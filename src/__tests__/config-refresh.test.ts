import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Hoisted mocks — capture onDidChangeConfiguration handlers
// ---------------------------------------------------------------------------

const {
  mockOnDidChangeConfiguration,
  mockWorkItemsSetRepos,
  mockWorkItemsSetAdoConfig,
  mockPRsSetRepos,
  mockPRsSetAdoConfig,
} = vi.hoisted(() => ({
  mockOnDidChangeConfiguration: vi.fn(),
  mockWorkItemsSetRepos: vi.fn(),
  mockWorkItemsSetAdoConfig: vi.fn(),
  mockPRsSetRepos: vi.fn(),
  mockPRsSetAdoConfig: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: vscode
// ---------------------------------------------------------------------------

vi.mock('vscode', async () => {
  const { TreeItem, TreeItemCollapsibleState, ThemeIcon, MarkdownString, EventEmitter } =
    await import('./mocks/vscode-mocks');

  return {
    TreeItem,
    TreeItemCollapsibleState,
    ThemeIcon,
    MarkdownString,
    EventEmitter,
    Uri: {
      parse: (s: string) => ({ toString: () => s, fsPath: s }),
      file: (p: string) => ({ fsPath: p, toString: () => p }),
    },
    Range: class { constructor(public start: unknown, public end: unknown) {} },
    Selection: class { constructor(public anchor: unknown, public active: unknown) {} },
    TextEditorRevealType: { InCenter: 1 },
    commands: {
      registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
      executeCommand: vi.fn(),
    },
    window: {
      showQuickPick: vi.fn(),
      showInputBox: vi.fn(),
      showWarningMessage: vi.fn(),
      showInformationMessage: vi.fn(),
      createOutputChannel: () => ({ appendLine: vi.fn(), dispose: vi.fn() }),
      createTreeView: () => ({ reveal: vi.fn(), dispose: vi.fn(), description: undefined }),
      registerTreeDataProvider: () => ({ dispose: vi.fn() }),
      onDidChangeActiveTerminal: vi.fn(() => ({ dispose: vi.fn() })),
      onDidOpenTerminal: vi.fn(() => ({ dispose: vi.fn() })),
      onDidCloseTerminal: vi.fn(() => ({ dispose: vi.fn() })),
      onDidStartTerminalShellExecution: vi.fn(() => ({ dispose: vi.fn() })),
      onDidEndTerminalShellExecution: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChangeVisibleTextEditors: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChangeWindowState: vi.fn(() => ({ dispose: vi.fn() })),
      visibleTextEditors: [],
      activeTerminal: undefined,
      createTerminal: vi.fn(() => ({ sendText: vi.fn(), show: vi.fn(), dispose: vi.fn() })),
      terminals: [],
      showOpenDialog: vi.fn(),
      showTextDocument: vi.fn(),
    },
    workspace: {
      getConfiguration: () => ({
        get: (_key: string, defaultValue?: unknown) => {
          if (_key === 'additionalArgs') return '';
          return defaultValue ?? [];
        },
      }),
      onDidChangeWorkspaceFolders: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChangeConfiguration: mockOnDidChangeConfiguration,
      workspaceFolders: [],
      openTextDocument: vi.fn().mockResolvedValue({ getText: () => '', positionAt: () => ({}) }),
      fs: { createDirectory: vi.fn(), copy: vi.fn() },
      createFileSystemWatcher: vi.fn(() => ({
        onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
        onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
        onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
        dispose: vi.fn(),
      })),
    },
    env: {
      openExternal: vi.fn(),
      clipboard: { writeText: vi.fn() },
    },
    extensions: {
      getExtension: vi.fn(),
      onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
    },
    ProgressLocation: { Notification: 15 },
    QuickPickItemKind: { Separator: -1, Default: 0 },
  };
});

// ---------------------------------------------------------------------------
// Mock: internal modules
// ---------------------------------------------------------------------------

vi.mock('../editless-tree', () => ({
  EditlessTreeProvider: vi.fn(function () {
    return { refresh: vi.fn(), setDiscoveredItems: vi.fn(), getDiscoveredItems: vi.fn().mockReturnValue([]), invalidate: vi.fn(), findTerminalItem: vi.fn() };
  }),
  EditlessTreeItem: class {},
  DEFAULT_COPILOT_CLI_ID: 'builtin:copilot-cli',
}));
vi.mock('../agent-settings', () => ({
  createAgentSettings: vi.fn(() => ({
    get: vi.fn(),
    getAll: vi.fn().mockReturnValue({}),
    update: vi.fn(),
    remove: vi.fn(),
    hide: vi.fn(),
    show: vi.fn(),
    showAll: vi.fn(),
    getHiddenIds: vi.fn().mockReturnValue([]),
    isHidden: vi.fn().mockReturnValue(false),
    reload: vi.fn(),
    settingsPath: '/mock/agent-settings.json',
  })),
  migrateFromRegistry: vi.fn(),
}));
vi.mock('../terminal-manager', () => ({ TerminalManager: vi.fn(function () { return { persist: vi.fn(), reconcile: vi.fn(), waitForReconciliation: vi.fn().mockResolvedValue(undefined), setSessionResolver: vi.fn(), setAgentSessionId: vi.fn(), getOrphanedSessions: vi.fn().mockReturnValue([]), onDidChange: vi.fn(() => ({ dispose: vi.fn() })), dispose: vi.fn(), getAllTerminals: vi.fn().mockReturnValue([]), launchTerminal: vi.fn(), closeTerminal: vi.fn(), focusTerminal: vi.fn(), getTerminalInfo: vi.fn(), getLabelKey: vi.fn().mockReturnValue('key'), getDisplayName: vi.fn().mockReturnValue('display'), renameSession: vi.fn(), relaunchSession: vi.fn(), dismissOrphan: vi.fn(), relaunchAllOrphans: vi.fn() }; }), getStateIcon: vi.fn(), getStateDescription: vi.fn() }));
vi.mock('../session-labels', () => ({ SessionLabelManager: vi.fn(function () { return { getLabel: vi.fn(), setLabel: vi.fn(), clearLabel: vi.fn(), onDidChange: vi.fn(() => ({ dispose: vi.fn() })) }; }), promptClearLabel: vi.fn(), promptRenameSession: vi.fn() }));
vi.mock('../squad-utils', () => ({ checkNpxAvailable: vi.fn().mockResolvedValue(true), promptInstallNode: vi.fn(), isSquadInitialized: vi.fn() }));
vi.mock('../discovery', () => ({ ensureWorkspaceFolder: vi.fn() }));
vi.mock('../unified-discovery', () => ({ discoverAll: vi.fn().mockReturnValue([]) }));
vi.mock('../watcher', () => ({ SquadWatcher: vi.fn(function () { return { dispose: vi.fn(), updateSquads: vi.fn() }; }) }));
vi.mock('../status-bar', () => ({ EditlessStatusBar: vi.fn(function () { return { update: vi.fn(), updateSessionsOnly: vi.fn(), setDiscoveredItems: vi.fn(), dispose: vi.fn() }; }) }));
vi.mock('../session-context', () => ({ SessionContextResolver: vi.fn(function () { return {}; }) }));
vi.mock('../scanner', () => ({ scanSquad: vi.fn() }));
vi.mock('../work-items-tree', () => ({
  WorkItemsTreeProvider: vi.fn(function () {
    return {
      setRepos: mockWorkItemsSetRepos,
      refresh: vi.fn(),
      setTreeView: vi.fn(),
      setFilter: vi.fn(),
      clearFilter: vi.fn(),
      filter: {},
      isFiltered: false,
      getAllRepos: vi.fn().mockReturnValue([]),
      getAllLabels: vi.fn().mockReturnValue([]),
      setAdoItems: vi.fn(),
      setAdoConfig: mockWorkItemsSetAdoConfig,
      setAdoRefresh: vi.fn(),
      getLevelFilter: vi.fn(),
      setLevelFilter: vi.fn(),
      clearLevelFilter: vi.fn(),
      clearAllLevelFilters: vi.fn(),
      getAvailableOptions: vi.fn().mockReturnValue({}),
    };
  }),
  WorkItemsTreeItem: class { constructor(public label: string) {} },
}));
vi.mock('../prs-tree', () => ({
  PRsTreeProvider: vi.fn(function () {
    return {
      setRepos: mockPRsSetRepos,
      refresh: vi.fn(),
      setAdoPRs: vi.fn(),
      setAdoRefresh: vi.fn(),
      setTreeView: vi.fn(),
      setFilter: vi.fn(),
      clearFilter: vi.fn(),
      filter: {},
      isFiltered: false,
      getAllRepos: vi.fn().mockReturnValue([]),
      getAllLabels: vi.fn().mockReturnValue([]),
      setAdoConfig: mockPRsSetAdoConfig,
      setAdoMe: vi.fn(),
      clearAllLevelFilters: vi.fn(),
      getAvailableOptions: vi.fn().mockReturnValue({}),
      getLevelFilter: vi.fn(),
      setLevelFilter: vi.fn(),
      clearLevelFilter: vi.fn(),
    };
  }),
  PRsTreeItem: class { constructor(public label: string) {} },
}));
vi.mock('../github-client', () => ({ fetchLinkedPRs: vi.fn() }));
vi.mock('../vscode-compat', () => ({ getEdition: vi.fn(() => 'VS Code') }));
vi.mock('../ado-auth', () => ({ getAdoToken: vi.fn(), promptAdoSignIn: vi.fn(), clearAzTokenCache: vi.fn(), setAdoAuthOutput: vi.fn() }));
vi.mock('../ado-client', () => ({ fetchAdoWorkItems: vi.fn(), fetchAdoPRs: vi.fn(), fetchAdoMe: vi.fn() }));
vi.mock('../squad-ui-integration', () => ({ initSquadUiContext: vi.fn(), openSquadUiDashboard: vi.fn() }));
vi.mock('../team-dir', () => ({ resolveTeamDir: vi.fn(), resolveTeamMd: vi.fn(), TEAM_DIR_NAMES: ['.squad', '.ai-team'] }));
vi.mock('../launch-utils', () => ({ launchAndLabel: vi.fn() }));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn((p: string) => {
      if (typeof p === 'string' && p.includes('agent-registry.json')) return false;
      return actual.existsSync(p);
    }),
  };
});

