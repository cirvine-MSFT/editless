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

  return {
    TreeItem, TreeItemCollapsibleState, ThemeIcon, MarkdownString, EventEmitter,
    Uri: { parse: (s: string) => ({ toString: () => s }) },
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
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));

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
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));

    const children = provider.getChildren();
    expect(children).toHaveLength(2);
    expect(children[0].contextValue).toBe('pull-request');
  });

  it('should show repo headers for multiple repos', async () => {
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
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));

    const roots = provider.getChildren();
    expect(roots).toHaveLength(2);
    expect(roots[0].contextValue).toBe('repo-group');
    expect(roots[0].label).toBe('owner/repo-a');
    expect(roots[1].label).toBe('owner/repo-b');

    // Children of repo header are PRs
    const repoAPRs = provider.getChildren(roots[0]);
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
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));

    const children = provider.getChildren();
    expect(children).toHaveLength(1);
    expect(children[0].label).toBe('No open PRs');
  });

  it('should show config placeholder when no repos set', () => {
    const provider = new PRsTreeProvider();
    const children = provider.getChildren();
    expect(children).toHaveLength(1);
    expect(children[0].label).toBe('Configure GitHub repos in settings');
  });
});
