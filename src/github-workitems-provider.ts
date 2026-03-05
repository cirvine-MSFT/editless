import * as vscode from 'vscode';
import { GitHubIssue, fetchAssignedIssues, isGhAvailable } from './github-client';
import {
  type IWorkItemBackendProvider, type TreeRenderContext, type LevelFilter,
  type AvailableFilterOptions, WorkItemsTreeItem, mapGitHubState,
} from './work-item-types';

interface IssueFilter {
  includeLabels?: string[];
  excludeLabels?: string[];
}

export class GitHubWorkItemsProvider implements IWorkItemBackendProvider {
  readonly backendId = 'github';
  readonly label = 'GitHub';
  readonly icon = 'github';

  private _issues = new Map<string, GitHubIssue[]>();
  private _repos: string[] = [];
  private _allLabels = new Set<string>();

  get repos(): string[] { return this._repos; }
  set repos(value: string[]) { this._repos = value; }
  get allLabels(): Set<string> { return this._allLabels; }

  getIssuesMap(): Map<string, GitHubIssue[]> { return this._issues; }

  isConfigured(): boolean { return this._repos.length > 0; }

  hasFilteredItems(ctx: TreeRenderContext): boolean {
    return this.getFilteredMap(ctx).size > 0;
  }

  getFilteredItemCount(ctx: TreeRenderContext): number {
    let count = 0;
    for (const issues of this.getFilteredMap(ctx).values()) count += issues.length;
    return count;
  }

  getFilteredMap(ctx: TreeRenderContext): Map<string, GitHubIssue[]> {
    const result = new Map<string, GitHubIssue[]>();
    for (const [repo, issues] of this._issues) {
      const filtered = this.applyRuntimeFilter(issues, ctx);
      if (filtered.length > 0) result.set(repo, filtered);
    }
    return result;
  }

  applyRuntimeFilter(issues: GitHubIssue[], ctx: TreeRenderContext): GitHubIssue[] {
    const { filter } = ctx;
    return issues.filter(issue => {
      if (filter.states.length === 0 && mapGitHubState(issue) === 'closed') return false;
      if (filter.repos.length > 0 && !filter.repos.includes(issue.repository)) return false;
      if (filter.labels.length > 0 && !ctx.matchesLabelFilter(issue.labels, filter.labels)) return false;
      if (filter.states.length > 0 && !filter.states.includes(mapGitHubState(issue))) return false;
      if (filter.types.length > 0 && !this._matchesTypeFilter(issue.labels, filter.types)) return false;
      return true;
    });
  }

  applyLevelFilter(issues: GitHubIssue[], filter: LevelFilter, ctx: TreeRenderContext): GitHubIssue[] {
    return issues.filter(issue => {
      if (filter.labels && filter.labels.length > 0 && !ctx.matchesLabelFilter(issue.labels, filter.labels)) return false;
      if ((!filter.states || filter.states.length === 0) && mapGitHubState(issue) === 'closed') return false;
      if (filter.states && filter.states.length > 0 && !filter.states.includes(mapGitHubState(issue))) return false;
      return true;
    });
  }

  // ── IWorkItemBackendProvider ────────────────────────────────────

  handlesContext(ctx: string): boolean {
    return ctx === 'github-repo' || ctx === 'milestone-group';
  }

  getSingleBackendRootItems(ctx: TreeRenderContext): WorkItemsTreeItem[] {
    const filteredItems = this.getFilteredMap(ctx);
    if (filteredItems.size === 1) {
      const [, issues] = [...filteredItems.entries()][0];
      const milestoneGroups = this._buildMilestoneGroups(issues, ctx);
      if (milestoneGroups) return milestoneGroups;
      return issues.map(i => this.buildIssueItem(i));
    }
    return this._buildOwnerNodes(filteredItems, ctx);
  }

  createBackendGroupItem(itemCount: number, ctx: TreeRenderContext): WorkItemsTreeItem {
    const item = new WorkItemsTreeItem('GitHub', vscode.TreeItemCollapsibleState.Expanded);
    item.iconPath = new vscode.ThemeIcon('github');
    item.description = ctx.getFilterDescription(`${this.backendId}:`, itemCount);
    item.contextValue = ctx.contextWithFilter(`${this.backendId}-backend`, `${this.backendId}:`);
    item.id = `${this.backendId}::f${ctx.filterSeq}`;
    return item;
  }

  getConfigureItem(): WorkItemsTreeItem {
    const item = new WorkItemsTreeItem('Configure in GitHub');
    item.iconPath = new vscode.ThemeIcon('github');
    item.command = { command: 'editless.configureRepos', title: 'Configure GitHub Repos' };
    return item;
  }

  getChildren(element: WorkItemsTreeItem, ctx: string, renderCtx: TreeRenderContext): WorkItemsTreeItem[] {
    if (ctx === 'github-repo') {
      return this._getRepoChildren(element, renderCtx);
    }
    if (ctx === 'milestone-group') {
      return this._getMilestoneChildren(element, renderCtx);
    }
    return [];
  }

  getAvailableOptions(nodeId: string, baseContext: string): AvailableFilterOptions | null {
    if (baseContext === 'github-repo') {
      const repoName = nodeId.replace(/:f\d+$/, '').replace('github:', '');
      const issues = this._issues.get(repoName) ?? [];
      const labels = new Set<string>();
      for (const issue of issues) {
        for (const label of issue.labels) labels.add(label);
      }
      return { states: ['open', 'active', 'closed'], labels: [...labels].sort() };
    }
    return null;
  }

