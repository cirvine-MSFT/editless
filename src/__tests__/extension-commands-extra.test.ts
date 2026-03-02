import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { activate } from '../extension';

const { mockCommands, mockShowInformationMessage, mockAgentSettings, mockTreeProvider } = vi.hoisted(() => ({
  mockCommands: {} as Record<string, Function>,
  mockShowInformationMessage: vi.fn(),
  mockAgentSettings: {
    show: vi.fn(),
    hide: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    getHiddenIds: vi.fn(() => []),
    hydrateFromDiscovery: vi.fn(),
    settingsPath: '/mock/settings.json',
    reload: vi.fn(),
    onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
    dispose: vi.fn(),
  },
  mockTreeProvider: {
    setDiscoveredItems: vi.fn(),
    refresh: vi.fn(),
    invalidate: vi.fn(),
    findTerminalItem: vi.fn(),
    getDiscoveredItems: vi.fn(() => []),
  },
}));

vi.mock('vscode', () => ({
  commands: {
    registerCommand: (id: string, handler: Function) => {
      mockCommands[id] = handler;
      return { dispose: vi.fn() };
    },
    executeCommand: vi.fn(),
  },
  window: {
    createOutputChannel: () => ({ appendLine: vi.fn(), dispose: vi.fn() }),
    createTreeView: () => ({ reveal: vi.fn(), dispose: vi.fn() }),
    showInformationMessage: (...args: any[]) => mockShowInformationMessage(...args),
    onDidChangeActiveTerminal: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChangeWindowState: vi.fn(() => ({ dispose: vi.fn() })),
    createStatusBarItem: () => ({ show: vi.fn(), hide: vi.fn(), dispose: vi.fn() }),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/mock/workspace' } }],
    updateWorkspaceFolders: vi.fn(),
    onDidChangeWorkspaceFolders: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
    createFileSystemWatcher: () => ({ onDidCreate: vi.fn(), onDidChange: vi.fn(), onDidDelete: vi.fn(), dispose: vi.fn() }),
    getConfiguration: () => ({ 
      get: (key: string, defaultValue?: any) => {
        if (key === 'github.repos') return [];
        return defaultValue;
      },
      update: vi.fn() 
    }),
  },
  ExtensionContext: class {
    subscriptions: any[] = [];
    globalStorageUri = { fsPath: '/mock/storage' };
    extensionPath = '/mock/extension';
    secrets = { store: vi.fn(), get: vi.fn(), delete: vi.fn(), onDidChange: vi.fn() };
  },
  Uri: { file: (p: string) => ({ fsPath: p }) },
  ThemeIcon: class {},
  ThemeColor: class {},
  TreeItem: class {},
  TreeItemCollapsibleState: { None: 0 },
  EventEmitter: class { event = vi.fn(); fire = vi.fn(); dispose = vi.fn(); },
  RelativePattern: class {},
  FileSystemWatcher: class {},
}));

// Mock other modules
vi.mock('../agent-settings', () => ({
  createAgentSettings: () => mockAgentSettings,
  migrateFromRegistry: vi.fn(),
}));

