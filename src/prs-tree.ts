import * as vscode from 'vscode';
import { GitHubPR, fetchMyPRs, isGhAvailable } from './github-client';
import type { AdoPR } from './ado-client';

/** Map ADO raw status to user-facing label (e.g. "active" → "open") */
function deriveAdoState(pr: AdoPR): string {
  if (pr.isDraft) return 'draft';
  if (pr.status === 'active') return 'open';
  return pr.status;
}

export interface PRsFilter {
  repos: string[];
  labels: string[];
  statuses: string[];
  author: string;
}

export interface PRLevelFilter {
  selectedChildren?: string[];
  statuses?: string[];
  labels?: string[];
}

export class PRsTreeItem extends vscode.TreeItem {
  public pr?: GitHubPR;
  public adoPR?: AdoPR;

  constructor(
    label: string,
    collapsible: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
  ) {
    super(label, collapsible);
  }
}

export class PRsTreeProvider implements vscode.TreeDataProvider<PRsTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<PRsTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _repos: string[] = [];
  private _prs = new Map<string, GitHubPR[]>();
  private _adoPRs: AdoPR[] = [];
  private _adoConfigured = false;
  private _loading = false;
  private _filter: PRsFilter = { repos: [], labels: [], statuses: [], author: '' };
  private _levelFilters = new Map<string, PRLevelFilter>();
  private _filterSeq = 0;
  private _treeView?: vscode.TreeView<PRsTreeItem>;
  private _allLabels = new Set<string>();
  private _adoOrg: string | undefined;
  private _adoProject: string | undefined;
  private _adoMe: string | undefined;

  setRepos(repos: string[]): void {
    this._repos = repos;
    this.fetchAll();
  }

  setAdoConfig(org: string | undefined, project: string | undefined): void {
    this._adoOrg = org;
    this._adoProject = project;
  }

  setAdoMe(me: string): void {
    this._adoMe = me;
  }

  setAdoPRs(prs: AdoPR[]): void {
    this._adoPRs = prs;
    this._adoConfigured = true;
    this._onDidChangeTreeData.fire();
  }

  clearAdo(): void {
    this._adoPRs = [];
    this._adoConfigured = false;
    this._onDidChangeTreeData.fire();
  }

  setTreeView(view: vscode.TreeView<PRsTreeItem>): void {
    this._treeView = view;
    this._updateDescription();
  }

  get filter(): PRsFilter {
    return { ...this._filter };
  }

  get isFiltered(): boolean {
    return this._filter.repos.length > 0 || this._filter.labels.length > 0 || this._filter.statuses.length > 0 || this._filter.author !== '';
  }

  setFilter(filter: PRsFilter): void {
    const authorChanged = this._filter.author !== filter.author;
    this._filter = { ...filter };
    this._filterSeq++;
    vscode.commands.executeCommand('setContext', 'editless.prsFiltered', this.isFiltered);
    vscode.commands.executeCommand('setContext', 'editless.prsMyOnly', filter.author !== '');
    this._updateDescription();
    if (authorChanged) {
      this.fetchAll();
    } else {
      this._onDidChangeTreeData.fire();
    }
  }

  clearFilter(): void {
    this.setFilter({ repos: [], labels: [], statuses: [], author: '' });
  }

  private _cleanNodeId(id: string): string { return id.replace(/:f\d+$/, ''); }

  getLevelFilter(nodeId: string): PRLevelFilter | undefined {
    return this._levelFilters.get(this._cleanNodeId(nodeId));
  }

  setLevelFilter(nodeId: string, filter: PRLevelFilter): void {
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

  private _contextWithFilter(base: string, nodeId: string): string {
    return this._levelFilters.has(this._cleanNodeId(nodeId)) ? `${base}-filtered` : base;
  }

  getAvailableOptions(nodeId: string, contextValue: string): { owners?: string[]; repos?: string[]; orgs?: string[]; projects?: string[]; statuses?: string[]; labels?: string[] } {
    // Strip :f{seq} suffix from node IDs and -filtered from contextValue before data lookup
    const cleanId = nodeId.replace(/:f\d+$/, '');
    const baseContext = contextValue.replace(/-filtered$/, '');
    if (baseContext === 'github-pr-backend') {
      const owners = new Set<string>();
      for (const repo of this._repos) {
        const owner = repo.split('/')[0];
        if (owner) owners.add(owner);
      }
      return { owners: [...owners].sort() };
    }

    if (baseContext === 'github-pr-org') {
      const owner = cleanId.replace('github-pr:', '');
      const repos = this._repos.filter(r => r.startsWith(owner + '/'));
      return { repos };
    }

    if (baseContext === 'github-pr-repo') {
      const repoName = cleanId.replace('github-pr:', '');
      const prs = this._prs.get(repoName) ?? [];
      const labels = new Set<string>();
      for (const pr of prs) {
        for (const label of pr.labels) labels.add(label);
      }
      return {
        statuses: ['draft', 'open', 'approved', 'changes-requested', 'auto-merge'],
        labels: [...labels].sort(),
      };
    }

    if (baseContext === 'ado-pr-backend') {
      return { orgs: this._adoOrg ? [this._adoOrg] : [] };
    }

    if (baseContext === 'ado-pr-org') {
      return { projects: this._adoProject ? [this._adoProject] : [] };
    }

    if (baseContext === 'ado-pr-project') {
      return {
        statuses: ['draft', 'open', 'merged'],
      };
    }

    return {};
  }

  private _updateDescription(): void {
    if (!this._treeView) return;
    if (!this.isFiltered) {
      this._treeView.description = undefined;
      return;
    }
    this._treeView.description = this.getFilterDescription();
  }

  getFilterDescription(): string {
    const parts: string[] = [];
    if (this._filter.author) parts.push('author:me');
    if (this._filter.repos.length > 0) parts.push(`repo:${this._filter.repos.join(',')}`);
    if (this._filter.statuses.length > 0) parts.push(`status:${this._filter.statuses.join(',')}`);
    if (this._filter.labels.length > 0) parts.push(`label:${this._filter.labels.join(',')}`);
    return parts.join(' · ');
  }

  getAllLabels(): string[] {
    const labels = new Set(this._allLabels);
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

    const nextPrs = new Map<string, GitHubPR[]>();
    const nextLabels = new Set<string>();
    const fetches: Promise<void>[] = [];

    // GitHub fetch — only if gh CLI is available and repos configured
    if (this._repos.length > 0) {
      const ghOk = await isGhAvailable();
      if (ghOk) {
        fetches.push(
          ...this._repos.map(async (repo) => {
            const author = this._filter.author || undefined;
            const prs = await fetchMyPRs(repo, author);
            for (const pr of prs) {
              for (const label of pr.labels) nextLabels.add(label);
            }
            if (prs.length > 0) {
              nextPrs.set(repo, prs);
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

    this._prs = nextPrs;
    this._allLabels = nextLabels;
    this._loading = false;
    this._onDidChangeTreeData.fire();
    if (this._pendingRefresh) {
      this._pendingRefresh = false;
      this.fetchAll();
    }
  }

  getTreeItem(element: PRsTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: PRsTreeItem): PRsTreeItem[] {
    if (!element) {
      if (this._loading && this._prs.size === 0 && this._adoPRs.length === 0) {
        const item = new PRsTreeItem('Loading...');
        item.iconPath = new vscode.ThemeIcon('loading~spin');
        return [item];
      }

      if (this._repos.length === 0 && !this._adoConfigured) {
        const ghItem = new PRsTreeItem('Configure in GitHub');
        ghItem.iconPath = new vscode.ThemeIcon('github');
        ghItem.command = {
          command: 'editless.configureRepos',
          title: 'Configure GitHub Repos',
        };

        const adoItem = new PRsTreeItem('Configure in ADO');
        adoItem.iconPath = new vscode.ThemeIcon('azure');
        adoItem.command = {
          command: 'editless.configureAdo',
          title: 'Configure Azure DevOps',
        };

        return [ghItem, adoItem];
      }

      // Apply runtime filters
      const filteredPRs = new Map<string, GitHubPR[]>();
      for (const [repo, prs] of this._prs.entries()) {
        const filtered = this.applyRuntimeFilter(prs);
        if (filtered.length > 0) filteredPRs.set(repo, filtered);
      }
      const filteredAdoPRs = this.applyAdoRuntimeFilter(this._adoPRs);

      const hasGitHub = filteredPRs.size > 0;
      const hasAdo = filteredAdoPRs.length > 0;

      if (!hasGitHub && !hasAdo) {
        const msg = this.isFiltered ? 'No PRs match current filter' : 'No open PRs';
        const icon = this.isFiltered ? 'filter' : 'check';
        const item = new PRsTreeItem(msg);
        item.iconPath = new vscode.ThemeIcon(icon);
        return [item];
      }

      const items: PRsTreeItem[] = [];
      const fseq = this._filterSeq;
      const backendCount = (hasGitHub ? 1 : 0) + (hasAdo ? 1 : 0);

      // ADO backend group
      if (hasAdo) {
        if (backendCount > 1) {
          const adoGroup = new PRsTreeItem('Azure DevOps', vscode.TreeItemCollapsibleState.Expanded);
          adoGroup.iconPath = new vscode.ThemeIcon('azure');
          adoGroup.description = this._getFilterDescription('ado-pr:', filteredAdoPRs.length);
          adoGroup.contextValue = this._contextWithFilter('ado-pr-backend', 'ado-pr:');
          adoGroup.id = `ado-pr::f${fseq}`;
          items.push(adoGroup);
        } else {
          // Only ADO — show org→project hierarchy
          return this._getAdoOrgNodes(filteredAdoPRs);
        }
      }

      // GitHub backend group
      if (hasGitHub) {
        if (backendCount > 1) {
          const ghGroup = new PRsTreeItem('GitHub', vscode.TreeItemCollapsibleState.Expanded);
          ghGroup.iconPath = new vscode.ThemeIcon('github');
          const totalCount = [...filteredPRs.values()].flat().length;
          ghGroup.description = this._getFilterDescription('github-pr:', totalCount);
          ghGroup.contextValue = this._contextWithFilter('github-pr-backend', 'github-pr:');
          ghGroup.id = `github-pr::f${fseq}`;
          items.push(ghGroup);
        } else {
          // Only GitHub — always show owner→repo hierarchy
          return this._getGitHubOwnerNodes(filteredPRs);
        }
      }

      return items;
    }

    // Strip -filtered suffix for dispatch
    const ctx = element.contextValue?.replace(/-filtered$/, '') ?? '';

    // ADO backend → org nodes
    if (ctx === 'ado-pr-backend') {
      return this._getAdoOrgNodes(this.applyAdoRuntimeFilter(this._adoPRs));
    }

    // ADO org → project nodes
    if (ctx === 'ado-pr-org') {
      return this._getAdoProjectNodes(this.applyAdoRuntimeFilter(this._adoPRs));
    }

    // ADO project → PR items
    if (ctx === 'ado-pr-project') {
      let filtered = this.applyAdoRuntimeFilter(this._adoPRs);
      const projectFilter = this._levelFilters.get(this._cleanNodeId(element.id ?? ''));
      if (projectFilter) {
        filtered = this._applyAdoLevelFilter(filtered, projectFilter);
      }
      return filtered.map(p => this.buildAdoPRItem(p));
    }

    // GitHub backend → owner nodes
    if (ctx === 'github-pr-backend') {
      const filteredPRs = new Map<string, GitHubPR[]>();
      for (const [repo, prs] of this._prs.entries()) {
        const filtered = this.applyRuntimeFilter(prs);
        if (filtered.length > 0) filteredPRs.set(repo, filtered);
      }
      return this._getGitHubOwnerNodes(filteredPRs);
    }

    // GitHub owner → repo nodes
    if (ctx === 'github-pr-org') {
      const owner = element.id?.replace(/^github-pr:|:f\d+$/g, '') ?? '';
      const filteredPRs = new Map<string, GitHubPR[]>();
      for (const [repo, prs] of this._prs.entries()) {
        if (repo.startsWith(owner + '/')) {
          const filtered = this.applyRuntimeFilter(prs);
          if (filtered.length > 0) filteredPRs.set(repo, filtered);
        }
      }
      return this._getGitHubRepoNodes(filteredPRs, owner);
    }

    // GitHub repo → PR items
    if (ctx === 'github-pr-repo') {
      const repoName = element.id?.replace(/^github-pr:|:f\d+$/g, '') ?? '';
      let filtered = this.applyRuntimeFilter(this._prs.get(repoName) ?? []);
      const repoFilter = this._levelFilters.get(this._cleanNodeId(element.id ?? ''));
      if (repoFilter) {
        filtered = this._applyGitHubLevelFilter(filtered, repoFilter);
      }
      return filtered.map((p) => this.buildPRItem(p));
    }

    return [];
  }

  derivePRState(pr: GitHubPR): string {
    if (pr.isDraft) return 'draft';
    if (pr.state === 'MERGED') return 'merged';
    if (pr.state === 'CLOSED') return 'closed';
    if (pr.autoMergeRequest) return 'auto-merge';
    if (pr.reviewDecision === 'APPROVED') return 'approved';
    if (pr.reviewDecision === 'CHANGES_REQUESTED') return 'changes-requested';
    return 'open';
  }

  private prStateIcon(state: string): vscode.ThemeIcon {
    switch (state) {
      case 'draft':
        return new vscode.ThemeIcon('git-pull-request-draft');
      case 'merged':
        return new vscode.ThemeIcon('git-merge');
      case 'closed':
        return new vscode.ThemeIcon('git-pull-request-closed');
      case 'approved':
        return new vscode.ThemeIcon('git-pull-request-go-to-changes');
      case 'changes-requested':
        return new vscode.ThemeIcon('git-pull-request-create');
      case 'auto-merge':
        return new vscode.ThemeIcon('git-pull-request');
      default:
        return new vscode.ThemeIcon('git-pull-request');
    }
  }

  private hasConflicts(pr: GitHubPR): boolean {
    return pr.mergeable === 'CONFLICTING';
  }

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

  applyRuntimeFilter(prs: GitHubPR[]): GitHubPR[] {
    return prs.filter(pr => {
      const state = this.derivePRState(pr);
      // Default exclusion: hide merged/closed unless user explicitly includes them
      if (this._filter.statuses.length === 0 && (state === 'merged' || state === 'closed')) return false;
      if (this._filter.repos.length > 0 && !this._filter.repos.includes(pr.repository)) return false;
      if (this._filter.labels.length > 0 && !this.matchesLabelFilter(pr.labels, this._filter.labels)) return false;
      if (this._filter.statuses.length > 0 && !this._filter.statuses.includes(state)) return false;
      return true;
    });
  }

  applyAdoRuntimeFilter(prs: AdoPR[]): AdoPR[] {
    return prs.filter(pr => {
      const state = deriveAdoState(pr);
      // Default exclusion: hide merged/closed unless user explicitly includes them
      if (this._filter.statuses.length === 0 && (state === 'merged' || state === 'closed')) return false;
      if (this._filter.repos.length > 0 && !this._filter.repos.includes('(ADO)')) return false;
      if (this._filter.statuses.length > 0 && !this._filter.statuses.includes(state)) return false;
      if (this._filter.author && this._adoMe && pr.createdBy.toLowerCase() !== this._adoMe.toLowerCase()) return false;
      return true;
    });
  }

  private buildPRItem(pr: GitHubPR): PRsTreeItem {
    const state = this.derivePRState(pr);
    const conflicts = this.hasConflicts(pr);
    const item = new PRsTreeItem(`#${pr.number} ${pr.title}`);
    item.pr = pr;
    item.description = conflicts
      ? `${state} · ⚠️ has conflicts · ${pr.headRef} → ${pr.baseRef}`
      : `${state} · ${pr.headRef} → ${pr.baseRef}`;
    item.iconPath = conflicts
      ? new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'))
      : this.prStateIcon(state);
    item.contextValue = 'pull-request';
    const tooltipLines = [
      `**#${pr.number} ${pr.title}**`,
      `State: ${state}`,
      `Branch: \`${pr.headRef}\` → \`${pr.baseRef}\``,
    ];
    if (conflicts) {
      tooltipLines.push('⚠️ **This PR has merge conflicts**');
    }
    item.tooltip = new vscode.MarkdownString(tooltipLines.join('\n\n'));
    return item;
  }

  private buildAdoPRItem(pr: AdoPR): PRsTreeItem {
    const item = new PRsTreeItem(`#${pr.id} ${pr.title}`);
    item.adoPR = pr;
    const stateLabel = deriveAdoState(pr);
    const authorSuffix = !this._filter.author && pr.createdBy ? ` · ${pr.createdBy}` : '';
    item.description = `${stateLabel} · ${pr.sourceRef} → ${pr.targetRef}${authorSuffix}`;
    item.iconPath = pr.isDraft
      ? new vscode.ThemeIcon('git-pull-request-draft')
      : pr.status === 'merged'
        ? new vscode.ThemeIcon('git-merge')
        : new vscode.ThemeIcon('git-pull-request');
    item.contextValue = 'ado-pull-request';
    item.tooltip = new vscode.MarkdownString(
      [
        `**#${pr.id} ${pr.title}**`,
        `State: ${stateLabel}`,
        `Branch: \`${pr.sourceRef}\` → \`${pr.targetRef}\``,
        `Repo: ${pr.repository}`,
        pr.reviewers.length > 0 ? `Reviewers: ${pr.reviewers.join(', ')}` : '',
      ].filter(Boolean).join('\n\n'),
    );
    return item;
  }

  private _getFilterDescription(nodeId: string, itemCount: number): string {
    const filter = this._levelFilters.get(this._cleanNodeId(nodeId));
    const parts: string[] = [];

    if (filter?.statuses && filter.statuses.length > 0) {
      parts.push(filter.statuses.join(', '));
    }
    if (filter?.labels && filter.labels.length > 0) {
      parts.push(filter.labels.join(', '));
    }

    const countStr = `${itemCount} PR${itemCount === 1 ? '' : 's'}`;
    return parts.length > 0 ? `${countStr} · ${parts.join(' · ')}` : countStr;
  }

  private _getAdoOrgNodes(filteredAdo: AdoPR[]): PRsTreeItem[] {
    if (!this._adoOrg) return [];

    const fseq = this._filterSeq;
    const orgItem = new PRsTreeItem(this._adoOrg, vscode.TreeItemCollapsibleState.Expanded);
    orgItem.iconPath = new vscode.ThemeIcon('organization');
    orgItem.description = this._getFilterDescription(`ado-pr:${this._adoOrg}`, filteredAdo.length);
    orgItem.contextValue = this._contextWithFilter('ado-pr-org', `ado-pr:${this._adoOrg}`);
    orgItem.id = `ado-pr:${this._adoOrg}:f${fseq}`;
    return [orgItem];
  }

  private _getAdoProjectNodes(filteredAdo: AdoPR[]): PRsTreeItem[] {
    if (!this._adoProject) return [];

    const fseq = this._filterSeq;
    const projectItem = new PRsTreeItem(this._adoProject, vscode.TreeItemCollapsibleState.Expanded);
    projectItem.iconPath = new vscode.ThemeIcon('folder');
    projectItem.description = this._getFilterDescription(`ado-pr:${this._adoOrg}:${this._adoProject}`, filteredAdo.length);
    projectItem.contextValue = this._contextWithFilter('ado-pr-project', `ado-pr:${this._adoOrg}:${this._adoProject}`);
    projectItem.id = `ado-pr:${this._adoOrg}:${this._adoProject}:f${fseq}`;
    return [projectItem];
  }

  private _getGitHubOwnerNodes(filteredPRs: Map<string, GitHubPR[]>): PRsTreeItem[] {
    const owners = new Map<string, GitHubPR[]>();
    for (const [repo, prs] of filteredPRs.entries()) {
      const owner = repo.split('/')[0];
      if (owner) {
        const existing = owners.get(owner) ?? [];
        existing.push(...prs);
        owners.set(owner, existing);
      }
    }

    const fseq = this._filterSeq;
    const items: PRsTreeItem[] = [];
    for (const [owner, prs] of owners) {
      const ownerItem = new PRsTreeItem(owner, vscode.TreeItemCollapsibleState.Expanded);
      ownerItem.iconPath = new vscode.ThemeIcon('organization');
      ownerItem.description = this._getFilterDescription(`github-pr:${owner}`, prs.length);
      ownerItem.contextValue = this._contextWithFilter('github-pr-org', `github-pr:${owner}`);
      ownerItem.id = `github-pr:${owner}:f${fseq}`;
      items.push(ownerItem);
    }
    return items;
  }

  private _getGitHubRepoNodes(filteredPRs: Map<string, GitHubPR[]>, owner: string): PRsTreeItem[] {
    const fseq = this._filterSeq;
    const items: PRsTreeItem[] = [];
    for (const [repo, prs] of filteredPRs.entries()) {
      if (repo.startsWith(owner + '/')) {
        const repoItem = new PRsTreeItem(repo, vscode.TreeItemCollapsibleState.Expanded);
        repoItem.iconPath = new vscode.ThemeIcon('repo');
        repoItem.description = this._getFilterDescription(`github-pr:${repo}`, prs.length);
        repoItem.contextValue = this._contextWithFilter('github-pr-repo', `github-pr:${repo}`);
        repoItem.id = `github-pr:${repo}:f${fseq}`;
        items.push(repoItem);
      }
    }
    return items;
  }

  private _applyAdoLevelFilter(prs: AdoPR[], filter: PRLevelFilter): AdoPR[] {
    return prs.filter(pr => {
      const state = deriveAdoState(pr);
      if ((!filter.statuses || filter.statuses.length === 0) && (state === 'merged' || state === 'closed')) return false;
      if (filter.statuses && filter.statuses.length > 0 && !filter.statuses.includes(state)) return false;
      return true;
    });
  }

  private _applyGitHubLevelFilter(prs: GitHubPR[], filter: PRLevelFilter): GitHubPR[] {
    return prs.filter(pr => {
      const state = this.derivePRState(pr);
      if ((!filter.statuses || filter.statuses.length === 0) && (state === 'merged' || state === 'closed')) return false;
      if (filter.statuses && filter.statuses.length > 0 && !filter.statuses.includes(state)) return false;
      if (filter.labels && filter.labels.length > 0 && !this.matchesLabelFilter(pr.labels, filter.labels)) return false;
      return true;
    });
  }
}
