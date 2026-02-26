import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createVscodeMock,
  ThemeIcon,
} from './mocks/vscode-mocks';

const mockIsGhAvailable = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
const mockFetchAssignedIssues = vi.fn().mockResolvedValue([]);
const mockFetchMyPRs = vi.fn().mockResolvedValue([]);
let mockIssueFilterConfig: Record<string, unknown> = {};

vi.mock('vscode', () =>
  createVscodeMock({
    workspace: {
      getConfiguration: () => ({
        get: (key: string, defaultValue?: unknown) =>
          key === 'github.issueFilter' ? mockIssueFilterConfig : defaultValue,
      }),
    },
  }),
);

vi.mock('../github-client', () => ({
  isGhAvailable: (...args: unknown[]) => mockIsGhAvailable(...(args as [])),
  fetchAssignedIssues: (...args: unknown[]) => mockFetchAssignedIssues(...(args as [string])),
  fetchMyPRs: (...args: unknown[]) => mockFetchMyPRs(...(args as [string])),
}));

vi.mock('../scanner', () => ({
  scanSquad: vi.fn((cfg: unknown) => ({
    config: cfg,
    lastActivity: null,
    roster: [{ name: 'Morty', role: 'Dev' }],
    charter: '',
  })),
}));

vi.mock('../squad-utils', () => ({
  getLocalSquadVersion: vi.fn(() => null),
}));

vi.mock('../terminal-manager', () => ({
  getStateIcon: vi.fn(() => undefined),
  getStateDescription: vi.fn(() => ''),
}));

import { WorkItemsTreeProvider, WorkItemsTreeItem } from '../work-items-tree';
import { PRsTreeProvider, PRsTreeItem } from '../prs-tree';
import { EditlessTreeProvider, EditlessTreeItem } from '../editless-tree';

beforeEach(() => {
  vi.clearAllMocks();
  mockIsGhAvailable.mockResolvedValue(false);
  mockIssueFilterConfig = {};
});

// ---------------------------------------------------------------------------
// WorkItemsTreeProvider
// ---------------------------------------------------------------------------

describe('WorkItemsTreeProvider', () => {
  it('should return placeholder info item when no repos are configured', () => {
    const provider = new WorkItemsTreeProvider();
    const children = provider.getChildren();

    expect(children).toHaveLength(2);
    expect(children[0].label).toBe('Configure in GitHub');
    expect(children[1].label).toBe('Configure in ADO');
    expect(children[0].iconPath).toEqual(new ThemeIcon('github'));
    expect(children[1].iconPath).toEqual(new ThemeIcon('azure'));
  });

  it('should return empty array when getChildren is called with an unrecognised element', async () => {
    const provider = new WorkItemsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);

    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());

    const item = new WorkItemsTreeItem('test');
    const children = provider.getChildren(item);

    expect(children).toEqual([]);
  });

  it('should fire onDidChangeTreeData when refresh completes', async () => {
    const provider = new WorkItemsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);

    provider.refresh();
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());
  });

  it('should return the element itself from getTreeItem', () => {
    const provider = new WorkItemsTreeProvider();
    const item = new WorkItemsTreeItem('test');
    const result = provider.getTreeItem(item);

    expect(result).toBe(item);
  });

  it('should filter out issues with excluded labels', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue([
      { number: 1, title: 'Bug', state: 'OPEN', url: 'u', labels: ['bug'], assignees: [], repository: 'r', milestone: '' },
      { number: 2, title: 'Wontfix', state: 'OPEN', url: 'u', labels: ['wontfix'], assignees: [], repository: 'r', milestone: '' },
    ]);
    mockIssueFilterConfig = { excludeLabels: ['wontfix'] };

    const provider = new WorkItemsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['r']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const children = provider.getChildren();
    expect(children).toHaveLength(1);
    expect(children[0].label).toContain('#1');
  });

  it('should only show issues with included labels', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue([
      { number: 1, title: 'Feature', state: 'OPEN', url: 'u', labels: ['feature'], assignees: [], repository: 'r', milestone: '' },
      { number: 2, title: 'Bug', state: 'OPEN', url: 'u', labels: ['bug'], assignees: [], repository: 'r', milestone: '' },
    ]);
    mockIssueFilterConfig = { includeLabels: ['feature'] };

    const provider = new WorkItemsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['r']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const children = provider.getChildren();
    expect(children).toHaveLength(1);
    expect(children[0].label).toContain('#1');
  });

  it('should group issues by milestone when milestones are present', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue([
      { number: 1, title: 'A', state: 'OPEN', url: 'u', labels: [], assignees: [], repository: 'r', milestone: 'v1.0' },
      { number: 2, title: 'B', state: 'OPEN', url: 'u', labels: [], assignees: [], repository: 'r', milestone: 'v1.0' },
      { number: 3, title: 'C', state: 'OPEN', url: 'u', labels: [], assignees: [], repository: 'r', milestone: '' },
    ]);

    const provider = new WorkItemsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['r']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const roots = provider.getChildren();
    expect(roots).toHaveLength(2);
    expect(roots[0].label).toBe('v1.0');
    expect(roots[0].description).toBe('2 issues');
    expect(roots[0].contextValue).toBe('milestone-group');
    expect(roots[1].label).toBe('No Milestone');

    const msChildren = provider.getChildren(roots[0]);
    expect(msChildren).toHaveLength(2);

    const noMsChildren = provider.getChildren(roots[1]);
    expect(noMsChildren).toHaveLength(1);
  });

  it('should show flat list when no milestones are present', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue([
      { number: 1, title: 'A', state: 'OPEN', url: 'u', labels: [], assignees: [], repository: 'r', milestone: '' },
      { number: 2, title: 'B', state: 'OPEN', url: 'u', labels: [], assignees: [], repository: 'r', milestone: '' },
    ]);

    const provider = new WorkItemsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['r']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const children = provider.getChildren();
    expect(children).toHaveLength(2);
    expect(children[0].contextValue).toBe('work-item');
  });
});

// ---------------------------------------------------------------------------
// PRsTreeProvider
// ---------------------------------------------------------------------------

