import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockOnDidChangeWindowState,
  mockOnDidChangeConfiguration,
  mockGetConfiguration,
} = vi.hoisted(() => ({
  mockOnDidChangeWindowState: vi.fn(),
  mockOnDidChangeConfiguration: vi.fn(),
  mockGetConfiguration: vi.fn(),
}));

vi.mock('vscode', () => ({
  window: {
    onDidChangeWindowState: mockOnDidChangeWindowState,
  },
  workspace: {
    getConfiguration: mockGetConfiguration,
    onDidChangeConfiguration: mockOnDidChangeConfiguration,
  },
}));

// Stub remaining module mocks so extension.ts doesn't blow up at import time
vi.mock('../editless-tree', () => ({
  EditlessTreeProvider: vi.fn(function () {
    return { refresh: vi.fn(), setDiscoveredAgents: vi.fn(), invalidate: vi.fn(), findTerminalItem: vi.fn() };
  }),
  EditlessTreeItem: class {},
}));
vi.mock('../registry', () => ({ createRegistry: vi.fn(() => ({ loadSquads: vi.fn().mockReturnValue([]) })), watchRegistry: vi.fn(() => ({ dispose: vi.fn() })) }));
vi.mock('../terminal-manager', () => ({ TerminalManager: vi.fn(function () { return { persist: vi.fn(), reconcile: vi.fn(), waitForReconciliation: vi.fn().mockResolvedValue(undefined), setSessionResolver: vi.fn(), setAgentSessionId: vi.fn(), getOrphanedSessions: vi.fn().mockReturnValue([]), onDidChange: vi.fn(() => ({ dispose: vi.fn() })), dispose: vi.fn(), getAllTerminals: vi.fn().mockReturnValue([]) }; }), getStateIcon: vi.fn(), getStateDescription: vi.fn() }));
vi.mock('../session-labels', () => ({ SessionLabelManager: vi.fn(function () { return { getLabel: vi.fn(), setLabel: vi.fn(), clearLabel: vi.fn() }; }), promptClearLabel: vi.fn(), promptRenameSession: vi.fn() }));
vi.mock('../visibility', () => ({ AgentVisibilityManager: vi.fn(function () { return { hide: vi.fn(), show: vi.fn(), showAll: vi.fn(), getHiddenIds: vi.fn().mockReturnValue([]), isHidden: vi.fn() }; }) }));
vi.mock('../squad-utils', () => ({ checkNpxAvailable: vi.fn().mockResolvedValue(true), promptInstallNode: vi.fn(), isSquadInitialized: vi.fn() }));
vi.mock('../discovery', () => ({ autoRegisterWorkspaceSquads: vi.fn() }));
vi.mock('../agent-discovery', () => ({ discoverAllAgents: vi.fn(() => []) }));
vi.mock('../watcher', () => ({ SquadWatcher: vi.fn(function () { return { dispose: vi.fn(), updateSquads: vi.fn() }; }) }));
vi.mock('../status-bar', () => ({ EditlessStatusBar: vi.fn(function () { return { update: vi.fn(), updateSessionsOnly: vi.fn(), dispose: vi.fn() }; }) }));
vi.mock('../session-context', () => ({ SessionContextResolver: vi.fn(function () { return {}; }) }));
vi.mock('../scanner', () => ({ scanSquad: vi.fn() }));
vi.mock('../work-items-tree', () => ({ WorkItemsTreeProvider: vi.fn(function () { return { setRepos: vi.fn(), refresh: vi.fn(), setTreeView: vi.fn(), setFilter: vi.fn(), clearFilter: vi.fn(), filter: {}, isFiltered: false, getAllRepos: vi.fn().mockReturnValue([]), getAllLabels: vi.fn().mockReturnValue([]), setAdoItems: vi.fn(), setAdoConfig: vi.fn(), setAdoRefresh: vi.fn(), getLevelFilter: vi.fn(), setLevelFilter: vi.fn(), clearLevelFilter: vi.fn(), getAvailableOptions: vi.fn().mockReturnValue({}) }; }), WorkItemsTreeItem: class { constructor(public label: string) {} } }));
vi.mock('../prs-tree', () => ({ PRsTreeProvider: vi.fn(function () { return { setRepos: vi.fn(), refresh: vi.fn(), setAdoPRs: vi.fn(), setAdoRefresh: vi.fn() }; }), PRsTreeItem: class { constructor(public label: string) {} } }));
vi.mock('../github-client', () => ({ fetchLinkedPRs: vi.fn() }));
vi.mock('../vscode-compat', () => ({ getEdition: vi.fn(() => 'VS Code') }));
vi.mock('../ado-auth', () => ({ getAdoToken: vi.fn(), promptAdoSignIn: vi.fn(), clearAzTokenCache: vi.fn() }));
vi.mock('../ado-client', () => ({ fetchAdoWorkItems: vi.fn(), fetchAdoPRs: vi.fn() }));
vi.mock('../squad-ui-integration', () => ({ initSquadUiContext: vi.fn(), openSquadUiDashboard: vi.fn() }));
vi.mock('../team-dir', () => ({ resolveTeamDir: vi.fn() }));

import { initAutoRefresh } from '../extension';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockProvider {
  refresh: ReturnType<typeof vi.fn>;
}

function makeMockProviders(): { workItems: MockProvider; prs: MockProvider } {
  return {
    workItems: { refresh: vi.fn() },
    prs: { refresh: vi.fn() },
  };
}

