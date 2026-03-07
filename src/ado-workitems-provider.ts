import * as vscode from 'vscode';
import type { AdoWorkItem } from './ado-client';
import {
  type IWorkItemBackendProvider, type TreeRenderContext, type LevelFilter,
  type AvailableFilterOptions, WorkItemsTreeItem, mapAdoState,
} from './work-item-types';

export class AdoWorkItemsProvider implements IWorkItemBackendProvider {
  readonly backendId = 'ado';
  readonly label = 'Azure DevOps';
  readonly icon = 'azure';

  private _items: AdoWorkItem[] = [];
  private _childMap = new Map<number, number[]>();
  private _configured = false;
  private _org: string | undefined;
  private _projects: string[] = [];

  get configured(): boolean { return this._configured; }
  set configured(value: boolean) { this._configured = value; }

  get org(): string | undefined { return this._org; }
  get projects(): string[] { return this._projects; }

  setConfig(org: string | undefined, projects: string[]): void {
    this._org = org;
    this._projects = projects;
  }

  getItems(): AdoWorkItem[] { return this._items; }

  setItems(items: AdoWorkItem[]): void {
    this._items = items;
    this._configured = true;
    this._buildChildMap();
  }

  isConfigured(): boolean { return this._configured; }

  hasFilteredItems(ctx: TreeRenderContext): boolean {
    return this.applyRuntimeFilter(this._items, ctx).length > 0;
  }

  getFilteredItemCount(ctx: TreeRenderContext): number {
    return this.applyRuntimeFilter(this._items, ctx).length;
  }

  applyRuntimeFilter(items: AdoWorkItem[], ctx: TreeRenderContext): AdoWorkItem[] {
    const { filter } = ctx;
    return items.filter(wi => {
      if (filter.states.length === 0 && mapAdoState(wi.state) === 'closed') return false;
      if (filter.repos.length > 0 && !filter.repos.includes('(ADO)')) return false;
      if (filter.labels.length > 0 && !ctx.matchesLabelFilter(wi.tags, filter.labels)) return false;
      if (filter.states.length > 0 && !filter.states.includes(mapAdoState(wi.state))) return false;
      if (filter.types.length > 0 && !filter.types.includes(wi.type)) return false;
      if (filter.projects.length > 0 && !filter.projects.includes(wi.project)) return false;
      return true;
    });
  }

  applyLevelFilter(items: AdoWorkItem[], levelFilter: LevelFilter, ctx: TreeRenderContext): AdoWorkItem[] {
    return items.filter(wi => {
      if (levelFilter.types && levelFilter.types.length > 0 && !levelFilter.types.includes(wi.type)) return false;
      if (levelFilter.tags && levelFilter.tags.length > 0 && !ctx.matchesLabelFilter(wi.tags, levelFilter.tags)) return false;
      if ((!levelFilter.states || levelFilter.states.length === 0) && mapAdoState(wi.state) === 'closed') return false;
      if (levelFilter.states && levelFilter.states.length > 0 && !levelFilter.states.includes(mapAdoState(wi.state))) return false;
      return true;
    });
  }

  // ── IWorkItemBackendProvider ────────────────────────────────────

  handlesContext(ctx: string): boolean {
    return ctx === 'ado-project' || ctx === 'ado-parent-item';
  }

  getSingleBackendRootItems(ctx: TreeRenderContext): WorkItemsTreeItem[] {
    return this._buildOrgNodes(this.getFilteredItemCount(ctx), ctx);
  }

  createBackendGroupItem(itemCount: number, ctx: TreeRenderContext): WorkItemsTreeItem {
    const item = new WorkItemsTreeItem('Azure DevOps', vscode.TreeItemCollapsibleState.Expanded);
    item.iconPath = new vscode.ThemeIcon('azure');
    item.description = ctx.getFilterDescription(`${this.backendId}:`, itemCount);
    item.contextValue = ctx.contextWithFilter(`${this.backendId}-backend`, `${this.backendId}:`);
    item.id = `${this.backendId}::f${ctx.filterSeq}`;
    return item;
  }

  getConfigureItem(): WorkItemsTreeItem {
    const item = new WorkItemsTreeItem('Configure in ADO');
    item.iconPath = new vscode.ThemeIcon('azure');
    item.command = { command: 'editless.configureAdo', title: 'Configure Azure DevOps' };
    return item;
  }

  getChildren(element: WorkItemsTreeItem, ctx: string, renderCtx: TreeRenderContext): WorkItemsTreeItem[] {
    if (ctx === 'ado-project') {
      return this._getProjectChildren(element, renderCtx);
    }
    if (ctx === 'ado-parent-item' && element.adoWorkItem) {
      return this._getParentItemChildren(element, renderCtx);
    }
    return [];
  }

