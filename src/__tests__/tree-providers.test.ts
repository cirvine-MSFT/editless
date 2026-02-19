import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockIsGhAvailable = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
const mockFetchAssignedIssues = vi.fn().mockResolvedValue([]);
const mockFetchMyPRs = vi.fn().mockResolvedValue([]);
let mockIssueFilterConfig: Record<string, unknown> = {};

vi.mock('vscode', () => {
  const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };

  class TreeItem {
    label: string;
    collapsibleState: number;
    iconPath?: unknown;
    description?: string;
    contextValue?: string;
    tooltip?: unknown;
    command?: unknown;
    id?: string;
    constructor(label: string, collapsibleState: number = TreeItemCollapsibleState.None) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }

  class ThemeIcon {
    id: string;
    constructor(id: string) { this.id = id; }
  }

  class MarkdownString {
    value: string;
    constructor(value: string) { this.value = value; }
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

  return {
    TreeItem, TreeItemCollapsibleState, ThemeIcon, MarkdownString, EventEmitter,
    Uri: {
      parse: (s: string) => ({ toString: () => s }),
      file: (s: string) => ({ toString: () => s, fsPath: s }),
    },
    workspace: {
      getConfiguration: () => ({
        get: (key: string, defaultValue?: unknown) =>
          key === 'github.issueFilter' ? mockIssueFilterConfig : defaultValue,
      }),
    },
  };
});

vi.mock('../github-client', () => ({
  isGhAvailable: (...args: unknown[]) => mockIsGhAvailable(...(args as [])),
  fetchAssignedIssues: (...args: unknown[]) => mockFetchAssignedIssues(...(args as [string])),
  fetchMyPRs: (...args: unknown[]) => mockFetchMyPRs(...(args as [string])),
}));

