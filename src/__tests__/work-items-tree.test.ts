import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createVscodeMock, ThemeIcon, CancellationError } from './mocks/vscode-mocks';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockIsGhAvailable = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
const mockFetchAssignedIssues = vi.fn().mockResolvedValue([]);

vi.mock('vscode', () => createVscodeMock({
  commands: {
    executeCommand: vi.fn(),
  },
  workspace: {
    workspaceFolders: [],
    getConfiguration: () => ({
      get: () => ({}),
    }),
  },
}));

vi.mock('../github-client', () => ({
  isGhAvailable: (...args: unknown[]) => mockIsGhAvailable(...(args as [])),
  fetchAssignedIssues: (...args: unknown[]) => mockFetchAssignedIssues(...(args as [string])),
}));

const mockFetchLocalTasks = vi.fn().mockResolvedValue([]);

vi.mock('../local-tasks-client', () => ({
  fetchLocalTasks: (...args: unknown[]) => mockFetchLocalTasks(...(args as [string])),
  mapLocalState: (task: { state: string; sessionId: string | null }) => {
    if (task.state === 'Done') return 'closed';
    if (task.sessionId !== null) return 'active';
    return 'open';
  },
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
      types: filter.types ?? [], projects: [] });

    return provider.getChildren();
  }

  it.each([
    { filterName: 'label', filter: { labels: ['bug'] }, expectedIssue: 1, testIssues: [makeIssue({ number: 1, labels: ['bug'] }), makeIssue({ number: 2, labels: ['feature'] })] },
    { filterName: 'state (active = assigned)', filter: { states: ['active'] as UnifiedState[] }, expectedIssue: 1, testIssues: [makeIssue({ number: 1, assignees: ['user'] }), makeIssue({ number: 2, assignees: [] })] },
    { filterName: 'state (open = unassigned)', filter: { states: ['open'] as UnifiedState[] }, expectedIssue: 2, testIssues: [makeIssue({ number: 1, assignees: ['user'] }), makeIssue({ number: 2, assignees: [] })] },
  ])('should filter by $filterName', async ({ filter, expectedIssue, testIssues }) => {
    const items = await getFilteredItems(testIssues, filter);
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain(`#${expectedIssue}`);
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

    provider.setFilter({ repos: [], labels: [], states: [], types: [], projects: [] });
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

    provider.setFilter({ repos: [], labels: ['bug'], states: [], types: [], projects: [] });
    expect(provider.getChildren()).toHaveLength(1);

    provider.clearFilter();
    expect(provider.getChildren()).toHaveLength(2);
  });

  it('should report isFiltered correctly', () => {
    const provider = new WorkItemsTreeProvider();
    expect(provider.isFiltered).toBe(false);
    provider.setFilter({ repos: ['test'], labels: [], states: [], types: [], projects: [] });
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

  it('should match labels with hyphens in the value (type:user-story)', async () => {
    const items = await getFilteredItems(
      [
        makeIssue({ number: 1, labels: ['type:user-story', 'release:v0.1'] }),
        makeIssue({ number: 2, labels: ['type:bug', 'release:v0.1'] }),
        makeIssue({ number: 3, labels: ['type:user-story'] }),
      ],
      { labels: ['type:user-story'] },
    );
    expect(items).toHaveLength(2);
    expect(items.map(i => i.label)).toEqual(
      expect.arrayContaining([expect.stringContaining('#1'), expect.stringContaining('#3')]),
    );
  });

  it('should treat all states selected the same as showing all items', async () => {
    const allIssues = [
      makeIssue({ number: 1, assignees: ['user'], state: 'open' }),
      makeIssue({ number: 2, assignees: [], state: 'open' }),
      makeIssue({ number: 3, state: 'closed' }),
    ];

    // All states selected — shows everything including closed
    const filtered = await getFilteredItems(allIssues, { states: ['open', 'active', 'closed'] });
    expect(filtered).toHaveLength(3);

    // No states selected — default exclusion hides closed items (#390)
    const unfiltered = await getFilteredItems(allIssues, {});
    expect(unfiltered).toHaveLength(2);
  });

  it('should build description with multiple filter dimensions', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue([makeIssue()]);

    const provider = new WorkItemsTreeProvider();
    const mockTreeView = { description: undefined as string | undefined };
    provider.setTreeView(mockTreeView as any);

    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    provider.setFilter({ repos: ['owner/repo'], labels: ['type:bug'], states: ['open'], types: [], projects: [] });

    expect(mockTreeView.description).toBe('repo:owner/repo · label:type:bug · state:open');
  });

  it('should clear description when filter is removed', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue([makeIssue()]);

    const provider = new WorkItemsTreeProvider();
    const mockTreeView = { description: undefined as string | undefined };
    provider.setTreeView(mockTreeView as any);

    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    provider.setFilter({ repos: ['owner/repo'], labels: [], states: [], types: [], projects: [] });
    expect(mockTreeView.description).toBeDefined();

    provider.clearFilter();
    expect(mockTreeView.description).toBeUndefined();
  });

  it('should handle type labels with multiple hyphens (type:in-progress-review)', async () => {
    const items = await getFilteredItems(
      [
        makeIssue({ number: 1, labels: ['type:in-progress-review'] }),
        makeIssue({ number: 2, labels: ['type:bug'] }),
      ],
      { labels: ['type:in-progress-review'] },
    );
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain('#1');
  });
});

// ---------------------------------------------------------------------------
// Icon assertions (#PR review)
// ---------------------------------------------------------------------------

