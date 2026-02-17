import * as vscode from 'vscode';
import { GitHubPR, fetchMyPRs, isGhAvailable } from './github-client';
import type { AdoPR } from './ado-client';

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
    const fetches: Promise<void>[] = [];

    // GitHub fetch — only if gh CLI is available and repos configured
    if (this._repos.length > 0) {
      const ghOk = await isGhAvailable();
      if (ghOk) {
        fetches.push(
          ...this._repos.map(async (repo) => {
            const prs = await fetchMyPRs(repo);
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

      const hasGitHub = this._prs.size > 0;
      const hasAdo = this._adoPRs.length > 0;

      if (!hasGitHub && !hasAdo) {
        const item = new PRsTreeItem('No open PRs');
        item.iconPath = new vscode.ThemeIcon('check');
        return [item];
      }

      const items: PRsTreeItem[] = [];

      if (hasAdo) {
        if (hasGitHub) {
          const adoGroup = new PRsTreeItem('Azure DevOps', vscode.TreeItemCollapsibleState.Expanded);
          adoGroup.iconPath = new vscode.ThemeIcon('azure');
          adoGroup.description = `${this._adoPRs.length} PR${this._adoPRs.length === 1 ? '' : 's'}`;
          adoGroup.contextValue = 'ado-pr-group';
          adoGroup.id = 'pr:ado';
          items.push(adoGroup);
        } else {
          return this._adoPRs.map(p => this.buildAdoPRItem(p));
        }
      }

      if (hasGitHub) {
        if (this._prs.size === 1 && !hasAdo) {
          const [, prs] = [...this._prs.entries()][0];
          return prs.map((p) => this.buildPRItem(p));
        }

        for (const [repo, prs] of this._prs.entries()) {
          const repoItem = new PRsTreeItem(repo, vscode.TreeItemCollapsibleState.Expanded);
          repoItem.iconPath = new vscode.ThemeIcon('github');
          repoItem.description = `${prs.length} PR${prs.length === 1 ? '' : 's'}`;
          repoItem.contextValue = 'repo-group';
          repoItem.id = `pr:${repo}`;
          items.push(repoItem);
        }
      }

      return items;
    }

    if (element.contextValue === 'ado-pr-group') {
      return this._adoPRs.map(p => this.buildAdoPRItem(p));
    }

    const repoId = element.id?.replace('pr:', '');
    if (repoId && this._prs.has(repoId)) {
      return this._prs.get(repoId)!.map((p) => this.buildPRItem(p));
    }

    return [];
  }

  private derivePRState(pr: GitHubPR): string {
    if (pr.isDraft) return 'draft';
    if (pr.state === 'MERGED') return 'merged';
    if (pr.state === 'CLOSED') return 'closed';
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
