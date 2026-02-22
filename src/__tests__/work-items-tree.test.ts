import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockIsGhAvailable = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
const mockFetchAssignedIssues = vi.fn().mockResolvedValue([]);

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
    issue?: unknown;
    constructor(label: string, collapsibleState: number = TreeItemCollapsibleState.None) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }

  class ThemeIcon {
    id: string;
    color?: unknown;
    constructor(id: string, color?: unknown) { this.id = id; this.color = color; }
  }

  class ThemeColor {
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
    TreeItem, TreeItemCollapsibleState, ThemeIcon, ThemeColor, MarkdownString, EventEmitter,
    Uri: { parse: (s: string) => ({ toString: () => s }) },
    commands: {
      executeCommand: vi.fn(),
    },
    workspace: {
      workspaceFolders: [],
      getConfiguration: () => ({
        get: () => ({}),
      }),
    },
  };
});

vi.mock('../github-client', () => ({
  isGhAvailable: (...args: unknown[]) => mockIsGhAvailable(...(args as [])),
  fetchAssignedIssues: (...args: unknown[]) => mockFetchAssignedIssues(...(args as [string])),
}));

const mockExistsSync = vi.fn().mockReturnValue(false);
const mockReaddirSync = vi.fn().mockReturnValue([]);

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
  };
});

vi.mock('../team-dir', () => ({
  TEAM_DIR_NAMES: ['.squad', '.ai-team'],
}));

import { WorkItemsTreeProvider, WorkItemsTreeItem, mapGitHubState, mapAdoState, type UnifiedState } from '../work-items-tree';
import type { GitHubIssue } from '../github-client';

beforeEach(() => {
  vi.clearAllMocks();
  mockIsGhAvailable.mockResolvedValue(false);
  mockFetchAssignedIssues.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    number: 42,
    title: 'Test Issue',
    state: 'open',
    url: 'https://github.com/owner/repo/issues/42',
    labels: [],
    assignees: ['user'],
    repository: 'owner/repo',
    milestone: '',
    ...overrides,
  };
}

async function getIssueItems(issues: GitHubIssue[]): Promise<WorkItemsTreeItem[]> {
  mockIsGhAvailable.mockResolvedValue(true);
  mockFetchAssignedIssues.mockResolvedValue(issues);

  const provider = new WorkItemsTreeProvider();
  const listener = vi.fn();
  provider.onDidChangeTreeData(listener);
  provider.setRepos(['owner/repo']);
  await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

  return provider.getChildren();
}

// ---------------------------------------------------------------------------
// mapGitHubState / mapAdoState (#132)
// ---------------------------------------------------------------------------

describe('mapGitHubState', () => {
  it('should return "active" for open issues with assignees', () => {
    expect(mapGitHubState(makeIssue({ state: 'open', assignees: ['user'] }))).toBe('active');
  });

  it('should return "open" for open issues with no assignees', () => {
    expect(mapGitHubState(makeIssue({ state: 'open', assignees: [] }))).toBe('open');
  });

  it('should return "closed" for closed issues', () => {
    expect(mapGitHubState(makeIssue({ state: 'closed' }))).toBe('closed');
  });
});

describe('mapAdoState', () => {
  it('should map "New" to "open"', () => {
    expect(mapAdoState('New')).toBe('open');
  });

  it('should map "Active" to "active"', () => {
    expect(mapAdoState('Active')).toBe('active');
  });

  it('should map "Resolved" to "closed"', () => {
    expect(mapAdoState('Resolved')).toBe('closed');
  });
});

// ---------------------------------------------------------------------------
// Runtime filtering (#132)
// ---------------------------------------------------------------------------