describe('WorkItemsTreeProvider — icon paths', () => {
  it('should set "issues" icon for GitHub issues', async () => {
    const items = await getIssueItems([makeIssue({ number: 1 })]);
    expect(items).toHaveLength(1);
    expect(items[0].iconPath).toBeInstanceOf(ThemeIcon);
    expect((items[0].iconPath as ThemeIcon).id).toBe('issues');
  });

  it('should set "azure" icon for ADO work items', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', ['project']);
    const adoItem = {
      id: 123,
      title: 'ADO Item',
      state: 'Active',
      type: 'User Story',
      url: 'https://dev.azure.com/org/project/_workitems/edit/123',
      assignedTo: 'user',
      areaPath: 'Project\\Area',
      tags: [],
      project: 'project',
    };
    provider.setAdoItems([adoItem]);

    // Navigate through org→project hierarchy to reach work items
    const orgNodes = provider.getChildren();
    const projectNodes = provider.getChildren(orgNodes[0]);
    const items = provider.getChildren(projectNodes[0]);
    expect(items).toHaveLength(1);
    expect(items[0].iconPath).toBeInstanceOf(ThemeIcon);
    expect((items[0].iconPath as ThemeIcon).id).toBe('azure');
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
      project: 'project',
      ...overrides,
    };
  }

  it('should show parent items at root with children nested', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', ['project']);
    const parent = makeAdoItem({ id: 10, title: 'Epic' });
    const child1 = makeAdoItem({ id: 11, title: 'Story A', parentId: 10 });
    const child2 = makeAdoItem({ id: 12, title: 'Story B', parentId: 10 });
    provider.setAdoItems([parent, child1, child2]);

    // Navigate through org→project hierarchy
    const orgNodes = provider.getChildren();
    const projectNodes = provider.getChildren(orgNodes[0]);
    const roots = provider.getChildren(projectNodes[0]);
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
    provider.setAdoConfig('org', ['project']);
    const child = makeAdoItem({ id: 20, title: 'Orphan', parentId: 999 });
    provider.setAdoItems([child]);

    // Navigate through org→project hierarchy
    const orgNodes = provider.getChildren();
    const projectNodes = provider.getChildren(orgNodes[0]);
    const roots = provider.getChildren(projectNodes[0]);
    expect(roots).toHaveLength(1);
    expect(roots[0].label).toContain('#20');
    expect(roots[0].collapsibleState).toBe(0); // None (leaf)
  });

  it('should show items without parentId at root', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', ['project']);
    const item = makeAdoItem({ id: 30, title: 'Top Level' });
    provider.setAdoItems([item]);

    // Navigate through org→project hierarchy
    const orgNodes = provider.getChildren();
    const projectNodes = provider.getChildren(orgNodes[0]);
    const roots = provider.getChildren(projectNodes[0]);
    expect(roots).toHaveLength(1);
    expect(roots[0].label).toContain('#30');
  });

  it('should set ado-parent-item context for parents', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', ['project']);
    const parent = makeAdoItem({ id: 40, title: 'Parent' });
    const child = makeAdoItem({ id: 41, title: 'Child', parentId: 40 });
    provider.setAdoItems([parent, child]);

    // Navigate through org→project hierarchy
    const orgNodes = provider.getChildren();
    const projectNodes = provider.getChildren(orgNodes[0]);
    const roots = provider.getChildren(projectNodes[0]);
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
      project: 'project',
      ...overrides,
    };
  }

  it('should filter ADO items by type', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', ['project']);
    provider.setAdoItems([
      makeAdoItem({ id: 1, type: 'Bug', title: 'Fix crash' }),
      makeAdoItem({ id: 2, type: 'Task', title: 'Write docs' }),
      makeAdoItem({ id: 3, type: 'Bug', title: 'Fix typo' }),
    ]);

    provider.setFilter({ repos: [], labels: [], states: [], types: ['Bug'], projects: [] });
    // Navigate through org→project hierarchy
    const orgNodes = provider.getChildren();
    const projectNodes = provider.getChildren(orgNodes[0]);
    const roots = provider.getChildren(projectNodes[0]);
    expect(roots).toHaveLength(2);
    expect(roots.every(r => (r.label as string)?.includes('Fix'))).toBe(true);
  });

  it('should show all types when types filter is empty', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', ['project']);
    provider.setAdoItems([
      makeAdoItem({ id: 1, type: 'Bug' }),
      makeAdoItem({ id: 2, type: 'Task' }),
      makeAdoItem({ id: 3, type: 'Feature' }),
    ]);

    provider.setFilter({ repos: [], labels: [], states: [], types: [], projects: [] });
    // Navigate through org→project hierarchy
    const orgNodes = provider.getChildren();
    const projectNodes = provider.getChildren(orgNodes[0]);
    const roots = provider.getChildren(projectNodes[0]);
    expect(roots).toHaveLength(3);
  });

  it('should allow multiple types', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', ['project']);
    provider.setAdoItems([
      makeAdoItem({ id: 1, type: 'Bug' }),
      makeAdoItem({ id: 2, type: 'Task' }),
      makeAdoItem({ id: 3, type: 'Feature' }),
    ]);

    provider.setFilter({ repos: [], labels: [], states: [], types: ['Bug', 'Feature'], projects: [] });
    // Navigate through org→project hierarchy
    const orgNodes = provider.getChildren();
    const projectNodes = provider.getChildren(orgNodes[0]);
    const roots = provider.getChildren(projectNodes[0]);
    expect(roots).toHaveLength(2);
  });

  it('should promote children to root when parent is filtered out by type', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', ['project']);
    provider.setAdoItems([
      makeAdoItem({ id: 10, type: 'User Story', title: 'Story' }),
      makeAdoItem({ id: 11, type: 'Task', title: 'Task A', parentId: 10 }),
      makeAdoItem({ id: 12, type: 'Task', title: 'Task B', parentId: 10 }),
    ]);

    provider.setFilter({ repos: [], labels: [], states: [], types: ['Task'], projects: [] });
    // Navigate through org→project hierarchy
    const orgNodes = provider.getChildren();
    const projectNodes = provider.getChildren(orgNodes[0]);
    const roots = provider.getChildren(projectNodes[0]);
    expect(roots).toHaveLength(2);
    expect(roots[0].label).toContain('#11');
    expect(roots[1].label).toContain('#12');
    // Children should be leaf items since parent is gone
    expect(roots[0].collapsibleState).toBe(0);
  });

  it('should report isFiltered when types are set', () => {
    const provider = new WorkItemsTreeProvider();
    expect(provider.isFiltered).toBe(false);
    provider.setFilter({ repos: [], labels: [], states: [], types: ['Bug'], projects: [] });
    expect(provider.isFiltered).toBe(true);
    provider.clearFilter();
    expect(provider.isFiltered).toBe(false);
  });

  it('should show parent as leaf when all children are filtered out', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', ['project']);
    provider.setAdoItems([
      makeAdoItem({ id: 60, type: 'Epic', title: 'Big Epic' }),
      makeAdoItem({ id: 61, type: 'Bug', title: 'Bug Child', parentId: 60 }),
    ]);

    // Filter to only Epic type — parent has children in the map but filter removes them
    provider.setFilter({ repos: [], labels: [], states: [], types: ['Epic'], projects: [] });
    // Navigate through org→project hierarchy
    const orgNodes = provider.getChildren();
    const projectNodes = provider.getChildren(orgNodes[0]);
    const roots = provider.getChildren(projectNodes[0]);
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
      types: filter.types ?? [], projects: [] });

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
      project: 'project',
      ...overrides,
    };
  }

  it('should use "Labels" instead of "Tags" in ADO tooltips', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', ['project']);
    provider.setAdoItems([makeAdoItem({ tags: ['frontend', 'urgent'] })]);

    // Navigate through org→project hierarchy
    const orgNodes = provider.getChildren();
    const projectNodes = provider.getChildren(orgNodes[0]);
    const items = provider.getChildren(projectNodes[0]);
    expect(items).toHaveLength(1);
    const tooltip = (items[0].tooltip as { value: string }).value;
    expect(tooltip).toContain('Labels: frontend, urgent');
    expect(tooltip).not.toContain('Tags:');
  });

  it('should omit Labels line when ADO item has no tags', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', ['project']);
    provider.setAdoItems([makeAdoItem({ tags: [] })]);

    // Navigate through org→project hierarchy
    const orgNodes = provider.getChildren();
    const projectNodes = provider.getChildren(orgNodes[0]);
    const items = provider.getChildren(projectNodes[0]);
    const tooltip = (items[0].tooltip as { value: string }).value;
    expect(tooltip).not.toContain('Labels:');
    expect(tooltip).not.toContain('Tags:');
  });

  it('should use "Labels" in filter description', () => {
    const provider = new WorkItemsTreeProvider();
    const mockTreeView = { description: undefined as string | undefined };
    provider.setTreeView(mockTreeView as any);

    provider.setFilter({ repos: [], labels: ['frontend'], states: [], types: [], projects: [] });
    expect(mockTreeView.description).toContain('label:frontend');
  });

  it('should include type in filter description', () => {
    const provider = new WorkItemsTreeProvider();
    const mockTreeView = { description: undefined as string | undefined };
    provider.setTreeView(mockTreeView as any);

    provider.setFilter({ repos: [], labels: [], states: [], types: ['Bug'], projects: [] });
    expect(mockTreeView.description).toContain('type:Bug');
  });

  it('should join multiple filter dimensions with separator', () => {
    const provider = new WorkItemsTreeProvider();
    const mockTreeView = { description: undefined as string | undefined };
    provider.setTreeView(mockTreeView as any);

    provider.setFilter({ repos: ['owner/repo'], labels: ['urgent'], states: ['open'], types: ['Bug'], projects: [] });
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

    provider.setFilter({ repos: [], labels: ['bug'], states: [], types: ['Bug'], projects: [] });
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
      types: filter.types ?? [], projects: [] });

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
      project: 'project',
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

  it('should clear level filter by nodeId', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setLevelFilter('github:owner/repo:f0', { labels: ['bug'] });
    provider.clearLevelFilter('github:owner/repo:f0');
    expect(provider.getLevelFilter('github:owner/repo:f0')).toBeUndefined();
  });

  it('should clear all level filters', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setLevelFilter('github:owner/repo:f0', { labels: ['bug'] });
    provider.setLevelFilter('ado:org:project:f0', { types: ['Bug'] });
    provider.clearAllLevelFilters();
    expect(provider.getLevelFilter('github:owner/repo:f0')).toBeUndefined();
    expect(provider.getLevelFilter('ado:org:project:f0')).toBeUndefined();
  });

  it.each([
    { action: 'setting', perform: (p: any, id: string) => p.setLevelFilter(id, { labels: ['bug'] }) },
    { action: 'clearing', perform: (p: any, id: string) => p.clearLevelFilter(id) },
    { action: 'clearing all', perform: (p: any, _id: string) => p.clearAllLevelFilters() },
  ])('should fire tree data change when $action level filter', ({ action, perform }) => {
    const provider = new WorkItemsTreeProvider();
    const id = 'github:owner/repo:f0';

    // Pre-populate a filter so clear/clearAll have something to remove
    if (action !== 'setting') {
      provider.setLevelFilter(id, { labels: ['bug'] });
    }

    // Register listener AFTER setup so we isolate only the action under test
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    perform(provider, id);
    expect(listener).toHaveBeenCalledTimes(1);
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
      project: 'project',
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
    provider.setAdoConfig('my-org', ['my-project']);
    const options = provider.getAvailableOptions('ado:', 'ado-backend');
    expect(options.orgs).toEqual(['my-org']);
  });

  it('should return projects for ado-org', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('my-org', ['my-project']);
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
      project: 'project',
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
    provider.setAdoConfig('org', ['project']);
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
    provider.setAdoConfig('org', ['project']);
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
    provider.setAdoConfig('org', ['project']);
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

  it('should handle single backend ADO-only configuration with org→project hierarchy', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', ['project']);
    provider.setAdoItems([
      { id: 1, title: 'Item', state: 'Active', type: 'Bug', url: 'url', assignedTo: 'user', areaPath: 'Area', tags: [], project: 'project' },
    ]);

    // Single backend, ADO → still shows org→project hierarchy
    const root = provider.getChildren();
    expect(root).toHaveLength(1);
    expect(root[0].contextValue).toBe('ado-org');
    expect(root[0].label).toBe('org');

    // Expanding org node should show project
    const projects = provider.getChildren(root[0]);
    expect(projects).toHaveLength(1);
    expect(projects[0].contextValue).toBe('ado-project');
    expect(projects[0].label).toBe('project');

    // Expanding project node should show work items
    const items = provider.getChildren(projects[0]);
    expect(items).toHaveLength(1);
    expect(items[0].contextValue).toBe('ado-work-item');
  });

  it('should show both backends when both GitHub and ADO configured', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue([makeIssue()]);

    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', ['project']);
    provider.setAdoItems([
      { id: 1, title: 'Item', state: 'Active', type: 'Bug', url: 'url', assignedTo: 'user', areaPath: 'Area', tags: [], project: 'project' },
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

  it('should preserve ADO org→project hierarchy when source filter hides GitHub', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue([makeIssue()]);

    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', ['project']);
    provider.setAdoItems([
      { id: 1, title: 'Item', state: 'Active', type: 'Bug', url: 'url', assignedTo: 'user', areaPath: 'Area', tags: [], project: 'project' },
    ]);
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    // Both backends present initially
    let root = provider.getChildren();
    expect(root).toHaveLength(2);

    // Apply a filter that excludes all GitHub issues (state filter that only ADO items match)
    provider.setFilter({ repos: [], labels: [], states: ['active'], types: [], projects: [] });
    root = provider.getChildren();
    // ADO items with "Active" state map to "active", GitHub issues may or may not match
    // The key assertion: if only ADO items remain, we get org hierarchy not flat items
    const adoNodes = root.filter(n => n.contextValue?.startsWith('ado-'));
    expect(adoNodes.length).toBeGreaterThan(0);
    // When ADO is still present, its children should be org nodes, not flat items
    if (root.length === 1 && root[0].contextValue?.startsWith('ado-org')) {
      const projects = provider.getChildren(root[0]);
      expect(projects[0].contextValue).toBe('ado-project');
    }
  });
});

