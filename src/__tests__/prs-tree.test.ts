import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockIsGhAvailable = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
const mockFetchMyPRs = vi.fn().mockResolvedValue([]);

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
    pr?: unknown;
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

  class ThemeColor {
    id: string;
    constructor(id: string) { this.id = id; }
  }

  return {
    TreeItem, TreeItemCollapsibleState, ThemeIcon, ThemeColor, MarkdownString, EventEmitter,
    Uri: { parse: (s: string) => ({ toString: () => s }) },
    commands: { executeCommand: vi.fn() },
  };
});

vi.mock('../github-client', () => ({
  isGhAvailable: (...args: unknown[]) => mockIsGhAvailable(...(args as [])),
  fetchMyPRs: (...args: unknown[]) => mockFetchMyPRs(...(args as [string])),
}));

import { PRsTreeProvider, PRsTreeItem } from '../prs-tree';
import type { GitHubPR } from '../github-client';

beforeEach(() => {
  vi.clearAllMocks();
  mockIsGhAvailable.mockResolvedValue(false);
  mockFetchMyPRs.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePR(overrides: Partial<GitHubPR> = {}): GitHubPR {
  return {
    number: 1,
    title: 'Test PR',
    state: 'OPEN',
    isDraft: false,
    url: 'https://github.com/owner/repo/pull/1',
    headRef: 'feature',
    baseRef: 'main',
    repository: 'owner/repo',
    reviewDecision: '',
    mergeable: '',
    labels: [],
    autoMergeRequest: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// derivePRState — all 6 states
// ---------------------------------------------------------------------------

describe('PRsTreeProvider — derivePRState', () => {
  async function getPRItemState(pr: GitHubPR): Promise<string> {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchMyPRs.mockResolvedValue([pr]);

    const provider = new PRsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const children = provider.getChildren();
    expect(children).toHaveLength(1);
    return (children[0].description as string).split(' · ')[0];
  }

  it('should derive "draft" state', async () => {
    expect(await getPRItemState(makePR({ isDraft: true }))).toBe('draft');
  });

  it('should derive "merged" state', async () => {
    expect(await getPRItemState(makePR({ state: 'MERGED' }))).toBe('merged');
  });

  it('should derive "closed" state', async () => {
    expect(await getPRItemState(makePR({ state: 'CLOSED' }))).toBe('closed');
  });

  it('should derive "approved" state', async () => {
    expect(await getPRItemState(makePR({ reviewDecision: 'APPROVED' }))).toBe('approved');
  });

  it('should derive "changes-requested" state', async () => {
    expect(await getPRItemState(makePR({ reviewDecision: 'CHANGES_REQUESTED' }))).toBe('changes-requested');
  });

  it('should derive "open" when reviewDecision is empty (default)', async () => {
    expect(await getPRItemState(makePR({ reviewDecision: '' }))).toBe('open');
  });

  it('should derive "auto-merge" when autoMergeRequest is present', async () => {
    expect(await getPRItemState(makePR({ autoMergeRequest: { mergeMethod: 'SQUASH' } }))).toBe('auto-merge');
  });

  it('should prioritize draft over auto-merge', async () => {
    expect(await getPRItemState(makePR({ isDraft: true, autoMergeRequest: { mergeMethod: 'SQUASH' } }))).toBe('draft');
  });
});

// ---------------------------------------------------------------------------
// Multi-repo grouping
// ---------------------------------------------------------------------------

describe('PRsTreeProvider — multi-repo grouping', () => {
  it('should show flat PR list for single repo', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchMyPRs.mockResolvedValue([makePR({ number: 1 }), makePR({ number: 2, title: 'Second' })]);

    const provider = new PRsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const children = provider.getChildren();
    expect(children).toHaveLength(2);
    expect(children[0].contextValue).toBe('pull-request');
  });

  it('should show owner → repo hierarchy for multiple repos', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchMyPRs.mockImplementation(async (repo: string) => {
      if (repo === 'owner/repo-a') return [makePR({ number: 1, repository: 'owner/repo-a' })];
      if (repo === 'owner/repo-b') return [makePR({ number: 2, repository: 'owner/repo-b' })];
      return [];
    });

    const provider = new PRsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo-a', 'owner/repo-b']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    // Root shows owner node (same owner for both repos)
    const roots = provider.getChildren();
    expect(roots).toHaveLength(1);
    expect(roots[0].contextValue).toBe('github-pr-org');
    expect(roots[0].label).toBe('owner');

    // Owner node children are repo nodes
    const repoNodes = provider.getChildren(roots[0]);
    expect(repoNodes).toHaveLength(2);
    expect(repoNodes[0].contextValue).toBe('github-pr-repo');
    expect(repoNodes[0].label).toBe('owner/repo-a');

    // Children of repo node are PRs
    const repoAPRs = provider.getChildren(repoNodes[0]);
    expect(repoAPRs).toHaveLength(1);
    expect(repoAPRs[0].contextValue).toBe('pull-request');
  });
});

// ---------------------------------------------------------------------------
// Loading and empty states
// ---------------------------------------------------------------------------

describe('PRsTreeProvider — loading & empty states', () => {
  it('should show loading item while fetching', () => {
    mockIsGhAvailable.mockReturnValue(new Promise(() => {})); // Never resolves
    const provider = new PRsTreeProvider();
    provider.setRepos(['owner/repo']);

    // Fetch starts, sets _loading = true, fires tree data changed
    // We read children immediately while loading
    const children = provider.getChildren();
    // First fire happens right away with loading true
    expect(children.some(c => c.label === 'Loading...')).toBe(true);
  });

  it('should show "No open PRs" when gh available but no PRs', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchMyPRs.mockResolvedValue([]);

    const provider = new PRsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const children = provider.getChildren();
    expect(children).toHaveLength(1);
    expect(children[0].label).toBe('No open PRs');
  });

  it('should show config placeholder when no repos set', () => {
    const provider = new PRsTreeProvider();
    const children = provider.getChildren();
    expect(children).toHaveLength(2);
    expect(children[0].label).toBe('Configure in GitHub');
    expect(children[1].label).toBe('Configure in ADO');
  });
});

// ---------------------------------------------------------------------------
// Merge conflict indicator
// ---------------------------------------------------------------------------

describe('PRsTreeProvider — merge conflict indicator', () => {
  async function getPRItem(pr: GitHubPR): Promise<PRsTreeItem> {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchMyPRs.mockResolvedValue([pr]);

    const provider = new PRsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const children = provider.getChildren();
    expect(children).toHaveLength(1);
    return children[0];
  }

  it('should show conflict indicator when mergeable is CONFLICTING', async () => {
    const item = await getPRItem(makePR({ mergeable: 'CONFLICTING' }));
    expect(item.description).toContain('has conflicts');
    expect((item.iconPath as { id: string }).id).toBe('warning');
  });

  it('should not show conflict indicator when mergeable is MERGEABLE', async () => {
    const item = await getPRItem(makePR({ mergeable: 'MERGEABLE' }));
    expect(item.description).not.toContain('has conflicts');
    expect((item.iconPath as { id: string }).id).not.toBe('warning');
  });

  it('should not show conflict indicator when mergeable is UNKNOWN', async () => {
    const item = await getPRItem(makePR({ mergeable: 'UNKNOWN' }));
    expect(item.description).not.toContain('has conflicts');
    expect((item.iconPath as { id: string }).id).not.toBe('warning');
  });

  it('should not show conflict indicator when mergeable is empty', async () => {
    const item = await getPRItem(makePR({ mergeable: '' }));
    expect(item.description).not.toContain('has conflicts');
    expect((item.iconPath as { id: string }).id).not.toBe('warning');
  });

  it('should include conflict warning in tooltip for conflicting PRs', async () => {
    const item = await getPRItem(makePR({ mergeable: 'CONFLICTING' }));
    expect((item.tooltip as { value: string }).value).toContain('has merge conflicts');
  });

  it('should preserve PR state in description alongside conflict indicator', async () => {
    const item = await getPRItem(makePR({ mergeable: 'CONFLICTING', reviewDecision: 'APPROVED' }));
    expect(item.description).toContain('approved');
    expect(item.description).toContain('has conflicts');
  });
});

// ---------------------------------------------------------------------------
// Filter infrastructure
// ---------------------------------------------------------------------------

describe('PRsTreeProvider — filter', () => {
  it('isFiltered should return false when no filters set', () => {
    const provider = new PRsTreeProvider();
    expect(provider.isFiltered).toBe(false);
  });

  it('isFiltered should return true when repo filter set', () => {
    const provider = new PRsTreeProvider();
    provider.setFilter({ repos: ['owner/repo'], labels: [], statuses: [], author: '' });
    expect(provider.isFiltered).toBe(true);
  });

  it('isFiltered should return true when status filter set', () => {
    const provider = new PRsTreeProvider();
    provider.setFilter({ repos: [], labels: [], statuses: ['draft'], author: '' });
    expect(provider.isFiltered).toBe(true);
  });

  it('isFiltered should return false after clearFilter', () => {
    const provider = new PRsTreeProvider();
    provider.setFilter({ repos: ['r'], labels: ['l'], statuses: ['s'], author: '' });
    provider.clearFilter();
    expect(provider.isFiltered).toBe(false);
  });

  it('getFilterDescription should show active filters', () => {
    const provider = new PRsTreeProvider();
    provider.setFilter({ repos: ['owner/repo'], labels: ['bug'], statuses: ['draft'], author: '' });
    const desc = provider.getFilterDescription();
    expect(desc).toContain('repo:owner/repo');
    expect(desc).toContain('status:draft');
    expect(desc).toContain('label:bug');
  });

  it('getFilterDescription should show only set filters', () => {
    const provider = new PRsTreeProvider();
    provider.setFilter({ repos: [], labels: [], statuses: ['open'], author: '' });
    expect(provider.getFilterDescription()).toBe('status:open');
  });
});

// ---------------------------------------------------------------------------
// applyRuntimeFilter
// ---------------------------------------------------------------------------

describe('PRsTreeProvider — applyRuntimeFilter', () => {
  it('should return all PRs when no filter set', () => {
    const provider = new PRsTreeProvider();
    const prs = [makePR({ number: 1 }), makePR({ number: 2 })];
    expect(provider.applyRuntimeFilter(prs)).toHaveLength(2);
  });

  it('should filter by status', () => {
    const provider = new PRsTreeProvider();
    const prs = [
      makePR({ number: 1, isDraft: true }),
      makePR({ number: 2 }),
      makePR({ number: 3, reviewDecision: 'APPROVED' }),
    ];
    provider.setFilter({ repos: [], labels: [], statuses: ['draft'], author: '' });
    const filtered = provider.applyRuntimeFilter(prs);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].number).toBe(1);
  });

  it('should filter by labels with OR-within-group logic', () => {
    const provider = new PRsTreeProvider();
    const prs = [
      makePR({ number: 1, labels: ['type:bug'] }),
      makePR({ number: 2, labels: ['type:feature'] }),
      makePR({ number: 3, labels: ['release:v1'] }),
    ];
    provider.setFilter({ repos: [], labels: ['type:bug', 'type:feature'], statuses: [], author: '' });
    const filtered = provider.applyRuntimeFilter(prs);
    expect(filtered).toHaveLength(2);
  });

  it('should filter by labels with AND-across-groups logic', () => {
    const provider = new PRsTreeProvider();
    const prs = [
      makePR({ number: 1, labels: ['type:bug', 'release:v1'] }),
      makePR({ number: 2, labels: ['type:bug'] }),
      makePR({ number: 3, labels: ['release:v1'] }),
    ];
    provider.setFilter({ repos: [], labels: ['type:bug', 'release:v1'], statuses: [], author: '' });
    const filtered = provider.applyRuntimeFilter(prs);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].number).toBe(1);
  });

  it('should filter by repo', () => {
    const provider = new PRsTreeProvider();
    const prs = [
      makePR({ number: 1, repository: 'owner/repo1' }),
      makePR({ number: 2, repository: 'owner/repo2' }),
    ];
    provider.setFilter({ repos: ['owner/repo1'], labels: [], statuses: [], author: '' });
    const filtered = provider.applyRuntimeFilter(prs);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].repository).toBe('owner/repo1');
  });

  it('should filter auto-merge status', () => {
    const provider = new PRsTreeProvider();
    const prs = [
      makePR({ number: 1, autoMergeRequest: { mergeMethod: 'SQUASH' } }),
      makePR({ number: 2 }),
    ];
    provider.setFilter({ repos: [], labels: [], statuses: ['auto-merge'], author: '' });
    const filtered = provider.applyRuntimeFilter(prs);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].number).toBe(1);
  });

  it('should show filter-aware empty message when filter active', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchMyPRs.mockResolvedValue([makePR({ number: 1, isDraft: true })]);

    const provider = new PRsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());

    provider.setFilter({ repos: [], labels: [], statuses: ['approved'], author: '' });
    const children = provider.getChildren();
    expect(children).toHaveLength(1);
    expect(children[0].label).toBe('No PRs match current filter');
  });
});

