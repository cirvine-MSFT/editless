import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as vscode from 'vscode';

// ----- Hoisted mocks --------------------------------------------------------
const {
  mockRegisterCommand,
  mockExecuteCommand,
  mockShowQuickPick,
  mockShowInputBox,
  mockShowWarningMessage,
  mockShowInformationMessage,
  mockActiveTerminalRef,
  mockLoadSquads,
  mockGetSquad,
  mockUpdateSquad,
  mockLaunchTerminal,
  mockCloseTerminal,
  mockFocusTerminal,
  mockGetAllTerminals,
  mockGetTerminalInfo,
  mockGetLabelKey,
  mockGetDisplayName,
  mockRenameSession,
  mockRelaunchSession,
  mockDismissOrphan,
  mockRelaunchAllOrphans,
  mockGetLabel,
  mockSetLabel,
  mockPromptClearLabel,
  mockHide,
  mockShow,
  mockShowAll,
  mockGetHiddenIds,
  mockTreeRefresh,
  mockTreeSetDiscoveredAgents,
  mockWorkItemsRefresh,
  mockPRsRefresh,
  mockOpenExternal,
  MockEditlessTreeItem,
} = vi.hoisted(() => {
  class MockEditlessTreeItem {
    terminal?: unknown;
    persistedEntry?: unknown;
    parent?: unknown;
    squadId?: string;
    id?: string;
    constructor(
      public label: string,
      public type: string,
      public collapsibleState: number,
      squadId?: string,
    ) {
      this.squadId = squadId;
    }
  }

  return {
    mockRegisterCommand: vi.fn(),
    mockExecuteCommand: vi.fn(),
    mockShowQuickPick: vi.fn(),
    mockShowInputBox: vi.fn(),
    mockShowWarningMessage: vi.fn(),
    mockShowInformationMessage: vi.fn(),
    mockActiveTerminalRef: { current: undefined as unknown },
    mockLoadSquads: vi.fn().mockReturnValue([]),
    mockGetSquad: vi.fn(),
    mockUpdateSquad: vi.fn(),
    mockLaunchTerminal: vi.fn(),
    mockCloseTerminal: vi.fn(),
    mockFocusTerminal: vi.fn(),
    mockGetAllTerminals: vi.fn().mockReturnValue([]),
    mockGetTerminalInfo: vi.fn(),
    mockGetLabelKey: vi.fn().mockReturnValue('key'),
    mockGetDisplayName: vi.fn().mockReturnValue('display'),
    mockRenameSession: vi.fn(),
    mockRelaunchSession: vi.fn(),
    mockDismissOrphan: vi.fn(),
    mockRelaunchAllOrphans: vi.fn(),
    mockGetLabel: vi.fn(),
    mockSetLabel: vi.fn(),
    mockPromptClearLabel: vi.fn(),
    mockHide: vi.fn(),
    mockShow: vi.fn(),
    mockShowAll: vi.fn(),
    mockGetHiddenIds: vi.fn().mockReturnValue([]),
    mockTreeRefresh: vi.fn(),
    mockTreeSetDiscoveredAgents: vi.fn(),
    mockWorkItemsRefresh: vi.fn(),
    mockPRsRefresh: vi.fn(),
    mockOpenExternal: vi.fn(),
    MockEditlessTreeItem,
  };
});

// Registered command handlers captured during activate()
const commandHandlers = new Map<string, Function>();

