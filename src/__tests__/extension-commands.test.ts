import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as vscode from 'vscode';
import { MockEditlessTreeItem } from './mocks/vscode-mocks';

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
  mockTreeSetDiscoveredItems,
  mockWorkItemsRefresh,
  mockPRsRefresh,
  mockOpenExternal,
  mockSetFilter,
  mockClearFilter,
  mockGetAllRepos,
  mockGetAllLabels,
  mockPRsSetFilter,
  mockPRsClearFilter,
  mockPRsGetAllRepos,
  mockPRsGetAllLabels,
  mockPRsClearAllLevelFilters,
  mockPRsGetAvailableOptions,
  mockPRsGetLevelFilter,
  mockPRsSetLevelFilter,
  mockPRsClearLevelFilter,
  mockPRsSetAdoConfig,
  mockPromptAdoSignIn,
  mockOpenSquadUiDashboard,
  mockFetchLinkedPRs,
  mockShowTextDocument,
  mockShowOpenDialog,
  mockCheckNpxAvailable,
  mockPromptInstallNode,
  mockIsSquadInitialized,
  mockCreateTerminal,
  mockWorkspaceFsCopy,
  mockAddSquads,
  mockDiscoverAllAgents,
  mockDiscoverAgentTeams,
  mockDiscoverAll,
  mockOnDidCloseTerminal,
  mockResolveTeamDir,
} = vi.hoisted(() => ({
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
    mockTreeSetDiscoveredItems: vi.fn(),
    mockWorkItemsRefresh: vi.fn(),
    mockPRsRefresh: vi.fn(),
    mockOpenExternal: vi.fn(),
    mockSetFilter: vi.fn(),
    mockClearFilter: vi.fn(),
    mockGetAllRepos: vi.fn().mockReturnValue([]),
    mockGetAllLabels: vi.fn().mockReturnValue([]),
    mockPRsSetFilter: vi.fn(),
    mockPRsClearFilter: vi.fn(),
    mockPRsGetAllRepos: vi.fn().mockReturnValue([]),
    mockPRsGetAllLabels: vi.fn().mockReturnValue([]),
    mockPRsClearAllLevelFilters: vi.fn(),
    mockPRsGetAvailableOptions: vi.fn().mockReturnValue({}),
    mockPRsGetLevelFilter: vi.fn(),
    mockPRsSetLevelFilter: vi.fn(),
    mockPRsClearLevelFilter: vi.fn(),
    mockPRsSetAdoConfig: vi.fn(),
    mockPromptAdoSignIn: vi.fn(),
    mockOpenSquadUiDashboard: vi.fn(),
    mockFetchLinkedPRs: vi.fn(),
    mockShowTextDocument: vi.fn(),
    mockShowOpenDialog: vi.fn(),
    mockCheckNpxAvailable: vi.fn().mockResolvedValue(true),
    mockPromptInstallNode: vi.fn(),
    mockIsSquadInitialized: vi.fn().mockReturnValue(false),
    mockCreateTerminal: vi.fn(() => ({ sendText: vi.fn(), show: vi.fn(), dispose: vi.fn() })),
    mockWorkspaceFsCopy: vi.fn(),
    mockAddSquads: vi.fn(),
    mockDiscoverAllAgents: vi.fn().mockReturnValue([]),
    mockDiscoverAgentTeams: vi.fn().mockReturnValue([]),
    mockDiscoverAll: vi.fn().mockReturnValue([]),
    mockOnDidCloseTerminal: vi.fn(() => ({ dispose: vi.fn() })),
    mockResolveTeamDir: vi.fn(),
  }),
);

// Registered command handlers captured during activate()
const commandHandlers = new Map<string, Function>();