describe('PRsTreeProvider', () => {
  it('should return placeholder info item when no repos are configured', () => {
    const provider = new PRsTreeProvider();
    const children = provider.getChildren();

    expect(children).toHaveLength(2);
    expect(children[0].label).toBe('Configure in GitHub');
    expect(children[1].label).toBe('Configure in ADO');
    expect(children[0].iconPath).toEqual(new ThemeIcon('github'));
    expect(children[1].iconPath).toEqual(new ThemeIcon('azure'));
  });

  it('should return empty array when getChildren is called with an unrecognised element', async () => {
    const provider = new PRsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);

    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());

    const item = new PRsTreeItem('test');
    const children = provider.getChildren(item);

    expect(children).toEqual([]);
  });

  it('should fire onDidChangeTreeData when refresh completes', async () => {
    const provider = new PRsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);

    provider.refresh();
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());
  });

  it('should return the element itself from getTreeItem', () => {
    const provider = new PRsTreeProvider();
    const item = new PRsTreeItem('test');
    const result = provider.getTreeItem(item);

    expect(result).toBe(item);
  });
});

// ---------------------------------------------------------------------------
// EditlessTreeProvider — getParent
// ---------------------------------------------------------------------------

describe('EditlessTreeProvider — getParent', () => {
  function createMockAgentSettings(
    squads: { id: string; name: string; path: string; icon: string; universe: string }[],
    opts: { isHidden?: (id: string) => boolean; getHiddenIds?: () => string[] } = {},
  ) {
    return {
      get: (id: string) => {
        const s = squads.find(s => s.id === id);
        return s ? { name: s.name, icon: s.icon } : undefined;
      },
      getAll: () => Object.fromEntries(squads.map(s => [s.id, { name: s.name, icon: s.icon }])),
      isHidden: opts.isHidden ?? (() => false),
      getHiddenIds: opts.getHiddenIds ?? (() => []),
      update: vi.fn(),
      remove: vi.fn(),
      hide: vi.fn(),
      show: vi.fn(),
      showAll: vi.fn(),
      reload: vi.fn(),
      settingsPath: '/mock/settings.json',
    };
  }

  function toDiscovered(squads: { id: string; name: string; path: string; icon: string; universe: string }[]) {
    return squads.map(s => ({
      id: s.id, name: s.name, type: 'squad' as const,
      source: 'workspace' as const, path: s.path, universe: s.universe,
    }));
  }

  it('should return undefined for root-level items', () => {
    const squads = [
      { id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'test' },
    ];
    const agentSettings = createMockAgentSettings(squads);
    const provider = new EditlessTreeProvider(agentSettings as never);
    provider.setDiscoveredItems(toDiscovered(squads));
    const roots = provider.getChildren();

    expect(roots.length).toBeGreaterThan(0);
    for (const root of roots) {
      expect(provider.getParent(root)).toBeUndefined();
    }
  });

  it('should return squad item as parent of category children', () => {
    const squads = [
      { id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'test' },
    ];
    const agentSettings = createMockAgentSettings(squads);
    const provider = new EditlessTreeProvider(agentSettings as never);
    provider.setDiscoveredItems(toDiscovered(squads));
    const roots = provider.getChildren();
    const squadItem = roots.find(r => r.type === 'squad');
    expect(squadItem).toBeDefined();

    const squadChildren = provider.getChildren(squadItem!);
    expect(squadChildren.length).toBeGreaterThan(0);
    for (const child of squadChildren) {
      expect(provider.getParent(child)).toBe(squadItem);
    }
  });

  it('should return category item as parent of roster children', () => {
    const squads = [
      { id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'test' },
    ];
    const agentSettings = createMockAgentSettings(squads);
    const provider = new EditlessTreeProvider(agentSettings as never);
    provider.setDiscoveredItems(toDiscovered(squads));
    const roots = provider.getChildren();
    const squadItem = roots.find(r => r.type === 'squad')!;
    const squadChildren = provider.getChildren(squadItem);

    const rosterCategory = squadChildren.find(c => c.categoryKind === 'roster');
    expect(rosterCategory).toBeDefined();

    const rosterChildren = provider.getChildren(rosterCategory!);
    expect(rosterChildren.length).toBeGreaterThan(0);
    for (const child of rosterChildren) {
      expect(provider.getParent(child)).toBe(rosterCategory);
    }
  });
});

// ---------------------------------------------------------------------------
// EditlessTreeProvider — getChildren(squad)
// ---------------------------------------------------------------------------