import { activate } from '../extension';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ConfigChangeEvent = { affectsConfiguration: (key: string) => boolean };

function makeContext(): vscode.ExtensionContext {
  const store = new Map<string, unknown>();
  const secretStore = new Map<string, string>();
  return {
    subscriptions: [],
    globalStorageUri: { fsPath: '/mock/global-storage' },
    extensionPath: '/mock/extension',
    workspaceState: {
      get: vi.fn((key: string, defaultValue?: unknown) => store.get(key) ?? defaultValue),
      update: vi.fn((key: string, value: unknown) => { store.set(key, value); return Promise.resolve(); }),
      keys: () => [...store.keys()],
    },
    globalState: {
      get: vi.fn((key: string, defaultValue?: unknown) => store.get(key) ?? defaultValue),
      update: vi.fn((key: string, value: unknown) => { store.set(key, value); return Promise.resolve(); }),
      keys: () => [...store.keys()],
      setKeysForSync: vi.fn(),
    },
    secrets: {
      get: vi.fn((key: string) => Promise.resolve(secretStore.get(key))),
      store: vi.fn((key: string, value: string) => { secretStore.set(key, value); return Promise.resolve(); }),
      delete: vi.fn((key: string) => { secretStore.delete(key); return Promise.resolve(); }),
      onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
    },
  } as unknown as vscode.ExtensionContext;
}

