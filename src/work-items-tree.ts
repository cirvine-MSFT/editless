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

export class WorkItemsTreeProvider implements vscode.TreeDataProvider<WorkItemsTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<WorkItemsTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _repos: string[] = [];
  private _issues = new Map<string, GitHubIssue[]>();
  private _adoItems: AdoWorkItem[] = [];
  private _adoChildMap = new Map<number, number[]>();
  private _adoConfigured = false;
  private _loading = false;
  private _filter: WorkItemsFilter = { repos: [], labels: [], states: [], types: [] };
  private _levelFilters = new Map<string, LevelFilter>();
  private _filterSeq = 0;
  private _treeView?: vscode.TreeView<WorkItemsTreeItem>;
  private _allLabels = new Set<string>();
  private _adoOrg: string | undefined;
  private _adoProject: string | undefined;

  setRepos(repos: string[]): void {
    this._repos = repos;
    this.fetchAll();
  }

  setAdoConfig(org: string | undefined, project: string | undefined): void {
    this._adoOrg = org;
    this._adoProject = project;
  }

  setAdoItems(items: AdoWorkItem[]): void {
    this._adoItems = items;
    this._adoConfigured = true;
    this._buildAdoChildMap();
    this._onDidChangeTreeData.fire();
  }

  clearAdo(): void {
    this._adoItems = [];
    this._adoChildMap.clear();
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

  getAllRepos(): string[] {
    const repos = [...this._repos];
    if (this._adoConfigured) repos.push('(ADO)');
    return repos;
  }

  getLevelFilter(nodeId: string): LevelFilter | undefined {
    return this._levelFilters.get(nodeId);
  }

  setLevelFilter(nodeId: string, filter: LevelFilter): void {
    this._levelFilters.set(nodeId, filter);
    this._filterSeq++;
    this._onDidChangeTreeData.fire();
  }

  clearLevelFilter(nodeId: string): void {
    this._levelFilters.delete(nodeId);
    this._filterSeq++;
    this._onDidChangeTreeData.fire();
  }

  clearAllLevelFilters(): void {
    this._levelFilters.clear();
    this._filterSeq++;
    this._onDidChangeTreeData.fire();
  }

  getAvailableOptions(nodeId: string, contextValue: string): { owners?: string[]; repos?: string[]; orgs?: string[]; projects?: string[]; types?: string[]; labels?: string[]; states?: UnifiedState[]; tags?: string[] } {
    // Strip :f{seq} suffix from node IDs before data lookup
    const cleanId = nodeId.replace(/:f\d+$/, '');
    if (contextValue === 'github-backend') {
      // Extract unique owners from repo names
      const owners = new Set<string>();
      for (const repo of this._repos) {
        const owner = repo.split('/')[0];
        if (owner) owners.add(owner);
      }
      return { owners: [...owners].sort() };
    }

    if (contextValue === 'github-org') {
      // Extract repos for this owner
      const owner = cleanId.replace('github:', '');
      const repos = this._repos.filter(r => r.startsWith(owner + '/'));
      return { repos };
    }

    if (contextValue === 'github-repo') {
      // Labels, states, milestones for this repo
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

    if (contextValue === 'ado-backend') {
      // Return configured org
      return { orgs: this._adoOrg ? [this._adoOrg] : [] };
    }

    if (contextValue === 'ado-org') {
      // Return configured project
      return { projects: this._adoProject ? [this._adoProject] : [] };
    }

    if (contextValue === 'ado-project') {
      // Types, states, tags for ADO items
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
      // Root level - show backend groups or configure options
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
      const fseq = this._filterSeq;

      // Check if we have only one backend configured
      const backendCount = (hasGitHub ? 1 : 0) + (hasAdo ? 1 : 0);

      // ADO backend group
      if (hasAdo) {
        if (backendCount > 1) {
          const adoGroup = new WorkItemsTreeItem('Azure DevOps', vscode.TreeItemCollapsibleState.Expanded);
          adoGroup.iconPath = new vscode.ThemeIcon('azure');
          const totalCount = filteredAdo.length;
          adoGroup.description = this._getFilterDescription('ado:', totalCount);
          adoGroup.contextValue = 'ado-backend';
          adoGroup.id = `ado::f${fseq}`;
          items.push(adoGroup);
        } else {
          // Only ADO configured - show work items directly (since we only support one org+project)
          return this._getAdoRootItems(filteredAdo).map(wi => this.buildAdoItem(wi));
        }
      }

      // GitHub backend group
      if (hasGitHub) {
        if (backendCount > 1) {
          const ghGroup = new WorkItemsTreeItem('GitHub', vscode.TreeItemCollapsibleState.Expanded);
          ghGroup.iconPath = new vscode.ThemeIcon('github');
          const totalCount = [...filteredIssues.values()].flat().length;
          ghGroup.description = this._getFilterDescription('github:', totalCount);
          ghGroup.contextValue = 'github-backend';
          ghGroup.id = `github::f${fseq}`;
          items.push(ghGroup);
        } else {
          // Only GitHub configured - collapse if single repo
          if (filteredIssues.size === 1) {
            const [repoName, issues] = [...filteredIssues.entries()][0];
            // Check for milestone grouping
            const milestoneGroups = this._buildMilestoneGroupsForIssues(issues);
            if (milestoneGroups) return milestoneGroups;
            // Return issues directly
            return issues.map((i) => this.buildIssueItem(i));
          } else {
            // Multiple repos - show owner level
            return this._getGitHubOwnerNodes(filteredIssues);
          }
        }
      }

      return items;
    }

    // Handle backend group expansions
    if (element.contextValue === 'ado-backend') {
      return this._getAdoOrgNodes(this.applyAdoRuntimeFilter(this._adoItems));
    }

    if (element.contextValue === 'github-backend') {
      const filteredIssues = new Map<string, GitHubIssue[]>();
      for (const [repo, issues] of this._issues.entries()) {
        const filtered = this.applyRuntimeFilter(issues);
        if (filtered.length > 0) filteredIssues.set(repo, filtered);
      }
      return this._getGitHubOwnerNodes(filteredIssues);
    }

    // ADO org node
    if (element.contextValue === 'ado-org') {
      return this._getAdoProjectNodes(this.applyAdoRuntimeFilter(this._adoItems));
    }

    // ADO project node
    if (element.contextValue === 'ado-project') {
      const filteredAdo = this.applyAdoRuntimeFilter(this._adoItems);
      const projectFilter = this._levelFilters.get(element.id ?? '');
      let filtered = filteredAdo;
      if (projectFilter) {
        filtered = this._applyAdoLevelFilter(filteredAdo, projectFilter);
      }
      return this._getAdoRootItems(filtered).map(wi => this.buildAdoItem(wi));
    }

    // ADO parent item
    if (element.contextValue === 'ado-parent-item' && element.adoWorkItem) {
      const childIds = this._adoChildMap.get(element.adoWorkItem.id) ?? [];
      const filtered = this.applyAdoRuntimeFilter(this._adoItems);
      const filteredIdSet = new Set(filtered.map(wi => wi.id));
      return childIds
        .filter(id => filteredIdSet.has(id))
        .map(id => this.buildAdoItem(filtered.find(wi => wi.id === id)!));
    }

    // GitHub owner node
    if (element.contextValue === 'github-org') {
      const owner = element.id?.replace(/^github:|:f\d+$/g, '') ?? '';
      const filteredIssues = new Map<string, GitHubIssue[]>();
      for (const [repo, issues] of this._issues.entries()) {
        if (repo.startsWith(owner + '/')) {
          const filtered = this.applyRuntimeFilter(issues);
          if (filtered.length > 0) filteredIssues.set(repo, filtered);
        }
      }
      return this._getGitHubRepoNodes(filteredIssues, owner);
    }

    // GitHub repo node
    if (element.contextValue === 'github-repo') {
      const repoName = element.id?.replace(/^github:|:f\d+$/g, '') ?? '';
      const issues = this._issues.get(repoName) ?? [];
      let filtered = this.applyRuntimeFilter(issues);
      
      const repoFilter = this._levelFilters.get(element.id ?? '');
      if (repoFilter) {
        filtered = this._applyGitHubLevelFilter(filtered, repoFilter);
      }

      // Check for milestone grouping
      const milestoneGroups = this._buildMilestoneGroupsForIssues(filtered);
      if (milestoneGroups) return milestoneGroups;

      return filtered.map((i) => this.buildIssueItem(i));
    }

    // Milestone group
    if (element.contextValue === 'milestone-group') {
      const parts = element.id?.split(':') ?? [];
      // Format: ms:repoName:milestoneName:f{seq}
      const repoId = parts[1] ?? '';
      const msName = parts[2] ?? '';
      const issues = this._issues.get(repoId) ?? [];
      const filtered = this.applyRuntimeFilter(issues);
      const repoFilter = this._levelFilters.get(`github:${repoId}:f${this._filterSeq}`);
      const levelFiltered = repoFilter ? this._applyGitHubLevelFilter(filtered, repoFilter) : filtered;
      
      const msFiltered = msName === '__none__'
        ? levelFiltered.filter((i) => !i.milestone)
        : levelFiltered.filter((i) => i.milestone === msName);
      return msFiltered.map((i) => this.buildIssueItem(i));
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

  /**
   * Match GitHub issues by type filter.
   * Maps ADO-style types (e.g. "Bug") to GitHub's `type:bug` label convention.
   */
  private matchesTypeFilter(issueLabels: string[], types: string[]): boolean {
    const typeLabelPatterns = types.map(t => `type:${t.toLowerCase().replace(/\s+/g, '-')}`);
    return issueLabels.some(l => typeLabelPatterns.includes(l.toLowerCase()));
  }

  private applyRuntimeFilter(issues: GitHubIssue[]): GitHubIssue[] {
    if (!this.isFiltered) return issues;
    return issues.filter(issue => {
      if (this._filter.repos.length > 0 && !this._filter.repos.includes(issue.repository)) return false;
      if (this._filter.labels.length > 0 && !this.matchesLabelFilter(issue.labels, this._filter.labels)) return false;
      if (this._filter.states.length > 0 && !this._filter.states.includes(mapGitHubState(issue))) return false;
      if (this._filter.types.length > 0 && !this.matchesTypeFilter(issue.labels, this._filter.types)) return false;
      return true;
    });
  }

  private applyAdoRuntimeFilter(items: AdoWorkItem[]): AdoWorkItem[] {
    if (!this.isFiltered) return items;
    return items.filter(wi => {
      if (this._filter.repos.length > 0 && !this._filter.repos.includes('(ADO)')) return false;
      if (this._filter.labels.length > 0 && !this.matchesLabelFilter(wi.tags, this._filter.labels)) return false;
      if (this._filter.states.length > 0 && !this._filter.states.includes(mapAdoState(wi.state))) return false;
      if (this._filter.types.length > 0 && !this._filter.types.includes(wi.type)) return false;
      return true;
    });
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
    item.command = {
      command: 'vscode.open',
      title: 'Open in Browser',
      arguments: [vscode.Uri.parse(wi.url)],
    };
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

  private _getFilterDescription(nodeId: string, itemCount: number): string {
    const filter = this._levelFilters.get(nodeId);
    const parts: string[] = [];
    
    if (filter?.types && filter.types.length > 0) {
      parts.push(filter.types.join(', '));
    }
    if (filter?.labels && filter.labels.length > 0) {
      parts.push(filter.labels.join(', '));
    }
    if (filter?.states && filter.states.length > 0) {
      parts.push(filter.states.join(', '));
    }
    if (filter?.tags && filter.tags.length > 0) {
      parts.push(filter.tags.join(', '));
    }

    const countStr = `${itemCount} item${itemCount === 1 ? '' : 's'}`;
    return parts.length > 0 ? `${countStr} · ${parts.join(' · ')}` : countStr;
  }

  private _getAdoOrgNodes(filteredAdo: AdoWorkItem[]): WorkItemsTreeItem[] {
    if (!this._adoOrg) return [];
    
    const fseq = this._filterSeq;
    const orgItem = new WorkItemsTreeItem(this._adoOrg, vscode.TreeItemCollapsibleState.Expanded);
    orgItem.iconPath = new vscode.ThemeIcon('organization');
    orgItem.description = this._getFilterDescription(`ado:${this._adoOrg}`, filteredAdo.length);
    orgItem.contextValue = 'ado-org';
    orgItem.id = `ado:${this._adoOrg}:f${fseq}`;
    return [orgItem];
  }

  private _getAdoProjectNodes(filteredAdo: AdoWorkItem[]): WorkItemsTreeItem[] {
    if (!this._adoProject) return [];
    
    const fseq = this._filterSeq;
    const projectItem = new WorkItemsTreeItem(this._adoProject, vscode.TreeItemCollapsibleState.Expanded);
    projectItem.iconPath = new vscode.ThemeIcon('folder');
    projectItem.description = this._getFilterDescription(`ado:${this._adoOrg}:${this._adoProject}`, filteredAdo.length);
    projectItem.contextValue = 'ado-project';
    projectItem.id = `ado:${this._adoOrg}:${this._adoProject}:f${fseq}`;
    return [projectItem];
  }

  private _getGitHubOwnerNodes(filteredIssues: Map<string, GitHubIssue[]>): WorkItemsTreeItem[] {
    const owners = new Map<string, GitHubIssue[]>();
    for (const [repo, issues] of filteredIssues.entries()) {
      const owner = repo.split('/')[0];
      if (owner) {
        const existing = owners.get(owner) ?? [];
        existing.push(...issues);
        owners.set(owner, existing);
      }
    }

    const fseq = this._filterSeq;
    const items: WorkItemsTreeItem[] = [];
    for (const [owner, issues] of owners) {
      const ownerItem = new WorkItemsTreeItem(owner, vscode.TreeItemCollapsibleState.Expanded);
      ownerItem.iconPath = new vscode.ThemeIcon('organization');
      ownerItem.description = this._getFilterDescription(`github:${owner}`, issues.length);
      ownerItem.contextValue = 'github-org';
      ownerItem.id = `github:${owner}:f${fseq}`;
      items.push(ownerItem);
    }
    return items;
  }

  private _getGitHubRepoNodes(filteredIssues: Map<string, GitHubIssue[]>, owner: string): WorkItemsTreeItem[] {
    const fseq = this._filterSeq;
    const items: WorkItemsTreeItem[] = [];
    for (const [repo, issues] of filteredIssues.entries()) {
      if (repo.startsWith(owner + '/')) {
        const repoItem = new WorkItemsTreeItem(repo, vscode.TreeItemCollapsibleState.Expanded);
        repoItem.iconPath = new vscode.ThemeIcon('repo');
        repoItem.description = this._getFilterDescription(`github:${repo}`, issues.length);
        repoItem.contextValue = 'github-repo';
        repoItem.id = `github:${repo}:f${fseq}`;
        items.push(repoItem);
      }
    }
    return items;
  }

  private _applyAdoLevelFilter(items: AdoWorkItem[], filter: LevelFilter): AdoWorkItem[] {
    return items.filter(wi => {
      if (filter.types && filter.types.length > 0 && !filter.types.includes(wi.type)) return false;
      if (filter.tags && filter.tags.length > 0 && !this.matchesLabelFilter(wi.tags, filter.tags)) return false;
      if (filter.states && filter.states.length > 0 && !filter.states.includes(mapAdoState(wi.state))) return false;
      return true;
    });
  }

  private _applyGitHubLevelFilter(issues: GitHubIssue[], filter: LevelFilter): GitHubIssue[] {
    return issues.filter(issue => {
      if (filter.labels && filter.labels.length > 0 && !this.matchesLabelFilter(issue.labels, filter.labels)) return false;
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
