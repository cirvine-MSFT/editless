import * as vscode from 'vscode';

export class PRsTreeItem extends vscode.TreeItem {
  constructor(label: string, collapsible: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None) {
    super(label, collapsible);
  }
}

export class PRsTreeProvider implements vscode.TreeDataProvider<PRsTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<PRsTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: PRsTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: PRsTreeItem): PRsTreeItem[] {
    if (element) return [];
    const item = new PRsTreeItem('Configure GitHub or ADO integration to see PRs');
    item.iconPath = new vscode.ThemeIcon('info');
    return [item];
  }
}