// ----- Mock: vscode ---------------------------------------------------------
vi.mock('vscode', async () => {
  const { TreeItem, TreeItemCollapsibleState, ThemeIcon, MarkdownString, EventEmitter } =
    await import('./mocks/vscode-mocks');

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
      createTreeView: () => ({ reveal: vi.fn(), dispose: vi.fn(), description: undefined }),
      registerTreeDataProvider: () => ({ dispose: vi.fn() }),
      onDidChangeActiveTerminal: vi.fn(() => ({ dispose: vi.fn() })),
      onDidOpenTerminal: vi.fn(() => ({ dispose: vi.fn() })),
      onDidCloseTerminal: mockOnDidCloseTerminal,
      onDidStartTerminalShellExecution: vi.fn(() => ({ dispose: vi.fn() })),
      onDidEndTerminalShellExecution: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChangeVisibleTextEditors: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChangeWindowState: vi.fn(() => ({ dispose: vi.fn() })),
      visibleTextEditors: [],
      get activeTerminal() { return mockActiveTerminalRef.current; },
      createTerminal: mockCreateTerminal,
      terminals: [],
      showOpenDialog: mockShowOpenDialog,
      showTextDocument: mockShowTextDocument,
    },
    workspace: {
      getConfiguration: () => ({
        get: (key: string, defaultValue?: unknown) => {
          if (key === 'additionalArgs') return '';
          return defaultValue ?? [];
        },
      }),
      onDidChangeWorkspaceFolders: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
      workspaceFolders: [],
      openTextDocument: vi.fn().mockResolvedValue({ getText: () => '', positionAt: () => ({}) }),
      fs: { createDirectory: vi.fn(), copy: mockWorkspaceFsCopy },
    },
    env: {
      openExternal: mockOpenExternal,
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

// ----- Mock: internal modules -----------------------------------------------

vi.mock('../editless-tree', () => ({
  EditlessTreeProvider: vi.fn(function () {
    return {
      refresh: mockTreeRefresh,
      setDiscoveredAgents: mockTreeSetDiscoveredAgents,
      setDiscoveredItems: mockTreeSetDiscoveredItems,
      invalidate: vi.fn(),
      findTerminalItem: vi.fn(),
    };
  }),
  EditlessTreeItem: MockEditlessTreeItem,
  DEFAULT_COPILOT_CLI_ID: 'builtin:copilot-cli',
}));

vi.mock('../registry', () => ({
  createRegistry: vi.fn(() => ({
    loadSquads: mockLoadSquads,
    getSquad: mockGetSquad,
    updateSquad: mockUpdateSquad,
    addSquads: mockAddSquads,
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
      waitForReconciliation: vi.fn().mockResolvedValue(undefined),
      setSessionResolver: vi.fn(),
      setAgentSessionId: vi.fn(),
      getOrphanedSessions: vi.fn().mockReturnValue([]),
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

vi.mock('../squad-utils', () => ({
  checkNpxAvailable: mockCheckNpxAvailable,
  promptInstallNode: mockPromptInstallNode,
  isSquadInitialized: mockIsSquadInitialized,
}));

vi.mock('../discovery', () => ({
  autoRegisterWorkspaceSquads: vi.fn(),
  discoverAgentTeams: mockDiscoverAgentTeams,
}));

vi.mock('../agent-discovery', () => ({
  discoverAllAgents: mockDiscoverAllAgents,
}));

vi.mock('../unified-discovery', () => ({
  discoverAll: mockDiscoverAll,
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
      setTreeView: vi.fn(),
      setFilter: mockSetFilter,
      clearFilter: mockClearFilter,
      filter: { repos: [], labels: [], states: [], types: [] },
      isFiltered: false,
      getAllRepos: mockGetAllRepos,
      getAllLabels: mockGetAllLabels,
      setAdoItems: vi.fn(),
      setAdoConfig: vi.fn(),
      setAdoRefresh: vi.fn(),
      getLevelFilter: vi.fn(),
      setLevelFilter: vi.fn(),
      clearLevelFilter: vi.fn(),
      clearAllLevelFilters: vi.fn(),
      getAvailableOptions: vi.fn().mockReturnValue({}),
    };
  }),
  WorkItemsTreeItem: class {
    issue?: unknown;
    adoWorkItem?: unknown;
    constructor(public label: string) {}
  },
}));

vi.mock('../prs-tree', () => ({
  PRsTreeProvider: vi.fn(function () {
    return {
      setRepos: vi.fn(),
      refresh: mockPRsRefresh,
      setAdoPRs: vi.fn(),
      setAdoRefresh: vi.fn(),
      setTreeView: vi.fn(),
      setFilter: mockPRsSetFilter,
      clearFilter: mockPRsClearFilter,
      filter: { repos: [], labels: [], statuses: [], author: '' },
      isFiltered: false,
      getAllRepos: mockPRsGetAllRepos,
      getAllLabels: mockPRsGetAllLabels,
      setAdoConfig: mockPRsSetAdoConfig,
      clearAllLevelFilters: mockPRsClearAllLevelFilters,
      getAvailableOptions: mockPRsGetAvailableOptions,
      getLevelFilter: mockPRsGetLevelFilter,
      setLevelFilter: mockPRsSetLevelFilter,
      clearLevelFilter: mockPRsClearLevelFilter,
    };
  }),
  PRsTreeItem: class {
    pr?: unknown;
    adoPR?: unknown;
    constructor(public label: string) {}
  },
}));

vi.mock('../github-client', () => ({
  fetchLinkedPRs: mockFetchLinkedPRs,
}));

vi.mock('../vscode-compat', () => ({
  getEdition: vi.fn(() => 'VS Code'),
}));

vi.mock('../ado-auth', () => ({
  getAdoToken: vi.fn(),
  promptAdoSignIn: mockPromptAdoSignIn,
  clearAzTokenCache: vi.fn(),
  setAdoAuthOutput: vi.fn(),
}));

vi.mock('../ado-client', () => ({
  fetchAdoWorkItems: vi.fn(),
  fetchAdoPRs: vi.fn(),
}));

vi.mock('../squad-ui-integration', () => ({
  initSquadUiContext: vi.fn(),
  openSquadUiDashboard: mockOpenSquadUiDashboard,
}));

vi.mock('../team-dir', () => ({
  resolveTeamDir: vi.fn(),
  resolveTeamMd: vi.fn(),
  TEAM_DIR_NAMES: ['.squad', '.ai-team'],
}));

import { activate } from '../extension';

// ----- Helpers --------------------------------------------------------------

function makeContext(): vscode.ExtensionContext {
  const store = new Map<string, unknown>();
  const secretStore = new Map<string, string>();
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
    secrets: {
      get: vi.fn((key: string) => Promise.resolve(secretStore.get(key))),
      store: vi.fn((key: string, value: string) => { secretStore.set(key, value); return Promise.resolve(); }),
      delete: vi.fn((key: string) => { secretStore.delete(key); return Promise.resolve(); }),
      onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
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
    model: 'gpt-5',
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

    it('should strip discovered: prefix when hiding discovered agent', () => {
      const item = new MockEditlessTreeItem('My Agent', 'discovered-agent', 0);
      item.id = 'discovered:my-agent';
      getHandler('editless.hideAgent')(item);
      expect(mockHide).toHaveBeenCalledWith('my-agent');
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

    it('should re-scan discovered agents on refresh', () => {
      mockDiscoverAllAgents.mockClear();
      getHandler('editless.refresh')();
      expect(mockDiscoverAllAgents).toHaveBeenCalled();
      expect(mockTreeSetDiscoveredAgents).toHaveBeenCalled();
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
    it('should update model field and refresh tree', async () => {
      const item = new MockEditlessTreeItem('Alpha', 'squad', 0, 'squad-1');
      const squad = makeSquad({ model: 'gpt-5' });
      mockGetSquad.mockReturnValue(squad);
      mockShowQuickPick.mockResolvedValue({ label: 'claude-sonnet-4' });

      await getHandler('editless.changeModel')(item);

      expect(mockUpdateSquad).toHaveBeenCalledWith('squad-1', {
        model: 'claude-sonnet-4',
      });
      expect(mockTreeRefresh).toHaveBeenCalled();
    });

    it('should no-op when item has no squadId', async () => {
      const item = new MockEditlessTreeItem('X', 'agent', 0);
      await getHandler('editless.changeModel')(item);
      expect(mockUpdateSquad).not.toHaveBeenCalled();
    });

    it('should no-op when squad is not found', async () => {
      const item = new MockEditlessTreeItem('Alpha', 'squad', 0, 'squad-1');
      mockGetSquad.mockReturnValue(undefined);
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
      mockGetSquad.mockReturnValue(makeSquad({ model: 'gpt-5' }));
      mockShowQuickPick.mockResolvedValue({ label: 'gpt-5' });

      await getHandler('editless.changeModel')(item);
      expect(mockUpdateSquad).not.toHaveBeenCalled();
    });

    it('should set model when config has no model yet', async () => {
      const item = new MockEditlessTreeItem('Alpha', 'squad', 0, 'squad-1');
      mockGetSquad.mockReturnValue(makeSquad({ model: undefined }));
      mockShowQuickPick.mockResolvedValue({ label: 'claude-sonnet-4' });

      await getHandler('editless.changeModel')(item);

      expect(mockUpdateSquad).toHaveBeenCalledWith('squad-1', {
        model: 'claude-sonnet-4',
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

  // --- editless.addNew --------------------------------------------------------

  describe('editless.addNew', () => {
    it('should show quickpick with Agent, Session, and Squad options', async () => {
      mockShowQuickPick.mockResolvedValueOnce(undefined);
      await getHandler('editless.addNew')();
      expect(mockShowQuickPick).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ value: 'agent' }),
          expect.objectContaining({ value: 'session' }),
          expect.objectContaining({ value: 'squad' }),
        ]),
        expect.any(Object),
      );
    });

    it('should delegate to addAgent when agent is selected', async () => {
      mockShowQuickPick.mockResolvedValueOnce({ value: 'agent' });
      await getHandler('editless.addNew')();
      expect(mockExecuteCommand).toHaveBeenCalledWith('editless.addAgent');
    });

    it('should delegate to launchSession when session is selected', async () => {
      mockShowQuickPick.mockResolvedValueOnce({ value: 'session' });
      await getHandler('editless.addNew')();
      expect(mockExecuteCommand).toHaveBeenCalledWith('editless.launchSession');
    });

    it('should delegate to addSquad when squad is selected', async () => {
      mockShowQuickPick.mockResolvedValueOnce({ value: 'squad' });
      await getHandler('editless.addNew')();
      expect(mockExecuteCommand).toHaveBeenCalledWith('editless.addSquad');
    });

    it('should do nothing when quickpick is cancelled', async () => {
      mockShowQuickPick.mockResolvedValueOnce(undefined);
      await getHandler('editless.addNew')();
      expect(mockExecuteCommand).not.toHaveBeenCalledWith('editless.addAgent');
      expect(mockExecuteCommand).not.toHaveBeenCalledWith('editless.launchSession');
      expect(mockExecuteCommand).not.toHaveBeenCalledWith('editless.addSquad');
    });
  });

  // --- editless.addAgent -----------------------------------------------------

  describe('editless.addAgent', () => {
    it('should do nothing when name input is cancelled', async () => {
      mockShowInputBox.mockResolvedValueOnce(undefined);
      await getHandler('editless.addAgent')();
      expect(mockShowQuickPick).not.toHaveBeenCalled();
    });

    it('should show location picker with Personal and Project options', async () => {
      mockShowInputBox.mockResolvedValueOnce('test-agent');
      mockShowQuickPick.mockResolvedValueOnce(undefined);
      await getHandler('editless.addAgent')();
      expect(mockShowQuickPick).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ value: 'personal' }),
          expect.objectContaining({ value: 'project' }),
        ]),
        expect.any(Object),
      );
    });

    it('should do nothing when location picker is cancelled', async () => {
      mockShowInputBox.mockResolvedValueOnce('test-agent');
      mockShowQuickPick.mockResolvedValueOnce(undefined);
      await getHandler('editless.addAgent')();
      expect(mockShowTextDocument).not.toHaveBeenCalled();
    });

    it('should create personal agent in ~/.copilot/agents/', async () => {
      const os = await import('os');
      mockShowInputBox.mockResolvedValueOnce('test-agent');
      mockShowQuickPick.mockResolvedValueOnce({ value: 'personal' });
      try { await getHandler('editless.addAgent')(); } catch { /* fs write expected to fail */ }
      // Verify only 1 quick pick call (the location picker), no folder picker
      expect(mockShowQuickPick).toHaveBeenCalledTimes(1);
    });

    it('should show folder picker when project agent selected', async () => {
      mockShowInputBox.mockResolvedValueOnce('test-agent');
      mockShowQuickPick.mockResolvedValueOnce({ value: 'project' });
      mockShowOpenDialog.mockResolvedValueOnce(undefined); // cancel folder picker
      await getHandler('editless.addAgent')();
      expect(mockShowOpenDialog).toHaveBeenCalledWith(
        expect.objectContaining({ canSelectFolders: true, canSelectFiles: false }),
      );
      expect(mockShowTextDocument).not.toHaveBeenCalled();
    });

    it('should create project agent in .github/agents/ under selected folder', async () => {
      const os = await import('os');
      const projectDir = os.tmpdir();
      mockShowInputBox.mockResolvedValueOnce('test-agent');
      mockShowQuickPick.mockResolvedValueOnce({ value: 'project' });
      mockShowOpenDialog.mockResolvedValueOnce([{ fsPath: projectDir }]);
      try { await getHandler('editless.addAgent')(); } catch { /* fs write expected to fail */ }
      expect(mockShowOpenDialog).toHaveBeenCalled();
    });
  });

  // --- editless.openFilePreview ---------------------------------------------

  describe('editless.openFilePreview', () => {
    it('should delegate to markdown.showPreviewToSide', () => {
      const uri = { fsPath: '/test.md' };
      getHandler('editless.openFilePreview')(uri);
      expect(mockExecuteCommand).toHaveBeenCalledWith('markdown.showPreviewToSide', uri);
    });
  });

  // --- editless.filterWorkItems -----------------------------------------------

  describe('editless.filterWorkItems', () => {
    it('should show QuickPick with sources only', async () => {
      mockGetAllRepos.mockReturnValue(['owner/repo1', '(ADO)']);
      mockShowQuickPick.mockResolvedValue([]);

      await getHandler('editless.filterWorkItems')();

      expect(mockShowQuickPick).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ label: 'owner/repo1', description: 'GitHub' }),
          expect.objectContaining({ label: '(ADO)', description: 'Azure DevOps' }),
        ]),
        expect.objectContaining({ canPickMany: true, title: 'Show/Hide Sources' }),
      );
      // State and label options should NOT appear
      const items = mockShowQuickPick.mock.calls[0][0] as { description?: string }[];
      expect(items.filter(i => i.description === 'state')).toHaveLength(0);
      expect(items.filter(i => i.description === 'label')).toHaveLength(0);
    });

    it('should apply selected sources to provider with empty labels/states/types', async () => {
      mockGetAllRepos.mockReturnValue(['owner/repo1', '(ADO)']);
      mockShowQuickPick.mockResolvedValue([
        { label: 'owner/repo1', description: 'GitHub' },
      ]);

      await getHandler('editless.filterWorkItems')();

      expect(mockSetFilter).toHaveBeenCalledWith({
        repos: ['owner/repo1'],
        labels: [],
        states: [],
        types: [],
      });
    });

    it('should no-op when user cancels QuickPick', async () => {
      mockShowQuickPick.mockResolvedValue(undefined);
      await getHandler('editless.filterWorkItems')();
      expect(mockSetFilter).not.toHaveBeenCalled();
    });

    it('should set empty filter when no items selected', async () => {
      mockShowQuickPick.mockResolvedValue([]);
      await getHandler('editless.filterWorkItems')();
      expect(mockSetFilter).toHaveBeenCalledWith({ repos: [], labels: [], states: [], types: [] });
    });
  });

  // --- editless.clearWorkItemsFilter -----------------------------------------

  describe('editless.clearWorkItemsFilter', () => {
    it('should delegate to provider clearFilter and clearAllLevelFilters', () => {
      getHandler('editless.clearWorkItemsFilter')();
      expect(mockClearFilter).toHaveBeenCalled();
    });
  });

  // --- editless.filterPRs ---------------------------------------------------

  describe('editless.filterPRs', () => {
    it('should show QuickPick with sources only', async () => {
      mockPRsGetAllRepos.mockReturnValue(['owner/repo1', '(ADO)']);
      mockShowQuickPick.mockResolvedValue([]);

      await getHandler('editless.filterPRs')();

      expect(mockShowQuickPick).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ label: 'owner/repo1', description: 'GitHub' }),
          expect.objectContaining({ label: '(ADO)', description: 'Azure DevOps' }),
        ]),
        expect.objectContaining({ canPickMany: true, title: 'Show/Hide Sources' }),
      );
    });

    it('should apply selected sources to provider', async () => {
      mockPRsGetAllRepos.mockReturnValue(['owner/repo1']);
      mockShowQuickPick.mockResolvedValue([
        { label: 'owner/repo1', description: 'GitHub' },
      ]);

      await getHandler('editless.filterPRs')();

      expect(mockPRsSetFilter).toHaveBeenCalledWith({
        repos: ['owner/repo1'],
        labels: [],
        statuses: [],
        author: '',
      });
    });

    it('should no-op when user cancels QuickPick', async () => {
      mockShowQuickPick.mockResolvedValue(undefined);
      await getHandler('editless.filterPRs')();
      expect(mockPRsSetFilter).not.toHaveBeenCalled();
    });

    it('should set empty filter when no items selected', async () => {
      mockShowQuickPick.mockResolvedValue([]);
      await getHandler('editless.filterPRs')();
      expect(mockPRsSetFilter).toHaveBeenCalledWith({ repos: [], labels: [], statuses: [], author: '' });
    });
  });

  // --- editless.clearPRsFilter -----------------------------------------------

  describe('editless.clearPRsFilter', () => {
    it('should delegate to provider clearFilter and clearAllLevelFilters', () => {
      getHandler('editless.clearPRsFilter')();
      expect(mockPRsClearFilter).toHaveBeenCalled();
      expect(mockPRsClearAllLevelFilters).toHaveBeenCalled();
    });
  });

  // --- editless.openInBrowser ------------------------------------------------

  describe('editless.openInBrowser', () => {
    it('should open GitHub issue URL in external browser', async () => {
      const item = { issue: { url: 'https://github.com/owner/repo/issues/1' } };
      await getHandler('editless.openInBrowser')(item);
      expect(mockOpenExternal).toHaveBeenCalled();
    });

    it('should open ADO work item URL in external browser', async () => {
      const item = { adoWorkItem: { url: 'https://dev.azure.com/org/project/_workitems/edit/42' } };
      await getHandler('editless.openInBrowser')(item);
      expect(mockOpenExternal).toHaveBeenCalled();
    });

    it('should open PR URL in external browser', async () => {
      const item = { pr: { url: 'https://github.com/owner/repo/pull/5' } };
      await getHandler('editless.openInBrowser')(item);
      expect(mockOpenExternal).toHaveBeenCalled();
    });

    it('should open ADO PR URL in external browser', async () => {
      const item = { adoPR: { url: 'https://dev.azure.com/org/project/_git/repo/pullrequest/10' } };
      await getHandler('editless.openInBrowser')(item);
      expect(mockOpenExternal).toHaveBeenCalled();
    });

    it('should no-op when item has no URL', async () => {
      const item = {};
      await getHandler('editless.openInBrowser')(item);
      expect(mockOpenExternal).not.toHaveBeenCalled();
    });
  });

  // --- editless.launchFromWorkItem -------------------------------------------

  describe('editless.launchFromWorkItem', () => {
    it('should show warning when no squads registered', async () => {
      const item = { issue: { number: 42, title: 'Fix bug', url: 'https://example.com/42' } };
      mockLoadSquads.mockReturnValue([]);
      await getHandler('editless.launchFromWorkItem')(item);
      expect(mockShowWarningMessage).toHaveBeenCalledWith('No agents registered.');
    });

    it('should show QuickPick and launch terminal for selected squad', async () => {
      const squad = makeSquad();
      const item = { issue: { number: 42, title: 'Fix bug', url: 'https://example.com/42', repository: 'owner/repo' } };
      mockLoadSquads.mockReturnValue([squad]);
      mockShowQuickPick.mockResolvedValue({ label: '🚀 Alpha Squad', description: 'test', squad });

      await getHandler('editless.launchFromWorkItem')(item);

      expect(mockLaunchTerminal).toHaveBeenCalledWith(squad, '#42 Fix bug');
    });

    it('should persist terminal name as sticky label after launch', async () => {
      const squad = makeSquad();
      const item = { issue: { number: 42, title: 'Fix bug', url: 'https://example.com/42', repository: 'owner/repo' } };
      const mockTerminal = { name: '#42 Fix bug' };
      mockLoadSquads.mockReturnValue([squad]);
      mockShowQuickPick.mockResolvedValue({ label: '🚀 Alpha Squad', description: 'test', squad });
      mockLaunchTerminal.mockReturnValue(mockTerminal);
      mockGetLabelKey.mockReturnValue('terminal:squad-1-123-1');

      await getHandler('editless.launchFromWorkItem')(item);

      expect(mockGetLabelKey).toHaveBeenCalledWith(mockTerminal);
      expect(mockSetLabel).toHaveBeenCalledWith('terminal:squad-1-123-1', '#42 Fix bug');
    });

    it('should no-op when item has no issue', async () => {
      await getHandler('editless.launchFromWorkItem')({});
      expect(mockLaunchTerminal).not.toHaveBeenCalled();
    });

    it('should no-op when item is undefined', async () => {
      await getHandler('editless.launchFromWorkItem')();
      expect(mockLaunchTerminal).not.toHaveBeenCalled();
    });

    it('should no-op when user cancels QuickPick', async () => {
      const squad = makeSquad();
      const item = { issue: { number: 1, title: 'T', url: 'https://example.com/1' } };
      mockLoadSquads.mockReturnValue([squad]);
      mockShowQuickPick.mockResolvedValue(undefined);
      await getHandler('editless.launchFromWorkItem')(item);
      expect(mockLaunchTerminal).not.toHaveBeenCalled();
    });
  });

  // --- editless.goToPR -------------------------------------------------------

  describe('editless.goToPR', () => {
    it('should show info when no linked PRs found', async () => {
      const item = { issue: { number: 42, title: 'Test', repository: 'owner/repo' } };
      mockFetchLinkedPRs.mockResolvedValue([]);
      await getHandler('editless.goToPR')(item);
      expect(mockShowInformationMessage).toHaveBeenCalledWith('No linked PRs found for #42');
    });

    it('should open single PR directly in browser', async () => {
      const item = { issue: { number: 42, repository: 'owner/repo' } };
      mockFetchLinkedPRs.mockResolvedValue([{ number: 100, title: 'PR', state: 'open', url: 'https://github.com/pr/100' }]);
      await getHandler('editless.goToPR')(item);
      expect(mockOpenExternal).toHaveBeenCalled();
    });

    it('should show QuickPick when multiple PRs found', async () => {
      const item = { issue: { number: 42, repository: 'owner/repo' } };
      mockFetchLinkedPRs.mockResolvedValue([
        { number: 100, title: 'PR A', state: 'open', url: 'https://github.com/pr/100' },
        { number: 101, title: 'PR B', state: 'closed', url: 'https://github.com/pr/101' },
      ]);
      mockShowQuickPick.mockResolvedValue({ label: '#100 PR A', description: 'open', url: 'https://github.com/pr/100' });
      await getHandler('editless.goToPR')(item);
      expect(mockShowQuickPick).toHaveBeenCalled();
      expect(mockOpenExternal).toHaveBeenCalled();
    });

    it('should no-op when item has no issue', async () => {
      await getHandler('editless.goToPR')({});
      expect(mockFetchLinkedPRs).not.toHaveBeenCalled();
    });

    it('should no-op when user cancels QuickPick for multiple PRs', async () => {
      const item = { issue: { number: 42, repository: 'owner/repo' } };
      mockFetchLinkedPRs.mockResolvedValue([
        { number: 100, title: 'PR A', state: 'open', url: 'https://github.com/pr/100' },
        { number: 101, title: 'PR B', state: 'open', url: 'https://github.com/pr/101' },
      ]);
      mockShowQuickPick.mockResolvedValue(undefined);
      await getHandler('editless.goToPR')(item);
      expect(mockOpenExternal).not.toHaveBeenCalled();
    });
  });

  // --- editless.setAdoPat ----------------------------------------------------

  describe('editless.setAdoPat', () => {
    it('should prompt for PAT with password input', async () => {
      mockShowInputBox.mockResolvedValueOnce(undefined);
      await getHandler('editless.setAdoPat')();
      expect(mockShowInputBox).toHaveBeenCalledWith(
        expect.objectContaining({ password: true }),
      );
    });

    it('should not show confirmation when user cancels input', async () => {
      mockShowInputBox.mockResolvedValueOnce(undefined);
      await getHandler('editless.setAdoPat')();
      expect(mockShowInformationMessage).not.toHaveBeenCalled();
    });
  });

  // --- editless.adoSignIn ----------------------------------------------------

  describe('editless.adoSignIn', () => {
    it('should show confirmation when sign-in succeeds', async () => {
      mockPromptAdoSignIn.mockResolvedValue('some-token');
      await getHandler('editless.adoSignIn')();
      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Signed in to Azure DevOps'),
      );
    });

    it('should not show confirmation when sign-in fails', async () => {
      mockPromptAdoSignIn.mockResolvedValue(undefined);
      await getHandler('editless.adoSignIn')();
      expect(mockShowInformationMessage).not.toHaveBeenCalledWith(
        expect.stringContaining('Signed in'),
      );
    });
  });

  // --- editless.openInSquadUi ------------------------------------------------

  describe('editless.openInSquadUi', () => {
    it('should delegate to openSquadUiDashboard', () => {
      getHandler('editless.openInSquadUi')();
      expect(mockOpenSquadUiDashboard).toHaveBeenCalled();
    });
  });

  // --- editless.openRegistry -------------------------------------------------

  describe('editless.openRegistry', () => {
    it('should open the registry file in editor', async () => {
      await getHandler('editless.openRegistry')();
      expect(mockShowTextDocument).toHaveBeenCalled();
    });
  });

  // --- editless.goToSquadSettings --------------------------------------------

  describe('editless.goToSquadSettings', () => {
    it('should no-op when item has no squadId', async () => {
      const item = new MockEditlessTreeItem('Agent', 'agent', 0);
      await getHandler('editless.goToSquadSettings')(item);
      expect(mockShowTextDocument).not.toHaveBeenCalled();
    });

    it('should open registry file when squadId is present', async () => {
      const item = new MockEditlessTreeItem('Alpha', 'squad', 0, 'squad-1');
      mockShowTextDocument.mockResolvedValue({
        selection: undefined,
        revealRange: vi.fn(),
      });
      await getHandler('editless.goToSquadSettings')(item);
      expect(mockShowTextDocument).toHaveBeenCalled();
    });
  });

  // --- editless.addSquad -----------------------------------------------------

  describe('editless.addSquad', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockCheckNpxAvailable.mockResolvedValue(true);
      mockIsSquadInitialized.mockReturnValue(false);
      mockShowOpenDialog.mockResolvedValue([{ fsPath: '/path/to/squad', toString: () => '/path/to/squad' }]);
      mockCreateTerminal.mockReturnValue({ sendText: vi.fn(), show: vi.fn(), dispose: vi.fn() });
    });

    it('should prompt for npx and return early when npx not available', async () => {
      mockCheckNpxAvailable.mockResolvedValue(false);
      
      await getHandler('editless.addSquad')();
      
      expect(mockCheckNpxAvailable).toHaveBeenCalled();
      expect(mockPromptInstallNode).toHaveBeenCalled();
      expect(mockShowOpenDialog).not.toHaveBeenCalled();
    });

    it('should show folder picker dialog with correct options', async () => {
      await getHandler('editless.addSquad')();
      
      expect(mockShowOpenDialog).toHaveBeenCalledWith({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: 'Select directory for new squad',
      });
    });

    it('should return early when user cancels folder picker', async () => {
      mockShowOpenDialog.mockResolvedValue(undefined);
      
      await getHandler('editless.addSquad')();
      
      expect(mockShowOpenDialog).toHaveBeenCalled();
      expect(mockIsSquadInitialized).not.toHaveBeenCalled();
      expect(mockCreateTerminal).not.toHaveBeenCalled();
    });

    it('should return early when folder picker returns empty array', async () => {
      mockShowOpenDialog.mockResolvedValue([]);
      
      await getHandler('editless.addSquad')();
      
      expect(mockShowOpenDialog).toHaveBeenCalled();
      expect(mockIsSquadInitialized).not.toHaveBeenCalled();
      expect(mockCreateTerminal).not.toHaveBeenCalled();
    });

    it('should run squad init command for new squad directory', async () => {
      mockIsSquadInitialized.mockReturnValue(false);
      const mockTerminal = { sendText: vi.fn(), show: vi.fn(), dispose: vi.fn() };
      mockCreateTerminal.mockReturnValue(mockTerminal);
      
      await getHandler('editless.addSquad')();
      
      expect(mockIsSquadInitialized).toHaveBeenCalledWith('/path/to/squad');
      expect(mockCreateTerminal).toHaveBeenCalledWith({
        name: 'Squad Init: squad',
        cwd: '/path/to/squad',
        hideFromUser: true,
      });
      expect(mockTerminal.sendText).toHaveBeenCalledWith('git init && npx -y github:bradygaster/squad init; exit');
    });

    it('should silently skip terminal for already-initialized squad directory', async () => {
      mockIsSquadInitialized.mockReturnValue(true);
      mockDiscoverAgentTeams.mockReturnValue([{ id: 'squad', name: 'squad', path: '/path/to/squad', icon: '🔷', universe: 'unknown' }]);
      
      await getHandler('editless.addSquad')();
      
      expect(mockIsSquadInitialized).toHaveBeenCalledWith('/path/to/squad');
      expect(mockCreateTerminal).not.toHaveBeenCalled();
      expect(mockAddSquads).toHaveBeenCalled();
    });

    it('should not show toast for new squad (silent add)', async () => {
      mockIsSquadInitialized.mockReturnValue(false);
      
      await getHandler('editless.addSquad')();
      
      expect(mockShowInformationMessage).not.toHaveBeenCalled();
    });

    it('should not show toast for already-initialized squad (silent add)', async () => {
      mockIsSquadInitialized.mockReturnValue(true);
      mockDiscoverAgentTeams.mockReturnValue([{ id: 'squad', name: 'squad', path: '/path/to/squad', icon: '🔷', universe: 'unknown' }]);
      
      await getHandler('editless.addSquad')();
      
      expect(mockShowInformationMessage).not.toHaveBeenCalled();
    });

    it('should handle nested directory paths correctly', async () => {
      mockShowOpenDialog.mockResolvedValue([{ 
        fsPath: '/users/dev/projects/my-awesome-squad',
        toString: () => '/users/dev/projects/my-awesome-squad',
      }]);
      mockIsSquadInitialized.mockReturnValue(false);
      
      await getHandler('editless.addSquad')();
      
      expect(mockCreateTerminal).toHaveBeenCalledWith({
        name: 'Squad Init: my-awesome-squad',
        cwd: '/users/dev/projects/my-awesome-squad',
        hideFromUser: true,
      });
    });

    it('should execute full flow for happy path (init)', async () => {
      mockCheckNpxAvailable.mockResolvedValue(true);
      mockShowOpenDialog.mockResolvedValue([{ fsPath: '/squad-dir', toString: () => '/squad-dir' }]);
      mockIsSquadInitialized.mockReturnValue(false);
      const mockTerminal = { sendText: vi.fn(), show: vi.fn(), dispose: vi.fn() };
      mockCreateTerminal.mockReturnValue(mockTerminal);
      
      await getHandler('editless.addSquad')();
      
      expect(mockCheckNpxAvailable).toHaveBeenCalled();
      expect(mockShowOpenDialog).toHaveBeenCalled();
      expect(mockIsSquadInitialized).toHaveBeenCalledWith('/squad-dir');
      expect(mockCreateTerminal).toHaveBeenCalled();
      expect(mockTerminal.sendText).toHaveBeenCalledWith('git init && npx -y github:bradygaster/squad init; exit');
      expect(mockShowInformationMessage).not.toHaveBeenCalled();
    });

    it('should execute full flow for happy path (already initialized)', async () => {
      mockCheckNpxAvailable.mockResolvedValue(true);
      mockShowOpenDialog.mockResolvedValue([{ fsPath: '/existing-squad', toString: () => '/existing-squad' }]);
      mockIsSquadInitialized.mockReturnValue(true);
      mockDiscoverAgentTeams.mockReturnValue([{ id: 'existing-squad', name: 'existing-squad', path: '/existing-squad', icon: '🔷', universe: 'unknown' }]);
      
      await getHandler('editless.addSquad')();
      
      expect(mockCheckNpxAvailable).toHaveBeenCalled();
      expect(mockShowOpenDialog).toHaveBeenCalled();
      expect(mockIsSquadInitialized).toHaveBeenCalledWith('/existing-squad');
      expect(mockCreateTerminal).not.toHaveBeenCalled();
      expect(mockAddSquads).toHaveBeenCalled();
      expect(mockShowInformationMessage).not.toHaveBeenCalled();
    });

    // --- Regression tests for #232: addSquad silently fails -------------------

    function getLastCloseCallback(): (t: unknown) => void {
      const calls = mockOnDidCloseTerminal.mock.calls as unknown[][];
      return calls[calls.length - 1][0] as (t: unknown) => void;
    }

    it('should close terminal after command finishes so completion can be detected', async () => {
      const mockTerminal = { sendText: vi.fn(), show: vi.fn(), dispose: vi.fn() };
      mockCreateTerminal.mockReturnValue(mockTerminal);
      mockIsSquadInitialized.mockReturnValue(false);

      await getHandler('editless.addSquad')();

      const sentCommand = mockTerminal.sendText.mock.calls[0][0] as string;
      expect(sentCommand).toContain('; exit');
    });

    it('should register onDidCloseTerminal listener for auto-registration', async () => {
      const mockTerminal = { sendText: vi.fn(), show: vi.fn(), dispose: vi.fn() };
      mockCreateTerminal.mockReturnValue(mockTerminal);

      await getHandler('editless.addSquad')();

      expect(mockOnDidCloseTerminal).toHaveBeenCalled();
    });

    it('should auto-register squad when init terminal closes successfully', async () => {
      const mockTerminal = { sendText: vi.fn(), show: vi.fn(), dispose: vi.fn() };
      mockCreateTerminal.mockReturnValue(mockTerminal);
      mockIsSquadInitialized.mockReturnValue(false);

      const discoveredSquad = makeSquad({ id: 'squad', path: '/path/to/squad' });
      mockDiscoverAgentTeams.mockReturnValue([discoveredSquad]);

      await getHandler('editless.addSquad')();

      getLastCloseCallback()(mockTerminal);

      expect(mockAddSquads).toHaveBeenCalledWith([discoveredSquad]);
    });

    it('should refresh tree after auto-registering squad on terminal close', async () => {
      const mockTerminal = { sendText: vi.fn(), show: vi.fn(), dispose: vi.fn() };
      mockCreateTerminal.mockReturnValue(mockTerminal);

      const discoveredSquad = makeSquad({ id: 'squad', path: '/path/to/squad' });
      mockDiscoverAgentTeams.mockReturnValue([discoveredSquad]);

      await getHandler('editless.addSquad')();

      mockTreeRefresh.mockClear();
      getLastCloseCallback()(mockTerminal);

      expect(mockTreeRefresh).toHaveBeenCalled();
    });

    it('should not register squad when discovery finds nothing (init failed)', async () => {
      const mockTerminal = { sendText: vi.fn(), show: vi.fn(), dispose: vi.fn() };
      mockCreateTerminal.mockReturnValue(mockTerminal);
      mockDiscoverAgentTeams.mockReturnValue([]);

      const teamDirMod = await import('../team-dir');
      (teamDirMod.resolveTeamDir as ReturnType<typeof vi.fn>).mockReturnValue(null);

      await getHandler('editless.addSquad')();

      getLastCloseCallback()(mockTerminal);

      expect(mockAddSquads).not.toHaveBeenCalled();
    });

    it('should register squad via resolveTeamDir when team.md does not exist yet', async () => {
      const mockTerminal = { sendText: vi.fn(), show: vi.fn(), dispose: vi.fn() };
      mockCreateTerminal.mockReturnValue(mockTerminal);
      mockDiscoverAgentTeams.mockReturnValue([]);
      mockLoadSquads.mockReturnValue([]);

      // Get the actual mock reference vitest uses (proxy differs from hoisted ref)
      const teamDirMod = await import('../team-dir');
      const resolveTeamDirSpy = teamDirMod.resolveTeamDir as ReturnType<typeof vi.fn>;
      resolveTeamDirSpy.mockReturnValue('/path/to/squad/.ai-team');

      await getHandler('editless.addSquad')();

      getLastCloseCallback()(mockTerminal);

      expect(resolveTeamDirSpy).toHaveBeenCalledWith('/path/to/squad');
      expect(mockAddSquads).toHaveBeenCalledWith([expect.objectContaining({
        name: 'squad',
        path: '/path/to/squad',
        icon: '🔷',
      })]);
    });

    it('should ignore close events from unrelated terminals', async () => {
      const mockTerminal = { sendText: vi.fn(), show: vi.fn(), dispose: vi.fn() };
      mockCreateTerminal.mockReturnValue(mockTerminal);
      mockDiscoverAgentTeams.mockReturnValue([makeSquad()]);

      await getHandler('editless.addSquad')();

      const unrelatedTerminal = { sendText: vi.fn(), show: vi.fn(), dispose: vi.fn() };
      getLastCloseCallback()(unrelatedTerminal);

      expect(mockAddSquads).not.toHaveBeenCalled();
    });
  });

  // --- #252 regression: QuickPick labels should not mention PAT ----------------

  describe('QuickPick ADO labels (#252)', () => {
    it('configureWorkItems ADO option should not mention PAT', async () => {
      mockShowQuickPick.mockResolvedValueOnce(undefined);
      await getHandler('editless.configureWorkItems')();
      const items = mockShowQuickPick.mock.calls[0][0] as Array<{ label: string; description: string }>;
      const adoItem = items.find(i => i.label === 'Azure DevOps');
      expect(adoItem).toBeDefined();
      expect(adoItem!.description).not.toContain('PAT');
    });

    it('configurePRs ADO option should not mention PAT', async () => {
      mockShowQuickPick.mockResolvedValueOnce(undefined);
      await getHandler('editless.configurePRs')();
      const items = mockShowQuickPick.mock.calls[0][0] as Array<{ label: string; description: string }>;
      const adoItem = items.find(i => i.label === 'Azure DevOps');
      expect(adoItem).toBeDefined();
      expect(adoItem!.description).not.toContain('PAT');
    });
  });
});

