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

import { WorkItemsTreeProvider, WorkItemsTreeItem } from '../work-items-tree';
import { PRsTreeProvider, PRsTreeItem } from '../prs-tree';

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