// ---------------------------------------------------------------------------
// Local Tasks integration
// ---------------------------------------------------------------------------

function makeLocalTask(overrides: Partial<import('../local-tasks-client').LocalTask> = {}): import('../local-tasks-client').LocalTask {
  return {
    id: 'task-1',
    title: 'Local Task',
    state: 'Todo',
    created: '2026-01-15',
    sessionId: null,
    filePath: '/projects/repo/.tasks/task-1.md',
    folderPath: '/projects/repo/.tasks',
    folderName: '.tasks',
    parentName: 'repo',
    body: '# Local Task',
    ...overrides,
  };
}

describe('WorkItemsTreeProvider — local tasks integration', () => {
  it('should show "Local Tasks" group when local tasks configured alongside GitHub', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue([makeIssue()]);
    mockFetchLocalTasks.mockResolvedValue([makeLocalTask()]);

    const provider = new WorkItemsTreeProvider();
    provider.setLocalFolders(['/projects/repo/.tasks']);

    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const root = provider.getChildren();
    const localGroup = root.find(n => n.label === 'Local Tasks');
    expect(localGroup).toBeDefined();
    expect(localGroup!.contextValue).toMatch(/^local-backend/);
  });

  it('should show folder nodes under the Local Tasks group', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue([makeIssue()]);
    mockFetchLocalTasks.mockResolvedValue([makeLocalTask()]);

    const provider = new WorkItemsTreeProvider();
    provider.setLocalFolders(['/projects/repo/.tasks']);

    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const root = provider.getChildren();
    const localGroup = root.find(n => n.label === 'Local Tasks');
    expect(localGroup).toBeDefined();

    const folderNodes = provider.getChildren(localGroup!);
    expect(folderNodes).toHaveLength(1);
    expect(folderNodes[0].label).toBe('repo / .tasks');
    expect(folderNodes[0].contextValue).toMatch(/^local-folder/);
  });

  it('should show task items under folder nodes', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue([makeIssue()]);
    mockFetchLocalTasks.mockResolvedValue([
      makeLocalTask({ id: 't1', title: 'Task One' }),
      makeLocalTask({ id: 't2', title: 'Task Two' }),
    ]);

    const provider = new WorkItemsTreeProvider();
    provider.setLocalFolders(['/projects/repo/.tasks']);

    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const root = provider.getChildren();
    const localGroup = root.find(n => n.label === 'Local Tasks');
    const folderNodes = provider.getChildren(localGroup!);
    const tasks = provider.getChildren(folderNodes[0]);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].label).toBe('Task One');
    expect(tasks[1].label).toBe('Task Two');
  });

  it('should display correct icons for task states', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setLocalFolders(['/tasks']);
    provider.setLocalTasks('/tasks', [
      makeLocalTask({ id: 'done', title: 'Done Task', state: 'Done', folderPath: '/tasks', folderName: 'tasks', parentName: '' }),
      makeLocalTask({ id: 'active', title: 'Active Task', state: 'Todo', sessionId: 'sess-1', folderPath: '/tasks', folderName: 'tasks', parentName: '' }),
      makeLocalTask({ id: 'open', title: 'Open Task', state: 'Todo', sessionId: null, folderPath: '/tasks', folderName: 'tasks', parentName: '' }),
    ]);

    // Show all states including closed
    provider.setFilter({ repos: [], labels: [], states: ['open', 'active', 'closed'], types: [], projects: [] });
    const items = provider.getChildren();
    expect(items).toHaveLength(3);

    const doneItem = items.find(i => i.label === 'Done Task');
    const activeItem = items.find(i => i.label === 'Active Task');
    const openItem = items.find(i => i.label === 'Open Task');

    expect((doneItem!.iconPath as ThemeIcon).id).toBe('pass-filled');
    expect((activeItem!.iconPath as ThemeIcon).id).toBe('debug-start');
    expect((openItem!.iconPath as ThemeIcon).id).toBe('circle-large-outline');
  });

  it('should set description to task state and contextValue to local-task', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setLocalFolders(['/tasks']);
    provider.setLocalTasks('/tasks', [makeLocalTask({ folderPath: '/tasks', folderName: 'tasks', parentName: '' })]);

    const items = provider.getChildren();
    expect(items).toHaveLength(1);
    expect(items[0].description).toBe('Todo');
    expect(items[0].contextValue).toBe('local-task');
  });

  it('should show all tasks including done by default (no state filter)', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setLocalFolders(['/tasks']);
    provider.setLocalTasks('/tasks', [
      makeLocalTask({ id: 'open-task', title: 'Open', state: 'Todo', folderPath: '/tasks', folderName: 'tasks', parentName: '' }),
      makeLocalTask({ id: 'done-task', title: 'Done', state: 'Done', folderPath: '/tasks', folderName: 'tasks', parentName: '' }),
    ]);

    const items = provider.getChildren();
    expect(items).toHaveLength(2);
  });

  it('should show closed tasks when state filter includes closed', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setLocalFolders(['/tasks']);
    provider.setLocalTasks('/tasks', [
      makeLocalTask({ id: 'open-task', title: 'Open', state: 'Todo', folderPath: '/tasks', folderName: 'tasks', parentName: '' }),
      makeLocalTask({ id: 'done-task', title: 'Done', state: 'Done', folderPath: '/tasks', folderName: 'tasks', parentName: '' }),
    ]);

    provider.setFilter({ repos: [], labels: [], states: ['open', 'active', 'closed'], types: [], projects: [] });
    const items = provider.getChildren();
    expect(items).toHaveLength(2);
  });

  it('should hide local tasks when source filter excludes (Local)', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue([makeIssue()]);
    mockFetchLocalTasks.mockResolvedValue([makeLocalTask({ folderPath: '/tasks', folderName: 'tasks', parentName: '' })]);

    const provider = new WorkItemsTreeProvider();
    provider.setLocalFolders(['/tasks']);

    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    provider.setFilter({ repos: ['owner/repo'], labels: [], states: [], types: [], projects: [] });
    const items = provider.getChildren();
    const localGroup = items.find(n => n.label === 'Local Tasks');
    expect(localGroup).toBeUndefined();
  });

  it('should show empty tree message when folder has no tasks', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setLocalFolders(['/tasks']);
    provider.setLocalTasks('/tasks', []);

    const items = provider.getChildren();
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('No assigned issues found');
  });

  it('should include (Local) in getAllRepos when local is configured', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setLocalFolders(['/tasks']);
    expect(provider.getAllRepos()).toContain('(Local)');
  });

  it('should not include (Local) in getAllRepos when local is not configured', () => {
    const provider = new WorkItemsTreeProvider();
    expect(provider.getAllRepos()).not.toContain('(Local)');
  });
});

