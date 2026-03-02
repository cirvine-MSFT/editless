import * as vscode from 'vscode';
import { GitHubPR, fetchMyPRs, isGhAvailable } from './github-client';
import type { AdoPR } from './ado-client';
import { BaseTreeProvider } from './base-tree-provider';

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

export class PRsTreeProvider extends BaseTreeProvider<GitHubPR, AdoPR, PRsTreeItem, PRLevelFilter> {
  protected readonly _ghIdPrefix = 'github-pr';
  protected readonly _adoIdPrefix = 'ado-pr';
  protected readonly _itemCountSuffix: [string, string] = ['PR', 'PRs'];
  protected readonly _emptyMessage = 'No open PRs';

  private _prs = new Map<string, GitHubPR[]>();
  private _adoPRs: AdoPR[] = [];
  private _filter: PRsFilter = { repos: [], labels: [], statuses: [], author: '' };
  private _adoMe: string | undefined;

  setAdoMe(me: string): void {
    this._adoMe = me;
  }

  setAdoPRs(prs: AdoPR[]): void {
    this._adoPRs = prs;
    this._adoConfigured = true;
    this._onDidChangeTreeData.fire();
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

  getFilterDescription(): string {
    const parts: string[] = [];
    if (this._filter.author) parts.push('author:me');
    if (this._filter.repos.length > 0) parts.push(`repo:${this._filter.repos.join(',')}`);
    if (this._filter.statuses.length > 0) parts.push(`status:${this._filter.statuses.join(',')}`);
    if (this._filter.labels.length > 0) parts.push(`label:${this._filter.labels.join(',')}`);
    return parts.join(' · ');
  }

  protected _updateDescription(): void {
    if (!this._treeView) return;
    if (!this.isFiltered) {
      this._treeView.description = undefined;
      return;
    }
    this._treeView.description = this.getFilterDescription();
  }

  getAvailableOptions(nodeId: string, contextValue: string): { owners?: string[]; repos?: string[]; orgs?: string[]; projects?: string[]; statuses?: string[]; labels?: string[] } {
    const base = this._getAvailableOptionsBase(nodeId, contextValue);
    if (base) return base;

    const cleanId = nodeId.replace(/:f\d+$/, '');
    const baseContext = contextValue.replace(/-filtered$/, '');

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

    if (baseContext === 'ado-pr-project') {
      return {
        statuses: ['draft', 'open', 'merged'],
      };
    }

    return {};
  }

  protected _createTreeItem(label: string, collapsible?: vscode.TreeItemCollapsibleState): PRsTreeItem {
    return new PRsTreeItem(label, collapsible);
  }

  protected _getLevelFilterParts(filter: PRLevelFilter): string[] {
    const parts: string[] = [];
    if (filter.statuses && filter.statuses.length > 0) parts.push(filter.statuses.join(', '));
    if (filter.labels && filter.labels.length > 0) parts.push(filter.labels.join(', '));
    return parts;
  }

  protected _getGitHubItemsMap(): Map<string, GitHubPR[]> {
    return this._prs;
  }

  protected _getAdoItemsList(): AdoPR[] {
    return this._adoPRs;
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

  protected async _doFetchAll(): Promise<void> {
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
  }

  protected _getRootGitHubSingleBackend(filteredItems: Map<string, GitHubPR[]>): PRsTreeItem[] {
    // Always show owner→repo hierarchy for PRs
    return this._getGitHubOwnerNodes(filteredItems);
  }

  protected _getChildrenForContext(element: PRsTreeItem, ctx: string): PRsTreeItem[] {
    // ADO project → PR items
    if (ctx === 'ado-pr-project') {
      let filtered = this.applyAdoRuntimeFilter(this._adoPRs);
      const projectFilter = this._levelFilters.get(this._cleanNodeId(element.id ?? ''));
      if (projectFilter) {
        filtered = this._applyAdoLevelFilter(filtered, projectFilter);
      }
      return filtered.map(p => this.buildAdoPRItem(p));
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

  protected _clearAdoData(): void {
    this._adoPRs = [];
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