vi.mock('../scanner', () => ({
  scanSquad: vi.fn((cfg: unknown) => ({
    config: cfg,
    status: 'idle',
    lastActivity: null,
    recentDecisions: [{ title: 'Dec1', date: '2026-01-01', author: 'Rick', summary: '' }],
    recentLogs: [],
    recentOrchestration: [],
    activeAgents: [],
    inboxCount: 0,
    roster: [{ name: 'Morty', role: 'Dev' }],
    charter: '',
    recentActivity: [{ agent: 'Morty', task: 'fix bug', outcome: 'done' }],
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
    expect(children[0].iconPath).toBeDefined();
    expect(children[1].iconPath).toBeDefined();
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
    expect(children[0].iconPath).toBeDefined();
    expect(children[1].iconPath).toBeDefined();
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
  function createMockRegistry(squads: { id: string; name: string; path: string; icon: string; universe: string }[]) {
    return {
      loadSquads: () => squads,
      getSquad: (id: string) => squads.find(s => s.id === id),
      registryPath: '/tmp/registry.json',
      updateSquad: vi.fn(),
    };
  }

  it('should return undefined for root-level items', () => {
    const registry = createMockRegistry([
      { id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'test' },
    ]);
    const provider = new EditlessTreeProvider(registry as never);
    const roots = provider.getChildren();

    expect(roots.length).toBeGreaterThan(0);
    for (const root of roots) {
      expect(provider.getParent(root)).toBeUndefined();
    }
  });

  it('should return squad item as parent of category children', () => {
    const registry = createMockRegistry([
      { id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'test' },
    ]);
    const provider = new EditlessTreeProvider(registry as never);
    const roots = provider.getChildren();
    const squadItem = roots.find(r => r.type === 'squad');
    expect(squadItem).toBeDefined();

    const squadChildren = provider.getChildren(squadItem!);
    expect(squadChildren.length).toBeGreaterThan(0);
    for (const child of squadChildren) {
      expect(provider.getParent(child)).toBe(squadItem);
    }
  });

  it('should return category item as parent of roster/decision/activity children', () => {
    const registry = createMockRegistry([
      { id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'test' },
    ]);
    const provider = new EditlessTreeProvider(registry as never);
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
  function createMockRegistry(squads: { id: string; name: string; path: string; icon: string; universe: string }[]) {
    return {
      loadSquads: () => squads,
      getSquad: (id: string) => squads.find(s => s.id === id),
      registryPath: '/tmp/registry.json',
      updateSquad: vi.fn(),
    };
  }

  it('returns terminal sessions + roster, decisions, activity categories', () => {
    const squads = [{ id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'test' }];
    const registry = createMockRegistry(squads);
    const provider = new EditlessTreeProvider(registry as never);
    const roots = provider.getChildren();
    const squadItem = roots.find(r => r.type === 'squad')!;

    const children = provider.getChildren(squadItem);

    const kinds = children.filter(c => c.type === 'category').map(c => c.categoryKind);
    expect(kinds).toContain('roster');
    expect(kinds).toContain('decisions');
    expect(kinds).toContain('activity');
  });

  it('returns empty array for unknown squad id', () => {
    const registry = createMockRegistry([]);
    const provider = new EditlessTreeProvider(registry as never);
    const fakeSquadItem = new EditlessTreeItem('Fake', 'squad', 1, 'nonexistent');

    const children = provider.getChildren(fakeSquadItem);

    expect(children).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// EditlessTreeProvider — getChildren(category)
// ---------------------------------------------------------------------------

describe('EditlessTreeProvider — getChildren(category)', () => {
  function createMockRegistry(squads: { id: string; name: string; path: string; icon: string; universe: string }[]) {
    return {
      loadSquads: () => squads,
      getSquad: (id: string) => squads.find(s => s.id === id),
      registryPath: '/tmp/registry.json',
      updateSquad: vi.fn(),
    };
  }

  const testSquads = [{ id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'test' }];

  it('returns roster agents for roster category', () => {
    const registry = createMockRegistry(testSquads);
    const provider = new EditlessTreeProvider(registry as never);
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

  it('returns decision items for decisions category', () => {
    const registry = createMockRegistry(testSquads);
    const provider = new EditlessTreeProvider(registry as never);
    const roots = provider.getChildren();
    const squadItem = roots.find(r => r.type === 'squad')!;
    const squadChildren = provider.getChildren(squadItem);
    const decisionsCategory = squadChildren.find(c => c.categoryKind === 'decisions')!;

    const decisionChildren = provider.getChildren(decisionsCategory);

    expect(decisionChildren.length).toBeGreaterThan(0);
    expect(decisionChildren[0].type).toBe('decision');
    expect(decisionChildren[0].label).toBe('Dec1');
  });

  it('returns activity items for activity category', () => {
    const registry = createMockRegistry(testSquads);
    const provider = new EditlessTreeProvider(registry as never);
    const roots = provider.getChildren();
    const squadItem = roots.find(r => r.type === 'squad')!;
    const squadChildren = provider.getChildren(squadItem);
    const activityCategory = squadChildren.find(c => c.categoryKind === 'activity')!;

    const activityChildren = provider.getChildren(activityCategory);

    expect(activityChildren.length).toBeGreaterThan(0);
    expect(activityChildren[0].type).toBe('activity');
    expect(activityChildren[0].label).toBe('Morty: fix bug');
  });

  it('returns empty for non-squad non-category element', () => {
    const registry = createMockRegistry(testSquads);
    const provider = new EditlessTreeProvider(registry as never);
    const item = new EditlessTreeItem('Random', 'agent');

    const children = provider.getChildren(item);

    expect(children).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// EditlessTreeProvider — findTerminalItem
// ---------------------------------------------------------------------------

describe('EditlessTreeProvider — findTerminalItem', () => {
  function createMockRegistry(squads: { id: string; name: string; path: string; icon: string; universe: string }[]) {
    return {
      loadSquads: () => squads,
      getSquad: (id: string) => squads.find(s => s.id === id),
      registryPath: '/tmp/registry.json',
      updateSquad: vi.fn(),
    };
  }

  it('returns undefined when no terminal manager', () => {
    const registry = createMockRegistry([]);
    const provider = new EditlessTreeProvider(registry as never);
    const mockTerminal = { name: 'test' } as never;

    expect(provider.findTerminalItem(mockTerminal)).toBeUndefined();
  });

  it('returns undefined for untracked terminal', () => {
    const squads = [{ id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'test' }];
    const registry = createMockRegistry(squads);
    const mockTerminalMgr = {
      getTerminalInfo: vi.fn().mockReturnValue(undefined),
      getTerminalsForSquad: vi.fn().mockReturnValue([]),
      getOrphanedSessions: vi.fn().mockReturnValue([]),
      getSessionState: vi.fn().mockReturnValue('idle'),
      onDidChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      getLastActivityAt: vi.fn().mockReturnValue(undefined),
    };

    const provider = new EditlessTreeProvider(registry as never, mockTerminalMgr as never);
    const mockTerminal = { name: 'untracked' } as never;

    expect(provider.findTerminalItem(mockTerminal)).toBeUndefined();
  });

  it('returns matching item for tracked terminal', () => {
    const squads = [{ id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'test' }];
    const registry = createMockRegistry(squads);
    const mockTerminal = { name: 'test-session' } as never;

    const mockTerminalMgr = {
      getTerminalInfo: vi.fn().mockReturnValue({ squadId: 'squad-a', displayName: 'Test', labelKey: 'lk', createdAt: new Date() }),
      getTerminalsForSquad: vi.fn().mockReturnValue([{ terminal: mockTerminal, info: { squadId: 'squad-a', displayName: 'Test', labelKey: 'lk', createdAt: new Date() } }]),
      getOrphanedSessions: vi.fn().mockReturnValue([]),
      getSessionState: vi.fn().mockReturnValue('idle'),
      onDidChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      getLastActivityAt: vi.fn().mockReturnValue(undefined),
    };

    const provider = new EditlessTreeProvider(registry as never, mockTerminalMgr as never);
    const found = provider.findTerminalItem(mockTerminal);

    expect(found).toBeDefined();
    expect(found!.type).toBe('terminal');
    expect(found!.terminal).toBe(mockTerminal);
  });
});

// ---------------------------------------------------------------------------
// EditlessTreeProvider — refresh, setDiscoveredAgents, invalidate
// ---------------------------------------------------------------------------

describe('EditlessTreeProvider — refresh / setDiscoveredAgents / invalidate', () => {
  function createMockRegistry(squads: { id: string; name: string; path: string; icon: string; universe: string }[]) {
    return {
      loadSquads: () => squads,
      getSquad: (id: string) => squads.find(s => s.id === id),
      registryPath: '/tmp/registry.json',
      updateSquad: vi.fn(),
    };
  }

  it('refresh clears cache and fires onDidChangeTreeData', () => {
    const squads = [{ id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'test' }];
    const registry = createMockRegistry(squads);
    const provider = new EditlessTreeProvider(registry as never);
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);

    // Populate cache by accessing children
    const roots = provider.getChildren();
    const squadItem = roots.find(r => r.type === 'squad')!;
    provider.getChildren(squadItem);

    provider.refresh();

    expect(listener).toHaveBeenCalled();
  });

  it('setDiscoveredAgents updates list and fires event', () => {
    const registry = createMockRegistry([]);
    const provider = new EditlessTreeProvider(registry as never);
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);

    const agents = [
      { id: 'agent-1', name: 'Agent One', filePath: '/agents/one.md', source: 'workspace' as const },
    ];
    provider.setDiscoveredAgents(agents);

    expect(listener).toHaveBeenCalled();

    const roots = provider.getChildren();
    const discoveredItems = roots.filter(r => r.type === 'discovered-agent');
    expect(discoveredItems).toHaveLength(1);
    expect(discoveredItems[0].label).toBe('Agent One');
  });

  it('invalidate clears specific cache entry and fires event', () => {
    const squads = [
      { id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'test' },
      { id: 'squad-b', name: 'Squad B', path: '/b', icon: '🚀', universe: 'test' },
    ];
    const registry = createMockRegistry(squads);
    const provider = new EditlessTreeProvider(registry as never);
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
  function createMockRegistry(squads: { id: string; name: string; path: string; icon: string; universe: string }[]) {
    return {
      loadSquads: () => squads,
      getSquad: (id: string) => squads.find(s => s.id === id),
      registryPath: '/tmp/registry.json',
      updateSquad: vi.fn(),
    };
  }

  it('hidden squads are excluded from root items', () => {
    const squads = [
      { id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'test' },
      { id: 'squad-b', name: 'Squad B', path: '/b', icon: '🚀', universe: 'test' },
    ];
    const registry = createMockRegistry(squads);
    const visibility = { isHidden: (id: string) => id === 'squad-a' };
    const provider = new EditlessTreeProvider(registry as never, undefined, undefined, undefined, visibility as never);

    const roots = provider.getChildren();
    const squadItems = roots.filter(r => r.type === 'squad');

    expect(squadItems).toHaveLength(1);
    expect(squadItems[0].squadId).toBe('squad-b');
  });

  it('"All agents hidden" placeholder when everything hidden', () => {
    const squads = [{ id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'test' }];
    const registry = createMockRegistry(squads);
    const visibility = { isHidden: () => true };
    const provider = new EditlessTreeProvider(registry as never, undefined, undefined, undefined, visibility as never);

    const roots = provider.getChildren();

    expect(roots).toHaveLength(1);
    expect(roots[0].label).toContain('All agents hidden');
  });
});

// ---------------------------------------------------------------------------
// EditlessTreeProvider — discovered agents section
// ---------------------------------------------------------------------------

describe('EditlessTreeProvider — discovered agents', () => {
  function createMockRegistry(squads: { id: string; name: string; path: string; icon: string; universe: string }[]) {
    return {
      loadSquads: () => squads,
      getSquad: (id: string) => squads.find(s => s.id === id),
      registryPath: '/tmp/registry.json',
      updateSquad: vi.fn(),
    };
  }

  it('shows discovered agents header and items in root', () => {
    const registry = createMockRegistry([]);
    const provider = new EditlessTreeProvider(registry as never);
    provider.setDiscoveredAgents([
      { id: 'a1', name: 'Bot One', filePath: '/bots/one.md', source: 'workspace' },
      { id: 'a2', name: 'Bot Two', filePath: '/bots/two.agent.md', source: 'copilot-dir' },
    ]);

    const roots = provider.getChildren();
    const header = roots.find(r => r.label === 'Discovered Agents');
    expect(header).toBeDefined();

    const agentItems = roots.filter(r => r.type === 'discovered-agent');
    expect(agentItems).toHaveLength(2);
  });

  it('hidden discovered agents are excluded', () => {
    const registry = createMockRegistry([]);
    const visibility = { isHidden: (id: string) => id === 'a1' };
    const provider = new EditlessTreeProvider(registry as never, undefined, undefined, undefined, visibility as never);
    provider.setDiscoveredAgents([
      { id: 'a1', name: 'Bot One', filePath: '/bots/one.md', source: 'workspace' },
      { id: 'a2', name: 'Bot Two', filePath: '/bots/two.md', source: 'workspace' },
    ]);

    const roots = provider.getChildren();
    const agentItems = roots.filter(r => r.type === 'discovered-agent');
    expect(agentItems).toHaveLength(1);
    expect(agentItems[0].label).toBe('Bot Two');
  });
});

// ---------------------------------------------------------------------------
// EditlessTreeProvider — squad item description
// ---------------------------------------------------------------------------

describe('EditlessTreeProvider — squad item description', () => {
  function createMockRegistry(squads: { id: string; name: string; path: string; icon: string; universe: string }[]) {
    return {
      loadSquads: () => squads,
      getSquad: (id: string) => squads.find(s => s.id === id),
      registryPath: '/tmp/registry.json',
      updateSquad: vi.fn(),
    };
  }

  it('includes session count in description when terminal manager has sessions', () => {
    const squads = [{ id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'test' }];
    const registry = createMockRegistry(squads);
    const mockTerminalMgr = {
      getTerminalsForSquad: vi.fn().mockReturnValue([
        { terminal: {}, info: {} },
        { terminal: {}, info: {} },
      ]),
      getOrphanedSessions: vi.fn().mockReturnValue([]),
      getSessionState: vi.fn().mockReturnValue('idle'),
      onDidChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      getLastActivityAt: vi.fn().mockReturnValue(undefined),
    };

    const provider = new EditlessTreeProvider(registry as never, mockTerminalMgr as never);
    const roots = provider.getChildren();
    const squadItem = roots.find(r => r.type === 'squad')!;

    expect(squadItem.description).toContain('2 sessions');
  });

  it('includes singular session count', () => {
    const squads = [{ id: 'squad-a', name: 'Squad A', path: '/a', icon: '🤖', universe: 'test' }];
    const registry = createMockRegistry(squads);
    const mockTerminalMgr = {
      getTerminalsForSquad: vi.fn().mockReturnValue([{ terminal: {}, info: {} }]),
      getOrphanedSessions: vi.fn().mockReturnValue([]),
      getSessionState: vi.fn().mockReturnValue('idle'),
      onDidChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      getLastActivityAt: vi.fn().mockReturnValue(undefined),
    };

    const provider = new EditlessTreeProvider(registry as never, mockTerminalMgr as never);
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
  function createMockRegistry(squads: { id: string; name: string; path: string; icon: string; universe: string }[]) {
    return {
      loadSquads: () => squads,
      getSquad: (id: string) => squads.find(s => s.id === id),
      registryPath: '/tmp/registry.json',
      updateSquad: vi.fn(),
    };
  }

  it('agents with same name in different squads have different IDs', () => {
    const squads = [
      { id: 'squad-a', name: 'Squad A', path: '/projects/alpha', icon: '🤖', universe: 'test' },
      { id: 'squad-b', name: 'Squad B', path: '/projects/beta', icon: '🚀', universe: 'test' },
    ];
    const registry = createMockRegistry(squads);
    const provider = new EditlessTreeProvider(registry as never);

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
    const registry = createMockRegistry(squads);
    const provider = new EditlessTreeProvider(registry as never);

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

  it('decision items have unique IDs based on content, not index', () => {
    const squads = [
      { id: 'squad-a', name: 'Squad A', path: '/projects/alpha', icon: '🤖', universe: 'test' },
    ];
    const registry = createMockRegistry(squads);
    const provider = new EditlessTreeProvider(registry as never);

    const roots = provider.getChildren();
    const squadItem = roots.find(r => r.squadId === 'squad-a')!;
    const squadChildren = provider.getChildren(squadItem);
    const decisionsCategory = squadChildren.find(c => c.categoryKind === 'decisions')!;
    const decisions = provider.getChildren(decisionsCategory);

    expect(decisions.length).toBeGreaterThan(0);
    expect(decisions[0].id).toBeDefined();
    expect(decisions[0].id).not.toContain(':0');
    expect(decisions[0].id).toMatch(/^[a-f0-9]{8}:decision:[a-f0-9]{8}$/);
  });

  it('activity items have unique IDs based on content, not index', () => {
    const squads = [
      { id: 'squad-a', name: 'Squad A', path: '/projects/alpha', icon: '🤖', universe: 'test' },
    ];
    const registry = createMockRegistry(squads);
    const provider = new EditlessTreeProvider(registry as never);

    const roots = provider.getChildren();
    const squadItem = roots.find(r => r.squadId === 'squad-a')!;
    const squadChildren = provider.getChildren(squadItem);
    const activityCategory = squadChildren.find(c => c.categoryKind === 'activity')!;
    const activities = provider.getChildren(activityCategory);

    expect(activities.length).toBeGreaterThan(0);
    expect(activities[0].id).toBeDefined();
    expect(activities[0].id).not.toContain(':0');
    expect(activities[0].id).toMatch(/^[a-f0-9]{8}:activity:[a-f0-9]{8}$/);
  });

  it('all tree item IDs across multiple squads are unique', () => {
    const squads = [
      { id: 'squad-a', name: 'Squad A', path: '/projects/alpha', icon: '🤖', universe: 'test' },
      { id: 'squad-b', name: 'Squad B', path: '/projects/beta', icon: '🚀', universe: 'test' },
    ];
    const registry = createMockRegistry(squads);
    const provider = new EditlessTreeProvider(registry as never);

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
