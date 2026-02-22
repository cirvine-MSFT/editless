import * as vscode from 'vscode';
import { GitHubPR, fetchMyPRs, isGhAvailable } from './github-client';
import type { AdoPR } from './ado-client';

export interface PRsFilter {
  repos: string[];
  labels: string[];
  statuses: string[];
  author: string;
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
  private _filterSeq = 0;
  private _treeView?: vscode.TreeView<PRsTreeItem>;
  private _allLabels = new Set<string>();

  setRepos(repos: string[]): void {
    this._repos = repos;
    this.fetchAll();
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

      if (hasAdo) {
        if (hasGitHub) {
          const adoGroup = new PRsTreeItem('Azure DevOps', vscode.TreeItemCollapsibleState.Expanded);
          adoGroup.iconPath = new vscode.ThemeIcon('azure');
          adoGroup.description = `${filteredAdoPRs.length} PR${filteredAdoPRs.length === 1 ? '' : 's'}`;
          adoGroup.contextValue = 'ado-pr-group';
          adoGroup.id = `pr:ado:f${fseq}`;
          items.push(adoGroup);
        } else {
          return filteredAdoPRs.map(p => this.buildAdoPRItem(p));
        }
      }

      if (hasGitHub) {
        if (filteredPRs.size === 1 && !hasAdo) {
          const [, prs] = [...filteredPRs.entries()][0];
          return prs.map((p) => this.buildPRItem(p));
        }

        for (const [repo, prs] of filteredPRs.entries()) {
          const repoItem = new PRsTreeItem(repo, vscode.TreeItemCollapsibleState.Expanded);
          repoItem.iconPath = new vscode.ThemeIcon('github');
          repoItem.description = `${prs.length} PR${prs.length === 1 ? '' : 's'}`;
          repoItem.contextValue = 'repo-group';
          repoItem.id = `pr:${repo}:f${fseq}`;
          items.push(repoItem);
        }
      }

      return items;
    }

    if (element.contextValue === 'ado-pr-group') {
      return this.applyAdoRuntimeFilter(this._adoPRs).map(p => this.buildAdoPRItem(p));
    }

    const repoId = element.id?.replace(/^pr:|:f\d+$/g, '');
    if (repoId && this._prs.has(repoId)) {
      return this.applyRuntimeFilter(this._prs.get(repoId)!).map((p) => this.buildPRItem(p));
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
    if (!this.isFiltered) return prs;
    return prs.filter(pr => {
      if (this._filter.repos.length > 0 && !this._filter.repos.includes(pr.repository)) return false;
      if (this._filter.labels.length > 0 && !this.matchesLabelFilter(pr.labels, this._filter.labels)) return false;
      if (this._filter.statuses.length > 0 && !this._filter.statuses.includes(this.derivePRState(pr))) return false;
      return true;
    });
  }

  applyAdoRuntimeFilter(prs: AdoPR[]): AdoPR[] {
    if (!this.isFiltered) return prs;
    return prs.filter(pr => {
      if (this._filter.repos.length > 0 && !this._filter.repos.includes('(ADO)')) return false;
      if (this._filter.statuses.length > 0) {
        const state = pr.isDraft ? 'draft' : pr.status;
        if (!this._filter.statuses.includes(state)) return false;
      }
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
    item.command = {
      command: 'vscode.open',
      title: 'Open in Browser',
      arguments: [vscode.Uri.parse(pr.url)],
    };
    return item;
  }

  private buildAdoPRItem(pr: AdoPR): PRsTreeItem {
    const item = new PRsTreeItem(`#${pr.id} ${pr.title}`);
    item.adoPR = pr;
    const stateLabel = pr.isDraft ? 'draft' : pr.status;
    item.description = `${stateLabel} · ${pr.sourceRef} → ${pr.targetRef}`;
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
    item.command = {
      command: 'vscode.open',
      title: 'Open in Browser',
      arguments: [vscode.Uri.parse(pr.url)],
    };
    return item;
  }
}
