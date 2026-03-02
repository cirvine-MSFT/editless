import * as vscode from 'vscode';
import { GitHubIssue, fetchAssignedIssues, isGhAvailable } from './github-client';
import type { AdoWorkItem } from './ado-client';
import { BaseTreeProvider } from './base-tree-provider';

interface IssueFilter {
  includeLabels?: string[];
  excludeLabels?: string[];
}

export type UnifiedState = 'open' | 'active' | 'closed';

export function mapGitHubState(issue: GitHubIssue): UnifiedState {
  if (issue.state === 'closed') return 'closed';
  return issue.assignees.length > 0 ? 'active' : 'open';
}

export function mapAdoState(state: string): UnifiedState {
  const lower = state.toLowerCase();
  if (lower === 'new') return 'open';
  if (lower === 'active' || lower === 'doing') return 'active';
  return 'closed';
}

export interface WorkItemsFilter {
  repos: string[];
  labels: string[];
  states: UnifiedState[];
  types: string[];
}

export interface LevelFilter {
  selectedChildren?: string[];  // Filter which children are visible
  types?: string[];             // ADO types (project level only)
  labels?: string[];            // GitHub labels (repo level only)
  states?: UnifiedState[];      // States (project/repo level)
  tags?: string[];              // ADO tags (project level only)
}



export class WorkItemsTreeItem extends vscode.TreeItem {
  public issue?: GitHubIssue;
  public adoWorkItem?: AdoWorkItem;

  constructor(
    label: string,
    collapsible: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
  ) {
    super(label, collapsible);
  }
}

export class WorkItemsTreeProvider extends BaseTreeProvider<GitHubIssue, AdoWorkItem, WorkItemsTreeItem, LevelFilter> {
  protected readonly _ghIdPrefix = 'github';
  protected readonly _adoIdPrefix = 'ado';
  protected readonly _itemCountSuffix: [string, string] = ['item', 'items'];
  protected readonly _emptyMessage = 'No assigned issues found';

  private _issues = new Map<string, GitHubIssue[]>();
  private _adoItems: AdoWorkItem[] = [];
  private _adoChildMap = new Map<number, number[]>();
  private _filter: WorkItemsFilter = { repos: [], labels: [], states: [], types: [] };

  setAdoItems(items: AdoWorkItem[]): void {
    this._adoItems = items;
    this._adoConfigured = true;
    this._buildAdoChildMap();
    this._onDidChangeTreeData.fire();
  }

  get filter(): WorkItemsFilter {
    return { ...this._filter };
  }

  get isFiltered(): boolean {
    return this._filter.repos.length > 0 || this._filter.labels.length > 0 || this._filter.states.length > 0 || this._filter.types.length > 0;
  }

  setFilter(filter: WorkItemsFilter): void {
    this._filter = { ...filter };
    this._filterSeq++;
    vscode.commands.executeCommand('setContext', 'editless.workItemsFiltered', this.isFiltered);
    this._updateDescription();
    this._onDidChangeTreeData.fire();
  }

  clearFilter(): void {
    this.setFilter({ repos: [], labels: [], states: [], types: [] });
  }

  protected _updateDescription(): void {
    if (!this._treeView) return;
    if (!this.isFiltered) {
      this._treeView.description = undefined;
      return;
    }
    const parts: string[] = [];
    if (this._filter.repos.length > 0) parts.push(`repo:${this._filter.repos.join(',')}`);
    if (this._filter.labels.length > 0) parts.push(`label:${this._filter.labels.join(',')}`);
    if (this._filter.states.length > 0) parts.push(`state:${this._filter.states.join(',')}`);
    if (this._filter.types.length > 0) parts.push(`type:${this._filter.types.join(',')}`);
    this._treeView.description = parts.join(' · ');
  }

  getAllLabels(): string[] {
    const labels = new Set(this._allLabels);
    for (const wi of this._adoItems) {
      for (const tag of wi.tags) labels.add(tag);
    }
    return [...labels].sort();
  }