// ---------------------------------------------------------------------------
// CancellationError handling (#456)
// ---------------------------------------------------------------------------

describe('WorkItemsTreeProvider — CancellationError handling', () => {
  it('fetchAll should not fire tree data change event after dispose()', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue([makeIssue()]);

    const provider = new WorkItemsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);

    provider.dispose();
    (provider as any)._repos = ['owner/repo'];
    await (provider as any).fetchAll();

    expect(listener).not.toHaveBeenCalled();
  });

  it('fetchAll should silently handle CancellationError', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockRejectedValue(new CancellationError());

    const provider = new WorkItemsTreeProvider();
    (provider as any)._repos = ['owner/repo'];

    await expect((provider as any).fetchAll()).resolves.toBeUndefined();
  });

  it('fetchAll should silently handle "Canceled" message errors', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockRejectedValue(new Error('The operation was Canceled by the user'));

    const provider = new WorkItemsTreeProvider();
    (provider as any)._repos = ['owner/repo'];

    await expect((provider as any).fetchAll()).resolves.toBeUndefined();
  });

  it('fetchAll should silently handle "Channel has been closed" errors', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockRejectedValue(new Error('Channel has been closed'));

    const provider = new WorkItemsTreeProvider();
    (provider as any)._repos = ['owner/repo'];

    await expect((provider as any).fetchAll()).resolves.toBeUndefined();
  });

  it('fetchAll should re-throw non-cancellation errors', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockRejectedValue(new Error('network failure'));

    const provider = new WorkItemsTreeProvider();
    (provider as any)._repos = ['owner/repo'];

    await expect((provider as any).fetchAll()).rejects.toThrow('network failure');
  });

  it('fetchAll should reset _loading on error', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockRejectedValue(new CancellationError());

    const provider = new WorkItemsTreeProvider();
    (provider as any)._repos = ['owner/repo'];
    await (provider as any).fetchAll();

    expect((provider as any)._loading).toBe(false);
  });

  it('dispose() should set the provider as disposed', () => {
    const provider = new WorkItemsTreeProvider();
    expect((provider as any)._disposed).toBe(false);

    provider.dispose();
    expect((provider as any)._disposed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Milestone group parsing (#448)
// ---------------------------------------------------------------------------

describe('WorkItemsTreeProvider — milestone group parsing', () => {
  it('should parse milestone group ID with ms:repo:name:f{seq} format', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue([
      makeIssue({ number: 1, title: 'Issue 1', milestone: 'v1.0', repository: 'owner/repo' }),
      makeIssue({ number: 2, title: 'Issue 2', milestone: 'v1.0', repository: 'owner/repo' }),
      makeIssue({ number: 3, title: 'Issue 3', milestone: 'v2.0', repository: 'owner/repo' }),
    ]);

    const provider = new WorkItemsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const root = provider.getChildren();
    // Should get milestone groups
    expect(root.length).toBeGreaterThan(0);
    const v1Group = root.find(n => n.label === 'v1.0');
    expect(v1Group).toBeDefined();
    
    // Check ID format: ms:repo:name:f{seq}
    expect(v1Group!.id).toMatch(/^ms:owner\/repo:v1\.0:f\d+$/);
    
    // Get children of milestone group
    const issues = provider.getChildren(v1Group!);
    expect(issues).toHaveLength(2);
    expect(issues[0].label).toContain('Issue 1');
    expect(issues[1].label).toContain('Issue 2');
  });

  it('should parse __none__ milestone group for issues without milestone', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue([
      makeIssue({ number: 1, title: 'With MS', milestone: 'v1.0', repository: 'owner/repo' }),
      makeIssue({ number: 2, title: 'No MS 1', milestone: '', repository: 'owner/repo' }),
      makeIssue({ number: 3, title: 'No MS 2', milestone: '', repository: 'owner/repo' }),
    ]);

    const provider = new WorkItemsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const root = provider.getChildren();
    const noMsGroup = root.find(n => n.label === 'No Milestone');
    expect(noMsGroup).toBeDefined();
    
    // Check ID format with __none__
    expect(noMsGroup!.id).toMatch(/^ms:owner\/repo:__none__:f\d+$/);
    
    // Get children
    const issues = provider.getChildren(noMsGroup!);
    expect(issues).toHaveLength(2);
    expect(issues[0].label).toContain('No MS 1');
    expect(issues[1].label).toContain('No MS 2');
  });

  it('should correctly extract repo and milestone from ID when getting children', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue([
      makeIssue({ number: 1, milestone: 'sprint-42', repository: 'owner/repo' }),
      makeIssue({ number: 2, milestone: 'sprint-42', repository: 'owner/repo' }),
    ]);

    const provider = new WorkItemsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const root = provider.getChildren();
    const msGroup = root.find(n => n.label === 'sprint-42');
    expect(msGroup).toBeDefined();

    // Manually construct a milestone group item to test ID parsing
    const testItem = new WorkItemsTreeItem('sprint-42', 2);
    testItem.id = 'ms:owner/repo:sprint-42:f99';
    testItem.contextValue = 'milestone-group';
    
    const children = provider.getChildren(testItem);
    expect(children).toHaveLength(2);
  });

  it('should apply level filters when getting milestone group children', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue([
      makeIssue({ number: 1, milestone: 'v1.0', labels: ['bug'], assignees: ['user'], repository: 'owner/repo' }),
      makeIssue({ number: 2, milestone: 'v1.0', labels: ['feature'], assignees: [], repository: 'owner/repo' }),
      makeIssue({ number: 3, milestone: 'v1.0', labels: ['bug'], assignees: [], repository: 'owner/repo' }),
    ]);

    const provider = new WorkItemsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    // Set a level filter on the repo
    provider.setLevelFilter('github:owner/repo', { states: ['active'] as import('../work-items-tree').UnifiedState[] });

    const root = provider.getChildren();
    const msGroup = root.find(n => n.label === 'v1.0');
    expect(msGroup).toBeDefined();
    
    // Only active issues (with assignees) should appear
    const issues = provider.getChildren(msGroup!);
    expect(issues).toHaveLength(1);
    expect(issues[0].label).toContain('#1');
  });
});

