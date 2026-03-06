import * as vscode from 'vscode';
import type { GitHubIssue } from './github-client';
import type { AdoWorkItem } from './ado-client';
import { BaseTreeProvider } from './base-tree-provider';
import { GitHubWorkItemsProvider } from './github-workitems-provider';
import { AdoWorkItemsProvider } from './ado-workitems-provider';
import { LocalTasksProvider } from './local-tasks-provider';
import {
  type UnifiedState, type WorkItemsFilter, type LevelFilter,
  type TreeRenderContext, type AvailableFilterOptions,
  WorkItemsTreeItem, mapGitHubState, mapAdoState,
} from './work-item-types';

// ── Re-exports for backward compatibility ──────────────────────────
export { UnifiedState, WorkItemsFilter, LevelFilter, WorkItemsTreeItem, mapGitHubState, mapAdoState };
export type { TreeRenderContext, AvailableFilterOptions, IWorkItemBackendProvider } from './work-item-types';

export class WorkItemsTreeProvider extends BaseTreeProvider<GitHubIssue, AdoWorkItem, WorkItemsTreeItem, LevelFilter> {
  protected readonly _ghIdPrefix = 'github';
  protected readonly _adoIdPrefix = 'ado';
  protected readonly _itemCountSuffix: [string, string] = ['item', 'items'];
  protected readonly _emptyMessage = 'No assigned issues found';

  private _filter: WorkItemsFilter = { repos: [], labels: [], states: [], types: [], projects: [] };
  private readonly _githubProvider = new GitHubWorkItemsProvider();
  private readonly _adoProvider = new AdoWorkItemsProvider();
  private readonly _localProvider = new LocalTasksProvider();
  private readonly _renderCtx: TreeRenderContext;

  constructor() {
    super();
    const self = this;
    this._renderCtx = {
      get filterSeq() { return self._filterSeq; },
      get filter() { return self._filter; },
      getFilterDescription: (n, c) => self._getFilterDescription(n, c),
      contextWithFilter: (b, n) => self._contextWithFilter(b, n),
      cleanNodeId: (id) => self._cleanNodeId(id),
      getLevelFilter: (id) => self.getLevelFilter(id),
      matchesLabelFilter: (l, f) => self.matchesLabelFilter(l, f),
    };
  }

  // ── Data setters (delegate to providers) ─────────────────────────

  override setRepos(repos: string[]): void {
    this._githubProvider.repos = repos;
    super.setRepos(repos);
  }

  setAdoItems(items: AdoWorkItem[]): void {
    this._adoProvider.setItems(items);
    this._adoConfigured = true;
    this._onDidChangeTreeData.fire();
  }

  override setAdoConfig(org: string | undefined, projects: string[]): void {
    this._adoProvider.setConfig(org, projects);
    super.setAdoConfig(org, projects);
  }

  setLocalFolders(folders: string[]): void {
    this._localProvider.setFolders(folders);
    this._onDidChangeTreeData.fire();
  }

  setLocalTasks(folderPath: string, tasks: import('./local-tasks-client').LocalTask[]): void {
    this._localProvider.setTasks(folderPath, tasks);
    this._onDidChangeTreeData.fire();
  }

  clearLocal(): void {
    this._localProvider.clear();
    this._onDidChangeTreeData.fire();
  }

  // ── Filter ───────────────────────────────────────────────────────

  get filter(): WorkItemsFilter { return { ...this._filter }; }

  get isFiltered(): boolean {
    return this._filter.repos.length > 0 || this._filter.labels.length > 0
      || this._filter.states.length > 0 || this._filter.types.length > 0
      || this._filter.projects.length > 0;
  }

  setFilter(filter: WorkItemsFilter): void {
    this._filter = { ...filter };
    this._filterSeq++;
    vscode.commands.executeCommand('setContext', 'editless.workItemsFiltered', this.isFiltered);
    this._updateDescription();
    this._onDidChangeTreeData.fire();
  }

  clearFilter(): void {
    this.setFilter({ repos: [], labels: [], states: [], types: [], projects: [] });
  }

  protected _updateDescription(): void {
    if (!this._treeView) return;
    if (!this.isFiltered) { this._treeView.description = undefined; return; }
    const parts: string[] = [];
    if (this._filter.repos.length > 0) parts.push(`repo:${this._filter.repos.join(',')}`);
    if (this._filter.labels.length > 0) parts.push(`label:${this._filter.labels.join(',')}`);
    if (this._filter.states.length > 0) parts.push(`state:${this._filter.states.join(',')}`);
    if (this._filter.types.length > 0) parts.push(`type:${this._filter.types.join(',')}`);
    if (this._filter.projects.length > 0) parts.push(`project:${this._filter.projects.join(',')}`);
    this._treeView.description = parts.join(' · ');
  }

  // ── Aggregation (combine all providers) ──────────────────────────

  getAllLabels(): string[] {
    const labels = new Set<string>();
    for (const l of this._githubProvider.getAllLabels()) labels.add(l);
    for (const l of this._adoProvider.getAllLabels()) labels.add(l);
    return [...labels].sort();
  }

  getAllRepos(): string[] {
    const repos = super.getAllRepos();
    for (const id of this._localProvider.getRepoIdentifiers()) repos.push(id);
    return repos;
  }