/**
 * Find all onDidChangeConfiguration handlers that respond to a given config key.
 */
function findConfigHandlers(key: string): Array<(e: ConfigChangeEvent) => void> {
  return mockOnDidChangeConfiguration.mock.calls
    .map((call: unknown[]) => call[0] as (e: ConfigChangeEvent) => void)
    .filter((handler: (e: ConfigChangeEvent) => void) => {
      // Test if this handler cares about the given key
      let matched = false;
      handler({ affectsConfiguration: (k: string) => { matched = k === key; return matched; } });
      return matched;
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('integration config refresh (#417)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnDidChangeConfiguration.mockReturnValue({ dispose: vi.fn() });
    activate(makeContext());
    // Clear call counts from initial activation so we only measure re-init calls
    mockWorkItemsSetRepos.mockClear();
    mockPRsSetRepos.mockClear();
    mockWorkItemsSetAdoConfig.mockClear();
    mockPRsSetAdoConfig.mockClear();
  });

  it('should re-init ADO integration when ado.organization changes', () => {
    vi.useFakeTimers();
    const handlers = findConfigHandlers('editless.ado.organization');
    expect(handlers.length).toBeGreaterThanOrEqual(1);

    handlers.forEach(h => h({ affectsConfiguration: (k: string) => k === 'editless.ado.organization' }));

    // Advance time to trigger debounced handler
    vi.advanceTimersByTime(500);

    // initAdoIntegration calls setAdoConfig on both providers
    expect(mockWorkItemsSetAdoConfig).toHaveBeenCalled();
    expect(mockPRsSetAdoConfig).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should re-init ADO integration when ado.project changes', () => {
    vi.useFakeTimers();
    const handlers = findConfigHandlers('editless.ado.project');
    expect(handlers.length).toBeGreaterThanOrEqual(1);

    handlers.forEach(h => h({ affectsConfiguration: (k: string) => k === 'editless.ado.project' }));

    // Advance time to trigger debounced handler
    vi.advanceTimersByTime(500);

    expect(mockWorkItemsSetAdoConfig).toHaveBeenCalled();
    expect(mockPRsSetAdoConfig).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should re-init GitHub integration when github.repos changes', () => {
    vi.useFakeTimers();
    const handlers = findConfigHandlers('editless.github.repos');
    expect(handlers.length).toBeGreaterThanOrEqual(1);

    handlers.forEach(h => h({ affectsConfiguration: (k: string) => k === 'editless.github.repos' }));

    // Advance time to trigger debounced handler
    vi.advanceTimersByTime(500);

    // initGitHubIntegration calls setRepos on both providers
    expect(mockWorkItemsSetRepos).toHaveBeenCalled();
    expect(mockPRsSetRepos).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should ignore config changes unrelated to ADO or GitHub integrations', () => {
    // Fire every registered handler with an unrelated key
    const allHandlers = mockOnDidChangeConfiguration.mock.calls
      .map((call: unknown[]) => call[0] as (e: ConfigChangeEvent) => void);

    allHandlers.forEach(h =>
      h({ affectsConfiguration: (k: string) => k === 'editless.someOtherSetting' }),
    );

    expect(mockWorkItemsSetRepos).not.toHaveBeenCalled();
    expect(mockPRsSetRepos).not.toHaveBeenCalled();
    expect(mockWorkItemsSetAdoConfig).not.toHaveBeenCalled();
    expect(mockPRsSetAdoConfig).not.toHaveBeenCalled();
  });

  it('should re-init ADO integration when organization is cleared/empty', () => {
    vi.useFakeTimers();
    const handlers = findConfigHandlers('editless.ado.organization');
    expect(handlers.length).toBeGreaterThanOrEqual(1);

    handlers.forEach(h => h({ affectsConfiguration: (k: string) => k === 'editless.ado.organization' }));

    // Advance time to trigger debounced handler
    vi.advanceTimersByTime(500);

    // initAdoIntegration should be called even for empty values (it handles them internally)
    expect(mockWorkItemsSetAdoConfig).toHaveBeenCalled();
    expect(mockPRsSetAdoConfig).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should re-init GitHub integration when repos is cleared/empty array', () => {
    vi.useFakeTimers();
    const handlers = findConfigHandlers('editless.github.repos');
    expect(handlers.length).toBeGreaterThanOrEqual(1);

    handlers.forEach(h => h({ affectsConfiguration: (k: string) => k === 'editless.github.repos' }));

    // Advance time to trigger debounced handler
    vi.advanceTimersByTime(500);

    // initGitHubIntegration should be called even for empty arrays (it handles them internally)
    expect(mockWorkItemsSetRepos).toHaveBeenCalled();
    expect(mockPRsSetRepos).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should debounce rapid config changes (ADO)', () => {
    vi.useFakeTimers();

    const handlers = findConfigHandlers('editless.ado.organization');
    expect(handlers.length).toBeGreaterThanOrEqual(1);

    // Simulate rapid-fire config changes (like typing character-by-character)
    handlers.forEach(h => {
      h({ affectsConfiguration: (k: string) => k === 'editless.ado.organization' });
      h({ affectsConfiguration: (k: string) => k === 'editless.ado.organization' });
      h({ affectsConfiguration: (k: string) => k === 'editless.ado.organization' });
    });

    // Should not have been called yet due to debounce
    expect(mockWorkItemsSetAdoConfig).not.toHaveBeenCalled();
    expect(mockPRsSetAdoConfig).not.toHaveBeenCalled();

    // Advance time by 500ms (debounce delay)
    vi.advanceTimersByTime(500);

    // Now should have been called exactly once
    expect(mockWorkItemsSetAdoConfig).toHaveBeenCalledTimes(1);
    expect(mockPRsSetAdoConfig).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('should debounce rapid config changes (GitHub)', () => {
    vi.useFakeTimers();

    const handlers = findConfigHandlers('editless.github.repos');
    expect(handlers.length).toBeGreaterThanOrEqual(1);

    // Simulate rapid-fire config changes
    handlers.forEach(h => {
      h({ affectsConfiguration: (k: string) => k === 'editless.github.repos' });
      h({ affectsConfiguration: (k: string) => k === 'editless.github.repos' });
      h({ affectsConfiguration: (k: string) => k === 'editless.github.repos' });
    });

    // Should not have been called yet due to debounce
    expect(mockWorkItemsSetRepos).not.toHaveBeenCalled();
    expect(mockPRsSetRepos).not.toHaveBeenCalled();

    // Advance time by 500ms (debounce delay)
    vi.advanceTimersByTime(500);

    // Now should have been called exactly once
    expect(mockWorkItemsSetRepos).toHaveBeenCalledTimes(1);
    expect(mockPRsSetRepos).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
