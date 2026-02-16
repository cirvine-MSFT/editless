import * as vscode from 'vscode';
import { GitHubIssue, fetchAssignedIssues, isGhAvailable } from './github-client';
import type { AdoWorkItem } from './ado-client';

interface IssueFilter {
  includeLabels?: string[];
  excludeLabels?: string[];
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
        const filtered = this.filterIssues(issues);
        if (filtered.length > 0) {
          this._issues.set(repo, filtered);
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

      const hasGitHub = this._issues.size > 0;
      const hasAdo = this._adoItems.length > 0;

      if (!hasGitHub && !hasAdo) {
        const item = new WorkItemsTreeItem('No assigned issues found');
        item.iconPath = new vscode.ThemeIcon('check');
        return [item];
      }

      const items: WorkItemsTreeItem[] = [];

      // ADO work items group
      if (hasAdo) {
        if (hasGitHub) {
          const adoGroup = new WorkItemsTreeItem('Azure DevOps', vscode.TreeItemCollapsibleState.Expanded);
          adoGroup.iconPath = new vscode.ThemeIcon('azure');
          adoGroup.description = `${this._adoItems.length} item${this._adoItems.length === 1 ? '' : 's'}`;
          adoGroup.contextValue = 'ado-group';
          adoGroup.id = 'wi:ado';
          items.push(adoGroup);
        } else {
          return this._adoItems.map(wi => this.buildAdoItem(wi));
        }
      }

      // GitHub issues (existing logic)
      if (hasGitHub) {
        const milestoneItems = this.buildMilestoneGroups();
        if (milestoneItems && !hasAdo) {
          return milestoneItems;
        }
        if (milestoneItems && hasAdo) {
          items.push(...milestoneItems);
        } else if (this._issues.size === 1 && !hasAdo) {
          const [, issues] = [...this._issues.entries()][0];
          return issues.map((i) => this.buildIssueItem(i));
        } else {
          for (const [repo, issues] of this._issues.entries()) {
            const repoItem = new WorkItemsTreeItem(repo, vscode.TreeItemCollapsibleState.Expanded);
            repoItem.iconPath = new vscode.ThemeIcon('github');
            repoItem.description = `${issues.length} issue${issues.length === 1 ? '' : 's'}`;
            repoItem.contextValue = 'repo-group';
            repoItem.id = `wi:${repo}`;
            items.push(repoItem);
          }
        }
      }

      return items;
    }

    if (element.contextValue === 'ado-group') {
      return this._adoItems.map(wi => this.buildAdoItem(wi));
    }

    if (element.contextValue === 'milestone-group') {
      const msName = element.id?.replace('ms:', '') ?? '';
      const allIssues = [...this._issues.values()].flat();
      const filtered = msName === '__none__'
        ? allIssues.filter((i) => !i.milestone)
        : allIssues.filter((i) => i.milestone === msName);
      return filtered.map((i) => this.buildIssueItem(i));
    }

    const repoId = element.id?.replace('wi:', '');
    if (repoId && this._issues.has(repoId)) {
      return this._issues.get(repoId)!.map((i) => this.buildIssueItem(i));
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

  private buildMilestoneGroups(): WorkItemsTreeItem[] | undefined {
    const allIssues = [...this._issues.values()].flat();
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

    const items: WorkItemsTreeItem[] = [];
    for (const [ms, issues] of milestones) {
      const msItem = new WorkItemsTreeItem(ms, vscode.TreeItemCollapsibleState.Expanded);
      msItem.iconPath = new vscode.ThemeIcon('milestone');
      msItem.description = `${issues.length} issue${issues.length === 1 ? '' : 's'}`;
      msItem.contextValue = 'milestone-group';
      msItem.id = `ms:${ms}`;
      items.push(msItem);
    }
    if (noMilestone.length > 0) {
      const noMsItem = new WorkItemsTreeItem('No Milestone', vscode.TreeItemCollapsibleState.Collapsed);
      noMsItem.iconPath = new vscode.ThemeIcon('milestone');
      noMsItem.description = `${noMilestone.length} issue${noMilestone.length === 1 ? '' : 's'}`;
      noMsItem.contextValue = 'milestone-group';
      noMsItem.id = 'ms:__none__';
      items.push(noMsItem);
    }
    return items;
  }

  private buildIssueItem(issue: GitHubIssue): WorkItemsTreeItem {
    const lowered = issue.labels.map(l => l.toLowerCase());
    const hasPlan = lowered.some(l =>
      ['has plan', 'has-plan', 'plan', 'planned', 'status:planned'].includes(l),
    );
    const needsPlan = !hasPlan && lowered.some(l =>
      ['status:needs-plan', 'needs-plan', 'needs plan'].includes(l),
    );

    const planIndicator = hasPlan ? '📋' : needsPlan ? '❓' : '—';
    const item = new WorkItemsTreeItem(`${planIndicator} #${issue.number} ${issue.title}`);
    item.issue = issue;

    const labelText = issue.labels.join(', ');
    item.description = hasPlan
      ? `✓ planned · ${labelText}`
      : needsPlan
        ? `needs plan · ${labelText}`
        : labelText;

    item.iconPath = hasPlan
      ? new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'))
      : needsPlan
        ? new vscode.ThemeIcon('question', new vscode.ThemeColor('editorWarning.foreground'))
        : new vscode.ThemeIcon('issues');
    item.contextValue = 'work-item';

    const planStatus = hasPlan ? '✓ planned' : needsPlan ? '❓ needs plan' : 'no status';
    item.tooltip = new vscode.MarkdownString(
      [
        `**#${issue.number} ${issue.title}**`,
        `Plan: ${planStatus}`,
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
    const item = new WorkItemsTreeItem(`${stateIcon} #${wi.id} ${wi.title}`);
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
