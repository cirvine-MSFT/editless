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
    Uri: { parse: (s: string) => ({ toString: () => s }) },
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

vi.mock('../squad-upgrader', () => ({
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

    expect(children).toHaveLength(1);
    expect(children[0].label).toBe('Configure GitHub repos in settings');
    expect(children[0].iconPath).toBeDefined();
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
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));

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
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));

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
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));

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
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));

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

    expect(children).toHaveLength(1);
    expect(children[0].label).toBe('Configure GitHub repos in settings');
    expect(children[0].iconPath).toBeDefined();
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