  getAvailableOptions(nodeId: string, baseContext: string): AvailableFilterOptions | null {
    if (baseContext === 'ado-project') {
      const project = this._extractProjectFromNodeId(nodeId);
      const items = project ? this._items.filter(wi => wi.project === project) : this._items;
      const types = new Set<string>();
      const tags = new Set<string>();
      for (const wi of items) {
        types.add(wi.type);
        for (const tag of wi.tags) tags.add(tag);
      }
      return { states: ['open', 'active', 'closed'], types: [...types].sort(), tags: [...tags].sort() };
    }
    return null;
  }

  getAllLabels(): string[] {
    const tags = new Set<string>();
    for (const wi of this._items) {
      for (const tag of wi.tags) tags.add(tag);
    }
    return [...tags];
  }

  getRepoIdentifiers(): string[] { return []; }
  createFetchPromises(): Promise<void>[] { return []; }

  clear(): void {
    this._items = [];
    this._childMap.clear();
  }

  clearConfigured(): void {
    this.clear();
    this._configured = false;
  }

  // ── Internal helpers ────────────────────────────────────────────

  buildAdoItem(wi: AdoWorkItem): WorkItemsTreeItem {
    const stateIcon = wi.state === 'Active' ? '🔵' : wi.state === 'New' ? '🟢' : '⚪';
    const label = `${stateIcon} #${wi.id} ${wi.title}`;
    const hasChildren = (this._childMap.get(wi.id)?.length ?? 0) > 0;
    const collapsible = hasChildren
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None;
    const item = new WorkItemsTreeItem(label, collapsible);
    item.adoWorkItem = wi;
    item.description = `${wi.type} · ${wi.state}`;
    item.iconPath = new vscode.ThemeIcon('azure');
    item.contextValue = hasChildren ? 'ado-parent-item' : 'ado-work-item';
    item.id = `ado-wi:${wi.id}`;
    item.tooltip = new vscode.MarkdownString(
      [
        `**#${wi.id} ${wi.title}**`,
        `Type: ${wi.type}`,
        `State: ${wi.state}`,
        `Area: ${wi.areaPath}`,
        wi.tags.length > 0 ? `Labels: ${wi.tags.join(', ')}` : '',
      ].filter(Boolean).join('\n\n'),
    );
    return item;
  }

  private _buildChildMap(): void {
    this._childMap.clear();
    const idSet = new Set(this._items.map(wi => wi.id));
    for (const wi of this._items) {
      if (wi.parentId != null && idSet.has(wi.parentId)) {
        const children = this._childMap.get(wi.parentId) ?? [];
        children.push(wi.id);
        this._childMap.set(wi.parentId, children);
      }
    }
  }

  private _getRootItems(items: AdoWorkItem[]): AdoWorkItem[] {
    const idSet = new Set(items.map(wi => wi.id));
    return items.filter(wi => wi.parentId == null || !idSet.has(wi.parentId));
  }

  private _getProjectChildren(element: WorkItemsTreeItem, ctx: TreeRenderContext): WorkItemsTreeItem[] {
    const project = this._extractProjectFromNodeId(element.id ?? '');
    const projectItems = project ? this._items.filter(wi => wi.project === project) : this._items;
    let filtered = this.applyRuntimeFilter(projectItems, ctx);
    const projectFilter = ctx.getLevelFilter(ctx.cleanNodeId(element.id ?? ''));
    if (projectFilter) filtered = this.applyLevelFilter(filtered, projectFilter, ctx);
    return this._getRootItems(filtered).map(wi => this.buildAdoItem(wi));
  }

  private _getParentItemChildren(element: WorkItemsTreeItem, ctx: TreeRenderContext): WorkItemsTreeItem[] {
    const childIds = this._childMap.get(element.adoWorkItem!.id) ?? [];
    const filtered = this.applyRuntimeFilter(this._items, ctx);
    const filteredIdSet = new Set(filtered.map(wi => wi.id));
    return childIds
      .filter(id => filteredIdSet.has(id))
      .map(id => this.buildAdoItem(filtered.find(wi => wi.id === id)!));
  }

  private _buildOrgNodes(adoCount: number, ctx: TreeRenderContext): WorkItemsTreeItem[] {
    if (!this._org) return [];
    const orgItem = new WorkItemsTreeItem(this._org, vscode.TreeItemCollapsibleState.Expanded);
    orgItem.iconPath = new vscode.ThemeIcon('organization');
    orgItem.description = ctx.getFilterDescription(`${this.backendId}:${this._org}`, adoCount);
    orgItem.contextValue = ctx.contextWithFilter(`${this.backendId}-org`, `${this.backendId}:${this._org}`);
    orgItem.id = `${this.backendId}:${this._org}:f${ctx.filterSeq}`;
    return [orgItem];
  }

  private _extractProjectFromNodeId(nodeId: string): string | undefined {
    const cleanId = nodeId.replace(/:f\d+$/, '');
    const prefix = `${this.backendId}:${this._org}:`;
    if (cleanId.startsWith(prefix)) {
      return cleanId.slice(prefix.length);
    }
    return undefined;
  }
}