// ---------------------------------------------------------------------------
// Multi-project ADO tree rendering (#487, #498)
// ---------------------------------------------------------------------------

describe('WorkItemsTreeProvider — multi-project tree rendering', () => {
  function makeAdoItem(overrides: Partial<import('../ado-client').AdoWorkItem> = {}): import('../ado-client').AdoWorkItem {
    return {
      id: 1, title: 'Item', state: 'Active', type: 'Bug',
      url: 'https://dev.azure.com/org/project/_workitems/edit/1',
      assignedTo: 'user', areaPath: 'Area', tags: [],
      project: 'projA',
      ...overrides,
    };
  }

  it('should render TWO project nodes for two configured projects with correct counts', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', ['projA', 'projB']);
    provider.setAdoItems([
      makeAdoItem({ id: 1, project: 'projA' }),
      makeAdoItem({ id: 2, project: 'projA' }),
      makeAdoItem({ id: 3, project: 'projA' }),
      makeAdoItem({ id: 4, project: 'projB' }),
      makeAdoItem({ id: 5, project: 'projB' }),
    ]);

    // Root → org node (single backend)
    const orgNodes = provider.getChildren();
    expect(orgNodes).toHaveLength(1);
    expect(orgNodes[0].label).toBe('org');

    // Org → project nodes
    const projectNodes = provider.getChildren(orgNodes[0]);
    expect(projectNodes).toHaveLength(2);

    const projA = projectNodes.find(n => n.label === 'projA')!;
    const projB = projectNodes.find(n => n.label === 'projB')!;
    expect(projA).toBeDefined();
    expect(projB).toBeDefined();
    expect(projA.description).toContain('3');
    expect(projB.description).toContain('2');
  });

  it('project node children route only that projects items — not other projects', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', ['projA', 'projB']);
    provider.setAdoItems([
      makeAdoItem({ id: 1, title: 'A-Item', project: 'projA' }),
      makeAdoItem({ id: 2, title: 'B-Item', project: 'projB' }),
    ]);

    const orgNodes = provider.getChildren();
    const projectNodes = provider.getChildren(orgNodes[0]);

    // Navigate to projA children
    const projANode = projectNodes.find(n => n.label === 'projA')!;
    const projAItems = provider.getChildren(projANode);
    expect(projAItems).toHaveLength(1);
    expect(projAItems[0].label).toContain('#1');
    expect(projAItems[0].label).toContain('A-Item');

    // Navigate to projB children
    const projBNode = projectNodes.find(n => n.label === 'projB')!;
    const projBItems = provider.getChildren(projBNode);
    expect(projBItems).toHaveLength(1);
    expect(projBItems[0].label).toContain('#2');
    expect(projBItems[0].label).toContain('B-Item');
  });

  it('empty project is suppressed — project with zero items hidden', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', ['projA', 'projEmpty']);
    provider.setAdoItems([
      makeAdoItem({ id: 1, project: 'projA' }),
      makeAdoItem({ id: 2, project: 'projA' }),
    ]);

    const orgNodes = provider.getChildren();
    const projectNodes = provider.getChildren(orgNodes[0]);
    expect(projectNodes).toHaveLength(1);
    expect(projectNodes[0].label).toBe('projA');
  });
});