  getAllLabels(): string[] { return [...this._allLabels]; }
  getRepoIdentifiers(): string[] { return []; }

  createFetchPromises(): Promise<void>[] {
    if (this._repos.length === 0) return [];
    return [this._fetchAll()];
  }

  clear(): void {
    this._issues.clear();
    this._allLabels.clear();
  }

  // ── Internal helpers ────────────────────────────────────────────

  buildIssueItem(issue: GitHubIssue): WorkItemsTreeItem {
    const item = new WorkItemsTreeItem(`#${issue.number} ${issue.title}`);
    item.issue = issue;
    item.description = issue.labels.join(', ');
    item.iconPath = new vscode.ThemeIcon('issues');
    item.contextValue = 'work-item';
    item.tooltip = new vscode.MarkdownString(
      [
        `**#${issue.number} ${issue.title}**`,
        `Labels: ${issue.labels.join(', ') || 'none'}`,
        `Assignees: ${issue.assignees.join(', ')}`,
      ].join('\n\n'),
    );
    return item;
  }

  private async _fetchAll(): Promise<void> {
    const ghOk = await isGhAvailable();
    if (!ghOk) return;
    const nextIssues = new Map<string, GitHubIssue[]>();
    const nextLabels = new Set<string>();
    await Promise.all(
      this._repos.map(async (repo) => {
        const issues = await fetchAssignedIssues(repo);
        for (const issue of issues) {
          for (const label of issue.labels) nextLabels.add(label);
        }
        const filtered = this._filterIssuesByConfig(issues);
        if (filtered.length > 0) nextIssues.set(repo, filtered);
      }),
    );
    this._issues = nextIssues;
    this._allLabels = nextLabels;
  }

  private _filterIssuesByConfig(issues: GitHubIssue[]): GitHubIssue[] {
    const config = vscode.workspace.getConfiguration('editless');
    const filter = config.get<IssueFilter>('github.issueFilter', {});
    const include = filter.includeLabels ?? [];
    const exclude = filter.excludeLabels ?? [];
    return issues.filter((issue) => {
      if (exclude.length > 0 && issue.labels.some((l) => exclude.includes(l))) return false;
      if (include.length > 0 && !issue.labels.some((l) => include.includes(l))) return false;
      return true;
    });
  }

  private _matchesTypeFilter(issueLabels: string[], types: string[]): boolean {
    const typeLabelPatterns = types.map(t => `type:${t.toLowerCase().replace(/\s+/g, '-')}`);
    return issueLabels.some(l => typeLabelPatterns.includes(l.toLowerCase()));
  }

  private _getRepoChildren(element: WorkItemsTreeItem, ctx: TreeRenderContext): WorkItemsTreeItem[] {
    const repoName = element.id?.replace(/^github:|:f\d+$/g, '') ?? '';
    let filtered = this.applyRuntimeFilter(this._issues.get(repoName) ?? [], ctx);
    const repoFilter = ctx.getLevelFilter(ctx.cleanNodeId(element.id ?? ''));
    if (repoFilter) filtered = this.applyLevelFilter(filtered, repoFilter, ctx);
    const milestoneGroups = this._buildMilestoneGroups(filtered, ctx);
    if (milestoneGroups) return milestoneGroups;
    return filtered.map(i => this.buildIssueItem(i));
  }

  private _getMilestoneChildren(element: WorkItemsTreeItem, ctx: TreeRenderContext): WorkItemsTreeItem[] {
    const parts = element.id?.split(':') ?? [];
    const repoId = parts[1] ?? '';
    const msName = parts[2] ?? '';
    const issues = this._issues.get(repoId) ?? [];
    const filtered = this.applyRuntimeFilter(issues, ctx);
    const repoFilter = ctx.getLevelFilter(`github:${repoId}`);
    const levelFiltered = repoFilter ? this.applyLevelFilter(filtered, repoFilter, ctx) : filtered;
    const msFiltered = msName === '__none__'
      ? levelFiltered.filter(i => !i.milestone)
      : levelFiltered.filter(i => i.milestone === msName);
    return msFiltered.map(i => this.buildIssueItem(i));
  }

  _buildMilestoneGroups(issues: GitHubIssue[], ctx: TreeRenderContext): WorkItemsTreeItem[] | undefined {
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
    if (milestones.size === 0) return undefined;

    const fseq = ctx.filterSeq;
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

  private _buildOwnerNodes(filteredItems: Map<string, GitHubIssue[]>, ctx: TreeRenderContext): WorkItemsTreeItem[] {
    const owners = new Map<string, number>();
    for (const [repo, items] of filteredItems) {
      const owner = repo.split('/')[0];
      if (owner) owners.set(owner, (owners.get(owner) ?? 0) + items.length);
    }
    const result: WorkItemsTreeItem[] = [];
    for (const [owner, count] of owners) {
      const item = new WorkItemsTreeItem(owner, vscode.TreeItemCollapsibleState.Expanded);
      item.iconPath = new vscode.ThemeIcon('organization');
      item.description = ctx.getFilterDescription(`${this.backendId}:${owner}`, count);
      item.contextValue = ctx.contextWithFilter(`${this.backendId}-org`, `${this.backendId}:${owner}`);
      item.id = `${this.backendId}:${owner}:f${ctx.filterSeq}`;
      result.push(item);
    }
    return result;
  }
}
