import * as vscode from 'vscode';

export class WorkItemsTreeItem extends vscode.TreeItem {
  constructor(label: string, collapsible: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None) {
    super(label, collapsible);
  }
}

export class WorkItemsTreeProvider implements vscode.TreeDataProvider<WorkItemsTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<WorkItemsTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: WorkItemsTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: WorkItemsTreeItem): WorkItemsTreeItem[] {
    if (element) return [];
    const item = new WorkItemsTreeItem('Configure GitHub or ADO integration to see work items');
    item.iconPath = new vscode.ThemeIcon('info');
    return [item];
  }
}
