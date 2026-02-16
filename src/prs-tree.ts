import * as vscode from 'vscode';
import { GitHubPR, fetchMyPRs, isGhAvailable } from './github-client';

export class PRsTreeItem extends vscode.TreeItem {
  public pr?: GitHubPR;

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
  private _loading = false;

  setRepos(repos: string[]): void {
    this._repos = repos;
    this.fetchAll();
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
    this._prs.clear();
    this._onDidChangeTreeData.fire();

    const ghOk = await isGhAvailable();
    if (!ghOk) {
      this._loading = false;
      this._onDidChangeTreeData.fire();
      return;
    }

    await Promise.all(
      this._repos.map(async (repo) => {
        const prs = await fetchMyPRs(repo);
        if (prs.length > 0) {
          this._prs.set(repo, prs);
        }
      }),
    );

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
      if (this._loading) {
        const item = new PRsTreeItem('Loading...');
        item.iconPath = new vscode.ThemeIcon('loading~spin');
        return [item];
      }

      if (this._repos.length === 0) {
        const item = new PRsTreeItem('Configure GitHub repos in settings');
        item.iconPath = new vscode.ThemeIcon('info');
        item.command = {
          command: 'editless.configureRepos',
          title: 'Configure GitHub Repos',
        };
        return [item];
      }

      if (this._prs.size === 0) {
        const item = new PRsTreeItem('No open PRs');
        item.iconPath = new vscode.ThemeIcon('check');
        return [item];
      }

      if (this._prs.size === 1) {
        const [, prs] = [...this._prs.entries()][0];
        return prs.map((p) => this.buildPRItem(p));
      }

      return [...this._prs.entries()].map(([repo, prs]) => {
        const item = new PRsTreeItem(repo, vscode.TreeItemCollapsibleState.Expanded);
        item.iconPath = new vscode.ThemeIcon('repo');
        item.description = `${prs.length} PR${prs.length === 1 ? '' : 's'}`;
        item.contextValue = 'repo-group';
        item.id = `pr:${repo}`;
        return item;
      });
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
}