describe('editless.promoteDiscoveredAgent', () => {
  const testAgent = {
    id: 'my-agent',
    name: 'My Agent',
    filePath: '/workspace/.github/agents/my-agent.agent.md',
    source: 'workspace' as const,
    description: 'A test agent',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    commandHandlers.clear();
    mockLoadSquads.mockReturnValue([]);
    mockGetHiddenIds.mockReturnValue([]);
    mockDiscoverAllAgents.mockReturnValue([testAgent]);
    activate(makeContext());
  });

  it('should add discovered agent to registry', () => {
    const item = new MockEditlessTreeItem('My Agent', 'discovered-agent', 0);
    item.id = 'discovered:my-agent';

    getHandler('editless.promoteDiscoveredAgent')(item);

    expect(mockAddSquads).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'my-agent',
        name: 'My Agent',
        path: '/workspace/.github/agents',
        icon: '🤖',
        universe: 'standalone',
        description: 'A test agent',
      }),
    ]);
  });

  it('should refresh tree after promotion', () => {
    const item = new MockEditlessTreeItem('My Agent', 'discovered-agent', 0);
    item.id = 'discovered:my-agent';

    getHandler('editless.promoteDiscoveredAgent')(item);

    expect(mockTreeRefresh).toHaveBeenCalled();
    // Unified flow re-discovers instead of manually filtering
    expect(mockTreeSetDiscoveredAgents).toHaveBeenCalled();
    expect(mockTreeSetDiscoveredItems).toHaveBeenCalled();
  });

  it('should not show toast on promote (silent add)', () => {
    const item = new MockEditlessTreeItem('My Agent', 'discovered-agent', 0);
    item.id = 'discovered:my-agent';

    getHandler('editless.promoteDiscoveredAgent')(item);

    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });

  it('should no-op when item has no id', () => {
    const item = new MockEditlessTreeItem('My Agent', 'discovered-agent', 0);
    item.id = undefined;

    getHandler('editless.promoteDiscoveredAgent')(item);

    expect(mockAddSquads).not.toHaveBeenCalled();
  });

  it('should no-op when agent is not found in discovered list', () => {
    const item = new MockEditlessTreeItem('Unknown', 'discovered-agent', 0);
    item.id = 'discovered:unknown-agent';

    getHandler('editless.promoteDiscoveredAgent')(item);

    expect(mockAddSquads).not.toHaveBeenCalled();
  });

  it('should no-op when called with no argument', () => {
    getHandler('editless.promoteDiscoveredAgent')();

    expect(mockAddSquads).not.toHaveBeenCalled();
  });

  it('should re-discover after promotion to exclude promoted item', () => {
    mockDiscoverAllAgents.mockReturnValue([
      testAgent,
      { id: 'other-agent', name: 'Other', filePath: '/workspace/other.agent.md', source: 'workspace' as const },
    ]);
    vi.clearAllMocks();
    commandHandlers.clear();
    mockLoadSquads.mockReturnValue([]);
    mockGetHiddenIds.mockReturnValue([]);
    mockDiscoverAllAgents.mockReturnValue([
      testAgent,
      { id: 'other-agent', name: 'Other', filePath: '/workspace/other.agent.md', source: 'workspace' as const },
    ]);
    activate(makeContext());

    const item = new MockEditlessTreeItem('My Agent', 'discovered-agent', 0);
    item.id = 'discovered:my-agent';

    getHandler('editless.promoteDiscoveredAgent')(item);

    // Unified flow re-discovers (calls both setDiscoveredAgents and setDiscoveredItems)
    expect(mockTreeSetDiscoveredAgents).toHaveBeenCalled();
    expect(mockTreeSetDiscoveredItems).toHaveBeenCalled();
    expect(mockTreeRefresh).toHaveBeenCalled();
  });

  it('should promote a discovered squad with squad-specific properties', () => {
    vi.clearAllMocks();
    commandHandlers.clear();
    mockLoadSquads.mockReturnValue([]);
    mockGetHiddenIds.mockReturnValue([]);
    mockDiscoverAllAgents.mockReturnValue([]);
    mockDiscoverAll.mockReturnValue([
      { id: 'my-squad', name: 'My Squad', type: 'squad', source: 'workspace', path: '/workspace/my-squad', description: 'A squad', universe: 'acme-corp' },
    ]);
    activate(makeContext());

    const item = new MockEditlessTreeItem('My Squad', 'discovered-squad', 0);
    item.id = 'discovered:my-squad';

    getHandler('editless.promoteDiscoveredAgent')(item);

    expect(mockAddSquads).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'my-squad',
        name: 'My Squad',
        path: '/workspace/my-squad',
        icon: '🔷',
        universe: 'acme-corp',
        description: 'A squad',
      }),
    ]);
  });

  // --- editless.goToWorkItem -------------------------------------------------

  describe('editless.goToWorkItem', () => {
    it('should open issue URL in browser', async () => {
      const item = { issue: { url: 'https://github.com/owner/repo/issues/42' } };
      await getHandler('editless.goToWorkItem')(item);
      expect(mockOpenExternal).toHaveBeenCalled();
    });

    it('should open ADO work item URL in browser', async () => {
      const item = { adoWorkItem: { url: 'https://dev.azure.com/org/project/_workitems/edit/42' } };
      await getHandler('editless.goToWorkItem')(item);
      expect(mockOpenExternal).toHaveBeenCalled();
    });

    it('should no-op when item has no URL', async () => {
      const item = {};
      await getHandler('editless.goToWorkItem')(item);
      expect(mockOpenExternal).not.toHaveBeenCalled();
    });
  });

  // --- editless.launchFromPR -------------------------------------------------

  describe('editless.launchFromPR', () => {
    it('should show warning when no squads registered', async () => {
      const item = { pr: { number: 100, title: 'Add feature', url: 'https://github.com/owner/repo/pull/100' } };
      mockLoadSquads.mockReturnValue([]);
      await getHandler('editless.launchFromPR')(item);
      expect(mockShowWarningMessage).toHaveBeenCalledWith('No agents registered.');
    });

    it('should show QuickPick and launch terminal for GitHub PR', async () => {
      const squad = makeSquad();
      const item = { pr: { number: 100, title: 'Add feature', url: 'https://github.com/owner/repo/pull/100' } };
      mockLoadSquads.mockReturnValue([squad]);
      mockShowQuickPick.mockResolvedValue({ label: '🚀 Alpha Squad', description: 'test', squad });

      await getHandler('editless.launchFromPR')(item);

      expect(mockLaunchTerminal).toHaveBeenCalledWith(squad, 'PR #100 Add feature');
      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('https://github.com/owner/repo/pull/100'),
      );
    });

    it('should show QuickPick and launch terminal for ADO PR', async () => {
      const squad = makeSquad();
      const item = { adoPR: { id: 200, title: 'Fix bug', url: 'https://dev.azure.com/org/project/_git/repo/pullrequest/200' } };
      mockLoadSquads.mockReturnValue([squad]);
      mockShowQuickPick.mockResolvedValue({ label: '🚀 Alpha Squad', description: 'test', squad });

      await getHandler('editless.launchFromPR')(item);

      expect(mockLaunchTerminal).toHaveBeenCalledWith(squad, 'PR #200 Fix bug');
      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('https://dev.azure.com/org/project/_git/repo/pullrequest/200'),
      );
    });

    it('should no-op when item has no PR', async () => {
      await getHandler('editless.launchFromPR')({});
      expect(mockLaunchTerminal).not.toHaveBeenCalled();
    });

    it('should no-op when user cancels QuickPick', async () => {
      const squad = makeSquad();
      const item = { pr: { number: 100, title: 'Test', url: 'https://example.com/100' } };
      mockLoadSquads.mockReturnValue([squad]);
      mockShowQuickPick.mockResolvedValue(undefined);
      await getHandler('editless.launchFromPR')(item);
      expect(mockLaunchTerminal).not.toHaveBeenCalled();
    });
  });

  // --- editless.goToPRInBrowser ----------------------------------------------

  describe('editless.goToPRInBrowser', () => {
    it('should open GitHub PR URL in browser', async () => {
      const item = { pr: { url: 'https://github.com/owner/repo/pull/100' } };
      await getHandler('editless.goToPRInBrowser')(item);
      expect(mockOpenExternal).toHaveBeenCalled();
    });

    it('should open ADO PR URL in browser', async () => {
      const item = { adoPR: { url: 'https://dev.azure.com/org/project/_git/repo/pullrequest/200' } };
      await getHandler('editless.goToPRInBrowser')(item);
      expect(mockOpenExternal).toHaveBeenCalled();
    });

    it('should no-op when item has no URL', async () => {
      const item = {};
      await getHandler('editless.goToPRInBrowser')(item);
      expect(mockOpenExternal).not.toHaveBeenCalled();
    });
  });
});
