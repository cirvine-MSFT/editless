import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentTeamConfig } from '../types';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockShowInformationMessage,
  mockShowQuickPick,
} = vi.hoisted(() => ({
  mockShowInformationMessage: vi.fn(),
  mockShowQuickPick: vi.fn(),
}));

vi.mock('vscode', () => {
  return {
    window: {
      showInformationMessage: mockShowInformationMessage,
      showQuickPick: mockShowQuickPick,
    },
    workspace: {
      getConfiguration: (section?: string) => {
        if (section === 'editless.cli') {
          return {
            get: (key: string, defaultValue?: unknown) => {
              if (key === 'launchCommand') return 'copilot --agent $(agent)';
              return defaultValue;
            },
          };
        }
        return { get: vi.fn() };
      },
      workspaceFolders: [],
    },
  };
});

vi.mock('../team-dir', () => ({
  resolveTeamMd: vi.fn(),
}));

// We import the module under test AFTER mocks are set up.

import {
  promptAndAddSquads,
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

beforeEach(() => {
  vi.clearAllMocks();
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
