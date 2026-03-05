import * as vscode from 'vscode';
import type { LocalTask } from './local-tasks-client';
import { mapLocalState, fetchLocalTasks } from './local-tasks-client';
import {
  type IWorkItemBackendProvider, type TreeRenderContext, type LevelFilter,
  type AvailableFilterOptions, WorkItemsTreeItem,
} from './work-item-types';

export class LocalTasksProvider implements IWorkItemBackendProvider {
  readonly backendId = 'local';
  readonly label = 'Local Tasks';
  readonly icon = 'checklist';

  private _tasks = new Map<string, LocalTask[]>();
  private _folders: string[] = [];
  private _configured = false;

  get folders(): string[] { return this._folders; }

  setFolders(folders: string[]): void {
    this._folders = folders;
    this._configured = folders.length > 0;
  }

  setTasks(folderPath: string, tasks: LocalTask[]): void {
    this._tasks.set(folderPath, tasks);
  }

  isConfigured(): boolean { return this._configured; }

  hasFilteredItems(ctx: TreeRenderContext): boolean {
    return this._getAllFilteredTasks(ctx).length > 0;
  }

  getFilteredItemCount(ctx: TreeRenderContext): number {
    return this._getAllFilteredTasks(ctx).length;
  }

  // ── IWorkItemBackendProvider ────────────────────────────────────

  handlesContext(ctx: string): boolean {
    return ctx === 'local-backend' || ctx === 'local-folder';
  }

  getSingleBackendRootItems(ctx: TreeRenderContext): WorkItemsTreeItem[] {
    const tasks = this._getAllFilteredTasks(ctx);
    if (this._folders.length === 1) {
      return tasks.map(t => this._buildTaskItem(t));
    }
    return this._buildFolderNodes(tasks, ctx);
  }

  createBackendGroupItem(itemCount: number, ctx: TreeRenderContext): WorkItemsTreeItem {
    const item = new WorkItemsTreeItem('Local Tasks', vscode.TreeItemCollapsibleState.Expanded);
    item.iconPath = new vscode.ThemeIcon('checklist');
    item.description = ctx.getFilterDescription('local:', itemCount);
    item.contextValue = ctx.contextWithFilter('local-backend', 'local:');
    item.id = `local::f${ctx.filterSeq}`;
    return item;
  }

  getConfigureItem(): WorkItemsTreeItem {
    const item = new WorkItemsTreeItem('Configure Local Tasks');
    item.iconPath = new vscode.ThemeIcon('checklist');
    item.command = { command: 'editless.configureLocalTasks', title: 'Configure Local Tasks' };
    return item;
  }

  getChildren(element: WorkItemsTreeItem, ctx: string, renderCtx: TreeRenderContext): WorkItemsTreeItem[] {
    if (ctx === 'local-backend') {
      return this._getBackendChildren(element, renderCtx);
    }
    if (ctx === 'local-folder') {
      return this._getFolderChildren(element, renderCtx);
    }
    return [];
  }

  getAvailableOptions(_nodeId: string, baseContext: string): AvailableFilterOptions | null {
    if (baseContext === 'local-backend' || baseContext === 'local-folder') {
      return { states: ['open', 'active', 'closed'] };
    }
    return null;
  }

  getAllLabels(): string[] { return []; }
  getRepoIdentifiers(): string[] { return this._configured ? ['(Local)'] : []; }

  createFetchPromises(): Promise<void>[] {
    return this._folders.map(folder =>
      fetchLocalTasks(folder).then(tasks => {
        this._tasks.set(folder, tasks);
      }),
    );
  }

  clear(): void {
    this._tasks.clear();
    this._folders = [];
    this._configured = false;
  }

  // ── Internal helpers ────────────────────────────────────────────

  _getAllFilteredTasks(ctx: TreeRenderContext): LocalTask[] {
    const all: LocalTask[] = [];
    for (const folder of this._folders) {
      const tasks = this._tasks.get(folder) ?? [];
      all.push(...this._applyRuntimeFilter(tasks, ctx));
    }
    return all;
  }

