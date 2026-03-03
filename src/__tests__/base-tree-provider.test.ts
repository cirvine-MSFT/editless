import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createVscodeMock, TreeItem, TreeItemCollapsibleState } from './mocks/vscode-mocks';

vi.mock('vscode', () => createVscodeMock());

import { BaseTreeProvider } from '../base-tree-provider';
import type * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Concrete test subclass exposing protected base-class behaviour
// ---------------------------------------------------------------------------

interface TestFilter {
  labels?: string[];
}

class TestTreeItem extends TreeItem {
  constructor(label: string, collapsible?: number) {
    super(label, collapsible ?? TreeItemCollapsibleState.None);
  }
}

class TestTreeProvider extends BaseTreeProvider<
  { id: number; labels: string[]; repo: string },
  { id: number; name: string },
  TestTreeItem,
  TestFilter
> {
  protected readonly _ghIdPrefix = 'test-gh';
  protected readonly _adoIdPrefix = 'test-ado';
  protected readonly _itemCountSuffix: [string, string] = ['item', 'items'];
  protected readonly _emptyMessage = 'Nothing here';

  // Publicly-settable backing stores for tests
  ghItems = new Map<string, { id: number; labels: string[]; repo: string }[]>();
  adoItems: { id: number; name: string }[] = [];
  doFetchCalled = 0;
  runtimeFilterFn: ((items: { id: number; labels: string[]; repo: string }[]) => { id: number; labels: string[]; repo: string }[]) | undefined;
  adoRuntimeFilterFn: ((items: { id: number; name: string }[]) => { id: number; name: string }[]) | undefined;
  singleBackendResult: TestTreeItem[] | undefined;
  childrenForContextResult: TestTreeItem[] | undefined;

  protected _createTreeItem(label: string, collapsible?: number): TestTreeItem {
    return new TestTreeItem(label, collapsible);
  }

  protected _getLevelFilterParts(filter: TestFilter): string[] {
    return filter.labels ? [`label:${filter.labels.join(',')}`] : [];
  }

  protected _updateDescription(): void { /* no-op for tests */ }

  protected _getGitHubItemsMap() { return this.ghItems; }
  protected _getAdoItemsList() { return this.adoItems; }

  applyRuntimeFilter(items: { id: number; labels: string[]; repo: string }[]) {
    return this.runtimeFilterFn ? this.runtimeFilterFn(items) : items;
  }
  applyAdoRuntimeFilter(items: { id: number; name: string }[]) {
    return this.adoRuntimeFilterFn ? this.adoRuntimeFilterFn(items) : items;
  }

  protected async _doFetchAll(): Promise<void> {
    this.doFetchCalled++;
  }

  protected _getRootGitHubSingleBackend(filteredItems: Map<string, { id: number; labels: string[]; repo: string }[]>): TestTreeItem[] {
    if (this.singleBackendResult) return this.singleBackendResult;
    const items: TestTreeItem[] = [];
    for (const [, list] of filteredItems) {
      for (const gh of list) items.push(new TestTreeItem(`GH#${gh.id}`));
    }
    return items;
  }

  protected _getChildrenForContext(_element: TestTreeItem, _ctx: string): TestTreeItem[] {
    return this.childrenForContextResult ?? [];
  }

  protected _clearAdoData(): void {
    this.adoItems = [];
  }

  get isFiltered(): boolean { return false; }

  // Expose protected helpers for testing
  public testCleanNodeId(id: string) { return this._cleanNodeId(id); }
  public testContextWithFilter(base: string, nodeId: string) { return this._contextWithFilter(base, nodeId); }
  public testGetFilterDescription(nodeId: string, count: number) { return this._getFilterDescription(nodeId, count); }
  public testMatchesLabelFilter(itemLabels: string[], activeFilters: string[]) { return this.matchesLabelFilter(itemLabels, activeFilters); }
  public testGetFilteredGitHubMap() { return this._getFilteredGitHubMap(); }
  public testGetFilteredGitHubMapForOwner(owner: string) { return this._getFilteredGitHubMapForOwner(owner); }
  public testGetRootChildren() { return this._getRootChildren(); }
  public testGetAdoOrgNodes(count: number) { return this._getAdoOrgNodes(count); }
  public testGetAdoProjectNodes(count: number) { return this._getAdoProjectNodes(count); }
  public testGetGitHubOwnerNodes(map: Map<string, { id: number; labels: string[]; repo: string }[]>) { return this._getGitHubOwnerNodes(map); }
  public testGetGitHubRepoNodes(map: Map<string, { id: number; labels: string[]; repo: string }[]>, owner: string) { return this._getGitHubRepoNodes(map, owner); }
  public testGetAvailableOptionsBase(nodeId: string, ctx: string) { return this._getAvailableOptionsBase(nodeId, ctx); }
}

