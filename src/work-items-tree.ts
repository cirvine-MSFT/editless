import * as vscode from 'vscode';
import { GitHubIssue, fetchAssignedIssues, isGhAvailable } from './github-client';

export class WorkItemsTreeItem extends vscode.TreeItem {
  public issue?: GitHubIssue;

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
    this._issues.clear();
    this._onDidChangeTreeData.fire();

    const ghOk = await isGhAvailable();
    if (!ghOk) {
      this._loading = false;
      this._onDidChangeTreeData.fire();
      return;
    }

    await Promise.all(
      this._repos.map(async (repo) => {
        const issues = await fetchAssignedIssues(repo);
        if (issues.length > 0) {
          this._issues.set(repo, issues);
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

  getTreeItem(element: WorkItemsTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: WorkItemsTreeItem): WorkItemsTreeItem[] {
    if (!element) {
      if (this._loading) {
        const item = new WorkItemsTreeItem('Loading...');
        item.iconPath = new vscode.ThemeIcon('loading~spin');
        return [item];
      }

      if (this._repos.length === 0) {
        const item = new WorkItemsTreeItem('Configure GitHub repos in settings');
        item.iconPath = new vscode.ThemeIcon('info');
        return [item];
      }

      if (this._issues.size === 0) {
        const item = new WorkItemsTreeItem('No assigned issues found');
        item.iconPath = new vscode.ThemeIcon('check');
        return [item];
      }

      if (this._issues.size === 1) {
        const [, issues] = [...this._issues.entries()][0];
        return issues.map((i) => this.buildIssueItem(i));
      }

      return [...this._issues.entries()].map(([repo, issues]) => {
        const item = new WorkItemsTreeItem(repo, vscode.TreeItemCollapsibleState.Expanded);
        item.iconPath = new vscode.ThemeIcon('repo');
        item.description = `${issues.length} issue${issues.length === 1 ? '' : 's'}`;
        item.contextValue = 'repo-group';
        item.id = `wi:${repo}`;
        return item;
      });
    }

    const repoId = element.id?.replace('wi:', '');
    if (repoId && this._issues.has(repoId)) {
      return this._issues.get(repoId)!.map((i) => this.buildIssueItem(i));
    }

    return [];
  }

  private buildIssueItem(issue: GitHubIssue): WorkItemsTreeItem {
    const hasPlan = issue.labels.some(l =>
      ['has plan', 'has-plan', 'plan', 'planned'].includes(l.toLowerCase()),
    );

    const planIndicator = hasPlan ? '📋' : '❓';
    const item = new WorkItemsTreeItem(`${planIndicator} #${issue.number} ${issue.title}`);
    item.issue = issue;

    const labelText = issue.labels.join(', ');
    item.description = hasPlan
      ? `✓ planned · ${labelText}`
      : `needs plan · ${labelText}`;

    item.iconPath = new vscode.ThemeIcon('issues');
    item.contextValue = 'work-item';
    item.tooltip = new vscode.MarkdownString(
      [
        `**#${issue.number} ${issue.title}**`,
        `Plan: ${hasPlan ? '✓ planned' : '❓ needs plan'}`,
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
}