  getAvailableOptions(nodeId: string, contextValue: string): AvailableFilterOptions {
    const base = this._getAvailableOptionsBase(nodeId, contextValue);
    if (base) return base;

    const baseContext = contextValue.replace(/-filtered$/, '');
    for (const provider of [this._githubProvider, this._adoProvider, this._localProvider]) {
      if (provider.handlesContext(baseContext)) {
        const options = provider.getAvailableOptions(nodeId, baseContext);
        if (options) return options;
      }
    }
    return {};
  }

  // ── BaseTreeProvider abstract implementations ────────────────────

  protected _createTreeItem(label: string, collapsible?: vscode.TreeItemCollapsibleState): WorkItemsTreeItem {
    return new WorkItemsTreeItem(label, collapsible);
  }

  protected _getLevelFilterParts(filter: LevelFilter): string[] {
    const parts: string[] = [];
    if (filter.types && filter.types.length > 0) parts.push(filter.types.join(', '));
    if (filter.labels && filter.labels.length > 0) parts.push(filter.labels.join(', '));
    if (filter.states && filter.states.length > 0) parts.push(filter.states.join(', '));
    if (filter.tags && filter.tags.length > 0) parts.push(filter.tags.join(', '));
    return parts;
  }

  protected _getGitHubItemsMap(): Map<string, GitHubIssue[]> {
    return this._githubProvider.getIssuesMap();
  }

  protected _getAdoItemsList(): AdoWorkItem[] {
    return this._adoProvider.getItems();
  }

  protected _getAdoItemProject(item: AdoWorkItem): string {
    return item.project;
  }

  protected applyRuntimeFilter(issues: GitHubIssue[]): GitHubIssue[] {
    return this._githubProvider.applyRuntimeFilter(issues, this._renderCtx);
  }

  protected applyAdoRuntimeFilter(items: AdoWorkItem[]): AdoWorkItem[] {
    return this._adoProvider.applyRuntimeFilter(items, this._renderCtx);
  }

  protected _clearAdoData(): void {
    this._adoProvider.clear();
  }

  // ── Tree rendering (strategy dispatch) ───────────────────────────

  protected _getRootGitHubSingleBackend(filteredItems: Map<string, GitHubIssue[]>): WorkItemsTreeItem[] {
    return this._githubProvider.getSingleBackendRootItems(this._renderCtx);
  }

  protected _getRootChildren(): WorkItemsTreeItem[] {
    const ctx = this._renderCtx;
    const hasGH = this._githubProvider.hasFilteredItems(ctx);
    const hasAdo = this._adoProvider.hasFilteredItems(ctx);
    const hasLocal = this._localProvider.hasFilteredItems(ctx);

    if (this._loading && !hasGH && !hasAdo && !hasLocal) {
      const item = this._createTreeItem('Loading...');
      item.iconPath = new vscode.ThemeIcon('loading~spin');
      return [item];
    }

    if (!this._githubProvider.isConfigured() && !this._adoProvider.isConfigured() && !this._localProvider.isConfigured()) {
      return [
        this._githubProvider.getConfigureItem(),
        this._adoProvider.getConfigureItem(),
        this._localProvider.getConfigureItem(),
      ];
    }

    if (!hasGH && !hasAdo && !hasLocal) {
      const msg = this.isFiltered ? `No ${this._itemCountSuffix[1]} match current filter` : this._emptyMessage;
      const item = this._createTreeItem(msg);
      item.iconPath = new vscode.ThemeIcon(this.isFiltered ? 'filter' : 'check');
      return [item];
    }

    const backendCount = (hasGH ? 1 : 0) + (hasAdo ? 1 : 0) + (hasLocal ? 1 : 0);

    // Single backend: collapse into that backend's root view
    if (backendCount === 1) {
      if (hasAdo) return this._getAdoOrgNodes(this._adoProvider.getFilteredItemCount(ctx));
      if (hasGH) return this._getRootGitHubSingleBackend(this._githubProvider.getFilteredMap(ctx));
      if (hasLocal) return this._localProvider.getSingleBackendRootItems(ctx);
    }

    // Multi-backend: show backend group nodes
    const items: WorkItemsTreeItem[] = [];
    if (hasAdo) items.push(this._adoProvider.createBackendGroupItem(this._adoProvider.getFilteredItemCount(ctx), ctx));
    if (hasGH) items.push(this._githubProvider.createBackendGroupItem(this._githubProvider.getFilteredItemCount(ctx), ctx));
    if (hasLocal) items.push(this._localProvider.createBackendGroupItem(this._localProvider.getFilteredItemCount(ctx), ctx));
    return items;
  }

  protected _getChildrenForContext(element: WorkItemsTreeItem, ctx: string): WorkItemsTreeItem[] {
    for (const provider of [this._githubProvider, this._adoProvider, this._localProvider]) {
      if (provider.handlesContext(ctx)) {
        return provider.getChildren(element, ctx, this._renderCtx);
      }
    }
    return [];
  }

  protected async _doFetchAll(): Promise<void> {
    // Sync repos to provider (tests may set _repos directly)
    this._githubProvider.repos = this._repos;
    const fetches: Promise<void>[] = [
      ...this._githubProvider.createFetchPromises(),
      ...this._localProvider.createFetchPromises(),
    ];
    if (this._adoRefresh) fetches.push(this._adoRefresh());
    await Promise.all(fetches);
    this._allLabels = this._githubProvider.allLabels;
  }

  dispose(): void {
    this._disposed = true;
  }
}
