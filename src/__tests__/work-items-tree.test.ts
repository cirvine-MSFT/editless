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

import { WorkItemsTreeProvider, WorkItemsTreeItem, mapGitHubState, mapAdoState } from '../work-items-tree';
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
  await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));

  return provider.getChildren();
}

// ---------------------------------------------------------------------------
// buildIssueItem — plan status indicators
// ---------------------------------------------------------------------------

describe('WorkItemsTreeProvider — plan status indicators', () => {
  it('should show planned indicator for status:planned label', async () => {
    const items = await getIssueItems([makeIssue({ labels: ['status:planned'] })]);
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain('📋');
    expect(items[0].description).toContain('✓ planned');
  });

  it('should show planned indicator for has-plan label', async () => {
    const items = await getIssueItems([makeIssue({ labels: ['has-plan'] })]);
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain('📋');
    expect(items[0].description).toContain('✓ planned');
  });

  it('should show planned indicator for "planned" label', async () => {
    const items = await getIssueItems([makeIssue({ labels: ['planned'] })]);
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain('📋');
    expect(items[0].description).toContain('✓ planned');
  });

  it('should show planned indicator for "has plan" label', async () => {
    const items = await getIssueItems([makeIssue({ labels: ['has plan'] })]);
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain('📋');
    expect(items[0].description).toContain('✓ planned');
  });

  it('should show planned indicator for "plan" label', async () => {
    const items = await getIssueItems([makeIssue({ labels: ['plan'] })]);
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain('📋');
    expect(items[0].description).toContain('✓ planned');
  });

  it('should show needs-plan indicator for status:needs-plan label', async () => {
    const items = await getIssueItems([makeIssue({ labels: ['status:needs-plan'] })]);
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain('❓');
    expect(items[0].description).toContain('needs plan');
  });

  it('should show neutral indicator when no plan label exists', async () => {
    const items = await getIssueItems([makeIssue({ labels: ['bug', 'priority:high'] })]);
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain('—');
    expect(items[0].description).not.toContain('planned');
    expect(items[0].description).not.toContain('needs plan');
  });

  it('should show neutral indicator when issue has no labels', async () => {
    const items = await getIssueItems([makeIssue({ labels: [] })]);
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain('—');
  });

  it('should prefer planned over needs-plan when both labels present', async () => {
    const items = await getIssueItems([
      makeIssue({ labels: ['status:planned', 'status:needs-plan'] }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain('📋');
    expect(items[0].description).toContain('✓ planned');
  });

  it('should match plan labels case-insensitively', async () => {
    const items = await getIssueItems([makeIssue({ labels: ['Status:Planned'] })]);
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain('📋');
    expect(items[0].description).toContain('✓ planned');
  });

  it('should include label text in description for planned items', async () => {
    const items = await getIssueItems([
      makeIssue({ labels: ['status:planned', 'priority:high'] }),
    ]);
    expect(items[0].description).toBe('✓ planned · status:planned, priority:high');
  });

  it('should include label text in description for needs-plan items', async () => {
    const items = await getIssueItems([
      makeIssue({ labels: ['status:needs-plan', 'bug'] }),
    ]);
    expect(items[0].description).toBe('needs plan · status:needs-plan, bug');
  });

  it('should show only label text in description for neutral items', async () => {
    const items = await getIssueItems([makeIssue({ labels: ['bug', 'feature'] })]);
    expect(items[0].description).toBe('bug, feature');
  });

  it('should include plan status in tooltip', async () => {
    const planned = await getIssueItems([makeIssue({ labels: ['status:planned'] })]);
    expect((planned[0].tooltip as { value: string }).value).toContain('✓ planned');

    const needsPlan = await getIssueItems([makeIssue({ labels: ['status:needs-plan'] })]);
    expect((needsPlan[0].tooltip as { value: string }).value).toContain('❓ needs plan');

    const neutral = await getIssueItems([makeIssue({ labels: ['bug'] })]);
    expect((neutral[0].tooltip as { value: string }).value).toContain('no status');
  });

  it('should include issue number and title in label', async () => {
    const items = await getIssueItems([
      makeIssue({ number: 139, title: 'Fix icon bug', labels: ['status:planned'] }),
    ]);
    expect(items[0].label).toBe('📋 #139 Fix icon bug');
  });

  it('should use pass icon for planned items', async () => {
    const items = await getIssueItems([makeIssue({ labels: ['status:planned'] })]);
    const icon = items[0].iconPath as { id: string; color?: { id: string } };
    expect(icon.id).toBe('pass');
    expect(icon.color?.id).toBe('testing.iconPassed');
  });

  it('should use question icon for needs-plan items', async () => {
    const items = await getIssueItems([makeIssue({ labels: ['status:needs-plan'] })]);
    const icon = items[0].iconPath as { id: string; color?: { id: string } };
    expect(icon.id).toBe('question');
    expect(icon.color?.id).toBe('editorWarning.foreground');
  });

  it('should use issues icon for neutral items', async () => {
    const items = await getIssueItems([makeIssue({ labels: ['bug'] })]);
    const icon = items[0].iconPath as { id: string; color?: unknown };
    expect(icon.id).toBe('issues');
    expect(icon.color).toBeUndefined();
  });
});

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
    filter: { repos?: string[]; labels?: string[]; states?: Array<'open' | 'active' | 'closed'> },
  ): Promise<WorkItemsTreeItem[]> {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchAssignedIssues.mockResolvedValue(issues);

    const provider = new WorkItemsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));

    provider.setFilter({
      repos: filter.repos ?? [],
      labels: filter.labels ?? [],
      states: filter.states ?? [],
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
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));

    provider.setFilter({ repos: [], labels: [], states: [] });
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
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));

    provider.setFilter({ repos: [], labels: ['bug'], states: [] });
    expect(provider.getChildren()).toHaveLength(1);

    provider.clearFilter();
    expect(provider.getChildren()).toHaveLength(2);
  });

  it('should report isFiltered correctly', () => {
    const provider = new WorkItemsTreeProvider();
    expect(provider.isFiltered).toBe(false);
    provider.setFilter({ repos: ['test'], labels: [], states: [] });
    expect(provider.isFiltered).toBe(true);
    provider.clearFilter();
    expect(provider.isFiltered).toBe(false);
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
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));

    const labels = provider.getAllLabels();
    expect(labels).toEqual(['bug', 'feature', 'urgent']);
  });
});
