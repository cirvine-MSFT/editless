import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createVscodeMock } from './mocks/vscode-mocks';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockIsGhAvailable = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
const mockFetchMyPRs = vi.fn().mockResolvedValue([]);

vi.mock('vscode', () => createVscodeMock({
  commands: { executeCommand: vi.fn() },
}));

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

    // Navigate owner→repo→PR hierarchy
    const ownerNodes = provider.getChildren();
    expect(ownerNodes).toHaveLength(1);
    const repoNodes = provider.getChildren(ownerNodes[0]);
    expect(repoNodes).toHaveLength(1);
    const children = provider.getChildren(repoNodes[0]);
    expect(children).toHaveLength(1);
    return (children[0].description as string).split(' · ')[0];
  }

  it('should derive "draft" state', async () => {
    expect(await getPRItemState(makePR({ isDraft: true }))).toBe('draft');
  });

  it('should derive "merged" state', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchMyPRs.mockResolvedValue([makePR({ state: 'MERGED' })]);

    const provider = new PRsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    // Must include 'merged' in statuses since merged PRs are hidden by default
    provider.setFilter({ repos: [], labels: [], statuses: ['merged'], author: '' });
    // Navigate owner→repo→PR hierarchy
    const ownerNodes = provider.getChildren();
    expect(ownerNodes).toHaveLength(1);
    const repoNodes = provider.getChildren(ownerNodes[0]);
    expect(repoNodes).toHaveLength(1);
    const children = provider.getChildren(repoNodes[0]);
    expect(children).toHaveLength(1);
    expect((children[0].description as string).split(' · ')[0]).toBe('merged');
  });

  it('should derive "closed" state', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchMyPRs.mockResolvedValue([makePR({ state: 'CLOSED' })]);

    const provider = new PRsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    // Must include 'closed' in statuses since closed PRs are hidden by default
    provider.setFilter({ repos: [], labels: [], statuses: ['closed'], author: '' });
    // Navigate owner→repo→PR hierarchy
    const ownerNodes = provider.getChildren();
    expect(ownerNodes).toHaveLength(1);
    const repoNodes = provider.getChildren(ownerNodes[0]);
    expect(repoNodes).toHaveLength(1);
    const children = provider.getChildren(repoNodes[0]);
    expect(children).toHaveLength(1);
    expect((children[0].description as string).split(' · ')[0]).toBe('closed');
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
  it('should show owner → repo hierarchy for single repo', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchMyPRs.mockResolvedValue([makePR({ number: 1 }), makePR({ number: 2, title: 'Second' })]);

    const provider = new PRsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    // Single repo still shows owner→repo hierarchy
    const roots = provider.getChildren();
    expect(roots).toHaveLength(1);
    expect(roots[0].contextValue).toBe('github-pr-org');
    expect(roots[0].label).toBe('owner');

    const repoNodes = provider.getChildren(roots[0]);
    expect(repoNodes).toHaveLength(1);
    expect(repoNodes[0].contextValue).toBe('github-pr-repo');

    const prItems = provider.getChildren(repoNodes[0]);
    expect(prItems).toHaveLength(2);
    expect(prItems[0].contextValue).toBe('pull-request');
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

    // Navigate owner→repo→PR hierarchy
    const ownerNodes = provider.getChildren();
    expect(ownerNodes).toHaveLength(1);
    const repoNodes = provider.getChildren(ownerNodes[0]);
    expect(repoNodes).toHaveLength(1);
    const children = provider.getChildren(repoNodes[0]);
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

// ---------------------------------------------------------------------------
// PRLevelFilter lifecycle (#390)
// ---------------------------------------------------------------------------

describe('PRsTreeProvider — PRLevelFilter lifecycle', () => {
  it('should get undefined when no level filter set', () => {
    const provider = new PRsTreeProvider();
    expect(provider.getLevelFilter('github-pr:owner/repo:f0')).toBeUndefined();
  });

  it('should set and get level filter', () => {
    const provider = new PRsTreeProvider();
    const filter = { statuses: ['draft'], labels: ['urgent'] };
    provider.setLevelFilter('github-pr:owner/repo:f0', filter);
    expect(provider.getLevelFilter('github-pr:owner/repo:f0')).toEqual(filter);
  });

  it('should fire tree data change when setting level filter', () => {
    const provider = new PRsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setLevelFilter('github-pr:owner/repo:f0', { statuses: ['draft'] });
    expect(listener).toHaveBeenCalledOnce();
  });

  it('should clear level filter by nodeId', () => {
    const provider = new PRsTreeProvider();
    provider.setLevelFilter('github-pr:owner/repo:f0', { statuses: ['draft'] });
    provider.clearLevelFilter('github-pr:owner/repo:f0');
    expect(provider.getLevelFilter('github-pr:owner/repo:f0')).toBeUndefined();
  });

  it('should fire tree data change when clearing level filter', () => {
    const provider = new PRsTreeProvider();
    provider.setLevelFilter('github-pr:owner/repo:f0', { statuses: ['draft'] });
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.clearLevelFilter('github-pr:owner/repo:f0');
    expect(listener).toHaveBeenCalledOnce();
  });

  it('should clear all level filters', () => {
    const provider = new PRsTreeProvider();
    provider.setLevelFilter('github-pr:owner/repo:f0', { statuses: ['draft'] });
    provider.setLevelFilter('ado-pr:org:project:f0', { statuses: ['active'] });
    provider.clearAllLevelFilters();
    expect(provider.getLevelFilter('github-pr:owner/repo:f0')).toBeUndefined();
    expect(provider.getLevelFilter('ado-pr:org:project:f0')).toBeUndefined();
  });

  it('should fire tree data change when clearing all level filters', () => {
    const provider = new PRsTreeProvider();
    provider.setLevelFilter('github-pr:owner/repo:f0', { statuses: ['draft'] });
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.clearAllLevelFilters();
    expect(listener).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// getAvailableOptions (#390)
// ---------------------------------------------------------------------------

describe('PRsTreeProvider — getAvailableOptions', () => {
  it('should return owners for github-pr-backend', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchMyPRs.mockResolvedValue([makePR()]);
    const provider = new PRsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner1/repo1', 'owner2/repo2']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const options = provider.getAvailableOptions('github-pr:', 'github-pr-backend');
    expect(options.owners).toEqual(['owner1', 'owner2']);
  });

  it('should return repos for github-pr-org', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchMyPRs.mockResolvedValue([makePR()]);
    const provider = new PRsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo-a', 'owner/repo-b']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const options = provider.getAvailableOptions('github-pr:owner', 'github-pr-org');
    expect(options.repos).toEqual(['owner/repo-a', 'owner/repo-b']);
  });

  it('should return statuses and labels for github-pr-repo', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchMyPRs.mockResolvedValue([
      makePR({ labels: ['bug', 'urgent'] }),
      makePR({ labels: ['feature'] }),
    ]);
    const provider = new PRsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const options = provider.getAvailableOptions('github-pr:owner/repo', 'github-pr-repo');
    expect(options.statuses).toEqual(['draft', 'open', 'approved', 'changes-requested', 'auto-merge']);
    expect(options.labels).toEqual(['bug', 'feature', 'urgent']);
  });

  it('should return orgs for ado-pr-backend', () => {
    const provider = new PRsTreeProvider();
    provider.setAdoConfig('my-org', 'my-project');
    const options = provider.getAvailableOptions('ado-pr:', 'ado-pr-backend');
    expect(options.orgs).toEqual(['my-org']);
  });

  it('should return projects for ado-pr-org', () => {
    const provider = new PRsTreeProvider();
    provider.setAdoConfig('my-org', 'my-project');
    const options = provider.getAvailableOptions('ado-pr:my-org', 'ado-pr-org');
    expect(options.projects).toEqual(['my-project']);
  });

  it('should return statuses for ado-pr-project', () => {
    const provider = new PRsTreeProvider();
    const options = provider.getAvailableOptions('ado-pr:org:project', 'ado-pr-project');
    expect(options.statuses).toEqual(['draft', 'open', 'merged']);
  });

  it('should return empty for unknown contextValue', () => {
    const provider = new PRsTreeProvider();
    const options = provider.getAvailableOptions('unknown', 'unknown-context');
    expect(options).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Hierarchy rendering with level filters (#390)
// ---------------------------------------------------------------------------

describe('PRsTreeProvider — hierarchy rendering with level filters', () => {
  it('should apply level filter to GitHub repo node', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchMyPRs.mockImplementation(async (repo: string) => {
      if (repo === 'owner/repo') {
        return [
          makePR({ number: 1, isDraft: true }),
          makePR({ number: 2, reviewDecision: 'APPROVED' }),
        ];
      }
      return [];
    });

    const provider = new PRsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    // Get owner→repo hierarchy
    const root = provider.getChildren();
    expect(root).toHaveLength(1); // 1 owner node
    const repoNodes = provider.getChildren(root[0]);
    expect(repoNodes).toHaveLength(1); // 1 repo node

    // Now apply level filter to the repo
    const repoNode = new PRsTreeItem('owner/repo', 1);
    repoNode.id = 'github-pr:owner/repo:f1';
    repoNode.contextValue = 'github-pr-repo';
    provider.setLevelFilter('github-pr:owner/repo:f1', { statuses: ['draft'] });

    // Get children with filter applied
    const filtered = provider.getChildren(repoNode);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].label).toContain('#1');
  });

  it('should apply label filter in level filter', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchMyPRs.mockResolvedValue([
      makePR({ number: 1, labels: ['bug'] }),
      makePR({ number: 2, labels: ['feature'] }),
    ]);

    const provider = new PRsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const repoNode = new PRsTreeItem('owner/repo', 1);
    repoNode.id = 'github-pr:owner/repo:f1';
    repoNode.contextValue = 'github-pr-repo';
    provider.setLevelFilter('github-pr:owner/repo:f1', { labels: ['bug'] });

    const filtered = provider.getChildren(repoNode);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].label).toContain('#1');
  });

  it('should apply combined status and label filter in level filter', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchMyPRs.mockResolvedValue([
      makePR({ number: 1, isDraft: true, labels: ['urgent'] }),
      makePR({ number: 2, isDraft: true, labels: ['low-priority'] }),
      makePR({ number: 3, reviewDecision: 'APPROVED', labels: ['urgent'] }),
    ]);

    const provider = new PRsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const repoNode = new PRsTreeItem('owner/repo', 1);
    repoNode.id = 'github-pr:owner/repo:f1';
    repoNode.contextValue = 'github-pr-repo';
    provider.setLevelFilter('github-pr:owner/repo:f1', {
      statuses: ['draft'],
      labels: ['urgent'],
    });

    const filtered = provider.getChildren(repoNode);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].label).toContain('#1');
  });

  it('should apply level filter to ADO project node', () => {
    const provider = new PRsTreeProvider();
    provider.setAdoConfig('org', 'project');
    provider.setAdoPRs([
      {
        id: 1, title: 'PR 1', isDraft: true, status: 'active',
        url: 'url', sourceRef: 'feature', targetRef: 'main',
        repository: 'repo', reviewers: [], createdBy: 'user1@example.com',
      },
      {
        id: 2, title: 'PR 2', isDraft: false, status: 'active',
        url: 'url', sourceRef: 'fix', targetRef: 'main',
        repository: 'repo', reviewers: [], createdBy: 'user2@example.com',
      },
    ]);

    const projectNode = new PRsTreeItem('project', 2);
    projectNode.id = 'ado-pr:org:project:f1';
    projectNode.contextValue = 'ado-pr-project';
    provider.setLevelFilter('ado-pr:org:project:f1', { statuses: ['draft'] });

    const filtered = provider.getChildren(projectNode);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].label).toContain('#1');
  });
});