// ---------------------------------------------------------------------------
// Projects filter (#487, #498)
// ---------------------------------------------------------------------------

describe('WorkItemsTreeProvider — projects filter', () => {
  function makeAdoItem(overrides: Partial<import('../ado-client').AdoWorkItem> = {}): import('../ado-client').AdoWorkItem {
    return {
      id: 1, title: 'Item', state: 'Active', type: 'Bug',
      url: 'https://dev.azure.com/org/project/_workitems/edit/1',
      assignedTo: 'user', areaPath: 'Area', tags: [],
      project: 'projA',
      ...overrides,
    };
  }

  it('projects: [projA] filters items to only projA', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', ['projA', 'projB']);
    provider.setAdoItems([
      makeAdoItem({ id: 1, project: 'projA' }),
      makeAdoItem({ id: 2, project: 'projB' }),
    ]);

    provider.setFilter({ repos: [], labels: [], states: [], types: [], projects: ['projA'] });

    // Only projA project node should appear
    const orgNodes = provider.getChildren();
    const projectNodes = provider.getChildren(orgNodes[0]);
    expect(projectNodes).toHaveLength(1);
    expect(projectNodes[0].label).toBe('projA');

    const items = provider.getChildren(projectNodes[0]);
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain('#1');
  });

  it('projects: [projA, projB] includes both projects', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', ['projA', 'projB']);
    provider.setAdoItems([
      makeAdoItem({ id: 1, project: 'projA' }),
      makeAdoItem({ id: 2, project: 'projB' }),
    ]);

    provider.setFilter({ repos: [], labels: [], states: [], types: [], projects: ['projA', 'projB'] });

    const orgNodes = provider.getChildren();
    const projectNodes = provider.getChildren(orgNodes[0]);
    expect(projectNodes).toHaveLength(2);
    expect(projectNodes.map(n => n.label).sort()).toEqual(['projA', 'projB']);
  });

  it('isFiltered returns true when only projects is non-empty', () => {
    const provider = new WorkItemsTreeProvider();
    expect(provider.isFiltered).toBe(false);

    provider.setFilter({ repos: [], labels: [], states: [], types: [], projects: ['projA'] });
    expect(provider.isFiltered).toBe(true);
  });

  it('isFiltered returns false when all filter arrays are empty', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setFilter({ repos: [], labels: [], states: [], types: [], projects: [] });
    expect(provider.isFiltered).toBe(false);
  });

  it('project filter description includes project names', () => {
    const provider = new WorkItemsTreeProvider();
    const mockTreeView = { description: undefined as string | undefined };
    provider.setTreeView(mockTreeView as any);

    provider.setFilter({ repos: [], labels: [], states: [], types: [], projects: ['projA', 'projB'] });
    expect(mockTreeView.description).toContain('project:projA,projB');
  });
});