// ----- Mock: vscode ---------------------------------------------------------
vi.mock('vscode', () => {
  const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };

  class TreeItem {
    label: string;
    collapsibleState: number;
    id?: string;
    contextValue?: string;
    constructor(label: string, collapsibleState = 0) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }

  class EventEmitter {
    private listeners: Function[] = [];
    get event() {
      return (listener: Function) => {
        this.listeners.push(listener);
        return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
      };
    }
    fire(value?: unknown) { this.listeners.forEach(l => l(value)); }
    dispose() { this.listeners = []; }
  }

  class ThemeIcon { constructor(public id: string) {} }
  class MarkdownString { constructor(public value: string) {} }

  mockRegisterCommand.mockImplementation((id: string, handler: Function) => {
    commandHandlers.set(id, handler);
    return { dispose: vi.fn() };
  });

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
      registerCommand: mockRegisterCommand,
      executeCommand: mockExecuteCommand,
    },
    window: {
      showQuickPick: mockShowQuickPick,
      showInputBox: mockShowInputBox,
      showWarningMessage: mockShowWarningMessage,
      showInformationMessage: mockShowInformationMessage,
      createOutputChannel: () => ({ appendLine: vi.fn(), dispose: vi.fn() }),
      createTreeView: () => ({ reveal: vi.fn(), dispose: vi.fn() }),
      registerTreeDataProvider: () => ({ dispose: vi.fn() }),
      onDidChangeActiveTerminal: vi.fn(() => ({ dispose: vi.fn() })),
      onDidOpenTerminal: vi.fn(() => ({ dispose: vi.fn() })),
      onDidCloseTerminal: vi.fn(() => ({ dispose: vi.fn() })),
      onDidStartTerminalShellExecution: vi.fn(() => ({ dispose: vi.fn() })),
      onDidEndTerminalShellExecution: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChangeVisibleTextEditors: vi.fn(() => ({ dispose: vi.fn() })),
      visibleTextEditors: [],
      get activeTerminal() { return mockActiveTerminalRef.current; },
      createTerminal: vi.fn(() => ({ show: vi.fn(), sendText: vi.fn(), dispose: vi.fn() })),
      terminals: [],
      showOpenDialog: vi.fn(),
    },
    workspace: {
      getConfiguration: () => ({
        get: vi.fn().mockReturnValue([]),
      }),
      onDidChangeWorkspaceFolders: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
      workspaceFolders: [],
      openTextDocument: vi.fn().mockResolvedValue({ getText: () => '', positionAt: () => ({}) }),
      fs: { createDirectory: vi.fn() },
    },
    env: {
      openExternal: mockOpenExternal,
      clipboard: { writeText: vi.fn() },
    },
    ProgressLocation: { Notification: 15 },
  };
});

// ----- Mock: internal modules -----------------------------------------------

vi.mock('../editless-tree', () => ({
  EditlessTreeProvider: vi.fn(function () {
    return {
      refresh: mockTreeRefresh,
      setDiscoveredAgents: mockTreeSetDiscoveredAgents,
      invalidate: vi.fn(),
      findTerminalItem: vi.fn(),
    };
  }),
  EditlessTreeItem: MockEditlessTreeItem,
}));

vi.mock('../registry', () => ({
  createRegistry: vi.fn(() => ({
    loadSquads: mockLoadSquads,
    getSquad: mockGetSquad,
    updateSquad: mockUpdateSquad,
    registryPath: '/mock/registry.json',
  })),
  watchRegistry: vi.fn(() => ({ dispose: vi.fn() })),
}));

vi.mock('../terminal-manager', () => ({
  TerminalManager: vi.fn(function () {
    return {
      launchTerminal: mockLaunchTerminal,
      closeTerminal: mockCloseTerminal,
      focusTerminal: mockFocusTerminal,
      getAllTerminals: mockGetAllTerminals,
      getTerminalInfo: mockGetTerminalInfo,
      getLabelKey: mockGetLabelKey,
      getDisplayName: mockGetDisplayName,
      renameSession: mockRenameSession,
      relaunchSession: mockRelaunchSession,
      dismissOrphan: mockDismissOrphan,
      relaunchAllOrphans: mockRelaunchAllOrphans,
      persist: vi.fn(),
      reconcile: vi.fn(),
      onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
      dispose: vi.fn(),
    };
  }),
  getStateIcon: vi.fn(),
  getStateDescription: vi.fn(),
}));

vi.mock('../session-labels', () => ({
  SessionLabelManager: vi.fn(function () {
    return {
      getLabel: mockGetLabel,
      setLabel: mockSetLabel,
      clearLabel: vi.fn(),
    };
  }),
  promptClearLabel: mockPromptClearLabel,
  promptRenameSession: vi.fn(),
}));

vi.mock('../visibility', () => ({
  AgentVisibilityManager: vi.fn(function () {
    return {
      hide: mockHide,
      show: mockShow,
      showAll: mockShowAll,
      getHiddenIds: mockGetHiddenIds,
      isHidden: vi.fn(),
    };
  }),
}));

vi.mock('../squad-upgrader', () => ({
  registerSquadUpgradeCommand: vi.fn(() => ({ dispose: vi.fn() })),
  registerSquadUpgradeAllCommand: vi.fn(() => ({ dispose: vi.fn() })),
}));

vi.mock('../cli-provider', () => ({
  registerAgencyUpdateCommand: vi.fn(() => ({ dispose: vi.fn() })),
  checkProviderUpdatesOnStartup: vi.fn(),
  probeAllProviders: vi.fn(() => Promise.resolve()),
  resolveActiveProvider: vi.fn(),
}));

vi.mock('../discovery', () => ({
  registerDiscoveryCommand: vi.fn(() => ({ dispose: vi.fn() })),
  checkDiscoveryOnStartup: vi.fn(),
}));