describe('WorkItemsTreeProvider — runtime filter', () => {
  async function getFilteredItems(
    issues: GitHubIssue[],
    filter: { repos?: string[]; labels?: string[]; states?: Array<'open' | 'active' | 'closed'>; types?: string[] },
  ): Promise<WorkItemsTreeItem[]> {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue(issues);

    const provider = new WorkItemsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    provider.setFilter({
      repos: filter.repos ?? [],
      labels: filter.labels ?? [],
      states: filter.states ?? [],
      types: filter.types ?? [],
    });

    return provider.getChildren();
  }

  it('should filter by label', async () => {
    const items = await getFilteredItems(
      [makeIssue({ number: 1, labels: ['bug'] }), makeIssue({ number: 2, labels: ['feature'] })],
      { labels: ['bug'] },
    );
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain('#1');
  });

  it('should filter by state (active = assigned)', async () => {
    const items = await getFilteredItems(
      [makeIssue({ number: 1, assignees: ['user'] }), makeIssue({ number: 2, assignees: [] })],
      { states: ['active'] },
    );
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain('#1');
  });

  it('should filter by state (open = unassigned)', async () => {
    const items = await getFilteredItems(
      [makeIssue({ number: 1, assignees: ['user'] }), makeIssue({ number: 2, assignees: [] })],
      { states: ['open'] },
    );
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain('#2');
  });

  it('should show empty state message when filter excludes all items', async () => {
    const items = await getFilteredItems(
      [makeIssue({ labels: ['bug'] })],
      { labels: ['nonexistent'] },
    );
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('No items match current filter');
  });

  it('should return all items when filter is empty', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue([makeIssue({ number: 1 }), makeIssue({ number: 2 })]);

    const provider = new WorkItemsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    provider.setFilter({ repos: [], labels: [], states: [], types: [] });
    const items = provider.getChildren();
    expect(items).toHaveLength(2);
  });

  it('should clear filter and show all items', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue([makeIssue({ number: 1, labels: ['bug'] }), makeIssue({ number: 2 })]);

    const provider = new WorkItemsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    provider.setFilter({ repos: [], labels: ['bug'], states: [], types: [] });
    expect(provider.getChildren()).toHaveLength(1);

    provider.clearFilter();
    expect(provider.getChildren()).toHaveLength(2);
  });

  it('should report isFiltered correctly', () => {
    const provider = new WorkItemsTreeProvider();
    expect(provider.isFiltered).toBe(false);
    provider.setFilter({ repos: ['test'], labels: [], states: [], types: [] });
    expect(provider.isFiltered).toBe(true);
    provider.clearFilter();
    expect(provider.isFiltered).toBe(false);
  });

  it('should exclude items with non-matching release label (#194)', async () => {
    const items = await getFilteredItems(
      [
        makeIssue({ number: 1, labels: ['release:v0.1', 'type:bug'] }),
        makeIssue({ number: 2, labels: ['release:backlog', 'type:bug'] }),
        makeIssue({ number: 3, labels: ['release:v0.1', 'priority:p1'] }),
      ],
      { labels: ['release:v0.1'] },
    );
    expect(items).toHaveLength(2);
    expect(items.map(i => i.label)).toEqual(
      expect.arrayContaining([expect.stringContaining('#1'), expect.stringContaining('#3')]),
    );
  });

  it('should collect all unique labels from issues', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue([
      makeIssue({ labels: ['bug', 'urgent'] }),
      makeIssue({ labels: ['bug', 'feature'] }),
    ]);

    const provider = new WorkItemsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const labels = provider.getAllLabels();
    expect(labels).toEqual(['bug', 'feature', 'urgent']);
  });

  it('should use OR logic within same label category', async () => {
    const items = await getFilteredItems(
      [
        makeIssue({ number: 1, labels: ['release:v0.1', 'type:bug'] }),
        makeIssue({ number: 2, labels: ['release:backlog', 'type:bug'] }),
        makeIssue({ number: 3, labels: ['release:v0.2', 'type:feature'] }),
      ],
      { labels: ['release:v0.1', 'release:backlog'] },
    );
    expect(items).toHaveLength(2);
    expect(items.map(i => i.label)).toEqual(
      expect.arrayContaining([expect.stringContaining('#1'), expect.stringContaining('#2')]),
    );
  });

  it('should use AND logic across different label categories', async () => {
    const items = await getFilteredItems(
      [
        makeIssue({ number: 1, labels: ['type:docs', 'release:v0.1'] }),
        makeIssue({ number: 2, labels: ['type:docs', 'release:backlog'] }),
        makeIssue({ number: 3, labels: ['type:bug', 'release:v0.1'] }),
        makeIssue({ number: 4, labels: ['type:docs'] }),
      ],
      { labels: ['type:docs', 'release:v0.1'] },
    );
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain('#1');
  });

  it('should combine OR within category and AND across categories', async () => {
    const items = await getFilteredItems(
      [
        makeIssue({ number: 1, labels: ['type:docs', 'release:v0.1'] }),
        makeIssue({ number: 2, labels: ['type:docs', 'release:backlog'] }),
        makeIssue({ number: 3, labels: ['type:bug', 'release:v0.1'] }),
        makeIssue({ number: 4, labels: ['type:docs'] }),
      ],
      { labels: ['type:docs', 'release:v0.1', 'release:backlog'] },
    );
    expect(items).toHaveLength(2);
    expect(items.map(i => i.label)).toEqual(
      expect.arrayContaining([expect.stringContaining('#1'), expect.stringContaining('#2')]),
    );
  });

  it('should handle labels without a prefix (empty prefix group)', async () => {
    const items = await getFilteredItems(
      [
        makeIssue({ number: 1, labels: ['urgent', 'type:bug'] }),
        makeIssue({ number: 2, labels: ['nice-to-have', 'type:bug'] }),
        makeIssue({ number: 3, labels: ['urgent', 'type:feature'] }),
      ],
      { labels: ['urgent', 'nice-to-have'] },
    );
    expect(items).toHaveLength(3);
    expect(items.map(i => i.label)).toEqual(
      expect.arrayContaining([expect.stringContaining('#1'), expect.stringContaining('#2'), expect.stringContaining('#3')]),
    );
  });

  it('should handle mixed prefixed and unprefixed filters', async () => {
    const items = await getFilteredItems(
      [
        makeIssue({ number: 1, labels: ['urgent', 'type:bug'] }),
        makeIssue({ number: 2, labels: ['nice-to-have', 'type:bug'] }),
        makeIssue({ number: 3, labels: ['urgent', 'type:feature'] }),
      ],
      { labels: ['urgent', 'type:bug'] },
    );
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain('#1');
  });
});