describe('EditlessTreeProvider — getChildren(squad)', () => {
  function createMockAgentSettings(
    squads: { id: string; name: string; path: string; icon: string; universe: string }[],
    opts: { isHidden?: (id: string) => boolean; getHiddenIds?: () => string[] } = {},
  ) {
    return {
      get: (id: string) => {
        const s = squads.find(s => s.id === id);
        return s ? { name: s.name, icon: s.icon } : undefined;
      },
      getAll: () => Object.fromEntries(squads.map(s => [s.id, { name: s.name, icon: s.icon }])),
      isHidden: opts.isHidden ?? (() => false),
      getHiddenIds: opts.getHiddenIds ?? (() => []),
      update: vi.fn(),
      remove: vi.fn(),
      hide: vi.fn(),
      show: vi.fn(),
      showAll: vi.fn(),
      reload: vi.fn(),
      settingsPath: '/mock/settings.json',
    };
  }

  function toDiscovered(squads: { id: string; name: string; path: string; icon: string; universe: string }[]) {
    return squads.map(s => ({
      id: s.id, name: s.name, type: 'squad' as const,
      source: 'workspace' as const, path: s.path, universe: s.universe,
    }));
  }

  it('returns terminal sessions + roster category', () => {
    const squads = [{ id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'test' }];
    const agentSettings = createMockAgentSettings(squads);
    const provider = new EditlessTreeProvider(agentSettings as never);
    provider.setDiscoveredItems(toDiscovered(squads));
    const roots = provider.getChildren();
    const squadItem = roots.find(r => r.type === 'squad')!;

    const children = provider.getChildren(squadItem);

    const kinds = children.filter(c => c.type === 'category').map(c => c.categoryKind);
    expect(kinds).toContain('roster');
  });

  it('returns empty array for unknown squad id', () => {
    const agentSettings = createMockAgentSettings([]);
    const provider = new EditlessTreeProvider(agentSettings as never);
    const fakeSquadItem = new EditlessTreeItem('Fake', 'squad', 1, 'nonexistent');

    const children = provider.getChildren(fakeSquadItem);

    expect(children).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// EditlessTreeProvider — getChildren(category)
// ---------------------------------------------------------------------------

describe('EditlessTreeProvider — getChildren(category)', () => {
  function createMockAgentSettings(
    squads: { id: string; name: string; path: string; icon: string; universe: string }[],
    opts: { isHidden?: (id: string) => boolean; getHiddenIds?: () => string[] } = {},
  ) {
    return {
      get: (id: string) => {
        const s = squads.find(s => s.id === id);
        return s ? { name: s.name, icon: s.icon } : undefined;
      },
      getAll: () => Object.fromEntries(squads.map(s => [s.id, { name: s.name, icon: s.icon }])),
      isHidden: opts.isHidden ?? (() => false),
      getHiddenIds: opts.getHiddenIds ?? (() => []),
      update: vi.fn(),
      remove: vi.fn(),
      hide: vi.fn(),
      show: vi.fn(),
      showAll: vi.fn(),
      reload: vi.fn(),
      settingsPath: '/mock/settings.json',
    };
  }

  function toDiscovered(squads: { id: string; name: string; path: string; icon: string; universe: string }[]) {
    return squads.map(s => ({
      id: s.id, name: s.name, type: 'squad' as const,
      source: 'workspace' as const, path: s.path, universe: s.universe,
    }));
  }

  const testSquads = [{ id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'test' }];

  it('returns roster agents for roster category', () => {
    const agentSettings = createMockAgentSettings(testSquads);
    const provider = new EditlessTreeProvider(agentSettings as never);
    provider.setDiscoveredItems(toDiscovered(testSquads));
    const roots = provider.getChildren();
    const squadItem = roots.find(r => r.type === 'squad')!;
    const squadChildren = provider.getChildren(squadItem);
    const rosterCategory = squadChildren.find(c => c.categoryKind === 'roster')!;

    const rosterChildren = provider.getChildren(rosterCategory);

    expect(rosterChildren.length).toBeGreaterThan(0);
    expect(rosterChildren[0].type).toBe('agent');
    expect(rosterChildren[0].label).toBe('Morty');
    expect(rosterChildren[0].description).toBe('Dev');
  });

  it('returns empty for non-squad non-category element', () => {
    const agentSettings = createMockAgentSettings(testSquads);
    const provider = new EditlessTreeProvider(agentSettings as never);
    const item = new EditlessTreeItem('Random', 'agent');

    const children = provider.getChildren(item);

    expect(children).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// EditlessTreeProvider — findTerminalItem
// ---------------------------------------------------------------------------

describe('EditlessTreeProvider — findTerminalItem', () => {
  function createMockAgentSettings(
    squads: { id: string; name: string; path: string; icon: string; universe: string }[],
    opts: { isHidden?: (id: string) => boolean; getHiddenIds?: () => string[] } = {},
  ) {
    return {
      get: (id: string) => {
        const s = squads.find(s => s.id === id);
        return s ? { name: s.name, icon: s.icon } : undefined;
      },
      getAll: () => Object.fromEntries(squads.map(s => [s.id, { name: s.name, icon: s.icon }])),
      isHidden: opts.isHidden ?? (() => false),
      getHiddenIds: opts.getHiddenIds ?? (() => []),
      update: vi.fn(),
      remove: vi.fn(),
      hide: vi.fn(),
      show: vi.fn(),
      showAll: vi.fn(),
      reload: vi.fn(),
      settingsPath: '/mock/settings.json',
    };
  }

  function toDiscovered(squads: { id: string; name: string; path: string; icon: string; universe: string }[]) {
    return squads.map(s => ({
      id: s.id, name: s.name, type: 'squad' as const,
      source: 'workspace' as const, path: s.path, universe: s.universe,
    }));
  }

  it('returns undefined when no terminal manager', () => {
    const agentSettings = createMockAgentSettings([]);
    const provider = new EditlessTreeProvider(agentSettings as never);
    const mockTerminal = { name: 'test' } as never;

    expect(provider.findTerminalItem(mockTerminal)).toBeUndefined();
  });

  it('returns undefined for untracked terminal', () => {
    const squads = [{ id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'test' }];
    const agentSettings = createMockAgentSettings(squads);
    const mockTerminalMgr = {
      getTerminalInfo: vi.fn().mockReturnValue(undefined),
      getTerminalsForSquad: vi.fn().mockReturnValue([]),
      getOrphanedSessions: vi.fn().mockReturnValue([]),
      getSessionState: vi.fn().mockReturnValue('inactive'),
      onDidChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      getLastActivityAt: vi.fn().mockReturnValue(undefined),
    };

    const provider = new EditlessTreeProvider(agentSettings as never, mockTerminalMgr as never);
    provider.setDiscoveredItems(toDiscovered(squads));
    const mockTerminal = { name: 'untracked' } as never;

    expect(provider.findTerminalItem(mockTerminal)).toBeUndefined();
  });

  it('returns matching item for tracked terminal', () => {
    const squads = [{ id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'test' }];
    const agentSettings = createMockAgentSettings(squads);
    const mockTerminal = { name: 'test-session' } as never;

    const mockTerminalMgr = {
      getTerminalInfo: vi.fn().mockReturnValue({ squadId: 'squad-a', displayName: 'Test', labelKey: 'lk', createdAt: new Date() }),
      getTerminalsForSquad: vi.fn().mockReturnValue([{ terminal: mockTerminal, info: { squadId: 'squad-a', displayName: 'Test', labelKey: 'lk', createdAt: new Date() } }]),
      getOrphanedSessions: vi.fn().mockReturnValue([]),
      getSessionState: vi.fn().mockReturnValue('inactive'),
      onDidChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      getLastActivityAt: vi.fn().mockReturnValue(undefined),
    };

    const provider = new EditlessTreeProvider(agentSettings as never, mockTerminalMgr as never);
    provider.setDiscoveredItems(toDiscovered(squads));
    const found = provider.findTerminalItem(mockTerminal);

    expect(found).toBeDefined();
    expect(found!.type).toBe('terminal');
    expect(found!.terminal).toBe(mockTerminal);
  });
});

// ---------------------------------------------------------------------------
// EditlessTreeProvider — refresh, setDiscoveredItems, invalidate
// ---------------------------------------------------------------------------

describe('EditlessTreeProvider — refresh / setDiscoveredItems / invalidate', () => {
  function createMockAgentSettings(
    squads: { id: string; name: string; path: string; icon: string; universe: string }[],
    opts: { isHidden?: (id: string) => boolean; getHiddenIds?: () => string[] } = {},
  ) {
    return {
      get: (id: string) => {
        const s = squads.find(s => s.id === id);
        return s ? { name: s.name, icon: s.icon } : undefined;
      },
      getAll: () => Object.fromEntries(squads.map(s => [s.id, { name: s.name, icon: s.icon }])),
      isHidden: opts.isHidden ?? (() => false),
      getHiddenIds: opts.getHiddenIds ?? (() => []),
      update: vi.fn(),
      remove: vi.fn(),
      hide: vi.fn(),
      show: vi.fn(),
      showAll: vi.fn(),
      reload: vi.fn(),
      settingsPath: '/mock/settings.json',
    };
  }

  function toDiscovered(squads: { id: string; name: string; path: string; icon: string; universe: string }[]) {
    return squads.map(s => ({
      id: s.id, name: s.name, type: 'squad' as const,
      source: 'workspace' as const, path: s.path, universe: s.universe,
    }));
  }

  it('refresh clears cache and fires onDidChangeTreeData', () => {
    const squads = [{ id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'test' }];
    const agentSettings = createMockAgentSettings(squads);
    const provider = new EditlessTreeProvider(agentSettings as never);
    provider.setDiscoveredItems(toDiscovered(squads));
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);

    // Populate cache by accessing children
    const roots = provider.getChildren();
    const squadItem = roots.find(r => r.type === 'squad')!;
    provider.getChildren(squadItem);

    provider.refresh();

    expect(listener).toHaveBeenCalled();
  });

  it('setDiscoveredItems updates list and fires event', () => {
    const agentSettings = createMockAgentSettings([]);
    const provider = new EditlessTreeProvider(agentSettings as never);
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);

    const items = [
      { id: 'agent-1', name: 'Agent One', type: 'agent' as const, source: 'workspace' as const, path: '/agents/one.md' },
    ];
    provider.setDiscoveredItems(items);

    expect(listener).toHaveBeenCalled();

    const roots = provider.getChildren();
    const agentItems = roots.filter(r => r.type === 'squad');
    expect(agentItems).toHaveLength(1);
    expect(agentItems[0].label).toBe('Agent One');
  });

  it('invalidate clears specific cache entry and fires event', () => {
    const squads = [
      { id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'test' },
      { id: 'squad-b', name: 'Squad B', path: '/b', icon: '🚀', universe: 'test' },
    ];
    const agentSettings = createMockAgentSettings(squads);
    const provider = new EditlessTreeProvider(agentSettings as never);
    provider.setDiscoveredItems(toDiscovered(squads));
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);

    provider.invalidate('squad-a');

    expect(listener).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// EditlessTreeProvider — visibility filtering
// ---------------------------------------------------------------------------

describe('EditlessTreeProvider — visibility filtering', () => {
  function createMockAgentSettings(
    squads: { id: string; name: string; path: string; icon: string; universe: string }[],
    opts: { isHidden?: (id: string) => boolean; getHiddenIds?: () => string[] } = {},
  ) {
    return {
      get: (id: string) => {
        const s = squads.find(s => s.id === id);
        return s ? { name: s.name, icon: s.icon } : undefined;
      },
      getAll: () => Object.fromEntries(squads.map(s => [s.id, { name: s.name, icon: s.icon }])),
      isHidden: opts.isHidden ?? (() => false),
      getHiddenIds: opts.getHiddenIds ?? (() => []),
      update: vi.fn(),
      remove: vi.fn(),
      hide: vi.fn(),
      show: vi.fn(),
      showAll: vi.fn(),
      reload: vi.fn(),
      settingsPath: '/mock/settings.json',
    };
  }

  function toDiscovered(squads: { id: string; name: string; path: string; icon: string; universe: string }[]) {
    return squads.map(s => ({
      id: s.id, name: s.name, type: 'squad' as const,
      source: 'workspace' as const, path: s.path, universe: s.universe,
    }));
  }

  it('hidden squads appear with type squad-hidden', () => {
    const squads = [
      { id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'test' },
      { id: 'squad-b', name: 'Squad B', path: '/b', icon: '🚀', universe: 'test' },
    ];
    const agentSettings = createMockAgentSettings(squads, { isHidden: (id: string) => id === 'squad-a' });
    const provider = new EditlessTreeProvider(agentSettings as never);
    provider.setDiscoveredItems(toDiscovered(squads));

    const roots = provider.getChildren();
    const visibleSquads = roots.filter(r => r.type === 'squad');
    const hiddenSquads = roots.filter(r => r.type === 'squad-hidden');

    expect(visibleSquads).toHaveLength(1);
    expect(visibleSquads[0].squadId).toBe('squad-b');
    expect(hiddenSquads).toHaveLength(1);
    expect(hiddenSquads[0].squadId).toBe('squad-a');
  });

  it('"All agents hidden" placeholder when everything hidden', () => {
    const squads = [{ id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'test' }];
    const agentSettings = createMockAgentSettings(squads, { isHidden: () => true, getHiddenIds: () => ['squad-a'] });
    const provider = new EditlessTreeProvider(agentSettings as never);
    provider.setDiscoveredItems(toDiscovered(squads));

    const roots = provider.getChildren();

    // First item is always the built-in Copilot CLI, then hidden squad, then the "all hidden" message
    expect(roots[0].type).toBe('default-agent');
    // Hidden squad appears inline as squad-hidden
    const hiddenSquads = roots.filter(r => r.type === 'squad-hidden');
    expect(hiddenSquads).toHaveLength(1);
  });

  it('shows default Copilot CLI agent when no squads registered', () => {
    const agentSettings = createMockAgentSettings([], { isHidden: () => false, getHiddenIds: () => [] });
    const provider = new EditlessTreeProvider(agentSettings as never);

    const roots = provider.getChildren();

    expect(roots).toHaveLength(1);
    expect(roots[0].type).toBe('default-agent');
    expect(roots[0].label).toBe('Copilot CLI');
  });
});

// ---------------------------------------------------------------------------
// EditlessTreeProvider — default Copilot CLI agent
// ---------------------------------------------------------------------------

describe('EditlessTreeProvider — default Copilot CLI agent', () => {
  function createMockAgentSettings(
    squads: { id: string; name: string; path: string; icon: string; universe: string }[],
    opts: { isHidden?: (id: string) => boolean; getHiddenIds?: () => string[] } = {},
  ) {
    return {
      get: (id: string) => {
        const s = squads.find(s => s.id === id);
        return s ? { name: s.name, icon: s.icon } : undefined;
      },
      getAll: () => Object.fromEntries(squads.map(s => [s.id, { name: s.name, icon: s.icon }])),
      isHidden: opts.isHidden ?? (() => false),
      getHiddenIds: opts.getHiddenIds ?? (() => []),
      update: vi.fn(),
      remove: vi.fn(),
      hide: vi.fn(),
      show: vi.fn(),
      showAll: vi.fn(),
      reload: vi.fn(),
      settingsPath: '/mock/settings.json',
    };
  }

  function toDiscovered(squads: { id: string; name: string; path: string; icon: string; universe: string }[]) {
    return squads.map(s => ({
      id: s.id, name: s.name, type: 'squad' as const,
      source: 'workspace' as const, path: s.path, universe: s.universe,
    }));
  }

  it('always appears as the first root item', () => {
    const squads = [
      { id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'test' },
    ];
    const agentSettings = createMockAgentSettings(squads);
    const provider = new EditlessTreeProvider(agentSettings as never);
    provider.setDiscoveredItems(toDiscovered(squads));

    const roots = provider.getChildren();

    expect(roots[0].type).toBe('default-agent');
    expect(roots[0].label).toBe('Copilot CLI');
    expect(roots[0].id).toBe('builtin:copilot-cli');
  });

  it('coexists with registered squads', () => {
    const squads = [
      { id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'test' },
      { id: 'squad-b', name: 'Squad B', path: '/b', icon: '🚀', universe: 'test' },
    ];
    const agentSettings = createMockAgentSettings(squads);
    const provider = new EditlessTreeProvider(agentSettings as never);
    provider.setDiscoveredItems(toDiscovered(squads));

    const roots = provider.getChildren();

    expect(roots).toHaveLength(3); // default + 2 squads
    expect(roots[0].type).toBe('default-agent');
    expect(roots[1].type).toBe('squad');
    expect(roots[2].type).toBe('squad');
  });

  it('has contextValue "default-agent" for menu targeting', () => {
    const agentSettings = createMockAgentSettings([]);
    const provider = new EditlessTreeProvider(agentSettings as never);

    const roots = provider.getChildren();
    const defaultItem = roots.find(r => r.type === 'default-agent');

    expect(defaultItem).toBeDefined();
    expect(defaultItem!.contextValue).toBe('default-agent');
  });

  it('is not affected by agentSettings isHidden', () => {
    const agentSettings = createMockAgentSettings([], { isHidden: () => true, getHiddenIds: () => [] });
    const provider = new EditlessTreeProvider(agentSettings as never);

    const roots = provider.getChildren();
    const defaultItem = roots.find(r => r.type === 'default-agent');

    expect(defaultItem).toBeDefined();
    expect(defaultItem!.label).toBe('Copilot CLI');
  });

  it('shows "Generic Copilot agent" description when no sessions', () => {
    const agentSettings = createMockAgentSettings([]);
    const provider = new EditlessTreeProvider(agentSettings as never);

    const roots = provider.getChildren();
    const defaultItem = roots.find(r => r.type === 'default-agent');

    expect(defaultItem!.description).toBe('Generic Copilot agent');
  });
});

// ---------------------------------------------------------------------------
// EditlessTreeProvider — discovered agents section
// ---------------------------------------------------------------------------

describe('EditlessTreeProvider — discovered agents', () => {
  function createMockAgentSettings(
    squads: { id: string; name: string; path: string; icon: string; universe: string }[],
    opts: { isHidden?: (id: string) => boolean; getHiddenIds?: () => string[] } = {},
  ) {
    return {
      get: (id: string) => {
        const s = squads.find(s => s.id === id);
        return s ? { name: s.name, icon: s.icon } : undefined;
      },
      getAll: () => Object.fromEntries(squads.map(s => [s.id, { name: s.name, icon: s.icon }])),
      isHidden: opts.isHidden ?? (() => false),
      getHiddenIds: opts.getHiddenIds ?? (() => []),
      update: vi.fn(),
      remove: vi.fn(),
      hide: vi.fn(),
      show: vi.fn(),
      showAll: vi.fn(),
      reload: vi.fn(),
      settingsPath: '/mock/settings.json',
    };
  }

  it('shows discovered agents as root items', () => {
    const agentSettings = createMockAgentSettings([]);
    const provider = new EditlessTreeProvider(agentSettings as never);
    provider.setDiscoveredItems([
      { id: 'a1', name: 'Bot One', type: 'agent' as const, source: 'workspace' as const, path: '/bots/one.md' },
      { id: 'a2', name: 'Bot Two', type: 'agent' as const, source: 'copilot-dir' as const, path: '/bots/two.agent.md' },
    ]);

    const roots = provider.getChildren();
    const agentItems = roots.filter(r => r.type === 'squad');
    expect(agentItems).toHaveLength(2);
  });

  it('hidden discovered agents appear with type squad-hidden', () => {
    const agentSettings = createMockAgentSettings([], { isHidden: (id: string) => id === 'a1' });
    const provider = new EditlessTreeProvider(agentSettings as never);
    provider.setDiscoveredItems([
      { id: 'a1', name: 'Bot One', type: 'agent' as const, source: 'workspace' as const, path: '/bots/one.md' },
      { id: 'a2', name: 'Bot Two', type: 'agent' as const, source: 'workspace' as const, path: '/bots/two.md' },
    ]);

    const roots = provider.getChildren();
    const visibleItems = roots.filter(r => r.type === 'squad');
    const hiddenItems = roots.filter(r => r.type === 'squad-hidden');
    expect(visibleItems).toHaveLength(1);
    expect(visibleItems[0].label).toBe('Bot Two');
    expect(hiddenItems).toHaveLength(1);
    expect(hiddenItems[0].label).toBe('Bot One');
  });
});

// ---------------------------------------------------------------------------
// EditlessTreeProvider — setDiscoveredItems (unified agents + squads)
// ---------------------------------------------------------------------------

describe('EditlessTreeProvider — setDiscoveredItems', () => {
  function createMockAgentSettings(
    squads: { id: string; name: string; path: string; icon: string; universe: string }[],
    opts: { isHidden?: (id: string) => boolean; getHiddenIds?: () => string[] } = {},
  ) {
    return {
      get: (id: string) => {
        const s = squads.find(s => s.id === id);
        return s ? { name: s.name, icon: s.icon } : undefined;
      },
      getAll: () => Object.fromEntries(squads.map(s => [s.id, { name: s.name, icon: s.icon }])),
      isHidden: opts.isHidden ?? (() => false),
      getHiddenIds: opts.getHiddenIds ?? (() => []),
      update: vi.fn(),
      remove: vi.fn(),
      hide: vi.fn(),
      show: vi.fn(),
      showAll: vi.fn(),
      reload: vi.fn(),
      settingsPath: '/mock/settings.json',
    };
  }

  it('shows both agents and squads from unified discovery as root items', () => {
    const agentSettings = createMockAgentSettings([]);
    const provider = new EditlessTreeProvider(agentSettings as never);
    provider.setDiscoveredItems([
      { id: 'agent-1', name: 'Solo Agent', type: 'agent' as const, source: 'workspace' as const, path: '/agents/solo.agent.md', description: 'An agent' },
      { id: 'squad-1', name: 'Team Alpha', type: 'squad' as const, source: 'workspace' as const, path: '/squads/alpha', description: 'A squad', universe: 'acme' },
    ]);

    const roots = provider.getChildren();

    const squadItems = roots.filter(r => r.type === 'squad');
    expect(squadItems).toHaveLength(2);
    // Both appear as root items with type 'squad'
    const labels = squadItems.map(r => r.label);
    expect(labels).toContain('Solo Agent');
  });
});

// ---------------------------------------------------------------------------
// EditlessTreeProvider — squad item description
// ---------------------------------------------------------------------------

describe('EditlessTreeProvider — squad item description', () => {
  function createMockAgentSettings(
    squads: { id: string; name: string; path: string; icon: string; universe: string }[],
    opts: { isHidden?: (id: string) => boolean; getHiddenIds?: () => string[] } = {},
  ) {
    return {
      get: (id: string) => {
        const s = squads.find(s => s.id === id);
        return s ? { name: s.name, icon: s.icon } : undefined;
      },
      getAll: () => Object.fromEntries(squads.map(s => [s.id, { name: s.name, icon: s.icon }])),
      isHidden: opts.isHidden ?? (() => false),
      getHiddenIds: opts.getHiddenIds ?? (() => []),
      update: vi.fn(),
      remove: vi.fn(),
      hide: vi.fn(),
      show: vi.fn(),
      showAll: vi.fn(),
      reload: vi.fn(),
      settingsPath: '/mock/settings.json',
    };
  }

  function toDiscovered(squads: { id: string; name: string; path: string; icon: string; universe: string }[]) {
    return squads.map(s => ({
      id: s.id, name: s.name, type: 'squad' as const,
      source: 'workspace' as const, path: s.path, universe: s.universe,
    }));
  }

  it('includes session count in description when terminal manager has sessions', () => {
    const squads = [{ id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'test' }];
    const agentSettings = createMockAgentSettings(squads);
    const mockTerminalMgr = {
      getTerminalsForSquad: vi.fn().mockReturnValue([
        { terminal: {}, info: {} },
        { terminal: {}, info: {} },
      ]),
      getOrphanedSessions: vi.fn().mockReturnValue([]),
      getSessionState: vi.fn().mockReturnValue('inactive'),
      onDidChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      getLastActivityAt: vi.fn().mockReturnValue(undefined),
    };

    const provider = new EditlessTreeProvider(agentSettings as never, mockTerminalMgr as never);
    provider.setDiscoveredItems(toDiscovered(squads));
    const roots = provider.getChildren();
    const squadItem = roots.find(r => r.type === 'squad')!;

    expect(squadItem.description).toContain('2 sessions');
  });

  it('includes singular session count', () => {
    const squads = [{ id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'test' }];
    const agentSettings = createMockAgentSettings(squads);
    const mockTerminalMgr = {
      getTerminalsForSquad: vi.fn().mockReturnValue([{ terminal: {}, info: {} }]),
      getOrphanedSessions: vi.fn().mockReturnValue([]),
      getSessionState: vi.fn().mockReturnValue('inactive'),
      onDidChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      getLastActivityAt: vi.fn().mockReturnValue(undefined),
    };

    const provider = new EditlessTreeProvider(agentSettings as never, mockTerminalMgr as never);
    provider.setDiscoveredItems(toDiscovered(squads));
    const roots = provider.getChildren();
    const squadItem = roots.find(r => r.type === 'squad')!;

    expect(squadItem.description).toContain('1 session');
    expect(squadItem.description).not.toContain('1 sessions');
  });
});

// ---------------------------------------------------------------------------
// EditlessTreeProvider — Tree Item ID Collision Prevention (Issue #227)
// ---------------------------------------------------------------------------

describe('EditlessTreeProvider — Tree Item ID Collision Prevention', () => {
  function createMockAgentSettings(
    squads: { id: string; name: string; path: string; icon: string; universe: string }[],
    opts: { isHidden?: (id: string) => boolean; getHiddenIds?: () => string[] } = {},
  ) {
    return {
      get: (id: string) => {
        const s = squads.find(s => s.id === id);
        return s ? { name: s.name, icon: s.icon } : undefined;
      },
      getAll: () => Object.fromEntries(squads.map(s => [s.id, { name: s.name, icon: s.icon }])),
      isHidden: opts.isHidden ?? (() => false),
      getHiddenIds: opts.getHiddenIds ?? (() => []),
      update: vi.fn(),
      remove: vi.fn(),
      hide: vi.fn(),
      show: vi.fn(),
      showAll: vi.fn(),
      reload: vi.fn(),
      settingsPath: '/mock/settings.json',
    };
  }

  function toDiscovered(squads: { id: string; name: string; path: string; icon: string; universe: string }[]) {
    return squads.map(s => ({
      id: s.id, name: s.name, type: 'squad' as const,
      source: 'workspace' as const, path: s.path, universe: s.universe,
    }));
  }

  it('agents with same name in different squads have different IDs', () => {
    const squads = [
      { id: 'squad-a', name: 'Squad A', path: '/projects/alpha', icon: '🤖', universe: 'test' },
      { id: 'squad-b', name: 'Squad B', path: '/projects/beta', icon: '🚀', universe: 'test' },
    ];
    const agentSettings = createMockAgentSettings(squads);
    const provider = new EditlessTreeProvider(agentSettings as never);
    provider.setDiscoveredItems(toDiscovered(squads));

    const roots = provider.getChildren();
    const squadAItem = roots.find(r => r.squadId === 'squad-a')!;
    const squadBItem = roots.find(r => r.squadId === 'squad-b')!;

    const squadAChildren = provider.getChildren(squadAItem);
    const squadBChildren = provider.getChildren(squadBItem);

    const rosterA = squadAChildren.find(c => c.categoryKind === 'roster')!;
    const rosterB = squadBChildren.find(c => c.categoryKind === 'roster')!;

    const agentsA = provider.getChildren(rosterA);
    const agentsB = provider.getChildren(rosterB);

    expect(agentsA.length).toBeGreaterThan(0);
    expect(agentsB.length).toBeGreaterThan(0);
    expect(agentsA[0].id).toBeDefined();
    expect(agentsB[0].id).toBeDefined();
    expect(agentsA[0].id).not.toBe(agentsB[0].id);
  });

  it('tree item IDs remain stable across refreshes', () => {
    const squads = [
      { id: 'squad-a', name: 'Squad A', path: '/projects/alpha', icon: '🤖', universe: 'test' },
    ];
    const agentSettings = createMockAgentSettings(squads);
    const provider = new EditlessTreeProvider(agentSettings as never);
    provider.setDiscoveredItems(toDiscovered(squads));

    const getRosterIds = () => {
      const roots = provider.getChildren();
      const squadItem = roots.find(r => r.squadId === 'squad-a')!;
      const squadChildren = provider.getChildren(squadItem);
      const rosterCategory = squadChildren.find(c => c.categoryKind === 'roster')!;
      const agents = provider.getChildren(rosterCategory);
      return agents.map(a => a.id);
    };

    const firstIds = getRosterIds();
    provider.refresh();
    const secondIds = getRosterIds();

    expect(firstIds).toEqual(secondIds);
  });

  it('all tree item IDs across multiple squads are unique', () => {
    const squads = [
      { id: 'squad-a', name: 'Squad A', path: '/projects/alpha', icon: '🤖', universe: 'test' },
      { id: 'squad-b', name: 'Squad B', path: '/projects/beta', icon: '🚀', universe: 'test' },
    ];
    const agentSettings = createMockAgentSettings(squads);
    const provider = new EditlessTreeProvider(agentSettings as never);
    provider.setDiscoveredItems(toDiscovered(squads));

    const collectAllIds = (item?: EditlessTreeItem): string[] => {
      const children = provider.getChildren(item);
      const ids: string[] = [];
      for (const child of children) {
        if (child.id) ids.push(child.id);
        ids.push(...collectAllIds(child));
      }
      return ids;
    };

    const allIds = collectAllIds();
    const uniqueIds = new Set(allIds);

    expect(allIds.length).toBe(uniqueIds.size);
  });
});

// ---------------------------------------------------------------------------
// EditlessTreeProvider — orphan item resumable vs non-resumable (#338)
// ---------------------------------------------------------------------------

describe('EditlessTreeProvider — orphan item resumability', () => {
  function createMockAgentSettings(
    squads: { id: string; name: string; path: string; icon: string; universe: string }[],
    opts: { isHidden?: (id: string) => boolean; getHiddenIds?: () => string[] } = {},
  ) {
    return {
      get: (id: string) => {
        const s = squads.find(s => s.id === id);
        return s ? { name: s.name, icon: s.icon } : undefined;
      },
      getAll: () => Object.fromEntries(squads.map(s => [s.id, { name: s.name, icon: s.icon }])),
      isHidden: opts.isHidden ?? (() => false),
      getHiddenIds: opts.getHiddenIds ?? (() => []),
      update: vi.fn(),
      remove: vi.fn(),
      hide: vi.fn(),
      show: vi.fn(),
      showAll: vi.fn(),
      reload: vi.fn(),
      settingsPath: '/mock/settings.json',
    };
  }

  function toDiscovered(squads: { id: string; name: string; path: string; icon: string; universe: string }[]) {
    return squads.map(s => ({
      id: s.id, name: s.name, type: 'squad' as const,
      source: 'workspace' as const, path: s.path, universe: s.universe,
    }));
  }

  function makeTerminalManager(orphans: Array<Record<string, unknown>>) {
    return {
      getTerminalsForSquad: () => [],
      getOrphanedSessions: () => orphans,
      onDidChange: (cb: Function) => ({ dispose: () => {} }),
      getSessionState: () => 'orphaned',
      getLastActivityAt: () => undefined,
      getStateIcon: vi.fn(),
      getStateDescription: vi.fn(),
      getTerminalInfo: () => undefined,
    };
  }

  const squads = [{ id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'standalone' }];

  it('should show "previous session — resume" for resumable orphan', () => {
    const orphan = {
      id: 'orphan-1',
      labelKey: 'terminal:orphan-1',
      displayName: '🤖 Squad A #1',
      squadId: 'squad-a',
      squadName: 'Squad A',
      squadIcon: '🤖',
      index: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      terminalName: '🤖 Squad A #1',
      lastSeenAt: Date.now(),
      rebootCount: 0,
      agentSessionId: 'session-abc',
    };

    const agentSettings = createMockAgentSettings(squads);
    const tm = makeTerminalManager([orphan]);
    const provider = new EditlessTreeProvider(agentSettings as never, tm as never);
    provider.setDiscoveredItems(toDiscovered(squads));

    const roots = provider.getChildren();
    const squadItem = roots.find(r => r.type === 'squad')!;
    const children = provider.getChildren(squadItem);
    const orphanItem = children.find(c => c.type === 'orphanedSession');

    expect(orphanItem).toBeDefined();
    expect(orphanItem!.description).toContain('resume');
    expect((orphanItem!.iconPath as { id: string }).id).toBe('history');
  });

  it('should show "session ended" for non-resumable orphan (no agentSessionId)', () => {
    const orphan = {
      id: 'orphan-2',
      labelKey: 'terminal:orphan-2',
      displayName: '🤖 Squad A #1',
      squadId: 'squad-a',
      squadName: 'Squad A',
      squadIcon: '🤖',
      index: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      terminalName: '🤖 Squad A #1',
      lastSeenAt: Date.now(),
      rebootCount: 0,
      // no agentSessionId
    };

    const agentSettings = createMockAgentSettings(squads);
    const tm = makeTerminalManager([orphan]);
    const provider = new EditlessTreeProvider(agentSettings as never, tm as never);
    provider.setDiscoveredItems(toDiscovered(squads));

    const roots = provider.getChildren();
    const squadItem = roots.find(r => r.type === 'squad')!;
    const children = provider.getChildren(squadItem);
    const orphanItem = children.find(c => c.type === 'orphanedSession');

    expect(orphanItem).toBeDefined();
    expect(orphanItem!.description).toBe('session ended');
    expect((orphanItem!.iconPath as { id: string }).id).toBe('circle-outline');
  });

  it('should have different tooltip for resumable vs non-resumable', () => {
    const resumableOrphan = {
      id: 'res-1', labelKey: 'terminal:res-1', displayName: 'Test', squadId: 'squad-a',
      squadName: 'Squad A', squadIcon: '🤖', index: 1, createdAt: '2026-01-01T00:00:00.000Z',
      terminalName: 'Test', lastSeenAt: Date.now(), rebootCount: 0, agentSessionId: 'sess-1',
    };
    const nonResumableOrphan = {
      id: 'non-1', labelKey: 'terminal:non-1', displayName: 'Test2', squadId: 'squad-a',
      squadName: 'Squad A', squadIcon: '🤖', index: 2, createdAt: '2026-01-01T00:00:00.000Z',
      terminalName: 'Test2', lastSeenAt: Date.now(), rebootCount: 0,
    };

    const agentSettings = createMockAgentSettings(squads);
    const tm = makeTerminalManager([resumableOrphan, nonResumableOrphan]);
    const provider = new EditlessTreeProvider(agentSettings as never, tm as never);
    provider.setDiscoveredItems(toDiscovered(squads));

    const roots = provider.getChildren();
    const squadItem = roots.find(r => r.type === 'squad')!;
    const children = provider.getChildren(squadItem);
    const orphanItems = children.filter(c => c.type === 'orphanedSession');

    expect(orphanItems).toHaveLength(2);
    const resumableTooltip = (orphanItems.find(o => o.persistedEntry?.id === 'res-1')!.tooltip as { value: string }).value;
    const nonResumableTooltip = (orphanItems.find(o => o.persistedEntry?.id === 'non-1')!.tooltip as { value: string }).value;

    expect(resumableTooltip).toContain('pick up where you left off');
    expect(nonResumableTooltip).toContain('cannot be resumed');
  });
});

// ---------------------------------------------------------------------------
// EditlessTreeProvider — resumable session count at tree level (#397)
// ---------------------------------------------------------------------------

describe('EditlessTreeProvider — resumable session count at tree level', () => {
  function createMockAgentSettings(
    squads: { id: string; name: string; path: string; icon: string; universe: string }[],
    opts: { isHidden?: (id: string) => boolean; getHiddenIds?: () => string[] } = {},
  ) {
    return {
      get: (id: string) => {
        const s = squads.find(s => s.id === id);
        return s ? { name: s.name, icon: s.icon } : undefined;
      },
      getAll: () => Object.fromEntries(squads.map(s => [s.id, { name: s.name, icon: s.icon }])),
      isHidden: opts.isHidden ?? (() => false),
      getHiddenIds: opts.getHiddenIds ?? (() => []),
      update: vi.fn(),
      remove: vi.fn(),
      hide: vi.fn(),
      show: vi.fn(),
      showAll: vi.fn(),
      reload: vi.fn(),
      settingsPath: '/mock/settings.json',
    };
  }

  function toDiscovered(squads: { id: string; name: string; path: string; icon: string; universe: string }[]) {
    return squads.map(s => ({
      id: s.id, name: s.name, type: 'squad' as const,
      source: 'workspace' as const, path: s.path, universe: s.universe,
    }));
  }

  function makeTerminalManager(
    terminals: Array<{ terminal: object; info: object }>,
    orphans: Array<Record<string, unknown>>,
  ) {
    return {
      getTerminalsForSquad: vi.fn().mockReturnValue(terminals),
      getOrphanedSessions: vi.fn().mockReturnValue(orphans),
      onDidChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      getSessionState: vi.fn().mockReturnValue('orphaned'),
      getLastActivityAt: vi.fn().mockReturnValue(undefined),
    };
  }

  const standaloneSquad = [{ id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'standalone' }];

  it('squad item shows resumable count in description when orphans exist', () => {
    const orphans = [
      { id: 'o1', squadId: 'squad-a', agentSessionId: 'sess-1', displayName: 'Test', labelKey: 'k', squadName: 'A', squadIcon: '🤖', index: 1, createdAt: '2026-01-01T00:00:00.000Z', terminalName: 'T', lastSeenAt: Date.now(), rebootCount: 0 },
      { id: 'o2', squadId: 'squad-a', agentSessionId: 'sess-2', displayName: 'Test2', labelKey: 'k2', squadName: 'A', squadIcon: '🤖', index: 2, createdAt: '2026-01-01T00:00:00.000Z', terminalName: 'T2', lastSeenAt: Date.now(), rebootCount: 0 },
    ];
    const tm = makeTerminalManager([], orphans);
    const provider = new EditlessTreeProvider(createMockAgentSettings(standaloneSquad) as never, tm as never);
    provider.setDiscoveredItems(toDiscovered(standaloneSquad));

    const roots = provider.getChildren();
    const squadItem = roots.find(r => r.type === 'squad')!;
    expect(squadItem.description).toContain('2 resumable');
  });

  it('standalone squad with 0 terminals but orphans still shows as Collapsed', () => {
    const orphans = [
      { id: 'o1', squadId: 'squad-a', agentSessionId: 'sess-1', displayName: 'Test', labelKey: 'k', squadName: 'A', squadIcon: '🤖', index: 1, createdAt: '2026-01-01T00:00:00.000Z', terminalName: 'T', lastSeenAt: Date.now(), rebootCount: 0 },
    ];
    const tm = makeTerminalManager([], orphans);
    const provider = new EditlessTreeProvider(createMockAgentSettings(standaloneSquad) as never, tm as never);
    provider.setDiscoveredItems(toDiscovered(standaloneSquad));

    const roots = provider.getChildren();
    const squadItem = roots.find(r => r.type === 'squad')!;
    // Collapsed (1) not None (0)
    expect(squadItem.collapsibleState).toBe(1);
  });

  it('default agent item shows resumable count in description', () => {
    const orphans = [
      { id: 'o1', squadId: 'builtin:copilot-cli', agentSessionId: 'sess-1', displayName: 'CLI', labelKey: 'k', squadName: 'CLI', squadIcon: '', index: 1, createdAt: '2026-01-01T00:00:00.000Z', terminalName: 'CLI', lastSeenAt: Date.now(), rebootCount: 0 },
    ];
    const tm = makeTerminalManager([], orphans);
    const provider = new EditlessTreeProvider(createMockAgentSettings([]) as never, tm as never);

    const roots = provider.getChildren();
    const defaultItem = roots.find(r => r.type === 'default-agent')!;
    expect(defaultItem.description).toContain('1 resumable');
    // Should be Collapsed, not None
    expect(defaultItem.collapsibleState).toBe(1);
  });

  it('description has no resumable text when no orphans exist', () => {
    const tm = makeTerminalManager([], []);
    const provider = new EditlessTreeProvider(createMockAgentSettings(standaloneSquad) as never, tm as never);
    provider.setDiscoveredItems(toDiscovered(standaloneSquad));

    const roots = provider.getChildren();
    const squadItem = roots.find(r => r.type === 'squad')!;
    expect(squadItem.description).not.toContain('resumable');

    const defaultItem = roots.find(r => r.type === 'default-agent')!;
    expect(defaultItem.description).not.toContain('resumable');
    expect(defaultItem.description).toBe('Generic Copilot agent');
  });
});