// ---------------------------------------------------------------------------
// Edge cases (#390)
// ---------------------------------------------------------------------------

describe('PRsTreeProvider — level filter edge cases', () => {
  it('should handle empty result when level filter matches nothing', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchMyPRs.mockResolvedValue([makePR({ reviewDecision: 'APPROVED' })]);

    const provider = new PRsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const repoNode = new PRsTreeItem('owner/repo', 1);
    repoNode.id = 'github-pr:owner/repo:f1';
    repoNode.contextValue = 'github-pr-repo';
    provider.setLevelFilter('github-pr:owner/repo:f1', { statuses: ['draft'] });

    const filtered = provider.getChildren(repoNode);
    expect(filtered).toHaveLength(0);
  });

  it('should handle single backend GitHub-only configuration', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchMyPRs.mockResolvedValue([makePR({ number: 1 })]);

    const provider = new PRsTreeProvider();
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    // Single backend, single repo → owner→repo hierarchy
    const root = provider.getChildren();
    expect(root).toHaveLength(1);
    expect(root[0].contextValue).toBe('github-pr-org');
    expect(root[0].label).toBe('owner');

    const repoNodes = provider.getChildren(root[0]);
    expect(repoNodes).toHaveLength(1);
    expect(repoNodes[0].contextValue).toBe('github-pr-repo');

    const prItems = provider.getChildren(repoNodes[0]);
    expect(prItems).toHaveLength(1);
    expect(prItems[0].contextValue).toBe('pull-request');
  });

  it('should handle single backend ADO-only configuration', () => {
    const provider = new PRsTreeProvider();
    provider.setAdoConfig('org', 'project');
    provider.setAdoPRs([
      {
        id: 1, title: 'PR', isDraft: false, status: 'active',
        url: 'url', sourceRef: 'feature', targetRef: 'main',
        repository: 'repo', reviewers: [], createdBy: 'user@example.com',
      },
    ]);

    // Single backend, ADO → org→project hierarchy
    const root = provider.getChildren();
    expect(root).toHaveLength(1);
    expect(root[0].contextValue).toBe('ado-pr-org');
    expect(root[0].label).toBe('org');

    const projectNodes = provider.getChildren(root[0]);
    expect(projectNodes).toHaveLength(1);
    expect(projectNodes[0].contextValue).toBe('ado-pr-project');

    const prItems = provider.getChildren(projectNodes[0]);
    expect(prItems).toHaveLength(1);
    expect(prItems[0].contextValue).toBe('ado-pull-request');
  });

  it('should show both backends when both GitHub and ADO configured', async () => {
    mockIsGhAvailable.mockResolvedValue(true);
    mockFetchMyPRs.mockResolvedValue([makePR()]);

    const provider = new PRsTreeProvider();
    provider.setAdoConfig('org', 'project');
    provider.setAdoPRs([
      {
        id: 1, title: 'PR', isDraft: false, status: 'active',
        url: 'url', sourceRef: 'feature', targetRef: 'main',
        repository: 'repo', reviewers: [], createdBy: 'user@example.com',
      },
    ]);
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());

    const root = provider.getChildren();
    expect(root).toHaveLength(2);
    expect(root.some(n => n.contextValue === 'ado-pr-backend')).toBe(true);
    expect(root.some(n => n.contextValue === 'github-pr-backend')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ADO author filter
// ---------------------------------------------------------------------------

describe('PRsTreeProvider — ADO author filter', () => {
  function makeAdoPRs() {
    return [
      {
        id: 1, title: 'My PR', isDraft: false, status: 'active',
        url: 'url', sourceRef: 'feature', targetRef: 'main',
        repository: 'repo', reviewers: [], createdBy: 'me@example.com',
      },
      {
        id: 2, title: 'Other PR', isDraft: false, status: 'active',
        url: 'url', sourceRef: 'fix', targetRef: 'main',
        repository: 'repo', reviewers: [], createdBy: 'other@example.com',
      },
      {
        id: 3, title: 'Draft PR', isDraft: true, status: 'active',
        url: 'url', sourceRef: 'draft-branch', targetRef: 'main',
        repository: 'repo', reviewers: [], createdBy: 'me@example.com',
      },
    ];
  }

  it('should filter ADO PRs by author when author filter is active', () => {
    const provider = new PRsTreeProvider();
    provider.setAdoMe('me@example.com');
    provider.setFilter({ repos: [], labels: [], statuses: [], author: '@me' });

    const filtered = provider.applyAdoRuntimeFilter(makeAdoPRs());
    expect(filtered).toHaveLength(2);
    expect(filtered.every(pr => pr.createdBy === 'me@example.com')).toBe(true);
  });

  it('should use case-insensitive matching for ADO author', () => {
    const provider = new PRsTreeProvider();
    provider.setAdoMe('ME@EXAMPLE.COM');
    provider.setFilter({ repos: [], labels: [], statuses: [], author: '@me' });

    const filtered = provider.applyAdoRuntimeFilter(makeAdoPRs());
    expect(filtered).toHaveLength(2);
    expect(filtered.every(pr => pr.createdBy.toLowerCase() === 'me@example.com')).toBe(true);
  });

  it('should show all ADO PRs when author filter is not active', () => {
    const provider = new PRsTreeProvider();
    provider.setAdoMe('me@example.com');
    provider.setFilter({ repos: [], labels: [], statuses: [], author: '' });

    const filtered = provider.applyAdoRuntimeFilter(makeAdoPRs());
    // 3 total, but draft/active are kept (merged/closed excluded by default)
    expect(filtered).toHaveLength(3);
  });

  it('should not filter by author when adoMe is not set', () => {
    const provider = new PRsTreeProvider();
    // No setAdoMe call
    provider.setFilter({ repos: [], labels: [], statuses: [], author: '@me' });

    const filtered = provider.applyAdoRuntimeFilter(makeAdoPRs());
    expect(filtered).toHaveLength(3);
  });

  it('should show createdBy in tree item description when not in author mode', () => {
    const provider = new PRsTreeProvider();
    provider.setAdoConfig('org', 'project');
    provider.setAdoPRs(makeAdoPRs());

    const projectNode = new PRsTreeItem('project', 2);
    projectNode.id = 'ado-pr:org:project:f1';
    projectNode.contextValue = 'ado-pr-project';

    const items = provider.getChildren(projectNode);
    expect(items[0].description).toContain('me@example.com');
  });

  it('should hide createdBy in tree item description when author filter is active', () => {
    const provider = new PRsTreeProvider();
    provider.setAdoConfig('org', 'project');
    provider.setAdoMe('me@example.com');
    provider.setFilter({ repos: [], labels: [], statuses: [], author: '@me' });
    provider.setAdoPRs(makeAdoPRs());

    const projectNode = new PRsTreeItem('project', 2);
    projectNode.id = 'ado-pr:org:project:f1';
    projectNode.contextValue = 'ado-pr-project';

    const items = provider.getChildren(projectNode);
    expect(items[0].description).not.toContain('me@example.com');
  });
});