  private _applyRuntimeFilter(tasks: LocalTask[], ctx: TreeRenderContext): LocalTask[] {
    const { filter } = ctx;
    return tasks.filter(task => {
      const state = mapLocalState(task);
      if (filter.repos.length > 0 && !filter.repos.includes('(Local)')) return false;
      if (filter.states.length > 0 && !filter.states.includes(state)) return false;
      return true;
    });
  }

  private _applyLevelFilter(tasks: LocalTask[], levelFilter: LevelFilter): LocalTask[] {
    return tasks.filter(task => {
      const state = mapLocalState(task);
      if (levelFilter.states && levelFilter.states.length > 0 && !levelFilter.states.includes(state)) return false;
      return true;
    });
  }

  _buildTaskItem(task: LocalTask): WorkItemsTreeItem {
    const item = new WorkItemsTreeItem(task.title);
    item.localTask = task;
    if (task.state === 'Done') {
      item.iconPath = new vscode.ThemeIcon('pass-filled');
    } else if (task.sessionId) {
      item.iconPath = new vscode.ThemeIcon('debug-start');
    } else {
      item.iconPath = new vscode.ThemeIcon('circle-large-outline');
    }
    item.description = task.state;
    item.contextValue = 'local-task';
    item.id = `local-task:${task.id}`;
    const tooltipParts = [
      `**${task.title}**`,
      `State: ${task.state}`,
      `Created: ${task.created}`,
    ];
    if (task.sessionId) tooltipParts.push(`Session: ${task.sessionId}`);
    item.tooltip = new vscode.MarkdownString(tooltipParts.join('\n\n'));
    return item;
  }

  private _getBackendChildren(element: WorkItemsTreeItem, ctx: TreeRenderContext): WorkItemsTreeItem[] {
    const backendFilter = ctx.getLevelFilter(ctx.cleanNodeId(element.id ?? ''));
    let tasks = this._getAllFilteredTasks(ctx);
    if (backendFilter) tasks = this._applyLevelFilter(tasks, backendFilter);
    return this._buildFolderNodes(tasks, ctx);
  }

  private _getFolderChildren(element: WorkItemsTreeItem, ctx: TreeRenderContext): WorkItemsTreeItem[] {
    const folderPath = element.id?.replace(/^local:|:f\d+$/g, '') ?? '';
    const tasks = this._tasks.get(folderPath) ?? [];
    const folderFilter = ctx.getLevelFilter(ctx.cleanNodeId(element.id ?? ''));
    const effectiveFilter = folderFilter ?? ctx.getLevelFilter('local:');
    if (effectiveFilter?.states && effectiveFilter.states.length > 0) {
      if (ctx.filter.repos.length > 0 && !ctx.filter.repos.includes('(Local)')) return [];
      return this._applyLevelFilter(tasks, effectiveFilter).map(t => this._buildTaskItem(t));
    }
    const filtered = this._applyRuntimeFilter(tasks, ctx);
    const levelFiltered = effectiveFilter ? this._applyLevelFilter(filtered, effectiveFilter) : filtered;
    return levelFiltered.map(t => this._buildTaskItem(t));
  }

  _buildFolderNodes(filteredLocal: LocalTask[], ctx: TreeRenderContext): WorkItemsTreeItem[] {
    const folderMap = new Map<string, LocalTask[]>();
    for (const task of filteredLocal) {
      const existing = folderMap.get(task.folderPath) ?? [];
      existing.push(task);
      folderMap.set(task.folderPath, existing);
    }
    const items: WorkItemsTreeItem[] = [];
    for (const [folderPath, tasks] of folderMap) {
      const first = tasks[0];
      const label = `${first.parentName} / ${first.folderName}`;
      const folderItem = new WorkItemsTreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
      folderItem.iconPath = new vscode.ThemeIcon('folder');
      folderItem.description = ctx.getFilterDescription(`local:${folderPath}`, tasks.length);
      folderItem.contextValue = ctx.contextWithFilter('local-folder', `local:${folderPath}`);
      folderItem.id = `local:${folderPath}:f${ctx.filterSeq}`;
      items.push(folderItem);
    }
    return items;
  }
}