// ---------------------------------------------------------------------------
// ADO parent/child hierarchy (#291)
// ---------------------------------------------------------------------------

describe('WorkItemsTreeProvider — ADO hierarchy', () => {
  function makeAdoItem(overrides: Partial<import('../ado-client').AdoWorkItem> = {}): import('../ado-client').AdoWorkItem {
    return {
      id: 1,
      title: 'ADO Item',
      state: 'Active',
      type: 'User Story',
      url: 'https://dev.azure.com/org/project/_workitems/edit/1',
      assignedTo: 'user',
      areaPath: 'Project\\Area',
      tags: [],
      ...overrides,
    };
  }

  it('should show parent items at root with children nested', () => {
    const provider = new WorkItemsTreeProvider();
    const parent = makeAdoItem({ id: 10, title: 'Epic' });
    const child1 = makeAdoItem({ id: 11, title: 'Story A', parentId: 10 });
    const child2 = makeAdoItem({ id: 12, title: 'Story B', parentId: 10 });
    provider.setAdoItems([parent, child1, child2]);

    // Root should only have the parent
    const roots = provider.getChildren();
    expect(roots).toHaveLength(1);
    expect(roots[0].label).toContain('#10');
    expect(roots[0].collapsibleState).toBe(1); // Collapsed

    // Expanding the parent should show children
    const children = provider.getChildren(roots[0]);
    expect(children).toHaveLength(2);
    expect(children.map(c => c.label)).toEqual(
      expect.arrayContaining([expect.stringContaining('#11'), expect.stringContaining('#12')]),
    );
    expect(children[0].collapsibleState).toBe(0); // None (leaf)
  });

  it('should show items at root when parent is not in result set', () => {
    const provider = new WorkItemsTreeProvider();
    const child = makeAdoItem({ id: 20, title: 'Orphan', parentId: 999 });
    provider.setAdoItems([child]);

    const roots = provider.getChildren();
    expect(roots).toHaveLength(1);
    expect(roots[0].label).toContain('#20');
    expect(roots[0].collapsibleState).toBe(0); // None (leaf)
  });

  it('should show items without parentId at root', () => {
    const provider = new WorkItemsTreeProvider();
    const item = makeAdoItem({ id: 30, title: 'Top Level' });
    provider.setAdoItems([item]);

    const roots = provider.getChildren();
    expect(roots).toHaveLength(1);
    expect(roots[0].label).toContain('#30');
  });

  it('should set ado-parent-item context for parents', () => {
    const provider = new WorkItemsTreeProvider();
    const parent = makeAdoItem({ id: 40, title: 'Parent' });
    const child = makeAdoItem({ id: 41, title: 'Child', parentId: 40 });
    provider.setAdoItems([parent, child]);

    const roots = provider.getChildren();
    expect(roots[0].contextValue).toBe('ado-parent-item');

    const children = provider.getChildren(roots[0]);
    expect(children[0].contextValue).toBe('ado-work-item');
  });

  it('should clear hierarchy on clearAdo', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoItems([
      makeAdoItem({ id: 50, title: 'Parent' }),
      makeAdoItem({ id: 51, title: 'Child', parentId: 50 }),
    ]);
    provider.clearAdo();

    const roots = provider.getChildren();
    // Should show "configure" items since no repos or ADO configured
    expect(roots.some(r => (r.label as string)?.includes('#50'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ADO type filtering (#292)
// ---------------------------------------------------------------------------

describe('WorkItemsTreeProvider — type filter', () => {
  function makeAdoItem(overrides: Partial<import('../ado-client').AdoWorkItem> = {}): import('../ado-client').AdoWorkItem {
    return {
      id: 1,
      title: 'ADO Item',
      state: 'Active',
      type: 'User Story',
      url: 'https://dev.azure.com/org/project/_workitems/edit/1',
      assignedTo: 'user',
      areaPath: 'Project\\Area',
      tags: [],
      ...overrides,
    };
  }

  it('should filter ADO items by type', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoItems([
      makeAdoItem({ id: 1, type: 'Bug', title: 'Fix crash' }),
      makeAdoItem({ id: 2, type: 'Task', title: 'Write docs' }),
      makeAdoItem({ id: 3, type: 'Bug', title: 'Fix typo' }),
    ]);

    provider.setFilter({ repos: [], labels: [], states: [], types: ['Bug'] });
    const roots = provider.getChildren();
    expect(roots).toHaveLength(2);
    expect(roots.every(r => (r.label as string)?.includes('Fix'))).toBe(true);
  });

  it('should show all types when types filter is empty', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoItems([
      makeAdoItem({ id: 1, type: 'Bug' }),
      makeAdoItem({ id: 2, type: 'Task' }),
      makeAdoItem({ id: 3, type: 'Feature' }),
    ]);

    provider.setFilter({ repos: [], labels: [], states: [], types: [] });
    const roots = provider.getChildren();
    expect(roots).toHaveLength(3);
  });

  it('should allow multiple types', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoItems([
      makeAdoItem({ id: 1, type: 'Bug' }),
      makeAdoItem({ id: 2, type: 'Task' }),
      makeAdoItem({ id: 3, type: 'Feature' }),
    ]);

    provider.setFilter({ repos: [], labels: [], states: [], types: ['Bug', 'Feature'] });
    const roots = provider.getChildren();
    expect(roots).toHaveLength(2);
  });

  it('should promote children to root when parent is filtered out by type', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoItems([
      makeAdoItem({ id: 10, type: 'User Story', title: 'Story' }),
      makeAdoItem({ id: 11, type: 'Task', title: 'Task A', parentId: 10 }),
      makeAdoItem({ id: 12, type: 'Task', title: 'Task B', parentId: 10 }),
    ]);

    provider.setFilter({ repos: [], labels: [], states: [], types: ['Task'] });
    const roots = provider.getChildren();
    expect(roots).toHaveLength(2);
    expect(roots[0].label).toContain('#11');
    expect(roots[1].label).toContain('#12');
    // Children should be leaf items since parent is gone
    expect(roots[0].collapsibleState).toBe(0);
  });

  it('should report isFiltered when types are set', () => {
    const provider = new WorkItemsTreeProvider();
    expect(provider.isFiltered).toBe(false);
    provider.setFilter({ repos: [], labels: [], states: [], types: ['Bug'] });
    expect(provider.isFiltered).toBe(true);
    provider.clearFilter();
    expect(provider.isFiltered).toBe(false);
  });

  it('should show parent as leaf when all children are filtered out', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoItems([
      makeAdoItem({ id: 60, type: 'Epic', title: 'Big Epic' }),
      makeAdoItem({ id: 61, type: 'Bug', title: 'Bug Child', parentId: 60 }),
    ]);

    // Filter to only Epic type — parent has children in the map but filter removes them
    provider.setFilter({ repos: [], labels: [], states: [], types: ['Epic'] });
    const roots = provider.getChildren();
    expect(roots).toHaveLength(1);
    expect(roots[0].label).toContain('#60');

    // getChildren on the parent should return empty because filter removes child
    const children = provider.getChildren(roots[0]);
    expect(children).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Unified filter with types for GitHub issues (#387)
// ---------------------------------------------------------------------------

describe('WorkItemsTreeProvider — unified type filter on GitHub issues', () => {
  async function getFilteredItems(
    issues: GitHubIssue[],
    filter: { repos?: string[]; labels?: string[]; states?: Array<'open' | 'active' | 'closed'>; types?: string[] },
  ): Promise<WorkItemsTreeItem[]> {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue(issues);

    const provider = new WorkItemsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    provider.setFilter({
      repos: filter.repos ?? [],
      labels: filter.labels ?? [],
      states: filter.states ?? [],
      types: filter.types ?? [],
    });

    return provider.getChildren();
  }

  it('should filter GitHub issues by type via type:* labels', async () => {
    const items = await getFilteredItems(
      [
        makeIssue({ number: 1, labels: ['type:bug', 'release:v0.1'] }),
        makeIssue({ number: 2, labels: ['type:feature', 'release:v0.1'] }),
        makeIssue({ number: 3, labels: ['release:v0.1'] }),
      ],
      { types: ['Bug'] },
    );
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain('#1');
  });

  it('should match User Story type to type:user-story label', async () => {
    const items = await getFilteredItems(
      [
        makeIssue({ number: 1, labels: ['type:user-story'] }),
        makeIssue({ number: 2, labels: ['type:bug'] }),
      ],
      { types: ['User Story'] },
    );
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain('#1');
  });

  it('should allow multiple type selections for GitHub issues', async () => {
    const items = await getFilteredItems(
      [
        makeIssue({ number: 1, labels: ['type:bug'] }),
        makeIssue({ number: 2, labels: ['type:task'] }),
        makeIssue({ number: 3, labels: ['type:feature'] }),
      ],
      { types: ['Bug', 'Feature'] },
    );
    expect(items).toHaveLength(2);
    expect(items.map(i => i.label)).toEqual(
      expect.arrayContaining([expect.stringContaining('#1'), expect.stringContaining('#3')]),
    );
  });

  it('should show no items when type filter matches nothing', async () => {
    const items = await getFilteredItems(
      [makeIssue({ number: 1, labels: ['release:v0.1'] })],
      { types: ['Bug'] },
    );
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('No items match current filter');
  });

  it('should not filter GitHub issues by type when types is empty', async () => {
    const items = await getFilteredItems(
      [
        makeIssue({ number: 1, labels: ['type:bug'] }),
        makeIssue({ number: 2, labels: [] }),
      ],
      { types: [] },
    );
    expect(items).toHaveLength(2);
  });

  it('should be case-insensitive for type label matching', async () => {
    const items = await getFilteredItems(
      [makeIssue({ number: 1, labels: ['Type:Bug'] })],
      { types: ['Bug'] },
    );
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain('#1');
  });
});

// ---------------------------------------------------------------------------
// ADO terminology harmonization (#387)
// ---------------------------------------------------------------------------

describe('WorkItemsTreeProvider — terminology harmonization', () => {
  function makeAdoItem(overrides: Partial<import('../ado-client').AdoWorkItem> = {}): import('../ado-client').AdoWorkItem {
    return {
      id: 1,
      title: 'ADO Item',
      state: 'Active',
      type: 'User Story',
      url: 'https://dev.azure.com/org/project/_workitems/edit/1',
      assignedTo: 'user',
      areaPath: 'Project\\Area',
      tags: [],
      ...overrides,
    };
  }

  it('should use "Labels" instead of "Tags" in ADO tooltips', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoItems([makeAdoItem({ tags: ['frontend', 'urgent'] })]);

    const roots = provider.getChildren();
    expect(roots).toHaveLength(1);
    const tooltip = (roots[0].tooltip as { value: string }).value;
    expect(tooltip).toContain('Labels: frontend, urgent');
    expect(tooltip).not.toContain('Tags:');
  });

  it('should omit Labels line when ADO item has no tags', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoItems([makeAdoItem({ tags: [] })]);

    const roots = provider.getChildren();
    const tooltip = (roots[0].tooltip as { value: string }).value;
    expect(tooltip).not.toContain('Labels:');
    expect(tooltip).not.toContain('Tags:');
  });

  it('should use "Labels" in filter description', () => {
    const provider = new WorkItemsTreeProvider();
    const mockTreeView = { description: undefined as string | undefined };
    provider.setTreeView(mockTreeView as any);

    provider.setFilter({ repos: [], labels: ['frontend'], states: [], types: [] });
    expect(mockTreeView.description).toContain('label:frontend');
  });

  it('should include type in filter description', () => {
    const provider = new WorkItemsTreeProvider();
    const mockTreeView = { description: undefined as string | undefined };
    provider.setTreeView(mockTreeView as any);

    provider.setFilter({ repos: [], labels: [], states: [], types: ['Bug'] });
    expect(mockTreeView.description).toContain('type:Bug');
  });

  it('should join multiple filter dimensions with separator', () => {
    const provider = new WorkItemsTreeProvider();
    const mockTreeView = { description: undefined as string | undefined };
    provider.setTreeView(mockTreeView as any);

    provider.setFilter({ repos: ['owner/repo'], labels: ['urgent'], states: ['open'], types: ['Bug'] });
    expect(mockTreeView.description).toContain('repo:owner/repo');
    expect(mockTreeView.description).toContain('label:urgent');
    expect(mockTreeView.description).toContain('state:open');
    expect(mockTreeView.description).toContain('type:Bug');
    expect(mockTreeView.description).toContain(' · ');
  });

  it('should clear description when filter is cleared', () => {
    const provider = new WorkItemsTreeProvider();
    const mockTreeView = { description: undefined as string | undefined };
    provider.setTreeView(mockTreeView as any);

    provider.setFilter({ repos: [], labels: ['bug'], states: [], types: ['Bug'] });
    expect(mockTreeView.description).toBeDefined();

    provider.clearFilter();
    expect(mockTreeView.description).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Additional mapAdoState coverage
// ---------------------------------------------------------------------------

describe('mapAdoState — additional states', () => {
  it('should map "Doing" to "active"', () => {
    expect(mapAdoState('Doing')).toBe('active');
  });

  it('should be case-insensitive', () => {
    expect(mapAdoState('new')).toBe('open');
    expect(mapAdoState('ACTIVE')).toBe('active');
  });

  it('should map unknown states to "closed"', () => {
    expect(mapAdoState('Resolved')).toBe('closed');
    expect(mapAdoState('Done')).toBe('closed');
    expect(mapAdoState('Removed')).toBe('closed');
  });
});

// ---------------------------------------------------------------------------
// Combined filters (#387)
// ---------------------------------------------------------------------------

describe('WorkItemsTreeProvider — combined type + label/state filters', () => {
  async function getFilteredItems(
    issues: GitHubIssue[],
    filter: { repos?: string[]; labels?: string[]; states?: Array<'open' | 'active' | 'closed'>; types?: string[] },
  ): Promise<WorkItemsTreeItem[]> {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue(issues);

    const provider = new WorkItemsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    provider.setFilter({
      repos: filter.repos ?? [],
      labels: filter.labels ?? [],
      states: filter.states ?? [],
      types: filter.types ?? [],
    });

    return provider.getChildren();
  }

  it('should apply type AND label filters together', async () => {
    const items = await getFilteredItems(
      [
        makeIssue({ number: 1, labels: ['type:bug', 'release:v0.1'] }),
        makeIssue({ number: 2, labels: ['type:bug', 'release:backlog'] }),
        makeIssue({ number: 3, labels: ['type:feature', 'release:v0.1'] }),
      ],
      { types: ['Bug'], labels: ['release:v0.1'] },
    );
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain('#1');
  });

  it('should apply type AND state filters together', async () => {
    const items = await getFilteredItems(
      [
        makeIssue({ number: 1, labels: ['type:bug'], assignees: ['user'] }),
        makeIssue({ number: 2, labels: ['type:bug'], assignees: [] }),
        makeIssue({ number: 3, labels: ['type:feature'], assignees: ['user'] }),
      ],
      { types: ['Bug'], states: ['active'] },
    );
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain('#1');
  });

  it('should apply all filter dimensions simultaneously', async () => {
    const items = await getFilteredItems(
      [
        makeIssue({ number: 1, labels: ['type:bug', 'release:v0.1'], assignees: ['user'], repository: 'owner/repo' }),
        makeIssue({ number: 2, labels: ['type:bug', 'release:v0.1'], assignees: [], repository: 'owner/repo' }),
        makeIssue({ number: 3, labels: ['type:feature', 'release:v0.1'], assignees: ['user'], repository: 'owner/repo' }),
      ],
      { repos: ['owner/repo'], labels: ['release:v0.1'], states: ['active'], types: ['Bug'] },
    );
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain('#1');
  });
});

// ---------------------------------------------------------------------------
// getAllRepos / getAllLabels with ADO (#387)
// ---------------------------------------------------------------------------

describe('WorkItemsTreeProvider — getAllRepos with ADO', () => {
  function makeAdoItem(overrides: Partial<import('../ado-client').AdoWorkItem> = {}): import('../ado-client').AdoWorkItem {
    return {
      id: 1, title: 'Item', state: 'Active', type: 'Bug',
      url: 'https://dev.azure.com/org/project/_workitems/edit/1',
      assignedTo: 'user', areaPath: 'Area', tags: [],
      ...overrides,
    };
  }

  it('should include (ADO) in getAllRepos when ADO is configured', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoItems([makeAdoItem()]);
    const repos = provider.getAllRepos();
    expect(repos).toContain('(ADO)');
  });

  it('should not include (ADO) when ADO is not configured', () => {
    const provider = new WorkItemsTreeProvider();
    const repos = provider.getAllRepos();
    expect(repos).not.toContain('(ADO)');
  });

  it('should merge ADO tags into getAllLabels', () => {
    mockIsGhAvailable.mockResolvedValue(false);
    const provider = new WorkItemsTreeProvider();
    provider.setAdoItems([makeAdoItem({ tags: ['ado-tag', 'shared'] })]);
    const labels = provider.getAllLabels();
    expect(labels).toContain('ado-tag');
    expect(labels).toContain('shared');
  });
});

// ---------------------------------------------------------------------------
// LevelFilter lifecycle (#390)
// ---------------------------------------------------------------------------

describe('WorkItemsTreeProvider — LevelFilter lifecycle', () => {
  it('should get undefined when no level filter set', () => {
    const provider = new WorkItemsTreeProvider();
    expect(provider.getLevelFilter('github:owner/repo:f0')).toBeUndefined();
  });

  it('should set and get level filter', () => {
    const provider = new WorkItemsTreeProvider();
    const filter = { labels: ['bug'], states: ['open'] as UnifiedState[] };
    provider.setLevelFilter('github:owner/repo:f0', filter);
    expect(provider.getLevelFilter('github:owner/repo:f0')).toEqual(filter);
  });

  it('should fire tree data change when setting level filter', () => {
    const provider = new WorkItemsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setLevelFilter('github:owner/repo:f0', { labels: ['bug'] });
    expect(listener).toHaveBeenCalledOnce();
  });

  it('should clear level filter by nodeId', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setLevelFilter('github:owner/repo:f0', { labels: ['bug'] });
    provider.clearLevelFilter('github:owner/repo:f0');
    expect(provider.getLevelFilter('github:owner/repo:f0')).toBeUndefined();
  });

  it('should fire tree data change when clearing level filter', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setLevelFilter('github:owner/repo:f0', { labels: ['bug'] });
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.clearLevelFilter('github:owner/repo:f0');
    expect(listener).toHaveBeenCalledOnce();
  });

  it('should clear all level filters', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setLevelFilter('github:owner/repo:f0', { labels: ['bug'] });
    provider.setLevelFilter('ado:org:project:f0', { types: ['Bug'] });
    provider.clearAllLevelFilters();
    expect(provider.getLevelFilter('github:owner/repo:f0')).toBeUndefined();
    expect(provider.getLevelFilter('ado:org:project:f0')).toBeUndefined();
  });

  it('should fire tree data change when clearing all level filters', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setLevelFilter('github:owner/repo:f0', { labels: ['bug'] });
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.clearAllLevelFilters();
    expect(listener).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// getAvailableOptions (#390)
// ---------------------------------------------------------------------------

describe('WorkItemsTreeProvider — getAvailableOptions', () => {
  function makeAdoItem(overrides: Partial<import('../ado-client').AdoWorkItem> = {}): import('../ado-client').AdoWorkItem {
    return {
      id: 1, title: 'Item', state: 'Active', type: 'Bug',
      url: 'https://dev.azure.com/org/project/_workitems/edit/1',
      assignedTo: 'user', areaPath: 'Area', tags: [],
      ...overrides,
    };
  }

  it('should return owners for github-backend', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue([makeIssue()]);
    const provider = new WorkItemsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner1/repo1', 'owner2/repo2']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const options = provider.getAvailableOptions('github:', 'github-backend');
    expect(options.owners).toEqual(['owner1', 'owner2']);
  });

  it('should return repos for github-org', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue([makeIssue()]);
    const provider = new WorkItemsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo-a', 'owner/repo-b']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const options = provider.getAvailableOptions('github:owner', 'github-org');
    expect(options.repos).toEqual(['owner/repo-a', 'owner/repo-b']);
  });

  it('should return labels and states for github-repo', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue([
      makeIssue({ labels: ['bug', 'urgent'] }),
      makeIssue({ labels: ['feature'] }),
    ]);
    const provider = new WorkItemsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const options = provider.getAvailableOptions('github:owner/repo', 'github-repo');
    expect(options.labels).toEqual(['bug', 'feature', 'urgent']);
    expect(options.states).toEqual(['open', 'active', 'closed']);
  });

  it('should return orgs for ado-backend', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('my-org', 'my-project');
    const options = provider.getAvailableOptions('ado:', 'ado-backend');
    expect(options.orgs).toEqual(['my-org']);
  });

  it('should return projects for ado-org', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('my-org', 'my-project');
    const options = provider.getAvailableOptions('ado:my-org', 'ado-org');
    expect(options.projects).toEqual(['my-project']);
  });

  it('should return types, states, and tags for ado-project', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoItems([
      makeAdoItem({ type: 'Bug', tags: ['frontend'] }),
      makeAdoItem({ type: 'User Story', tags: ['backend', 'api'] }),
    ]);
    const options = provider.getAvailableOptions('ado:org:project', 'ado-project');
    expect(options.types).toEqual(['Bug', 'User Story']);
    expect(options.states).toEqual(['open', 'active', 'closed']);
    expect(options.tags).toEqual(['api', 'backend', 'frontend']);
  });

  it('should return empty for unknown contextValue', () => {
    const provider = new WorkItemsTreeProvider();
    const options = provider.getAvailableOptions('unknown', 'unknown-context');
    expect(options).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Hierarchy rendering with level filters (#390)
// ---------------------------------------------------------------------------

describe('WorkItemsTreeProvider — hierarchy rendering with level filters', () => {
  function makeAdoItem(overrides: Partial<import('../ado-client').AdoWorkItem> = {}): import('../ado-client').AdoWorkItem {
    return {
      id: 1, title: 'Item', state: 'Active', type: 'Bug',
      url: 'https://dev.azure.com/org/project/_workitems/edit/1',
      assignedTo: 'user', areaPath: 'Area', tags: [],
      ...overrides,
    };
  }

  it('should apply level filter to GitHub repo node', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockImplementation(async (repo: string) => {
      if (repo === 'owner/repo') {
        return [
          makeIssue({ number: 1, labels: ['bug'] }),
          makeIssue({ number: 2, labels: ['feature'] }),
        ];
      }
      return [];
    });

    const provider = new WorkItemsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    // Get repo node
    const root = provider.getChildren();
    expect(root).toHaveLength(2); // 2 issues

    // Now apply level filter to the repo
    const repoNode = new WorkItemsTreeItem('owner/repo', 1);
    repoNode.id = 'github:owner/repo:f1';
    repoNode.contextValue = 'github-repo';
    provider.setLevelFilter('github:owner/repo:f1', { labels: ['bug'] });

    // Get children with filter applied
    const filtered = provider.getChildren(repoNode);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].label).toContain('#1');
  });

  it('should apply level filter to ADO project node', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', 'project');
    provider.setAdoItems([
      makeAdoItem({ id: 1, type: 'Bug' }),
      makeAdoItem({ id: 2, type: 'User Story' }),
    ]);

    const projectNode = new WorkItemsTreeItem('project', 2);
    projectNode.id = 'ado:org:project:f1';
    projectNode.contextValue = 'ado-project';
    provider.setLevelFilter('ado:org:project:f1', { types: ['Bug'] });

    const filtered = provider.getChildren(projectNode);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].label).toContain('#1');
  });

  it('should apply label filter with AND-across-groups logic in level filter', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue([
      makeIssue({ number: 1, labels: ['type:bug', 'release:v0.1'] }),
      makeIssue({ number: 2, labels: ['type:bug'] }),
      makeIssue({ number: 3, labels: ['release:v0.1'] }),
    ]);

    const provider = new WorkItemsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const repoNode = new WorkItemsTreeItem('owner/repo', 1);
    repoNode.id = 'github:owner/repo:f1';
    repoNode.contextValue = 'github-repo';
    provider.setLevelFilter('github:owner/repo:f1', { labels: ['type:bug', 'release:v0.1'] });

    const filtered = provider.getChildren(repoNode);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].label).toContain('#1');
  });

  it('should apply state filter in level filter', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue([
      makeIssue({ number: 1, assignees: ['user'] }),
      makeIssue({ number: 2, assignees: [] }),
    ]);

    const provider = new WorkItemsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const repoNode = new WorkItemsTreeItem('owner/repo', 1);
    repoNode.id = 'github:owner/repo:f1';
    repoNode.contextValue = 'github-repo';
    provider.setLevelFilter('github:owner/repo:f1', { states: ['active'] });

    const filtered = provider.getChildren(repoNode);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].label).toContain('#1');
  });

  it('should apply tags filter in ADO level filter', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', 'project');
    provider.setAdoItems([
      makeAdoItem({ id: 1, tags: ['frontend'] }),
      makeAdoItem({ id: 2, tags: ['backend'] }),
    ]);

    const projectNode = new WorkItemsTreeItem('project', 2);
    projectNode.id = 'ado:org:project:f1';
    projectNode.contextValue = 'ado-project';
    provider.setLevelFilter('ado:org:project:f1', { tags: ['frontend'] });

    const filtered = provider.getChildren(projectNode);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].label).toContain('#1');
  });

  it('should apply combined type, tags, and state filter in ADO level filter', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', 'project');
    provider.setAdoItems([
      makeAdoItem({ id: 1, type: 'Bug', state: 'Active', tags: ['frontend'] }),
      makeAdoItem({ id: 2, type: 'Bug', state: 'Active', tags: ['backend'] }),
      makeAdoItem({ id: 3, type: 'User Story', state: 'Active', tags: ['frontend'] }),
      makeAdoItem({ id: 4, type: 'Bug', state: 'New', tags: ['frontend'] }),
    ]);

    const projectNode = new WorkItemsTreeItem('project', 2);
    projectNode.id = 'ado:org:project:f1';
    projectNode.contextValue = 'ado-project';
    provider.setLevelFilter('ado:org:project:f1', {
      types: ['Bug'],
      tags: ['frontend'],
      states: ['active'],
    });

    const filtered = provider.getChildren(projectNode);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].label).toContain('#1');
  });
});

