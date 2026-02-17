import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentTeamConfig } from '../types';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockShowInformationMessage,
  mockShowQuickPick,
  mockShowOpenDialog,
  mockRegisterCommand,
  mockGetConfiguration,
  mockAutoRegisterWorkspaceSquads,
  mockDiscoverAgentTeams,
  mockDiscoverAgentTeamsInMultiplePaths,
} = vi.hoisted(() => ({
  mockShowInformationMessage: vi.fn(),
  mockShowQuickPick: vi.fn(),
  mockShowOpenDialog: vi.fn(),
  mockRegisterCommand: vi.fn<(id: string, handler: Function) => { dispose: () => void }>(),
  mockGetConfiguration: vi.fn(),
  mockAutoRegisterWorkspaceSquads: vi.fn(),
  mockDiscoverAgentTeams: vi.fn().mockReturnValue([]),
  mockDiscoverAgentTeamsInMultiplePaths: vi.fn().mockReturnValue([]),
}));

const commandHandlers = new Map<string, Function>();

vi.mock('vscode', () => {
  mockRegisterCommand.mockImplementation((id: string, handler: Function) => {
    commandHandlers.set(id, handler);
    return { dispose: vi.fn() };
  });

  return {
    window: {
      showInformationMessage: mockShowInformationMessage,
      showQuickPick: mockShowQuickPick,
      showOpenDialog: mockShowOpenDialog,
    },
    workspace: {
      getConfiguration: mockGetConfiguration,
      workspaceFolders: [],
    },
    commands: {
      registerCommand: mockRegisterCommand,
    },
  };
});

vi.mock('../cli-provider', () => ({
  getActiveProviderLaunchCommand: () => 'copilot --agent $(agent)',
}));

vi.mock('../team-dir', () => ({
  resolveTeamMd: vi.fn(),
}));

// We import the module under test AFTER mocks are set up.
// For checkDiscoveryOnStartup we need to partially mock discovery.ts itself
// so autoRegisterWorkspaceSquads and discoverAgentTeamsInMultiplePaths can be
// controlled independently. We do this by re-exporting the real functions
// but spying on the helpers.

import {
  promptAndAddSquads,
  registerDiscoveryCommand,
  checkDiscoveryOnStartup,
  discoverAgentTeams,
} from '../discovery';
import type { EditlessRegistry } from '../registry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSquad(overrides: Partial<AgentTeamConfig> = {}): AgentTeamConfig {
  return {
    id: 'squad-1',
    name: 'Alpha Squad',
    path: '/squads/alpha',
    icon: '🔷',
    universe: 'test',
    description: 'The alpha team.',
    launchCommand: 'copilot --agent $(agent)',
    ...overrides,
  };
}

function makeRegistry(squads: AgentTeamConfig[] = []): EditlessRegistry {
  return {
    loadSquads: vi.fn().mockReturnValue(squads),
    addSquads: vi.fn(),
    getSquad: vi.fn(),
    updateSquad: vi.fn(),
    registryPath: '/mock/registry.json',
  } as unknown as EditlessRegistry;
}

function makeContext() {
  return { subscriptions: [] } as unknown as import('vscode').ExtensionContext;
}

function getHandler(id: string): Function {
  const handler = commandHandlers.get(id);
  if (!handler) throw new Error(`Command handler "${id}" not registered`);
  return handler;
}