// ---------------------------------------------------------------------------
// Per-project failure isolation (#487, #498)
// ---------------------------------------------------------------------------

describe('WorkItemsTreeProvider — per-project failure isolation', () => {
  function makeAdoItem(overrides: Partial<import('../ado-client').AdoWorkItem> = {}): import('../ado-client').AdoWorkItem {
    return {
      id: 1, title: 'Item', state: 'Active', type: 'Bug',
      url: 'https://dev.azure.com/org/project/_workitems/edit/1',
      assignedTo: 'user', areaPath: 'Area', tags: [],
      project: 'projA',
      ...overrides,
    };
  }

  it('if one project has zero items while another has items, only non-empty project shows', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', ['projA', 'projB']);
    // Simulate projA fetch returned items, projB returned empty (failure or no results)
    provider.setAdoItems([
      makeAdoItem({ id: 1, project: 'projB' }),
      makeAdoItem({ id: 2, project: 'projB' }),
    ]);

    const orgNodes = provider.getChildren();
    const projectNodes = provider.getChildren(orgNodes[0]);
    // projA had zero items → suppressed; projB has items → shown
    expect(projectNodes).toHaveLength(1);
    expect(projectNodes[0].label).toBe('projB');

    const items = provider.getChildren(projectNodes[0]);
    expect(items).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Backward-compatibility: ado.projects vs ado.project (#487, #498)
// ---------------------------------------------------------------------------

describe('WorkItemsTreeProvider — backward-compatibility config behavior', () => {
  function makeAdoItem(overrides: Partial<import('../ado-client').AdoWorkItem> = {}): import('../ado-client').AdoWorkItem {
    return {
      id: 1, title: 'Item', state: 'Active', type: 'Bug',
      url: 'https://dev.azure.com/org/project/_workitems/edit/1',
      assignedTo: 'user', areaPath: 'Area', tags: [],
      project: 'legacyProj',
      ...overrides,
    };
  }

  it('empty ado.projects + populated ado.project → falls back to single project', () => {
    // Simulate what initAdoIntegration does when ado.projects is empty
    // and ado.project has "legacyProj": setAdoConfig('org', ['legacyProj'])
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', ['legacyProj']);
    provider.setAdoItems([makeAdoItem({ id: 1, project: 'legacyProj' })]);

    const orgNodes = provider.getChildren();
    expect(orgNodes).toHaveLength(1);
    expect(orgNodes[0].label).toBe('org');

    const projectNodes = provider.getChildren(orgNodes[0]);
    expect(projectNodes).toHaveLength(1);
    expect(projectNodes[0].label).toBe('legacyProj');

    const items = provider.getChildren(projectNodes[0]);
    expect(items).toHaveLength(1);
  });

  it('populated ado.projects → multiple projects rendered (ignores legacy ado.project)', () => {
    // Simulate what initAdoIntegration does when ado.projects has entries:
    // setAdoConfig('org', ['projA', 'projB']) — legacy ado.project is ignored
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', ['projA', 'projB']);
    provider.setAdoItems([
      makeAdoItem({ id: 1, project: 'projA' }),
      makeAdoItem({ id: 2, project: 'projB' }),
    ]);

    const orgNodes = provider.getChildren();
    const projectNodes = provider.getChildren(orgNodes[0]);
    expect(projectNodes).toHaveLength(2);
    expect(projectNodes.map(n => n.label).sort()).toEqual(['projA', 'projB']);
  });

  it('ado.projects with all entries enabled: false → falls back to empty (no projects)', () => {
    // Simulate what initAdoIntegration does when all entries have enabled: false
    // → projects array is empty after filtering → falls back to legacy, which may also be empty
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', []);

    // No items, no config → should show configure prompt, not crash
    const root = provider.getChildren();
    // Verify no org nodes (since projects list is empty)
    const orgNodes = root.filter(n => n.contextValue?.startsWith('ado-'));
    expect(orgNodes).toHaveLength(0);
  });

  it('setAdoConfig with undefined org clears ADO from the tree', () => {
    const provider = new WorkItemsTreeProvider();
    provider.setAdoConfig('org', ['proj']);
    provider.setAdoItems([makeAdoItem({ project: 'proj' })]);

    // Verify items are present
    let orgNodes = provider.getChildren();
    expect(orgNodes).toHaveLength(1);
    expect(orgNodes[0].contextValue).toBe('ado-org');

    // Clear ADO config
    provider.setAdoConfig(undefined, []);
    provider.clearAdo();
    orgNodes = provider.getChildren();
    const adoNodes = orgNodes.filter(n => n.contextValue?.startsWith('ado-'));
    expect(adoNodes).toHaveLength(0);
  });
});
