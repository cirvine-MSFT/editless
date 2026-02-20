import * as vscode from 'vscode';
import { GitHubIssue, fetchAssignedIssues, isGhAvailable } from './github-client';
import type { AdoWorkItem } from './ado-client';

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

export class WorkItemsTreeProvider implements vscode.TreeDataProvider<WorkItemsTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<WorkItemsTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _repos: string[] = [];
  private _issues = new Map<string, GitHubIssue[]>();
  private _adoItems: AdoWorkItem[] = [];
  private _adoConfigured = false;
  private _loading = false;
  private _filter: WorkItemsFilter = { repos: [], labels: [], states: [] };
  private _filterSeq = 0;
  private _treeView?: vscode.TreeView<WorkItemsTreeItem>;
  private _allLabels = new Set<string>();

  setRepos(repos: string[]): void {
    this._repos = repos;
    this.fetchAll();
  }

  setAdoItems(items: AdoWorkItem[]): void {
    this._adoItems = items;
    this._adoConfigured = true;
    this._onDidChangeTreeData.fire();
  }

  clearAdo(): void {
    this._adoItems = [];
    this._adoConfigured = false;
    this._onDidChangeTreeData.fire();
  }

  setTreeView(view: vscode.TreeView<WorkItemsTreeItem>): void {
    this._treeView = view;
    this._updateDescription();
  }

  get filter(): WorkItemsFilter {
    return { ...this._filter };
  }

  get isFiltered(): boolean {
    return this._filter.repos.length > 0 || this._filter.labels.length > 0 || this._filter.states.length > 0;
  }

  setFilter(filter: WorkItemsFilter): void {
    this._filter = { ...filter };
    this._filterSeq++;
    vscode.commands.executeCommand('setContext', 'editless.workItemsFiltered', this.isFiltered);
    this._updateDescription();
    this._onDidChangeTreeData.fire();
  }

  clearFilter(): void {
    this.setFilter({ repos: [], labels: [], states: [] });
  }

  private _updateDescription(): void {
    if (!this._treeView) return;
    if (!this.isFiltered) {
      this._treeView.description = undefined;
      return;
    }
    const parts: string[] = [];
    if (this._filter.repos.length > 0) parts.push(`repo:${this._filter.repos.join(',')}`);
    if (this._filter.labels.length > 0) parts.push(`label:${this._filter.labels.join(',')}`);
    if (this._filter.states.length > 0) parts.push(`state:${this._filter.states.join(',')}`);
    this._treeView.description = parts.join(' · ');
  }

  getAllLabels(): string[] {
    const labels = new Set(this._allLabels);
    for (const wi of this._adoItems) {
      for (const tag of wi.tags) labels.add(tag);
    }
    return [...labels].sort();
  }

  getAllRepos(): string[] {
    const repos = [...this._repos];
    if (this._adoConfigured) repos.push('(ADO)');
    return repos;
  }

  private _adoRefresh?: () => Promise<void>;

  setAdoRefresh(fn: () => Promise<void>): void {
    this._adoRefresh = fn;
  }

  refresh(): void {
    this.fetchAll();
  }

  private _pendingRefresh = false;

  private async fetchAll(): Promise<void> {
    if (this._loading) {
      this._pendingRefresh = true;
      return;
    }
    this._loading = true;

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
    this._loading = false;
    this._onDidChangeTreeData.fire();
    if (this._pendingRefresh) {
      this._pendingRefresh = false;
      this.fetchAll();
    }
  }

  getTreeItem(element: WorkItemsTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: WorkItemsTreeItem): WorkItemsTreeItem[] {
    if (!element) {
      if (this._loading && this._issues.size === 0 && this._adoItems.length === 0) {
        const item = new WorkItemsTreeItem('Loading...');
        item.iconPath = new vscode.ThemeIcon('loading~spin');
        return [item];
      }

      if (this._repos.length === 0 && !this._adoConfigured) {
        const ghItem = new WorkItemsTreeItem('Configure in GitHub');
        ghItem.iconPath = new vscode.ThemeIcon('github');
        ghItem.command = {
          command: 'editless.configureRepos',
          title: 'Configure GitHub Repos',
        };

        const adoItem = new WorkItemsTreeItem('Configure in ADO');
        adoItem.iconPath = new vscode.ThemeIcon('azure');
        adoItem.command = {
          command: 'editless.configureAdo',
          title: 'Configure Azure DevOps',
        };

        return [ghItem, adoItem];
      }

      // Apply runtime filters
      const filteredIssues = new Map<string, GitHubIssue[]>();
      for (const [repo, issues] of this._issues.entries()) {
        const filtered = this.applyRuntimeFilter(issues);
        if (filtered.length > 0) filteredIssues.set(repo, filtered);
      }
      const filteredAdo = this.applyAdoRuntimeFilter(this._adoItems);

      const hasGitHub = filteredIssues.size > 0;
      const hasAdo = filteredAdo.length > 0;

      if (!hasGitHub && !hasAdo) {
        const msg = this.isFiltered ? 'No items match current filter' : 'No assigned issues found';
        const icon = this.isFiltered ? 'filter' : 'check';
        const item = new WorkItemsTreeItem(msg);
        item.iconPath = new vscode.ThemeIcon(icon);
        return [item];
      }

      const items: WorkItemsTreeItem[] = [];
      // Embed filter sequence in group IDs so VS Code discards cached children on filter change
      const fseq = this._filterSeq;

      // ADO work items group
      if (hasAdo) {
        if (hasGitHub) {
          const adoGroup = new WorkItemsTreeItem('Azure DevOps', vscode.TreeItemCollapsibleState.Expanded);
          adoGroup.iconPath = new vscode.ThemeIcon('azure');
          adoGroup.description = `${filteredAdo.length} item${filteredAdo.length === 1 ? '' : 's'}`;
          adoGroup.contextValue = 'ado-group';
          adoGroup.id = `wi:ado:f${fseq}`;
          items.push(adoGroup);
        } else {
          return filteredAdo.map(wi => this.buildAdoItem(wi));
        }
      }

      // GitHub issues (existing logic)
      if (hasGitHub) {
        const milestoneItems = this.buildMilestoneGroups(filteredIssues);
        if (milestoneItems && !hasAdo) {
          return milestoneItems;
        }
        if (milestoneItems && hasAdo) {
          items.push(...milestoneItems);
        } else if (filteredIssues.size === 1 && !hasAdo) {
          const [, issues] = [...filteredIssues.entries()][0];
          return issues.map((i) => this.buildIssueItem(i));
        } else {
          for (const [repo, issues] of filteredIssues.entries()) {
            const repoItem = new WorkItemsTreeItem(repo, vscode.TreeItemCollapsibleState.Expanded);
            repoItem.iconPath = new vscode.ThemeIcon('github');
            repoItem.description = `${issues.length} issue${issues.length === 1 ? '' : 's'}`;
            repoItem.contextValue = 'repo-group';
            repoItem.id = `wi:${repo}:f${fseq}`;
            items.push(repoItem);
          }
        }
      }

      return items;
    }

    if (element.contextValue === 'ado-group') {
      return this.applyAdoRuntimeFilter(this._adoItems).map(wi => this.buildAdoItem(wi));
    }

    if (element.contextValue === 'milestone-group') {
      const msName = element.id?.replace(/^ms:|:f\d+$/g, '') ?? '';
      const allIssues = this.applyRuntimeFilter([...this._issues.values()].flat());
      const filtered = msName === '__none__'
        ? allIssues.filter((i) => !i.milestone)
        : allIssues.filter((i) => i.milestone === msName);
      return filtered.map((i) => this.buildIssueItem(i));
    }

    const repoId = element.id?.replace(/^wi:|:f\d+$/g, '');
    if (repoId && this._issues.has(repoId)) {
      return this.applyRuntimeFilter(this._issues.get(repoId)!).map((i) => this.buildIssueItem(i));
    }

    return [];
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
   * Group filters by their label prefix (everything before the colon).
   * Within each group, use OR logic (item matches if it has ANY label from that group).
   * Across groups, use AND logic (item must match at least one label from EACH group).
   */
  private matchesLabelFilter(itemLabels: string[], activeFilters: string[]): boolean {
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

  private applyRuntimeFilter(issues: GitHubIssue[]): GitHubIssue[] {
    if (!this.isFiltered) return issues;
    return issues.filter(issue => {
      if (this._filter.repos.length > 0 && !this._filter.repos.includes(issue.repository)) return false;
      if (this._filter.labels.length > 0 && !this.matchesLabelFilter(issue.labels, this._filter.labels)) return false;
      if (this._filter.states.length > 0 && !this._filter.states.includes(mapGitHubState(issue))) return false;
      return true;
    });
  }

  private applyAdoRuntimeFilter(items: AdoWorkItem[]): AdoWorkItem[] {
    if (!this.isFiltered) return items;
    return items.filter(wi => {
      if (this._filter.repos.length > 0 && !this._filter.repos.includes('(ADO)')) return false;
      if (this._filter.labels.length > 0 && !this.matchesLabelFilter(wi.tags, this._filter.labels)) return false;
      if (this._filter.states.length > 0 && !this._filter.states.includes(mapAdoState(wi.state))) return false;
      return true;
    });
  }

  private buildMilestoneGroups(filteredIssues?: Map<string, GitHubIssue[]>): WorkItemsTreeItem[] | undefined {
    const source = filteredIssues ?? this._issues;
    const allIssues = [...source.values()].flat();
    const milestones = new Map<string, GitHubIssue[]>();
    const noMilestone: GitHubIssue[] = [];

    for (const issue of allIssues) {
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
    const items: WorkItemsTreeItem[] = [];
    for (const [ms, issues] of milestones) {
      const msItem = new WorkItemsTreeItem(ms, vscode.TreeItemCollapsibleState.Expanded);
      msItem.iconPath = new vscode.ThemeIcon('milestone');
      msItem.description = `${issues.length} issue${issues.length === 1 ? '' : 's'}`;
      msItem.contextValue = 'milestone-group';
      msItem.id = `ms:${ms}:f${fseq}`;
      items.push(msItem);
    }
    if (noMilestone.length > 0) {
      const noMsItem = new WorkItemsTreeItem('No Milestone', vscode.TreeItemCollapsibleState.Collapsed);
      noMsItem.iconPath = new vscode.ThemeIcon('milestone');
      noMsItem.description = `${noMilestone.length} issue${noMilestone.length === 1 ? '' : 's'}`;
      noMsItem.contextValue = 'milestone-group';
      noMsItem.id = `ms:__none__:f${fseq}`;
      items.push(noMsItem);
    }
    return items;
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
    item.command = {
      command: 'vscode.open',
      title: 'Open in Browser',
      arguments: [vscode.Uri.parse(issue.url)],
    };
    return item;
  }

  private buildAdoItem(wi: AdoWorkItem): WorkItemsTreeItem {
    const stateIcon = wi.state === 'Active' ? '🔵' : wi.state === 'New' ? '🟢' : '⚪';
    const label = `${stateIcon} #${wi.id} ${wi.title}`;
    const item = new WorkItemsTreeItem(label);
    item.adoWorkItem = wi;
    item.description = `${wi.type} · ${wi.state}`;
    item.iconPath = new vscode.ThemeIcon('azure');
    item.contextValue = 'ado-work-item';
    item.tooltip = new vscode.MarkdownString(
      [
        `**#${wi.id} ${wi.title}**`,
        `Type: ${wi.type}`,
        `State: ${wi.state}`,
        `Area: ${wi.areaPath}`,
        wi.tags.length > 0 ? `Tags: ${wi.tags.join(', ')}` : '',
      ].filter(Boolean).join('\n\n'),
    );
    item.command = {
      command: 'vscode.open',
      title: 'Open in Browser',
      arguments: [vscode.Uri.parse(wi.url)],
    };
    return item;
  }
}
