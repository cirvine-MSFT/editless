import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockIsGhAvailable = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
const mockFetchAssignedIssues = vi.fn().mockResolvedValue([]);
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
  fetchAssignedIssues: (...args: unknown[]) => mockFetchAssignedIssues(...(args as [string])),
  fetchMyPRs: (...args: unknown[]) => mockFetchMyPRs(...(args as [string])),
}));

import { WorkItemsTreeProvider, WorkItemsTreeItem } from '../work-items-tree';
import { PRsTreeProvider, PRsTreeItem } from '../prs-tree';

beforeEach(() => {
  vi.clearAllMocks();
  mockIsGhAvailable.mockResolvedValue(false);
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