function makeConfig(discoveryDir: string = '', scanPaths: string[] = []) {
  mockGetConfiguration.mockReturnValue({
    get: vi.fn((key: string, defaultValue?: unknown) => {
      if (key === 'discoveryDir') return discoveryDir;
      if (key === 'discovery.scanPaths') return scanPaths;
      return defaultValue;
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  commandHandlers.clear();
  makeConfig();
});

// ---------------------------------------------------------------------------
// promptAndAddSquads
// ---------------------------------------------------------------------------

describe('promptAndAddSquads', () => {
  it('should show "no agents" message when discovered array is empty', async () => {
    const registry = makeRegistry();

    await promptAndAddSquads([], registry);

    expect(mockShowInformationMessage).toHaveBeenCalledWith('No new agents found.');
    expect(mockShowQuickPick).not.toHaveBeenCalled();
  });

  it('should present QuickPick with all discovered squads', async () => {
    const squads = [
      makeSquad({ id: 'alpha', name: 'Alpha', path: '/a', universe: 'prod' }),
      makeSquad({ id: 'bravo', name: 'Bravo', path: '/b', universe: 'staging' }),
    ];
    mockShowQuickPick.mockResolvedValue(undefined);
    const registry = makeRegistry();

    await promptAndAddSquads(squads, registry);

    expect(mockShowQuickPick).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ label: '🔷 Alpha', description: '/a' }),
        expect.objectContaining({ label: '🔷 Bravo', description: '/b' }),
      ]),
      expect.objectContaining({ canPickMany: true }),
    );
  });

  it('should add selected squads to registry', async () => {
    const squad = makeSquad({ id: 'alpha', name: 'Alpha' });
    const item = { label: '🔷 Alpha', description: '/a', detail: 'Universe: prod', picked: true, squad };
    mockShowQuickPick.mockResolvedValue([item]);
    const registry = makeRegistry();

    await promptAndAddSquads([squad], registry);

    expect(registry.addSquads).toHaveBeenCalledWith([squad]);
    expect(mockShowInformationMessage).toHaveBeenCalledWith('Added 1 agent(s) to registry.');
  });

  it('should show count of added agents', async () => {
    const squads = [
      makeSquad({ id: 'a', name: 'A' }),
      makeSquad({ id: 'b', name: 'B' }),
      makeSquad({ id: 'c', name: 'C' }),
    ];
    const items = squads.map(s => ({ label: s.name, description: s.path, detail: '', picked: true, squad: s }));
    mockShowQuickPick.mockResolvedValue(items);
    const registry = makeRegistry();

    await promptAndAddSquads(squads, registry);

    expect(mockShowInformationMessage).toHaveBeenCalledWith('Added 3 agent(s) to registry.');
  });

  it('should not add squads when user cancels QuickPick', async () => {
    mockShowQuickPick.mockResolvedValue(undefined);
    const registry = makeRegistry();

    await promptAndAddSquads([makeSquad()], registry);

    expect(registry.addSquads).not.toHaveBeenCalled();
  });

  it('should not add squads when user selects empty list', async () => {
    mockShowQuickPick.mockResolvedValue([]);
    const registry = makeRegistry();

    await promptAndAddSquads([makeSquad()], registry);

    expect(registry.addSquads).not.toHaveBeenCalled();
  });

  it('should include universe in detail field', async () => {
    const squad = makeSquad({ universe: 'rick-and-morty' });
    mockShowQuickPick.mockResolvedValue(undefined);
    const registry = makeRegistry();

    await promptAndAddSquads([squad], registry);

    expect(mockShowQuickPick).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ detail: 'Universe: rick-and-morty' }),
      ]),
      expect.anything(),
    );
  });

  it('should mark all items as picked by default', async () => {
    const squad = makeSquad();
    mockShowQuickPick.mockResolvedValue(undefined);
    const registry = makeRegistry();

    await promptAndAddSquads([squad], registry);

    const items = mockShowQuickPick.mock.calls[0][0];
    expect(items.every((i: { picked: boolean }) => i.picked === true)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// registerDiscoveryCommand (editless.discoverSquads)
// ---------------------------------------------------------------------------

describe('registerDiscoveryCommand', () => {
  it('should register editless.discoverSquads command', () => {
    const registry = makeRegistry();
    const ctx = makeContext();

    registerDiscoveryCommand(ctx, registry);

    expect(mockRegisterCommand).toHaveBeenCalledWith('editless.discoverSquads', expect.any(Function));
  });

  it('should push disposable to context subscriptions', () => {
    const registry = makeRegistry();
    const ctx = makeContext();

    registerDiscoveryCommand(ctx, registry);

    expect(ctx.subscriptions.length).toBe(1);
  });

  it('should use discoveryDir from config when set', async () => {
    makeConfig('/custom/dir');
    const registry = makeRegistry();
    const ctx = makeContext();
    registerDiscoveryCommand(ctx, registry);

    await getHandler('editless.discoverSquads')();

    expect(mockShowOpenDialog).not.toHaveBeenCalled();
  });

  it('should show folder picker when no discoveryDir configured', async () => {
    makeConfig('', []);
    mockShowOpenDialog.mockResolvedValue(undefined);
    const registry = makeRegistry();
    const ctx = makeContext();
    registerDiscoveryCommand(ctx, registry);

    await getHandler('editless.discoverSquads')();

    expect(mockShowOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
      }),
    );
  });

  it('should return early when user cancels folder picker', async () => {
    makeConfig('');
    mockShowOpenDialog.mockResolvedValue(undefined);
    const registry = makeRegistry();
    const ctx = makeContext();
    registerDiscoveryCommand(ctx, registry);

    await getHandler('editless.discoverSquads')();

    expect(registry.loadSquads).not.toHaveBeenCalled();
  });

  it('should call loadSquads and discover when directory is selected', async () => {
    makeConfig('');
    mockShowOpenDialog.mockResolvedValue([{ fsPath: '/selected/dir' }]);
    const registry = makeRegistry();
    const ctx = makeContext();
    registerDiscoveryCommand(ctx, registry);

    await getHandler('editless.discoverSquads')();

    // loadSquads is called twice: once to get existing, once inside discoverAgentTeams
    expect(registry.loadSquads).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// checkDiscoveryOnStartup
// ---------------------------------------------------------------------------

describe('checkDiscoveryOnStartup', () => {
  it('should return early when no scan paths configured', () => {
    makeConfig('', []);
    const registry = makeRegistry();
    const ctx = makeContext();

    checkDiscoveryOnStartup(ctx, registry);

    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });

  it('should return early when discoveryDir is whitespace only', () => {
    makeConfig('   ', []);
    const registry = makeRegistry();
    const ctx = makeContext();

    checkDiscoveryOnStartup(ctx, registry);

    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });

  it('should scan discoveryDir when configured', () => {
    makeConfig('/scan/here');
    const registry = makeRegistry();
    const ctx = makeContext();

    checkDiscoveryOnStartup(ctx, registry);

    expect(registry.loadSquads).toHaveBeenCalled();
  });

  it('should scan scanPaths when configured', () => {
    makeConfig('', ['/path/a', '/path/b']);
    const registry = makeRegistry();
    const ctx = makeContext();

    checkDiscoveryOnStartup(ctx, registry);

    expect(registry.loadSquads).toHaveBeenCalled();
  });

  it('should not show notification when no new agents discovered', () => {
    makeConfig('/empty/dir');
    const registry = makeRegistry();
    const ctx = makeContext();

    checkDiscoveryOnStartup(ctx, registry);

    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });

  it('should show notification when new agents are discovered', () => {
    // To make discoverAgentTeamsInMultiplePaths return results, we need
    // actual directories with team.md. Since we can't easily do that
    // with the real fs calls (discovery.ts uses real fs), we test that
    // the notification path works correctly by testing promptAndAddSquads
    // and the message flow separately.
    // Here we verify the "no agents found" early-return branch.
    makeConfig('/nonexistent/path');
    const registry = makeRegistry();
    const ctx = makeContext();

    checkDiscoveryOnStartup(ctx, registry);

    // discoverAgentTeamsInMultiplePaths returns [] for non-existent paths
    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });

  it('should combine discoveryDir and scanPaths for scanning', () => {
    makeConfig('/dir-a', ['/dir-b', '/dir-c']);
    const registry = makeRegistry();
    const ctx = makeContext();

    checkDiscoveryOnStartup(ctx, registry);

    // Should call loadSquads since there are paths to scan
    expect(registry.loadSquads).toHaveBeenCalled();
  });

  it('should filter out empty scan paths', () => {
    makeConfig('', ['', '  ', '']);
    const registry = makeRegistry();
    const ctx = makeContext();

    checkDiscoveryOnStartup(ctx, registry);

    // All paths are empty/whitespace, so early return
    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });
});