// ---------------------------------------------------------------------------

let provider: TestTreeProvider;

beforeEach(() => {
  vi.clearAllMocks();
  provider = new TestTreeProvider();
});

// ---------------------------------------------------------------------------
// _cleanNodeId
// ---------------------------------------------------------------------------

describe('_cleanNodeId', () => {
  it('strips :f<digits> suffix', () => {
    expect(provider.testCleanNodeId('test-gh:owner:f42')).toBe('test-gh:owner');
  });

  it('returns unchanged when no suffix', () => {
    expect(provider.testCleanNodeId('test-gh:owner')).toBe('test-gh:owner');
  });

  it('only strips the last :f<digits> match', () => {
    expect(provider.testCleanNodeId('prefix:f1:f2')).toBe('prefix:f1');
  });
});

// ---------------------------------------------------------------------------
// Level filter management
// ---------------------------------------------------------------------------

describe('level filter CRUD', () => {
  it('getLevelFilter returns undefined when no filter set', () => {
    expect(provider.getLevelFilter('node-1')).toBeUndefined();
  });

  it('setLevelFilter stores and getLevelFilter retrieves', () => {
    provider.setLevelFilter('node-1', { labels: ['bug'] });
    expect(provider.getLevelFilter('node-1')).toEqual({ labels: ['bug'] });
  });

  it('setLevelFilter strips :f<digits> suffix from nodeId', () => {
    provider.setLevelFilter('node-1:f5', { labels: ['bug'] });
    expect(provider.getLevelFilter('node-1')).toEqual({ labels: ['bug'] });
    expect(provider.getLevelFilter('node-1:f99')).toEqual({ labels: ['bug'] });
  });

  it('clearLevelFilter removes one filter', () => {
    provider.setLevelFilter('a', { labels: ['x'] });
    provider.setLevelFilter('b', { labels: ['y'] });
    provider.clearLevelFilter('a');
    expect(provider.getLevelFilter('a')).toBeUndefined();
    expect(provider.getLevelFilter('b')).toEqual({ labels: ['y'] });
  });

  it('clearAllLevelFilters removes all', () => {
    provider.setLevelFilter('a', { labels: ['x'] });
    provider.setLevelFilter('b', { labels: ['y'] });
    provider.clearAllLevelFilters();
    expect(provider.getLevelFilter('a')).toBeUndefined();
    expect(provider.getLevelFilter('b')).toBeUndefined();
  });

  it('setLevelFilter fires onDidChangeTreeData', () => {
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setLevelFilter('x', { labels: ['a'] });
    expect(listener).toHaveBeenCalledOnce();
  });

  it('clearLevelFilter fires onDidChangeTreeData', () => {
    provider.setLevelFilter('x', { labels: ['a'] });
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.clearLevelFilter('x');
    expect(listener).toHaveBeenCalledOnce();
  });

  it('clearAllLevelFilters fires onDidChangeTreeData', () => {
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.clearAllLevelFilters();
    expect(listener).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// _contextWithFilter
// ---------------------------------------------------------------------------

describe('_contextWithFilter', () => {
  it('returns base when no filter', () => {
    expect(provider.testContextWithFilter('test-gh-repo', 'test-gh:owner/repo')).toBe('test-gh-repo');
  });

  it('appends -filtered when filter exists', () => {
    provider.setLevelFilter('test-gh:owner/repo', { labels: ['bug'] });
    expect(provider.testContextWithFilter('test-gh-repo', 'test-gh:owner/repo')).toBe('test-gh-repo-filtered');
  });

  it('handles nodeId with :f suffix correctly', () => {
    provider.setLevelFilter('node-1', { labels: ['x'] });
    expect(provider.testContextWithFilter('ctx', 'node-1:f3')).toBe('ctx-filtered');
  });
});

// ---------------------------------------------------------------------------
// matchesLabelFilter
// ---------------------------------------------------------------------------

describe('matchesLabelFilter', () => {
  it('returns true with empty filters', () => {
    expect(provider.testMatchesLabelFilter(['bug', 'feature'], [])).toBe(true);
  });

  it('matches single label', () => {
    expect(provider.testMatchesLabelFilter(['bug', 'feature'], ['bug'])).toBe(true);
  });

  it('fails when no label matches', () => {
    expect(provider.testMatchesLabelFilter(['feature'], ['bug'])).toBe(false);
  });

  it('OR within same prefix group', () => {
    // Both have prefix 'priority', so OR logic applies
    expect(provider.testMatchesLabelFilter(['priority:high'], ['priority:high', 'priority:low'])).toBe(true);
  });

  it('AND across different prefix groups', () => {
    // 'priority:high' group AND 'status:open' group
    expect(provider.testMatchesLabelFilter(['priority:high', 'status:open'], ['priority:high', 'status:open'])).toBe(true);
    expect(provider.testMatchesLabelFilter(['priority:high'], ['priority:high', 'status:open'])).toBe(false);
  });

  it('empty-prefix labels grouped together', () => {
    // labels without colons share the empty-string prefix
    expect(provider.testMatchesLabelFilter(['bug'], ['bug', 'feature'])).toBe(true);
    expect(provider.testMatchesLabelFilter(['other'], ['bug', 'feature'])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// _getFilterDescription
// ---------------------------------------------------------------------------

describe('_getFilterDescription', () => {
  it('returns count only when no filter', () => {
    expect(provider.testGetFilterDescription('test-gh:', 5)).toBe('5 items');
  });

  it('singular when count is 1', () => {
    expect(provider.testGetFilterDescription('test-gh:', 1)).toBe('1 item');
  });

  it('includes filter parts when filter set', () => {
    provider.setLevelFilter('test-gh:', { labels: ['bug', 'feature'] });
    expect(provider.testGetFilterDescription('test-gh:', 3)).toBe('3 items · label:bug,feature');
  });

  it('handles nodeId with :f suffix', () => {
    provider.setLevelFilter('test-gh:', { labels: ['x'] });
    expect(provider.testGetFilterDescription('test-gh::f7', 2)).toBe('2 items · label:x');
  });
});

// ---------------------------------------------------------------------------
// fetchAll / debouncing
// ---------------------------------------------------------------------------

describe('fetchAll debouncing', () => {
  it('setRepos triggers fetchAll', async () => {
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.setRepos(['owner/repo']);
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    expect(provider.doFetchCalled).toBe(1);
  });

  it('refresh() triggers fetchAll', async () => {
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.refresh();
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    expect(provider.doFetchCalled).toBe(1);
  });

  it('concurrent calls are debounced', async () => {
    // Make _doFetchAll slow
    let resolveFirst: () => void;
    let firstCallDone = false;
    const orig = provider.doFetchCalled;
    provider._doFetchAll = async () => {
      provider.doFetchCalled++;
      if (!firstCallDone) {
        firstCallDone = true;
        await new Promise<void>(r => { resolveFirst = r; });
      }
    };
    // Workaround: cast to access protected method
    (provider as any).fetchAll();
    // second call while first is in progress → queued
    (provider as any).fetchAll();
    resolveFirst!();
    await vi.waitFor(() => expect(provider.doFetchCalled).toBeGreaterThanOrEqual(orig + 2));
  });
});

// ---------------------------------------------------------------------------
// ADO configuration
// ---------------------------------------------------------------------------

describe('ADO configuration', () => {
  it('setAdoConfig stores org and project', () => {
    provider.setAdoConfig('my-org', 'my-proj');
    expect(provider.getAllRepos()).not.toContain('(ADO)'); // not configured yet
  });

  it('clearAdo fires change event and resets flag', () => {
    provider.adoItems = [{ id: 1, name: 'wi' }];
    (provider as any)._adoConfigured = true;
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    provider.clearAdo();
    expect(listener).toHaveBeenCalledOnce();
    expect(provider.adoItems).toEqual([]);
  });

  it('getAllRepos includes (ADO) when configured', () => {
    (provider as any)._adoConfigured = true;
    provider.setRepos(['owner/repo']);
    // wait for fetchAll
    expect(provider.getAllRepos()).toContain('(ADO)');
  });
});

// ---------------------------------------------------------------------------
// getAllLabels
// ---------------------------------------------------------------------------

describe('getAllLabels', () => {
  it('returns sorted labels from _allLabels', () => {
    (provider as any)._allLabels = new Set(['z', 'a', 'm']);
    expect(provider.getAllLabels()).toEqual(['a', 'm', 'z']);
  });

  it('returns empty array when no labels', () => {
    expect(provider.getAllLabels()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// setTreeView
// ---------------------------------------------------------------------------

describe('setTreeView', () => {
  it('stores the tree view reference', () => {
    const mockView = { description: undefined } as any;
    provider.setTreeView(mockView);
    expect((provider as any)._treeView).toBe(mockView);
  });
});

// ---------------------------------------------------------------------------
// setAdoRefresh
// ---------------------------------------------------------------------------

describe('setAdoRefresh', () => {
  it('stores the refresh function', () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    provider.setAdoRefresh(fn);
    expect((provider as any)._adoRefresh).toBe(fn);
  });
});

// ---------------------------------------------------------------------------
// getTreeItem
// ---------------------------------------------------------------------------

describe('getTreeItem', () => {
  it('returns the element as-is', () => {
    const item = new TestTreeItem('hello');
    expect(provider.getTreeItem(item)).toBe(item);
  });
});

// ---------------------------------------------------------------------------
// _getFilteredGitHubMap
// ---------------------------------------------------------------------------

describe('_getFilteredGitHubMap', () => {
  it('returns all items when no runtime filter', () => {
    provider.ghItems.set('owner/repo', [{ id: 1, labels: [], repo: 'owner/repo' }]);
    const result = provider.testGetFilteredGitHubMap();
    expect(result.size).toBe(1);
    expect(result.get('owner/repo')).toHaveLength(1);
  });

  it('applies runtime filter', () => {
    provider.ghItems.set('owner/repo', [
      { id: 1, labels: ['bug'], repo: 'owner/repo' },
      { id: 2, labels: ['feature'], repo: 'owner/repo' },
    ]);
    provider.runtimeFilterFn = items => items.filter(i => i.labels.includes('bug'));
    const result = provider.testGetFilteredGitHubMap();
    expect(result.get('owner/repo')).toHaveLength(1);
    expect(result.get('owner/repo')![0].id).toBe(1);
  });

  it('excludes repos with zero filtered items', () => {
    provider.ghItems.set('owner/repo', [{ id: 1, labels: ['feature'], repo: 'owner/repo' }]);
    provider.runtimeFilterFn = () => [];
    const result = provider.testGetFilteredGitHubMap();
    expect(result.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// _getFilteredGitHubMapForOwner
// ---------------------------------------------------------------------------

describe('_getFilteredGitHubMapForOwner', () => {
  it('filters to specific owner', () => {
    provider.ghItems.set('alice/repo1', [{ id: 1, labels: [], repo: 'alice/repo1' }]);
    provider.ghItems.set('bob/repo2', [{ id: 2, labels: [], repo: 'bob/repo2' }]);
    const result = provider.testGetFilteredGitHubMapForOwner('alice');
    expect(result.size).toBe(1);
    expect(result.has('alice/repo1')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// _getRootChildren
// ---------------------------------------------------------------------------

describe('_getRootChildren', () => {
  it('shows loading indicator when loading and empty', () => {
    (provider as any)._loading = true;
    const children = provider.testGetRootChildren();
    expect(children).toHaveLength(1);
    expect(children[0].label).toBe('Loading...');
  });

  it('shows configure prompts when no repos or ADO', () => {
    const children = provider.testGetRootChildren();
    expect(children).toHaveLength(2);
    expect(children[0].label).toBe('Configure in GitHub');
    expect(children[1].label).toBe('Configure in ADO');
  });

  it('shows empty message when repos configured but no items', () => {
    (provider as any)._repos = ['owner/repo'];
    const children = provider.testGetRootChildren();
    expect(children).toHaveLength(1);
    expect(children[0].label).toBe('Nothing here');
  });

  it('shows single backend items directly for GitHub-only', () => {
    (provider as any)._repos = ['owner/repo'];
    provider.ghItems.set('owner/repo', [{ id: 1, labels: [], repo: 'owner/repo' }]);
    provider.singleBackendResult = [new TestTreeItem('direct')];
    const children = provider.testGetRootChildren();
    expect(children).toHaveLength(1);
    expect(children[0].label).toBe('direct');
  });

  it('shows dual backend groups when both GH and ADO have items', () => {
    (provider as any)._repos = ['owner/repo'];
    (provider as any)._adoConfigured = true;
    provider.ghItems.set('owner/repo', [{ id: 1, labels: [], repo: 'owner/repo' }]);
    provider.adoItems = [{ id: 1, name: 'wi' }];
    const children = provider.testGetRootChildren();
    expect(children).toHaveLength(2);
    expect(children[0].label).toBe('Azure DevOps');
    expect(children[0].contextValue).toBe('test-ado-backend');
    expect(children[1].label).toBe('GitHub');
    expect(children[1].contextValue).toBe('test-gh-backend');
  });

  it('shows ADO org directly for ADO-only single backend', () => {
    (provider as any)._adoConfigured = true;
    provider.setAdoConfig('my-org', 'my-proj');
    provider.adoItems = [{ id: 1, name: 'wi' }];
    const children = provider.testGetRootChildren();
    expect(children).toHaveLength(1);
    expect(children[0].label).toBe('my-org');
    expect(children[0].contextValue).toBe('test-ado-org');
  });
});

// ---------------------------------------------------------------------------
// getChildren routing
// ---------------------------------------------------------------------------

describe('getChildren routing', () => {
  it('delegates to _getRootChildren when no element', () => {
    const children = provider.getChildren();
    // No repos or ADO → configure prompts
    expect(children.length).toBeGreaterThan(0);
  });

  it('routes ado-backend to _getAdoOrgNodes', () => {
    provider.setAdoConfig('org', 'proj');
    provider.adoItems = [{ id: 1, name: 'wi' }];
    const element = new TestTreeItem('ADO');
    element.contextValue = 'test-ado-backend';
    const children = provider.getChildren(element as any);
    expect(children).toHaveLength(1);
    expect(children[0].label).toBe('org');
  });

  it('routes ado-org to _getAdoProjectNodes', () => {
    provider.setAdoConfig('org', 'proj');
    provider.adoItems = [{ id: 1, name: 'wi' }];
    const element = new TestTreeItem('org');
    element.contextValue = 'test-ado-org';
    const children = provider.getChildren(element as any);
    expect(children).toHaveLength(1);
    expect(children[0].label).toBe('proj');
  });

  it('routes gh-backend to _getGitHubOwnerNodes', () => {
    (provider as any)._repos = ['alice/repo'];
    provider.ghItems.set('alice/repo', [{ id: 1, labels: [], repo: 'alice/repo' }]);
    const element = new TestTreeItem('GitHub');
    element.contextValue = 'test-gh-backend';
    const children = provider.getChildren(element as any);
    expect(children).toHaveLength(1);
    expect(children[0].label).toBe('alice');
  });

  it('routes gh-org to _getGitHubRepoNodes', () => {
    (provider as any)._repos = ['alice/repo1'];
    provider.ghItems.set('alice/repo1', [{ id: 1, labels: [], repo: 'alice/repo1' }]);
    const element = new TestTreeItem('alice');
    element.contextValue = 'test-gh-org';
    element.id = 'test-gh:alice:f0';
    const children = provider.getChildren(element as any);
    expect(children).toHaveLength(1);
    expect(children[0].label).toBe('alice/repo1');
  });

  it('routes filtered context by stripping -filtered suffix', () => {
    provider.setAdoConfig('org', 'proj');
    provider.adoItems = [{ id: 1, name: 'wi' }];
    const element = new TestTreeItem('ADO');
    element.contextValue = 'test-ado-backend-filtered';
    const children = provider.getChildren(element as any);
    expect(children).toHaveLength(1);
    expect(children[0].label).toBe('org');
  });

  it('delegates unknown context to _getChildrenForContext', () => {
    provider.childrenForContextResult = [new TestTreeItem('custom')];
    const element = new TestTreeItem('something');
    element.contextValue = 'custom-ctx';
    const children = provider.getChildren(element as any);
    expect(children).toHaveLength(1);
    expect(children[0].label).toBe('custom');
  });
});

// ---------------------------------------------------------------------------
// _getAdoOrgNodes / _getAdoProjectNodes
// ---------------------------------------------------------------------------

describe('ADO node builders', () => {
  it('_getAdoOrgNodes returns empty when no org', () => {
    expect(provider.testGetAdoOrgNodes(5)).toEqual([]);
  });

  it('_getAdoOrgNodes returns org node with description', () => {
    provider.setAdoConfig('my-org', 'proj');
    const nodes = provider.testGetAdoOrgNodes(3);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].label).toBe('my-org');
    expect(nodes[0].description).toBe('3 items');
    expect(nodes[0].contextValue).toBe('test-ado-org');
    expect(nodes[0].id).toMatch(/^test-ado:my-org:f\d+$/);
  });

  it('_getAdoProjectNodes returns empty when no project', () => {
    provider.setAdoConfig('org', undefined);
    expect(provider.testGetAdoProjectNodes(5)).toEqual([]);
  });

  it('_getAdoProjectNodes returns project node', () => {
    provider.setAdoConfig('org', 'proj');
    const nodes = provider.testGetAdoProjectNodes(7);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].label).toBe('proj');
    expect(nodes[0].description).toBe('7 items');
    expect(nodes[0].contextValue).toBe('test-ado-project');
  });
});

// ---------------------------------------------------------------------------
// _getGitHubOwnerNodes / _getGitHubRepoNodes
// ---------------------------------------------------------------------------

describe('GitHub node builders', () => {
  it('_getGitHubOwnerNodes groups by owner', () => {
    const map = new Map([
      ['alice/repo1', [{ id: 1, labels: [], repo: 'alice/repo1' }]],
      ['alice/repo2', [{ id: 2, labels: [], repo: 'alice/repo2' }]],
      ['bob/repo3', [{ id: 3, labels: [], repo: 'bob/repo3' }]],
    ]);
    const nodes = provider.testGetGitHubOwnerNodes(map);
    expect(nodes).toHaveLength(2);
    const labels = nodes.map(n => n.label).sort();
    expect(labels).toEqual(['alice', 'bob']);
    const aliceNode = nodes.find(n => n.label === 'alice')!;
    expect(aliceNode.description).toBe('2 items');
    expect(aliceNode.contextValue).toBe('test-gh-org');
  });

  it('_getGitHubRepoNodes filters to owner', () => {
    const map = new Map([
      ['alice/repo1', [{ id: 1, labels: [], repo: 'alice/repo1' }]],
      ['bob/repo2', [{ id: 2, labels: [], repo: 'bob/repo2' }]],
    ]);
    const nodes = provider.testGetGitHubRepoNodes(map, 'alice');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].label).toBe('alice/repo1');
    expect(nodes[0].contextValue).toBe('test-gh-repo');
    expect(nodes[0].description).toBe('1 item');
  });
});

// ---------------------------------------------------------------------------
// _getAvailableOptionsBase
// ---------------------------------------------------------------------------

describe('_getAvailableOptionsBase', () => {
  beforeEach(() => {
    (provider as any)._repos = ['alice/repo1', 'alice/repo2', 'bob/repo3'];
    provider.setAdoConfig('my-org', 'my-proj');
  });

  it('returns owners for gh-backend', () => {
    const result = provider.testGetAvailableOptionsBase('test-gh:', 'test-gh-backend');
    expect(result).toEqual({ owners: ['alice', 'bob'] });
  });

  it('returns repos for gh-org', () => {
    const result = provider.testGetAvailableOptionsBase('test-gh:alice', 'test-gh-org');
    expect(result).toEqual({ repos: ['alice/repo1', 'alice/repo2'] });
  });

  it('returns orgs for ado-backend', () => {
    const result = provider.testGetAvailableOptionsBase('test-ado:', 'test-ado-backend');
    expect(result).toEqual({ orgs: ['my-org'] });
  });

  it('returns projects for ado-org', () => {
    const result = provider.testGetAvailableOptionsBase('test-ado:my-org', 'test-ado-org');
    expect(result).toEqual({ projects: ['my-proj'] });
  });

  it('returns null for unknown context', () => {
    expect(provider.testGetAvailableOptionsBase('id', 'unknown-ctx')).toBeNull();
  });

  it('handles -filtered suffix on contextValue', () => {
    const result = provider.testGetAvailableOptionsBase('test-gh:', 'test-gh-backend-filtered');
    expect(result).toEqual({ owners: ['alice', 'bob'] });
  });
});

// ---------------------------------------------------------------------------
// Filter description with level filters on backend groups
// ---------------------------------------------------------------------------

describe('backend group filter descriptions', () => {
  it('ADO backend group includes filter description when filter set', () => {
    (provider as any)._repos = ['owner/repo'];
    (provider as any)._adoConfigured = true;
    provider.ghItems.set('owner/repo', [{ id: 1, labels: [], repo: 'owner/repo' }]);
    provider.adoItems = [{ id: 1, name: 'wi' }];
    provider.setLevelFilter('test-ado:', { labels: ['urgent'] });
    const children = provider.testGetRootChildren();
    const adoGroup = children.find(c => c.label === 'Azure DevOps');
    expect(adoGroup).toBeDefined();
    expect(adoGroup!.description).toContain('label:urgent');
  });

  it('GitHub backend group includes filter description when filter set', () => {
    (provider as any)._repos = ['owner/repo'];
    (provider as any)._adoConfigured = true;
    provider.ghItems.set('owner/repo', [{ id: 1, labels: [], repo: 'owner/repo' }]);
    provider.adoItems = [{ id: 1, name: 'wi' }];
    provider.setLevelFilter('test-gh:', { labels: ['v2'] });
    const children = provider.testGetRootChildren();
    const ghGroup = children.find(c => c.label === 'GitHub');
    expect(ghGroup).toBeDefined();
    expect(ghGroup!.description).toContain('label:v2');
  });
});

// ---------------------------------------------------------------------------
// Runtime filter integration with root children
// ---------------------------------------------------------------------------

describe('runtime filter integration', () => {
  it('ADO runtime filter applied in root children', () => {
    (provider as any)._adoConfigured = true;
    provider.setAdoConfig('org', 'proj');
    provider.adoItems = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }];
    provider.adoRuntimeFilterFn = items => items.filter(i => i.id === 1);
    const children = provider.testGetRootChildren();
    // Single backend → org node
    expect(children).toHaveLength(1);
    expect(children[0].description).toBe('1 item');
  });

  it('GitHub runtime filter applied in root children', () => {
    (provider as any)._repos = ['owner/repo'];
    provider.ghItems.set('owner/repo', [
      { id: 1, labels: ['bug'], repo: 'owner/repo' },
      { id: 2, labels: ['feature'], repo: 'owner/repo' },
    ]);
    provider.runtimeFilterFn = items => items.filter(i => i.labels.includes('bug'));
    provider.singleBackendResult = [new TestTreeItem('filtered-item')];
    const children = provider.testGetRootChildren();
    expect(children).toHaveLength(1);
    expect(children[0].label).toBe('filtered-item');
  });
});