// ---------------------------------------------------------------------------
// Author filter (#280)
// ---------------------------------------------------------------------------

describe('PRsTreeProvider — author filter', () => {
  it('isFiltered should return true when author is set', () => {
    const provider = new PRsTreeProvider();
    provider.setFilter({ repos: [], labels: [], statuses: [], author: '@me' });
    expect(provider.isFiltered).toBe(true);
  });

  it('isFiltered should return false when author is empty string', () => {
    const provider = new PRsTreeProvider();
    provider.setFilter({ repos: [], labels: [], statuses: [], author: '' });
    expect(provider.isFiltered).toBe(false);
  });

  it('getFilterDescription should include author:me when author set', () => {
    const provider = new PRsTreeProvider();
    provider.setFilter({ repos: [], labels: [], statuses: [], author: '@me' });
    expect(provider.getFilterDescription()).toContain('author:me');
  });

  it('getFilterDescription should not include author when empty', () => {
    const provider = new PRsTreeProvider();
    provider.setFilter({ repos: [], labels: [], statuses: ['open'], author: '' });
    expect(provider.getFilterDescription()).not.toContain('author');
  });

  it('clearFilter should reset author to empty', () => {
    const provider = new PRsTreeProvider();
    provider.setFilter({ repos: [], labels: [], statuses: [], author: '@me' });
    expect(provider.isFiltered).toBe(true);
    provider.clearFilter();
    expect(provider.isFiltered).toBe(false);
    expect(provider.filter.author).toBe('');
  });

  it('should trigger fetchAll when author changes', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchMyPRs.mockResolvedValue([makePR()]);

    const provider = new PRsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());

    listener.mockClear();
    mockFetchMyPRs.mockClear();

    // Change author → should trigger a new fetchAll
    provider.setFilter({ repos: [], labels: [], statuses: [], author: '@me' });
    await vi.waitFor(() => expect(mockFetchMyPRs).toHaveBeenCalled());
  });
});
