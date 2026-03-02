import * as vscode from 'vscode';
import type { SessionContextResolver, CwdIndexEntry } from './session-context';

/** Format a date string as relative time ("5m ago", "2h ago", "3d ago"). */
export function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return '';
  const ms = Date.now() - new Date(dateStr).getTime();
  if (Number.isNaN(ms) || ms < 0) return '';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export interface SessionsFilter {
  squad?: string;
  workspace?: string;
}

export class SessionTreeItem extends vscode.TreeItem {
  sessionEntry?: CwdIndexEntry;
}

export class CopilotSessionsProvider implements vscode.TreeDataProvider<SessionTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SessionTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _dismissed = new Set<string>();
  private _filter: SessionsFilter = {};
  private _treeView?: vscode.TreeView<SessionTreeItem>;
  private _resolver: SessionContextResolver;

  constructor(resolver: SessionContextResolver) {
    this._resolver = resolver;
  }

  get filter(): SessionsFilter { return this._filter; }

  set filter(value: SessionsFilter) {
    this._filter = value;
    this._updateDescription();
    this.refresh();
  }

  setTreeView(view: vscode.TreeView<SessionTreeItem>): void {
    this._treeView = view;
    this._updateDescription();
  }

  refresh(): void {
    this._resolver.clearCache();
    this._onDidChangeTreeData.fire();
  }

  dismiss(sessionId: string): void {
    this._dismissed.add(sessionId);
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SessionTreeItem): SessionTreeItem {
    return element;
  }

  getChildren(element?: SessionTreeItem): SessionTreeItem[] {
    if (element) return [];

    let sessions = this._resolver.getAllSessions();

    // Apply filters
    if (this._filter.workspace) {
      const wsLower = this._filter.workspace.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
      sessions = sessions.filter(s => {
        const norm = s.cwd.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
        return norm === wsLower || norm.startsWith(wsLower + '/');
      });
    }
    if (this._filter.squad) {
      const sq = this._filter.squad.toLowerCase();
      sessions = sessions.filter(s => s.branch.toLowerCase().includes(sq) || s.summary.toLowerCase().includes(sq));
    }

    // Remove dismissed
    sessions = sessions.filter(s => !this._dismissed.has(s.sessionId));

    if (sessions.length === 0) {
      const item = new SessionTreeItem('No sessions found');
      item.contextValue = 'empty';
      return [item];
    }

    // Sort by updatedAt DESC
    sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const staleDays = 14;
    return sessions.map(s => {
      const isStale = this._isStale(s, staleDays);
      const label = s.summary || `Session ${s.sessionId.substring(0, 8)}`;
      const item = new SessionTreeItem(label);
      item.sessionEntry = s;
      item.description = s.cwd;
      item.tooltip = new vscode.MarkdownString(
        `**${label}**\n\nCWD: ${s.cwd}\nBranch: ${s.branch || '—'}\nUpdated: ${formatRelativeTime(s.updatedAt)}`,
      );
      item.iconPath = new vscode.ThemeIcon(
        isStale ? 'history' : 'terminal',
        isStale ? new vscode.ThemeColor('disabledForeground') : undefined,
      );
      item.contextValue = isStale ? 'copilot-session-stale' : 'copilot-session';
      item.id = s.sessionId;
      return item;
    });
  }

  getParent(): undefined {
    return undefined;
  }

  private _isStale(entry: CwdIndexEntry, days: number): boolean {
    if (!entry.updatedAt) return false;
    const ms = Date.now() - new Date(entry.updatedAt).getTime();
    return ms > days * 24 * 60 * 60 * 1000;
  }

  private _updateDescription(): void {
    if (!this._treeView) return;
    const parts: string[] = [];
    if (this._filter.workspace) parts.push(`cwd: ${this._filter.workspace}`);
    if (this._filter.squad) parts.push(`squad: ${this._filter.squad}`);
    this._treeView.description = parts.length > 0 ? parts.join(', ') : undefined;
  }
}