  getAvailableOptions(nodeId: string, contextValue: string): { owners?: string[]; repos?: string[]; orgs?: string[]; projects?: string[]; types?: string[]; labels?: string[]; states?: UnifiedState[]; tags?: string[] } {
    const base = this._getAvailableOptionsBase(nodeId, contextValue);
    if (base) return base;

    const cleanId = nodeId.replace(/:f\d+$/, '');
    const baseContext = contextValue.replace(/-filtered$/, '');

    if (baseContext === 'github-repo') {
      const repoName = cleanId.replace('github:', '');
      const issues = this._issues.get(repoName) ?? [];
      const labels = new Set<string>();
      for (const issue of issues) {
        for (const label of issue.labels) labels.add(label);
      }
      return { 
        labels: [...labels].sort(), 
        states: ['open', 'active', 'closed'] as UnifiedState[]
      };
    }

    if (baseContext === 'ado-project') {
      const types = new Set<string>();
      const tags = new Set<string>();
      for (const wi of this._adoItems) {
        types.add(wi.type);
        for (const tag of wi.tags) tags.add(tag);
      }
      return {
        types: [...types].sort(),
        states: ['open', 'active', 'closed'] as UnifiedState[],
        tags: [...tags].sort()
      };
    }

    return {};
  }

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
    return this._issues;
  }

  protected _getAdoItemsList(): AdoWorkItem[] {
    return this._adoItems;
  }

  protected applyRuntimeFilter(issues: GitHubIssue[]): GitHubIssue[] {
    return issues.filter(issue => {
      // Default exclusion: hide closed items unless user explicitly includes 'closed'
      if (this._filter.states.length === 0 && mapGitHubState(issue) === 'closed') return false;
      if (this._filter.repos.length > 0 && !this._filter.repos.includes(issue.repository)) return false;
      if (this._filter.labels.length > 0 && !this.matchesLabelFilter(issue.labels, this._filter.labels)) return false;
      if (this._filter.states.length > 0 && !this._filter.states.includes(mapGitHubState(issue))) return false;
      if (this._filter.types.length > 0 && !this.matchesTypeFilter(issue.labels, this._filter.types)) return false;
      return true;
    });
  }

  protected applyAdoRuntimeFilter(items: AdoWorkItem[]): AdoWorkItem[] {
    return items.filter(wi => {
      // Default exclusion: hide closed items unless user explicitly includes 'closed'
      if (this._filter.states.length === 0 && mapAdoState(wi.state) === 'closed') return false;
      if (this._filter.repos.length > 0 && !this._filter.repos.includes('(ADO)')) return false;
      if (this._filter.labels.length > 0 && !this.matchesLabelFilter(wi.tags, this._filter.labels)) return false;
      if (this._filter.states.length > 0 && !this._filter.states.includes(mapAdoState(wi.state))) return false;
      if (this._filter.types.length > 0 && !this._filter.types.includes(wi.type)) return false;
      return true;
    });
  }

  protected async _doFetchAll(): Promise<void> {
    const nextIssues = new Map<string, GitHubIssue[]>();
    const nextLabels = new Set<string>();
    const fetches: Promise<void>[] = [];

    // GitHub fetch — only if gh CLI is available and repos configured
    if (this._repos.length > 0) {
      const ghOk = await isGhAvailable();
      if (ghOk) {
        fetches.push(
          ...this._repos.map(async (repo) => {
            const issues = await fetchAssignedIssues(repo);
            for (const issue of issues) {
              for (const label of issue.labels) nextLabels.add(label);
            }
            const filtered = this.filterIssues(issues);
            if (filtered.length > 0) {
              nextIssues.set(repo, filtered);
            }
          }),
        );
      }
    }

    // ADO fetch — independent of GitHub
    if (this._adoRefresh) {
      fetches.push(this._adoRefresh());
    }

    await Promise.all(fetches);

    this._issues = nextIssues;
    this._allLabels = nextLabels;
  }

  protected _getRootGitHubSingleBackend(filteredItems: Map<string, GitHubIssue[]>): WorkItemsTreeItem[] {
    if (filteredItems.size === 1) {
      const [, issues] = [...filteredItems.entries()][0];
      // Check for milestone grouping
      const milestoneGroups = this._buildMilestoneGroupsForIssues(issues);
      if (milestoneGroups) return milestoneGroups;
      // Return issues directly
      return issues.map((i) => this.buildIssueItem(i));
    } else {
      // Multiple repos - show owner level
      return this._getGitHubOwnerNodes(filteredItems);
    }
  }

  protected _getChildrenForContext(element: WorkItemsTreeItem, ctx: string): WorkItemsTreeItem[] {
    // ADO project node
    if (ctx === 'ado-project') {
      const filteredAdo = this.applyAdoRuntimeFilter(this._adoItems);
      const projectFilter = this._levelFilters.get(this._cleanNodeId(element.id ?? ''));
      let filtered = filteredAdo;
      if (projectFilter) {
        filtered = this._applyAdoLevelFilter(filteredAdo, projectFilter);
      }
      return this._getAdoRootItems(filtered).map(wi => this.buildAdoItem(wi));
    }

    // ADO parent item
    if (ctx === 'ado-parent-item' && element.adoWorkItem) {
      const childIds = this._adoChildMap.get(element.adoWorkItem.id) ?? [];
      const filtered = this.applyAdoRuntimeFilter(this._adoItems);
      const filteredIdSet = new Set(filtered.map(wi => wi.id));
      return childIds
        .filter(id => filteredIdSet.has(id))
        .map(id => this.buildAdoItem(filtered.find(wi => wi.id === id)!));
    }

    // GitHub repo node
    if (ctx === 'github-repo') {
      const repoName = element.id?.replace(/^github:|:f\d+$/g, '') ?? '';
      const issues = this._issues.get(repoName) ?? [];
      let filtered = this.applyRuntimeFilter(issues);
      
      const repoFilter = this._levelFilters.get(this._cleanNodeId(element.id ?? ''));
      if (repoFilter) {
        filtered = this._applyGitHubLevelFilter(filtered, repoFilter);
      }

      // Check for milestone grouping
      const milestoneGroups = this._buildMilestoneGroupsForIssues(filtered);
      if (milestoneGroups) return milestoneGroups;

      return filtered.map((i) => this.buildIssueItem(i));
    }

    // Milestone group
    if (ctx === 'milestone-group') {
      const parts = element.id?.split(':') ?? [];
      // Format: ms:repoName:milestoneName:f{seq}
      const repoId = parts[1] ?? '';
      const msName = parts[2] ?? '';
      const issues = this._issues.get(repoId) ?? [];
      const filtered = this.applyRuntimeFilter(issues);
      const repoFilter = this._levelFilters.get(`github:${repoId}`);
      const levelFiltered = repoFilter ? this._applyGitHubLevelFilter(filtered, repoFilter) : filtered;
      
      const msFiltered = msName === '__none__'
        ? levelFiltered.filter((i) => !i.milestone)
        : levelFiltered.filter((i) => i.milestone === msName);
      return msFiltered.map((i) => this.buildIssueItem(i));
    }

    return [];
  }

  protected _clearAdoData(): void {
    this._adoItems = [];
    this._adoChildMap.clear();
  }

  private filterIssues(issues: GitHubIssue[]): GitHubIssue[] {
    const config = vscode.workspace.getConfiguration('editless');
    const filter = config.get<IssueFilter>('github.issueFilter', {});

    const include = filter.includeLabels ?? [];
    const exclude = filter.excludeLabels ?? [];

    return issues.filter((issue) => {
      if (exclude.length > 0 && issue.labels.some((l) => exclude.includes(l))) { return false; }
      if (include.length > 0 && !issue.labels.some((l) => include.includes(l))) { return false; }
      return true;
    });
  }

  /**
   * Match GitHub issues by type filter.
   * Maps ADO-style types (e.g. "Bug") to GitHub's `type:bug` label convention.
   */
  private matchesTypeFilter(issueLabels: string[], types: string[]): boolean {
    const typeLabelPatterns = types.map(t => `type:${t.toLowerCase().replace(/\s+/g, '-')}`);
    return issueLabels.some(l => typeLabelPatterns.includes(l.toLowerCase()));
  }

  private buildIssueItem(issue: GitHubIssue): WorkItemsTreeItem {
    const item = new WorkItemsTreeItem(`#${issue.number} ${issue.title}`);
    item.issue = issue;

    const labelText = issue.labels.join(', ');
    item.description = labelText;

    item.iconPath = new vscode.ThemeIcon('issues');
    item.contextValue = 'work-item';

    item.tooltip = new vscode.MarkdownString(
      [
        `**#${issue.number} ${issue.title}**`,
        `Labels: ${labelText || 'none'}`,
        `Assignees: ${issue.assignees.join(', ')}`,
      ].join('\n\n'),
    );
    return item;
  }

  private buildAdoItem(wi: AdoWorkItem): WorkItemsTreeItem {
    const stateIcon = wi.state === 'Active' ? '🔵' : wi.state === 'New' ? '🟢' : '⚪';
    const label = `${stateIcon} #${wi.id} ${wi.title}`;
    const hasChildren = (this._adoChildMap.get(wi.id)?.length ?? 0) > 0;
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

  private _buildAdoChildMap(): void {
    this._adoChildMap.clear();
    const idSet = new Set(this._adoItems.map(wi => wi.id));
    for (const wi of this._adoItems) {
      if (wi.parentId != null && idSet.has(wi.parentId)) {
        const children = this._adoChildMap.get(wi.parentId) ?? [];
        children.push(wi.id);
        this._adoChildMap.set(wi.parentId, children);
      }
    }
  }

  private _getAdoRootItems(items: AdoWorkItem[]): AdoWorkItem[] {
    const idSet = new Set(items.map(wi => wi.id));
    return items.filter(wi => wi.parentId == null || !idSet.has(wi.parentId));
  }

  private _applyAdoLevelFilter(items: AdoWorkItem[], filter: LevelFilter): AdoWorkItem[] {
    return items.filter(wi => {
      if (filter.types && filter.types.length > 0 && !filter.types.includes(wi.type)) return false;
      if (filter.tags && filter.tags.length > 0 && !this.matchesLabelFilter(wi.tags, filter.tags)) return false;
      if ((!filter.states || filter.states.length === 0) && mapAdoState(wi.state) === 'closed') return false;
      if (filter.states && filter.states.length > 0 && !filter.states.includes(mapAdoState(wi.state))) return false;
      return true;
    });
  }

  private _applyGitHubLevelFilter(issues: GitHubIssue[], filter: LevelFilter): GitHubIssue[] {
    return issues.filter(issue => {
      if (filter.labels && filter.labels.length > 0 && !this.matchesLabelFilter(issue.labels, filter.labels)) return false;
      if ((!filter.states || filter.states.length === 0) && mapGitHubState(issue) === 'closed') return false;
      if (filter.states && filter.states.length > 0 && !filter.states.includes(mapGitHubState(issue))) return false;
      return true;
    });
  }

  private _buildMilestoneGroupsForIssues(issues: GitHubIssue[]): WorkItemsTreeItem[] | undefined {
    const milestones = new Map<string, GitHubIssue[]>();
    const noMilestone: GitHubIssue[] = [];

    for (const issue of issues) {
      if (issue.milestone) {
        const existing = milestones.get(issue.milestone) ?? [];
        existing.push(issue);
        milestones.set(issue.milestone, existing);
      } else {
        noMilestone.push(issue);
      }
    }

    if (milestones.size === 0) { return undefined; }

    const fseq = this._filterSeq;
    const repoName = issues[0]?.repository ?? '';
    const items: WorkItemsTreeItem[] = [];
    for (const [ms, msIssues] of milestones) {
      const msItem = new WorkItemsTreeItem(ms, vscode.TreeItemCollapsibleState.Expanded);
      msItem.iconPath = new vscode.ThemeIcon('milestone');
      msItem.description = `${msIssues.length} issue${msIssues.length === 1 ? '' : 's'}`;
      msItem.contextValue = 'milestone-group';
      msItem.id = `ms:${repoName}:${ms}:f${fseq}`;
      items.push(msItem);
    }
    if (noMilestone.length > 0) {
      const noMsItem = new WorkItemsTreeItem('No Milestone', vscode.TreeItemCollapsibleState.Collapsed);
      noMsItem.iconPath = new vscode.ThemeIcon('milestone');
      noMsItem.description = `${noMilestone.length} issue${noMilestone.length === 1 ? '' : 's'}`;
      noMsItem.contextValue = 'milestone-group';
      noMsItem.id = `ms:${repoName}:__none__:f${fseq}`;
      items.push(noMsItem);
    }
    return items;
  }
}