vi.mock('../agent-discovery', () => ({
  discoverAllAgents: vi.fn(() => []),
}));

vi.mock('../watcher', () => ({
  SquadWatcher: vi.fn(function () {
    return { dispose: vi.fn(), updateSquads: vi.fn() };
  }),
}));

vi.mock('../status-bar', () => ({
  EditlessStatusBar: vi.fn(function () {
    return { update: vi.fn(), updateSessionsOnly: vi.fn(), dispose: vi.fn() };
  }),
}));

vi.mock('../notifications', () => ({
  NotificationManager: vi.fn(function () {
    return { checkAndNotify: vi.fn() };
  }),
}));

vi.mock('../session-context', () => ({
  SessionContextResolver: vi.fn(function () {
    return {};
  }),
}));

vi.mock('../scanner', () => ({
  scanSquad: vi.fn(),
}));

vi.mock('../work-items-tree', () => ({
  WorkItemsTreeProvider: vi.fn(function () {
    return {
      setRepos: vi.fn(),
      refresh: mockWorkItemsRefresh,
    };
  }),
  WorkItemsTreeItem: class {},
}));

vi.mock('../prs-tree', () => ({
  PRsTreeProvider: vi.fn(function () {
    return {
      setRepos: vi.fn(),
      refresh: mockPRsRefresh,
    };
  }),
  PRsTreeItem: class {},
}));

vi.mock('../github-client', () => ({
  fetchLinkedPRs: vi.fn(),
}));

vi.mock('../vscode-compat', () => ({
  getEdition: vi.fn(() => 'VS Code'),
}));

import { activate } from '../extension';

// ----- Helpers --------------------------------------------------------------

function makeContext(): vscode.ExtensionContext {
  const store = new Map<string, unknown>();
  return {
    subscriptions: [],
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
  } as unknown as vscode.ExtensionContext;
}

function makeSquad(overrides: Record<string, unknown> = {}) {
  return {
    id: 'squad-1',
    name: 'Alpha Squad',
    icon: '🚀',
    universe: 'test',
    path: '/squads/alpha',
    launchCommand: 'agency copilot --model gpt-5',
    ...overrides,
  };
}

function getHandler(id: string): Function {
  const handler = commandHandlers.get(id);
  if (!handler) throw new Error(`Command handler "${id}" not registered`);
  return handler;
}

// ----- Tests ----------------------------------------------------------------