// ---------------------------------------------------------------------------
// Edge cases (#390)
// ---------------------------------------------------------------------------

describe('WorkItemsTreeProvider — level filter edge cases', () => {
  it('should handle empty result when level filter matches nothing', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue([makeIssue({ labels: ['feature'] })]);

    const provider = new WorkItemsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const repoNode = new WorkItemsTreeItem('owner/repo', 1);
    repoNode.id = 'github:owner/repo:f1';
    repoNode.contextValue = 'github-repo';
    provider.setLevelFilter('github:owner/repo:f1', { labels: ['bug'] });

    const filtered = provider.getChildren(repoNode);
    expect(filtered).toHaveLength(0);
  });

  it('should handle single backend GitHub-only configuration', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue([makeIssue({ number: 1 })]);

    const provider = new WorkItemsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    // Single backend, single repo → flat list
    const root = provider.getChildren();
    expect(root).toHaveLength(1);
    expect(root[0].contextValue).toBe('work-item');
  });

  it('should handle single backend ADO-only configuration', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', 'project');
    provider.setAdoItems([
      { id: 1, title: 'Item', state: 'Active', type: 'Bug', url: 'url', assignedTo: 'user', areaPath: 'Area', tags: [] },
    ]);

    // Single backend, ADO → flat list
    const root = provider.getChildren();
    expect(root).toHaveLength(1);
    expect(root[0].contextValue).toBe('ado-work-item');
  });

  it('should show both backends when both GitHub and ADO configured', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue([makeIssue()]);

    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', 'project');
    provider.setAdoItems([
      { id: 1, title: 'Item', state: 'Active', type: 'Bug', url: 'url', assignedTo: 'user', areaPath: 'Area', tags: [] },
    ]);
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const root = provider.getChildren();
    expect(root).toHaveLength(2);
    expect(root.some(n => n.contextValue === 'ado-backend')).toBe(true);
    expect(root.some(n => n.contextValue === 'github-backend')).toBe(true);
  });
});