function setupConfig(refreshMinutes: number) {
  mockGetConfiguration.mockReturnValue({
    get: vi.fn((_key: string, defaultValue?: unknown) => {
      if (_key === 'refreshInterval') return refreshMinutes;
      return defaultValue;
    }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('initAutoRefresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockOnDidChangeWindowState.mockReturnValue({ dispose: vi.fn() });
    mockOnDidChangeConfiguration.mockReturnValue({ dispose: vi.fn() });
    setupConfig(5);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return a disposable', () => {
    const { workItems, prs } = makeMockProviders();

    const disposable = initAutoRefresh(workItems as never, prs as never);

    expect(disposable).toBeDefined();
    expect(typeof disposable.dispose).toBe('function');
  });

  it('should set up timer that refreshes both providers', () => {
    const { workItems, prs } = makeMockProviders();

    initAutoRefresh(workItems as never, prs as never);

    expect(workItems.refresh).not.toHaveBeenCalled();
    expect(prs.refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5 * 60_000);

    expect(workItems.refresh).toHaveBeenCalledTimes(1);
    expect(prs.refresh).toHaveBeenCalledTimes(1);
  });

  it('should refresh repeatedly on each interval tick', () => {
    const { workItems, prs } = makeMockProviders();

    initAutoRefresh(workItems as never, prs as never);

    vi.advanceTimersByTime(5 * 60_000 * 3);

    expect(workItems.refresh).toHaveBeenCalledTimes(3);
    expect(prs.refresh).toHaveBeenCalledTimes(3);
  });

  it('should not set timer when interval is 0', () => {
    setupConfig(0);
    const { workItems, prs } = makeMockProviders();

    initAutoRefresh(workItems as never, prs as never);

    vi.advanceTimersByTime(60 * 60_000);

    expect(workItems.refresh).not.toHaveBeenCalled();
    expect(prs.refresh).not.toHaveBeenCalled();
  });

  it('should register window focus listener', () => {
    const { workItems, prs } = makeMockProviders();

    initAutoRefresh(workItems as never, prs as never);

    expect(mockOnDidChangeWindowState).toHaveBeenCalledWith(expect.any(Function));
  });

  it('should refresh both providers when window gains focus', () => {
    const { workItems, prs } = makeMockProviders();

    initAutoRefresh(workItems as never, prs as never);

    const windowStateHandler = mockOnDidChangeWindowState.mock.calls[0][0];
    windowStateHandler({ focused: true });

    expect(workItems.refresh).toHaveBeenCalledTimes(1);
    expect(prs.refresh).toHaveBeenCalledTimes(1);
  });

  it('should not refresh when window loses focus', () => {
    const { workItems, prs } = makeMockProviders();

    initAutoRefresh(workItems as never, prs as never);

    const windowStateHandler = mockOnDidChangeWindowState.mock.calls[0][0];
    windowStateHandler({ focused: false });

    expect(workItems.refresh).not.toHaveBeenCalled();
    expect(prs.refresh).not.toHaveBeenCalled();
  });

  it('should register configuration change listener', () => {
    const { workItems, prs } = makeMockProviders();

    initAutoRefresh(workItems as never, prs as never);

    expect(mockOnDidChangeConfiguration).toHaveBeenCalledWith(expect.any(Function));
  });

  it('should restart timer when refreshInterval config changes', () => {
    setupConfig(5);
    const { workItems, prs } = makeMockProviders();

    initAutoRefresh(workItems as never, prs as never);

    // Advance partway through first interval
    vi.advanceTimersByTime(3 * 60_000);

    // Simulate config change to 1 minute
    setupConfig(1);
    const configHandler = mockOnDidChangeConfiguration.mock.calls[0][0];
    configHandler({ affectsConfiguration: (key: string) => key === 'editless.refreshInterval' });

    // Old timer should be cleared; new timer fires after 1 minute
    vi.advanceTimersByTime(1 * 60_000);

    expect(workItems.refresh).toHaveBeenCalledTimes(1);
    expect(prs.refresh).toHaveBeenCalledTimes(1);
  });

  it('should ignore config changes not related to refreshInterval', () => {
    setupConfig(5);
    const { workItems, prs } = makeMockProviders();

    initAutoRefresh(workItems as never, prs as never);

    const configHandler = mockOnDidChangeConfiguration.mock.calls[0][0];
    configHandler({ affectsConfiguration: (key: string) => key === 'editless.someOtherSetting' });

    // Timer should remain unchanged — no extra refresh
    vi.advanceTimersByTime(5 * 60_000);
    expect(workItems.refresh).toHaveBeenCalledTimes(1);
  });

  it('should clear interval and dispose listeners on dispose', () => {
    const windowDispose = vi.fn();
    const configDispose = vi.fn();
    mockOnDidChangeWindowState.mockReturnValue({ dispose: windowDispose });
    mockOnDidChangeConfiguration.mockReturnValue({ dispose: configDispose });
    const { workItems, prs } = makeMockProviders();

    const disposable = initAutoRefresh(workItems as never, prs as never);
    disposable.dispose();

    // Timer should not fire after dispose
    vi.advanceTimersByTime(10 * 60_000);
    expect(workItems.refresh).not.toHaveBeenCalled();
    expect(prs.refresh).not.toHaveBeenCalled();

    expect(windowDispose).toHaveBeenCalled();
    expect(configDispose).toHaveBeenCalled();
  });
});