describe('extension command handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commandHandlers.clear();
    mockActiveTerminalRef.current = undefined;
    mockLoadSquads.mockReturnValue([]);
    mockGetSquad.mockReturnValue(undefined);
    mockGetAllTerminals.mockReturnValue([]);
    mockGetHiddenIds.mockReturnValue([]);
    mockGetLabel.mockReturnValue(undefined);

    activate(makeContext());
  });

  // --- editless.launchSession -----------------------------------------------

  describe('editless.launchSession', () => {
    it('should show warning when registry is empty', async () => {
      mockLoadSquads.mockReturnValue([]);
      await getHandler('editless.launchSession')();
      expect(mockShowWarningMessage).toHaveBeenCalledWith('No agents registered yet.');
      expect(mockLaunchTerminal).not.toHaveBeenCalled();
    });

    it('should launch directly when squadId is provided', async () => {
      const squad = makeSquad();
      mockLoadSquads.mockReturnValue([squad]);
      mockGetSquad.mockReturnValue(squad);

      await getHandler('editless.launchSession')(squad.id);

      expect(mockShowQuickPick).not.toHaveBeenCalled();
      expect(mockLaunchTerminal).toHaveBeenCalledWith(squad);
    });

    it('should show QuickPick when no squadId provided', async () => {
      const squad = makeSquad();
      mockLoadSquads.mockReturnValue([squad]);
      mockGetSquad.mockReturnValue(squad);
      mockShowQuickPick.mockResolvedValue({ label: '🚀 Alpha Squad', description: 'test', id: 'squad-1' });

      await getHandler('editless.launchSession')();

      expect(mockShowQuickPick).toHaveBeenCalled();
      expect(mockLaunchTerminal).toHaveBeenCalledWith(squad);
    });

    it('should not launch when user dismisses QuickPick', async () => {
      mockLoadSquads.mockReturnValue([makeSquad()]);
      mockShowQuickPick.mockResolvedValue(undefined);

      await getHandler('editless.launchSession')();

      expect(mockLaunchTerminal).not.toHaveBeenCalled();
    });

    it('should not launch when getSquad returns undefined', async () => {
      mockLoadSquads.mockReturnValue([makeSquad()]);
      mockGetSquad.mockReturnValue(undefined);

      await getHandler('editless.launchSession')('nonexistent');

      expect(mockLaunchTerminal).not.toHaveBeenCalled();
    });
  });

  // --- editless.focusTerminal -----------------------------------------------

  describe('editless.focusTerminal', () => {
    it('should focus terminal from direct arg', () => {
      const terminal = { show: vi.fn(), name: 'test' };
      getHandler('editless.focusTerminal')(terminal);
      expect(mockFocusTerminal).toHaveBeenCalledWith(terminal);
    });

    it('should resolve terminal from EditlessTreeItem', () => {
      const terminal = { show: vi.fn(), name: 'test' };
      const item = new MockEditlessTreeItem('test', 'session', 0, 'squad-1');
      item.terminal = terminal;

      getHandler('editless.focusTerminal')(item);
      expect(mockFocusTerminal).toHaveBeenCalledWith(terminal);
    });

    it('should no-op when arg is undefined', () => {
      getHandler('editless.focusTerminal')(undefined);
      expect(mockFocusTerminal).not.toHaveBeenCalled();
    });
  });

  // --- editless.closeTerminal -----------------------------------------------

  describe('editless.closeTerminal', () => {
    it('should close terminal from direct arg', () => {
      const terminal = { show: vi.fn(), name: 'test', dispose: vi.fn() };
      getHandler('editless.closeTerminal')(terminal);
      expect(mockCloseTerminal).toHaveBeenCalledWith(terminal);
    });

    it('should resolve terminal from tree item and close it', () => {
      const terminal = { show: vi.fn(), name: 'test', dispose: vi.fn() };
      const item = new MockEditlessTreeItem('test', 'session', 0, 'squad-1');
      item.terminal = terminal;

      getHandler('editless.closeTerminal')(item);
      expect(mockCloseTerminal).toHaveBeenCalledWith(terminal);
    });

    it('should no-op when terminal is undefined', () => {
      getHandler('editless.closeTerminal')(undefined);
      expect(mockCloseTerminal).not.toHaveBeenCalled();
    });
  });

  // --- editless.hideAgent ---------------------------------------------------

  describe('editless.hideAgent', () => {
    it('should hide agent by squadId and refresh tree', () => {
      const item = new MockEditlessTreeItem('Alpha', 'squad', 0, 'squad-1');
      getHandler('editless.hideAgent')(item);
      expect(mockHide).toHaveBeenCalledWith('squad-1');
      expect(mockTreeRefresh).toHaveBeenCalled();
    });

    it('should hide agent by item.id when no squadId', () => {
      const item = new MockEditlessTreeItem('Bot', 'agent', 0);
      item.id = 'agent-42';
      getHandler('editless.hideAgent')(item);
      expect(mockHide).toHaveBeenCalledWith('agent-42');
    });

    it('should no-op when item is undefined', () => {
      getHandler('editless.hideAgent')(undefined);
      expect(mockHide).not.toHaveBeenCalled();
    });

    it('should no-op when item has neither squadId nor id', () => {
      const item = new MockEditlessTreeItem('X', 'orphan', 0);
      item.squadId = undefined;
      item.id = undefined;
      getHandler('editless.hideAgent')(item);
      expect(mockHide).not.toHaveBeenCalled();
    });
  });

  // --- editless.showHiddenAgents --------------------------------------------

  describe('editless.showHiddenAgents', () => {
    it('should show info message when no agents are hidden', async () => {
      mockGetHiddenIds.mockReturnValue([]);
      await getHandler('editless.showHiddenAgents')();
      expect(mockShowInformationMessage).toHaveBeenCalledWith('No hidden agents.');
      expect(mockShowQuickPick).not.toHaveBeenCalled();
    });

    it('should show QuickPick and unhide selected agents', async () => {
      const squad = makeSquad();
      mockGetHiddenIds.mockReturnValue(['squad-1']);
      mockGetSquad.mockReturnValue(squad);
      mockShowQuickPick.mockResolvedValue([{ label: '🚀 Alpha Squad', id: 'squad-1' }]);

      await getHandler('editless.showHiddenAgents')();

      expect(mockShowQuickPick).toHaveBeenCalled();
      expect(mockShow).toHaveBeenCalledWith('squad-1');
      expect(mockTreeRefresh).toHaveBeenCalled();
    });

    it('should unhide multiple agents when multi-selected', async () => {
      mockGetHiddenIds.mockReturnValue(['squad-1', 'squad-2']);
      mockGetSquad.mockImplementation((id: string) =>
        id === 'squad-1' ? makeSquad() : makeSquad({ id: 'squad-2', name: 'Beta' }),
      );
      mockShowQuickPick.mockResolvedValue([
        { label: '🚀 Alpha Squad', id: 'squad-1' },
        { label: '🚀 Beta', id: 'squad-2' },
      ]);

      await getHandler('editless.showHiddenAgents')();

      expect(mockShow).toHaveBeenCalledWith('squad-1');
      expect(mockShow).toHaveBeenCalledWith('squad-2');
    });

    it('should no-op when user cancels QuickPick', async () => {
      mockGetHiddenIds.mockReturnValue(['squad-1']);
      mockGetSquad.mockReturnValue(makeSquad());
      mockShowQuickPick.mockResolvedValue(undefined);

      await getHandler('editless.showHiddenAgents')();
      expect(mockShow).not.toHaveBeenCalled();
    });

    it('should label unknown hidden IDs as "unknown"', async () => {
      mockGetHiddenIds.mockReturnValue(['gone-agent']);
      mockGetSquad.mockReturnValue(undefined);
      mockShowQuickPick.mockResolvedValue(undefined);

      await getHandler('editless.showHiddenAgents')();

      const picks = mockShowQuickPick.mock.calls[0][0];
      expect(picks[0]).toEqual(expect.objectContaining({ label: 'gone-agent', description: 'unknown' }));
    });
  });

  // --- editless.showAllAgents -----------------------------------------------

  describe('editless.showAllAgents', () => {
    it('should call showAll and refresh tree', () => {
      getHandler('editless.showAllAgents')();
      expect(mockShowAll).toHaveBeenCalled();
      expect(mockTreeRefresh).toHaveBeenCalled();
    });
  });

  // --- editless.relaunchSession ---------------------------------------------

  describe('editless.relaunchSession', () => {
    it('should relaunch from persisted entry on tree item', () => {
      const entry = { id: 't-1', squadId: 'squad-1', displayName: 'Agent' };
      const item = new MockEditlessTreeItem('Orphan', 'orphan', 0);
      item.persistedEntry = entry;

      getHandler('editless.relaunchSession')(item);
      expect(mockRelaunchSession).toHaveBeenCalledWith(entry);
    });

    it('should no-op when item has no persisted entry', () => {
      const item = new MockEditlessTreeItem('Normal', 'session', 0);
      getHandler('editless.relaunchSession')(item);
      expect(mockRelaunchSession).not.toHaveBeenCalled();
    });

    it('should no-op when arg is undefined', () => {
      getHandler('editless.relaunchSession')(undefined);
      expect(mockRelaunchSession).not.toHaveBeenCalled();
    });
  });

  // --- editless.dismissOrphan -----------------------------------------------

  describe('editless.dismissOrphan', () => {
    it('should dismiss orphan from persisted entry', () => {
      const entry = { id: 't-1', squadId: 'squad-1', displayName: 'Dead' };
      const item = new MockEditlessTreeItem('Orphan', 'orphan', 0);
      item.persistedEntry = entry;

      getHandler('editless.dismissOrphan')(item);
      expect(mockDismissOrphan).toHaveBeenCalledWith(entry);
    });

    it('should no-op when item has no persisted entry', () => {
      const item = new MockEditlessTreeItem('Normal', 'session', 0);
      getHandler('editless.dismissOrphan')(item);
      expect(mockDismissOrphan).not.toHaveBeenCalled();
    });

    it('should no-op when arg is undefined', () => {
      getHandler('editless.dismissOrphan')(undefined);
      expect(mockDismissOrphan).not.toHaveBeenCalled();
    });
  });

  // --- editless.relaunchAllOrphans ------------------------------------------

  describe('editless.relaunchAllOrphans', () => {
    it('should delegate to terminalManager', () => {
      getHandler('editless.relaunchAllOrphans')();
      expect(mockRelaunchAllOrphans).toHaveBeenCalled();
    });
  });

  // --- editless.refresh -----------------------------------------------------

  describe('editless.refresh', () => {
    it('should refresh tree provider', () => {
      getHandler('editless.refresh')();
      expect(mockTreeRefresh).toHaveBeenCalled();
    });
  });

  // --- editless.refreshWorkItems / editless.refreshPRs ----------------------

  describe('editless.refreshWorkItems', () => {
    it('should refresh work items provider', () => {
      getHandler('editless.refreshWorkItems')();
      expect(mockWorkItemsRefresh).toHaveBeenCalled();
    });
  });

  describe('editless.refreshPRs', () => {
    it('should refresh PRs provider', () => {
      getHandler('editless.refreshPRs')();
      expect(mockPRsRefresh).toHaveBeenCalled();
    });
  });

  // --- editless.renameSession -----------------------------------------------

  describe('editless.renameSession', () => {
    it('should rename when called with a tree item arg', async () => {
      const terminal = { show: vi.fn(), name: 'Agent' };
      const item = new MockEditlessTreeItem('Agent', 'session', 0, 'squad-1');
      item.terminal = terminal;

      mockGetLabelKey.mockReturnValue('squad-1:0');
      mockGetLabel.mockReturnValue(undefined);
      mockGetDisplayName.mockReturnValue('Agent');
      mockGetTerminalInfo.mockReturnValue({ squadIcon: '🚀' });
      mockShowInputBox.mockResolvedValue('My Agent');
      mockExecuteCommand.mockResolvedValue(undefined);

      await getHandler('editless.renameSession')(item);

      expect(terminal.show).toHaveBeenCalledWith(true);
      expect(mockShowInputBox).toHaveBeenCalled();
      expect(mockSetLabel).toHaveBeenCalledWith('squad-1:0', 'My Agent');
      expect(mockRenameSession).toHaveBeenCalledWith(terminal, 'My Agent');
    });

    it('should prepend squad icon to terminal tab name', async () => {
      const terminal = { show: vi.fn(), name: 'Agent' };
      const item = new MockEditlessTreeItem('Agent', 'session', 0, 'squad-1');
      item.terminal = terminal;

      mockGetLabelKey.mockReturnValue('squad-1:0');
      mockGetTerminalInfo.mockReturnValue({ squadIcon: '🚀' });
      mockShowInputBox.mockResolvedValue('Renamed');
      mockExecuteCommand.mockResolvedValue(undefined);

      await getHandler('editless.renameSession')(item);

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'workbench.action.terminal.renameWithArg',
        { name: '🚀 Renamed' },
      );
    });

    it('should fall back to activeTerminal when no arg', async () => {
      const terminal = { show: vi.fn(), name: 'Agent' };
      mockActiveTerminalRef.current = terminal;

      mockGetLabelKey.mockReturnValue('squad-1:0');
      mockGetTerminalInfo.mockReturnValue({ squadIcon: '🚀' });
      mockShowInputBox.mockResolvedValue('Renamed');
      mockExecuteCommand.mockResolvedValue(undefined);

      await getHandler('editless.renameSession')();

      expect(terminal.show).toHaveBeenCalledWith(true);
      expect(mockSetLabel).toHaveBeenCalledWith('squad-1:0', 'Renamed');
    });

    it('should show QuickPick when no arg and no active terminal', async () => {
      mockActiveTerminalRef.current = undefined;

      const terminal = { show: vi.fn(), name: 'Agent' };
      mockGetAllTerminals.mockReturnValue([
        { terminal, info: { displayName: 'Agent', labelKey: 'squad-1:0', createdAt: new Date() } },
      ]);
      mockGetLabel.mockReturnValue(undefined);
      mockGetDisplayName.mockReturnValue('Agent');
      mockGetTerminalInfo.mockReturnValue({ squadIcon: '🚀' });
      mockShowQuickPick.mockResolvedValue({
        label: 'Agent',
        terminal,
        labelKey: 'squad-1:0',
      });
      mockShowInputBox.mockResolvedValue('Renamed');
      mockExecuteCommand.mockResolvedValue(undefined);

      await getHandler('editless.renameSession')();

      expect(mockShowQuickPick).toHaveBeenCalled();
      expect(mockSetLabel).toHaveBeenCalledWith('squad-1:0', 'Renamed');
    });

    it('should show info message when no terminals and no arg', async () => {
      mockActiveTerminalRef.current = undefined;
      mockGetAllTerminals.mockReturnValue([]);

      await getHandler('editless.renameSession')();

      expect(mockShowInformationMessage).toHaveBeenCalledWith('No active sessions.');
    });

    it('should no-op when user cancels input box', async () => {
      const terminal = { show: vi.fn(), name: 'Agent' };
      const item = new MockEditlessTreeItem('Agent', 'session', 0, 'squad-1');
      item.terminal = terminal;

      mockGetLabelKey.mockReturnValue('squad-1:0');
      mockShowInputBox.mockResolvedValue(undefined);

      await getHandler('editless.renameSession')(item);

      expect(mockSetLabel).not.toHaveBeenCalled();
      expect(mockRenameSession).not.toHaveBeenCalled();
    });

    it('should no-op when user enters empty string', async () => {
      const terminal = { show: vi.fn(), name: 'Agent' };
      const item = new MockEditlessTreeItem('Agent', 'session', 0, 'squad-1');
      item.terminal = terminal;

      mockGetLabelKey.mockReturnValue('squad-1:0');
      mockShowInputBox.mockResolvedValue('');

      await getHandler('editless.renameSession')(item);

      expect(mockSetLabel).not.toHaveBeenCalled();
      expect(mockRenameSession).not.toHaveBeenCalled();
    });
  });

  // --- editless.focusSession ------------------------------------------------

  describe('editless.focusSession', () => {
    it('should show info when no terminals exist', async () => {
      mockGetAllTerminals.mockReturnValue([]);
      await getHandler('editless.focusSession')();
      expect(mockShowInformationMessage).toHaveBeenCalledWith('No active sessions.');
    });

    it('should show QuickPick and focus selected terminal', async () => {
      const terminal = { show: vi.fn(), name: 'test' };
      mockGetAllTerminals.mockReturnValue([
        { terminal, info: { displayName: 'Agent', labelKey: 'k', createdAt: new Date() } },
      ]);
      mockGetLabel.mockReturnValue(undefined);
      mockShowQuickPick.mockResolvedValue({ terminal });

      await getHandler('editless.focusSession')();

      expect(mockShowQuickPick).toHaveBeenCalled();
      expect(mockFocusTerminal).toHaveBeenCalledWith(terminal);
    });

    it('should show custom label in picker when label exists', async () => {
      const terminal = { show: vi.fn() };
      mockGetAllTerminals.mockReturnValue([
        { terminal, info: { displayName: 'Agent', labelKey: 'k', createdAt: new Date() } },
      ]);
      mockGetLabel.mockReturnValue('My Custom Label');
      mockShowQuickPick.mockResolvedValue(undefined);

      await getHandler('editless.focusSession')();

      const picks = mockShowQuickPick.mock.calls[0][0];
      expect(picks[0].label).toBe('🏷️ My Custom Label');
    });

    it('should not focus when user dismisses picker', async () => {
      mockGetAllTerminals.mockReturnValue([
        { terminal: { show: vi.fn() }, info: { displayName: 'Agent', labelKey: 'k', createdAt: new Date() } },
      ]);
      mockGetLabel.mockReturnValue(undefined);
      mockShowQuickPick.mockResolvedValue(undefined);

      await getHandler('editless.focusSession')();
      expect(mockFocusTerminal).not.toHaveBeenCalled();
    });
  });

  // --- editless.clearSessionLabel -------------------------------------------

  describe('editless.clearSessionLabel', () => {
    it('should delegate to promptClearLabel with resolved terminal', async () => {
      const terminal = { show: vi.fn(), name: 'test' };
      const item = new MockEditlessTreeItem('test', 'session', 0);
      item.terminal = terminal;
      mockGetLabelKey.mockReturnValue('squad-1:0');

      await getHandler('editless.clearSessionLabel')(item);
      expect(mockPromptClearLabel).toHaveBeenCalledWith(terminal, expect.anything(), 'squad-1:0');
    });

    it('should no-op when no terminal resolved', async () => {
      await getHandler('editless.clearSessionLabel')(undefined);
      expect(mockPromptClearLabel).not.toHaveBeenCalled();
    });
  });

  // --- editless.renameSquad -------------------------------------------------

  describe('editless.renameSquad', () => {
    it('should rename squad and refresh tree', async () => {
      const item = new MockEditlessTreeItem('Alpha', 'squad', 0, 'squad-1');
      mockGetSquad.mockReturnValue(makeSquad());
      mockShowInputBox.mockResolvedValue('Beta Squad');

      await getHandler('editless.renameSquad')(item);

      expect(mockUpdateSquad).toHaveBeenCalledWith('squad-1', { name: 'Beta Squad' });
      expect(mockTreeRefresh).toHaveBeenCalled();
    });

    it('should no-op when item has no squadId', async () => {
      const item = new MockEditlessTreeItem('No Squad', 'agent', 0);
      await getHandler('editless.renameSquad')(item);
      expect(mockUpdateSquad).not.toHaveBeenCalled();
    });

    it('should no-op when squad not found in registry', async () => {
      const item = new MockEditlessTreeItem('Ghost', 'squad', 0, 'ghost');
      mockGetSquad.mockReturnValue(undefined);
      await getHandler('editless.renameSquad')(item);
      expect(mockShowInputBox).not.toHaveBeenCalled();
    });

    it('should no-op when user cancels input', async () => {
      const item = new MockEditlessTreeItem('Alpha', 'squad', 0, 'squad-1');
      mockGetSquad.mockReturnValue(makeSquad());
      mockShowInputBox.mockResolvedValue(undefined);

      await getHandler('editless.renameSquad')(item);
      expect(mockUpdateSquad).not.toHaveBeenCalled();
    });

    it('should no-op when name is unchanged', async () => {
      const item = new MockEditlessTreeItem('Alpha', 'squad', 0, 'squad-1');
      mockGetSquad.mockReturnValue(makeSquad());
      mockShowInputBox.mockResolvedValue('Alpha Squad');

      await getHandler('editless.renameSquad')(item);
      expect(mockUpdateSquad).not.toHaveBeenCalled();
    });
  });

  // --- editless.changeModel -------------------------------------------------

  describe('editless.changeModel', () => {
    it('should update launch command model and refresh tree', async () => {
      const item = new MockEditlessTreeItem('Alpha', 'squad', 0, 'squad-1');
      const squad = makeSquad({ launchCommand: 'agency copilot --model gpt-5' });
      mockGetSquad.mockReturnValue(squad);
      mockShowQuickPick.mockResolvedValue({ label: 'claude-sonnet-4' });

      await getHandler('editless.changeModel')(item);

      expect(mockUpdateSquad).toHaveBeenCalledWith('squad-1', {
        launchCommand: 'agency copilot --model claude-sonnet-4',
      });
      expect(mockTreeRefresh).toHaveBeenCalled();
    });

    it('should no-op when item has no squadId', async () => {
      const item = new MockEditlessTreeItem('X', 'agent', 0);
      await getHandler('editless.changeModel')(item);
      expect(mockUpdateSquad).not.toHaveBeenCalled();
    });

    it('should no-op when squad has no launchCommand', async () => {
      const item = new MockEditlessTreeItem('Alpha', 'squad', 0, 'squad-1');
      mockGetSquad.mockReturnValue(makeSquad({ launchCommand: undefined }));
      await getHandler('editless.changeModel')(item);
      expect(mockShowQuickPick).not.toHaveBeenCalled();
    });

    it('should no-op when user cancels picker', async () => {
      const item = new MockEditlessTreeItem('Alpha', 'squad', 0, 'squad-1');
      mockGetSquad.mockReturnValue(makeSquad());
      mockShowQuickPick.mockResolvedValue(undefined);

      await getHandler('editless.changeModel')(item);
      expect(mockUpdateSquad).not.toHaveBeenCalled();
    });

    it('should no-op when selected model is same as current', async () => {
      const item = new MockEditlessTreeItem('Alpha', 'squad', 0, 'squad-1');
      mockGetSquad.mockReturnValue(makeSquad({ launchCommand: 'agency copilot --model gpt-5' }));
      mockShowQuickPick.mockResolvedValue({ label: 'gpt-5' });

      await getHandler('editless.changeModel')(item);
      expect(mockUpdateSquad).not.toHaveBeenCalled();
    });

    it('should append --model when launch command has no model flag', async () => {
      const item = new MockEditlessTreeItem('Alpha', 'squad', 0, 'squad-1');
      mockGetSquad.mockReturnValue(makeSquad({ launchCommand: 'agency copilot' }));
      mockShowQuickPick.mockResolvedValue({ label: 'claude-sonnet-4' });

      await getHandler('editless.changeModel')(item);

      expect(mockUpdateSquad).toHaveBeenCalledWith('squad-1', {
        launchCommand: 'agency copilot --model claude-sonnet-4',
      });
    });
  });

  // --- editless.configureRepos ----------------------------------------------

  describe('editless.configureRepos', () => {
    it('should open settings for editless.github', async () => {
      await getHandler('editless.configureRepos')();
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'workbench.action.openSettings',
        'editless.github',
      );
    });
  });

  // --- editless.configureAdo -------------------------------------------------

  describe('editless.configureAdo', () => {
    it('should open settings for editless.ado', async () => {
      await getHandler('editless.configureAdo')();
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'workbench.action.openSettings',
        'editless.ado',
      );
    });
  });

  // --- editless.openFilePreview ---------------------------------------------

  describe('editless.openFilePreview', () => {
    it('should delegate to markdown.showPreview', () => {
      const uri = { fsPath: '/test.md' };
      getHandler('editless.openFilePreview')(uri);
      expect(mockExecuteCommand).toHaveBeenCalledWith('markdown.showPreview', uri);
    });
  });
});