// Mock everything else to avoid errors during activation
vi.mock('../terminal-manager', () => ({ TerminalManager: class { 
  setSessionResolver = vi.fn(); 
  reconcile = vi.fn(); 
  onDidChange = vi.fn(() => ({ dispose: vi.fn() }));
} }));
vi.mock('../session-labels', () => ({ SessionLabelManager: class {} }));
vi.mock('../session-context', () => ({ SessionContextResolver: class {} }));
vi.mock('../editless-tree', () => ({ 
  EditlessTreeProvider: class { 
    constructor() { return mockTreeProvider; } 
  },
  EditlessTreeItem: class { 
    constructor(public label: string, public type: string, public collapsibleState?: number, public squadId?: string) {} 
  },
  DEFAULT_COPILOT_CLI_ID: 'builtin:copilot-cli'
}));
vi.mock('../unified-discovery', () => ({ discoverAll: vi.fn(() => []) }));
vi.mock('../watcher', () => ({ SquadWatcher: class {} }));
vi.mock('../status-bar', () => ({ EditlessStatusBar: class { 
  setDiscoveredItems = vi.fn(); 
  update = vi.fn(); 
  updateSessionsOnly = vi.fn(); 
} }));
vi.mock('../squad-ui-integration', () => ({ initSquadUiContext: vi.fn() }));
vi.mock('../work-items-tree', () => ({ WorkItemsTreeProvider: class { setTreeView = vi.fn(); setAdoConfig = vi.fn(); setRepos = vi.fn(); } }));
vi.mock('../prs-tree', () => ({ PRsTreeProvider: class { setTreeView = vi.fn(); setAdoConfig = vi.fn(); setRepos = vi.fn(); } }));
vi.mock('../github-client', () => ({}));
vi.mock('../vscode-compat', () => ({ getEdition: () => 'code' }));
vi.mock('../ado-auth', () => ({ setAdoAuthOutput: vi.fn() }));
vi.mock('../ado-client', () => ({}));
vi.mock('../launch-utils', () => ({}));
vi.mock('../copilot-sessions-provider', () => ({ CopilotSessionsProvider: vi.fn(function () { return { refresh: vi.fn(), setTreeView: vi.fn(), filter: {}, dismiss: vi.fn(), onDidChangeTreeData: vi.fn(() => ({ dispose: vi.fn() })) }; }), SessionTreeItem: class { constructor(public label: string) {} } }));

import { createAgentSettings } from '../agent-settings';
import { EditlessTreeProvider } from '../editless-tree';

describe('Extra Extension Commands', () => {
  let context: vscode.ExtensionContext;

  beforeEach(() => {
    vi.clearAllMocks();
    context = { subscriptions: [], globalStorageUri: { fsPath: '/mock/storage' }, extensionPath: '/mock/extension', secrets: { store: vi.fn() } } as any;
    
    // Activate to register commands
    activate(context);
  });

  it('editless.hideAgent should show hidden agent and refresh tree when item is hidden', () => {
    const handler = mockCommands['editless.hideAgent'];
    expect(handler).toBeDefined();

    const item = { squadId: 'squad-1', type: 'squad-hidden' };
    handler(item);

    expect(mockAgentSettings.show).toHaveBeenCalledWith('squad-1');
    expect(mockTreeProvider.refresh).toHaveBeenCalled();
  });

  it('editless.hideAgent should hide visible agent', () => {
    const handler = mockCommands['editless.hideAgent'];
    const item = { squadId: 'squad-1', type: 'squad' };
    handler(item);

    expect(mockAgentSettings.show).not.toHaveBeenCalled();
    expect(mockAgentSettings.hide).toHaveBeenCalledWith('squad-1');
    expect(mockTreeProvider.refresh).toHaveBeenCalled();
  });

  it('editless.hideAgent should work with item.id if squadId is missing', () => {
    const handler = mockCommands['editless.hideAgent'];
    const item = { id: 'agent-1', type: 'squad-hidden' }; // EditlessTreeItem has id
    handler(item);

    expect(mockAgentSettings.show).toHaveBeenCalledWith('agent-1');
  });

  it('editless.hideAgent should no-op if no id', () => {
    const handler = mockCommands['editless.hideAgent'];
    handler({});
    expect(mockAgentSettings.show).not.toHaveBeenCalled();
    expect(mockAgentSettings.hide).not.toHaveBeenCalled();
  });

  it('editless.hideAgent strips discovered: prefix from ID', () => {
    const handler = mockCommands['editless.hideAgent'];
    const item = { squadId: 'discovered:my-agent', type: 'squad' };
    handler(item);

    expect(mockAgentSettings.hide).toHaveBeenCalledWith('my-agent');
  });
});
