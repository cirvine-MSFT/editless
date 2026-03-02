import * as vscode from 'vscode';

export abstract class BaseTreeProvider<
  TGitHub,
  TAdo,
  TTreeItem extends vscode.TreeItem,
  TLevelFilter,
> implements vscode.TreeDataProvider<TTreeItem> {

  protected _onDidChangeTreeData = new vscode.EventEmitter<TTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  protected _repos: string[] = [];
  protected _loading = false;
  private _pendingRefresh = false;
  protected _filterSeq = 0;
  protected _levelFilters = new Map<string, TLevelFilter>();
  protected _treeView?: vscode.TreeView<TTreeItem>;
  protected _allLabels = new Set<string>();
  protected _adoOrg: string | undefined;
  protected _adoProject: string | undefined;
  protected _adoConfigured = false;
  protected _adoRefresh?: () => Promise<void>;

  /** ID prefix for GitHub nodes (e.g. 'github' or 'github-pr') */
  protected abstract readonly _ghIdPrefix: string;
  /** ID prefix for ADO nodes (e.g. 'ado' or 'ado-pr') */
  protected abstract readonly _adoIdPrefix: string;
  /** Singular/plural suffix for item counts (e.g. ['item', 'items'] or ['PR', 'PRs']) */
  protected abstract readonly _itemCountSuffix: [string, string];
  /** Message when no items found and no filter active */
  protected abstract readonly _emptyMessage: string;

  protected abstract _createTreeItem(label: string, collapsible?: vscode.TreeItemCollapsibleState): TTreeItem;
  protected abstract _getLevelFilterParts(filter: TLevelFilter): string[];
  protected abstract _updateDescription(): void;
  protected abstract _getGitHubItemsMap(): Map<string, TGitHub[]>;
  protected abstract _getAdoItemsList(): TAdo[];
  protected abstract applyRuntimeFilter(items: TGitHub[]): TGitHub[];
  protected abstract applyAdoRuntimeFilter(items: TAdo[]): TAdo[];
  protected abstract _doFetchAll(): Promise<void>;
  protected abstract _getRootGitHubSingleBackend(filteredItems: Map<string, TGitHub[]>): TTreeItem[];
  protected abstract _getChildrenForContext(element: TTreeItem, ctx: string): TTreeItem[];
  protected abstract _clearAdoData(): void;
  abstract get isFiltered(): boolean;

  setRepos(repos: string[]): void {
    this._repos = repos;
    this.fetchAll();
  }

  setAdoConfig(org: string | undefined, project: string | undefined): void {
    this._adoOrg = org;
    this._adoProject = project;
  }

  clearAdo(): void {
    this._clearAdoData();
    this._adoConfigured = false;
    this._onDidChangeTreeData.fire();
  }

  setTreeView(view: vscode.TreeView<TTreeItem>): void {
    this._treeView = view;
    this._updateDescription();
  }

  getAllLabels(): string[] {
    return [...this._allLabels].sort();
  }

  getAllRepos(): string[] {
    const repos = [...this._repos];
    if (this._adoConfigured) repos.push('(ADO)');
    return repos;
  }

  protected _cleanNodeId(id: string): string {
    return id.replace(/:f\d+$/, '');
  }

  getLevelFilter(nodeId: string): TLevelFilter | undefined {
    return this._levelFilters.get(this._cleanNodeId(nodeId));
  }

  setLevelFilter(nodeId: string, filter: TLevelFilter): void {
    this._levelFilters.set(this._cleanNodeId(nodeId), filter);
    this._filterSeq++;
    this._onDidChangeTreeData.fire();
  }

  clearLevelFilter(nodeId: string): void {
    this._levelFilters.delete(this._cleanNodeId(nodeId));
    this._filterSeq++;
    this._onDidChangeTreeData.fire();
  }

  clearAllLevelFilters(): void {
    this._levelFilters.clear();
    this._filterSeq++;
    this._onDidChangeTreeData.fire();
  }

  protected _contextWithFilter(base: string, nodeId: string): string {
    return this._levelFilters.has(this._cleanNodeId(nodeId)) ? `${base}-filtered` : base;
  }

  protected matchesLabelFilter(itemLabels: string[], activeFilters: string[]): boolean {
    const grouped = new Map<string, string[]>();
    for (const filter of activeFilters) {
      const colonIndex = filter.indexOf(':');
      const prefix = colonIndex > 0 ? filter.slice(0, colonIndex) : '';
      const existing = grouped.get(prefix) ?? [];
      existing.push(filter);
      grouped.set(prefix, existing);
    }

    for (const [, group] of grouped) {
      const matchesAny = group.some(f => itemLabels.includes(f));
      if (!matchesAny) return false;
    }
    return true;
  }

  setAdoRefresh(fn: () => Promise<void>): void {
    this._adoRefresh = fn;
  }

  refresh(): void {
    this.fetchAll();
  }

  protected async fetchAll(): Promise<void> {
    if (this._loading) {
      this._pendingRefresh = true;
      return;
    }
    this._loading = true;
    await this._doFetchAll();
    this._loading = false;
    this._onDidChangeTreeData.fire();
    if (this._pendingRefresh) {
      this._pendingRefresh = false;
      this.fetchAll();
    }
  }

  getTreeItem(element: TTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TTreeItem): TTreeItem[] {
    if (!element) {
      return this._getRootChildren();
    }

    const ctx = element.contextValue?.replace(/-filtered$/, '') ?? '';

    if (ctx === `${this._adoIdPrefix}-backend`) {
      return this._getAdoOrgNodes(this.applyAdoRuntimeFilter(this._getAdoItemsList()).length);
    }
    if (ctx === `${this._adoIdPrefix}-org`) {
      return this._getAdoProjectNodes(this.applyAdoRuntimeFilter(this._getAdoItemsList()).length);
    }
    if (ctx === `${this._ghIdPrefix}-backend`) {
      return this._getGitHubOwnerNodes(this._getFilteredGitHubMap());
    }
    if (ctx === `${this._ghIdPrefix}-org`) {
      const owner = element.id?.replace(new RegExp(`^${this._ghIdPrefix}:|:f\\d+$`, 'g'), '') ?? '';
      return this._getGitHubRepoNodes(this._getFilteredGitHubMapForOwner(owner), owner);
    }

    return this._getChildrenForContext(element, ctx);
  }

  protected _getRootChildren(): TTreeItem[] {
    const ghMap = this._getGitHubItemsMap();
    const adoList = this._getAdoItemsList();

    if (this._loading && ghMap.size === 0 && adoList.length === 0) {
      const item = this._createTreeItem('Loading...');
      item.iconPath = new vscode.ThemeIcon('loading~spin');
      return [item];
    }

    if (this._repos.length === 0 && !this._adoConfigured) {
      const ghItem = this._createTreeItem('Configure in GitHub');
      ghItem.iconPath = new vscode.ThemeIcon('github');
      ghItem.command = {
        command: 'editless.configureRepos',
        title: 'Configure GitHub Repos',
      };

      const adoItem = this._createTreeItem('Configure in ADO');
      adoItem.iconPath = new vscode.ThemeIcon('azure');
      adoItem.command = {
        command: 'editless.configureAdo',
        title: 'Configure Azure DevOps',
      };

      return [ghItem, adoItem];
    }

    // Apply runtime filters
    const filteredGitHub = this._getFilteredGitHubMap();
    const filteredAdo = this.applyAdoRuntimeFilter(adoList);

    const hasGitHub = filteredGitHub.size > 0;
    const hasAdo = filteredAdo.length > 0;

    if (!hasGitHub && !hasAdo) {
      const msg = this.isFiltered ? `No ${this._itemCountSuffix[1]} match current filter` : this._emptyMessage;
      const icon = this.isFiltered ? 'filter' : 'check';
      const item = this._createTreeItem(msg);
      item.iconPath = new vscode.ThemeIcon(icon);
      return [item];
    }

    const items: TTreeItem[] = [];
    const fseq = this._filterSeq;
    const backendCount = (hasGitHub ? 1 : 0) + (hasAdo ? 1 : 0);

    // ADO backend group
    if (hasAdo) {
      if (backendCount > 1) {
        const adoGroup = this._createTreeItem('Azure DevOps', vscode.TreeItemCollapsibleState.Expanded);
        adoGroup.iconPath = new vscode.ThemeIcon('azure');
        adoGroup.description = this._getFilterDescription(`${this._adoIdPrefix}:`, filteredAdo.length);
        adoGroup.contextValue = this._contextWithFilter(`${this._adoIdPrefix}-backend`, `${this._adoIdPrefix}:`);
        adoGroup.id = `${this._adoIdPrefix}::f${fseq}`;
        items.push(adoGroup);
      } else {
        return this._getAdoOrgNodes(filteredAdo.length);
      }
    }

    // GitHub backend group
    if (hasGitHub) {
      if (backendCount > 1) {
        const ghGroup = this._createTreeItem('GitHub', vscode.TreeItemCollapsibleState.Expanded);
        ghGroup.iconPath = new vscode.ThemeIcon('github');
        const totalCount = [...filteredGitHub.values()].flat().length;
        ghGroup.description = this._getFilterDescription(`${this._ghIdPrefix}:`, totalCount);
        ghGroup.contextValue = this._contextWithFilter(`${this._ghIdPrefix}-backend`, `${this._ghIdPrefix}:`);
        ghGroup.id = `${this._ghIdPrefix}::f${fseq}`;
        items.push(ghGroup);
      } else {
        return this._getRootGitHubSingleBackend(filteredGitHub);
      }
    }

    return items;
  }

  protected _getFilteredGitHubMap(): Map<string, TGitHub[]> {
    const result = new Map<string, TGitHub[]>();
    for (const [repo, items] of this._getGitHubItemsMap().entries()) {
      const filtered = this.applyRuntimeFilter(items);
      if (filtered.length > 0) result.set(repo, filtered);
    }
    return result;
  }

  protected _getFilteredGitHubMapForOwner(owner: string): Map<string, TGitHub[]> {
    const result = new Map<string, TGitHub[]>();
    for (const [repo, items] of this._getGitHubItemsMap().entries()) {
      if (repo.startsWith(owner + '/')) {
        const filtered = this.applyRuntimeFilter(items);
        if (filtered.length > 0) result.set(repo, filtered);
      }
    }
    return result;
  }

  protected _getFilterDescription(nodeId: string, itemCount: number): string {
    const filter = this._levelFilters.get(this._cleanNodeId(nodeId));
    const parts = filter ? this._getLevelFilterParts(filter) : [];
    const [singular, plural] = this._itemCountSuffix;
    const countStr = `${itemCount} ${itemCount === 1 ? singular : plural}`;
    return parts.length > 0 ? `${countStr} · ${parts.join(' · ')}` : countStr;
  }

  protected _getAdoOrgNodes(adoCount: number): TTreeItem[] {
    if (!this._adoOrg) return [];
    const fseq = this._filterSeq;
    const orgItem = this._createTreeItem(this._adoOrg, vscode.TreeItemCollapsibleState.Expanded);
    orgItem.iconPath = new vscode.ThemeIcon('organization');
    orgItem.description = this._getFilterDescription(`${this._adoIdPrefix}:${this._adoOrg}`, adoCount);
    orgItem.contextValue = this._contextWithFilter(`${this._adoIdPrefix}-org`, `${this._adoIdPrefix}:${this._adoOrg}`);
    orgItem.id = `${this._adoIdPrefix}:${this._adoOrg}:f${fseq}`;
    return [orgItem];
  }

  protected _getAdoProjectNodes(adoCount: number): TTreeItem[] {
    if (!this._adoProject) return [];
    const fseq = this._filterSeq;
    const projectItem = this._createTreeItem(this._adoProject, vscode.TreeItemCollapsibleState.Expanded);
    projectItem.iconPath = new vscode.ThemeIcon('folder');
    projectItem.description = this._getFilterDescription(`${this._adoIdPrefix}:${this._adoOrg}:${this._adoProject}`, adoCount);
    projectItem.contextValue = this._contextWithFilter(`${this._adoIdPrefix}-project`, `${this._adoIdPrefix}:${this._adoOrg}:${this._adoProject}`);
    projectItem.id = `${this._adoIdPrefix}:${this._adoOrg}:${this._adoProject}:f${fseq}`;
    return [projectItem];
  }

  protected _getGitHubOwnerNodes(filteredItems: Map<string, TGitHub[]>): TTreeItem[] {
    const owners = new Map<string, number>();
    for (const [repo, items] of filteredItems.entries()) {
      const owner = repo.split('/')[0];
      if (owner) {
        owners.set(owner, (owners.get(owner) ?? 0) + items.length);
      }
    }

    const fseq = this._filterSeq;
    const result: TTreeItem[] = [];
    for (const [owner, count] of owners) {
      const ownerItem = this._createTreeItem(owner, vscode.TreeItemCollapsibleState.Expanded);
      ownerItem.iconPath = new vscode.ThemeIcon('organization');
      ownerItem.description = this._getFilterDescription(`${this._ghIdPrefix}:${owner}`, count);
      ownerItem.contextValue = this._contextWithFilter(`${this._ghIdPrefix}-org`, `${this._ghIdPrefix}:${owner}`);
      ownerItem.id = `${this._ghIdPrefix}:${owner}:f${fseq}`;
      result.push(ownerItem);
    }
    return result;
  }

  protected _getGitHubRepoNodes(filteredItems: Map<string, TGitHub[]>, owner: string): TTreeItem[] {
    const fseq = this._filterSeq;
    const result: TTreeItem[] = [];
    for (const [repo, items] of filteredItems.entries()) {
      if (repo.startsWith(owner + '/')) {
        const repoItem = this._createTreeItem(repo, vscode.TreeItemCollapsibleState.Expanded);
        repoItem.iconPath = new vscode.ThemeIcon('repo');
        repoItem.description = this._getFilterDescription(`${this._ghIdPrefix}:${repo}`, items.length);
        repoItem.contextValue = this._contextWithFilter(`${this._ghIdPrefix}-repo`, `${this._ghIdPrefix}:${repo}`);
        repoItem.id = `${this._ghIdPrefix}:${repo}:f${fseq}`;
        result.push(repoItem);
      }
    }
    return result;
  }

  protected _getAvailableOptionsBase(nodeId: string, contextValue: string):
    { owners?: string[]; repos?: string[]; orgs?: string[]; projects?: string[] } | null {
    const cleanId = nodeId.replace(/:f\d+$/, '');
    const baseContext = contextValue.replace(/-filtered$/, '');

    if (baseContext === `${this._ghIdPrefix}-backend`) {
      const owners = new Set<string>();
      for (const repo of this._repos) {
        const owner = repo.split('/')[0];
        if (owner) owners.add(owner);
      }
      return { owners: [...owners].sort() };
    }

    if (baseContext === `${this._ghIdPrefix}-org`) {
      const owner = cleanId.replace(`${this._ghIdPrefix}:`, '');
      const repos = this._repos.filter(r => r.startsWith(owner + '/'));
      return { repos };
    }

    if (baseContext === `${this._adoIdPrefix}-backend`) {
      return { orgs: this._adoOrg ? [this._adoOrg] : [] };
    }

    if (baseContext === `${this._adoIdPrefix}-org`) {
      return { projects: this._adoProject ? [this._adoProject] : [] };
    }

    return null;
  }
}
