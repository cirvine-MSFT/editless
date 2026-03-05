import * as vscode from 'vscode';
import type { TerminalManager } from './terminal-manager';
import type { SessionLabelManager } from './session-labels';
import type { SessionContextResolver } from './session-context';
import type { DiscoveredItem } from './unified-discovery';
import type { AgentSettingsManager } from './agent-settings';
import type { AgentStateManager } from './agent-state-manager';
import {
  queryAgentNodeData,
  queryTerminalNodes,
  queryOrphansForAgent,
  querySessionContext,
} from './editless-tree-data';
import {
  EditlessTreeItem,
  DEFAULT_COPILOT_CLI_ID,
  buildCopilotCLIConfig,
  buildDiscoveredRootItem,
  buildDefaultAgentItem,
  buildTerminalItem,
  buildOrphanItem,
  buildTerminalTooltip,
  buildAgentItem,
} from './editless-tree-items';

// Re-export everything consumers need (backward compat)
export { EditlessTreeItem, DEFAULT_COPILOT_CLI_ID, buildCopilotCLIConfig } from './editless-tree-items';
export type { TreeItemType } from './editless-tree-items';


// ---------------------------------------------------------------------------
// EditlessTreeProvider
// ---------------------------------------------------------------------------

export class EditlessTreeProvider implements vscode.TreeDataProvider<EditlessTreeItem>, vscode.Disposable {
  private _onDidChangeTreeData = new vscode.EventEmitter<EditlessTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly _terminalSub: vscode.Disposable | undefined;
  private readonly _labelSub: vscode.Disposable | undefined;
  private readonly _stateSub: vscode.Disposable | undefined;

  constructor(
    private readonly stateManager: AgentStateManager,
    private readonly agentSettings: AgentSettingsManager,
    private readonly terminalManager?: TerminalManager,
    private readonly labelManager?: SessionLabelManager,
    private readonly sessionContextResolver?: SessionContextResolver,
  ) {
    this._stateSub = stateManager.onDidChange(() => this._onDidChangeTreeData.fire());
    if (terminalManager) {
      this._terminalSub = terminalManager.onDidChange(() => this._onDidChangeTreeData.fire());
    }
    if (labelManager) {
      this._labelSub = labelManager.onDidChange(() => this._onDidChangeTreeData.fire());
    }
  }

  dispose(): void {
    this._stateSub?.dispose();
    this._terminalSub?.dispose();
    this._labelSub?.dispose();
    this._onDidChangeTreeData.dispose();
  }

  refresh(): void {
    this.stateManager.invalidateAll();
  }

  setDiscoveredItems(items: DiscoveredItem[]): void {
    this.stateManager.setDiscoveredItems(items);
  }

  getDiscoveredItems(): readonly DiscoveredItem[] {
    return this.stateManager.getDiscoveredItems();
  }

  invalidate(squadId: string): void {
    this.stateManager.invalidate(squadId);
  }

  findTerminalItem(terminal: vscode.Terminal): EditlessTreeItem | undefined {
    const info = this.terminalManager?.getTerminalInfo(terminal);
    if (!info) return undefined;

    // Build the parent squad item so getParent() can traverse back to root
    const rootItems = this.getRootItems();
    let parentItem: EditlessTreeItem | undefined = rootItems.find(item =>
      (item.type === 'squad' || item.type === 'default-agent') && item.squadId === info.agentId,
    );

    // Also search inside the hidden group
    if (!parentItem) {
      const hiddenGroup = rootItems.find(item => item.type === 'category' && item.categoryKind === 'hidden');
      if (hiddenGroup) {
        parentItem = this.getHiddenGroupChildren(hiddenGroup)
          .find(item => item.squadId === info.agentId);
      }
    }
    if (!parentItem) return undefined;

    if (parentItem.type === 'default-agent') {
      return this.getDefaultAgentChildren(parentItem)
        .find(item => item.type === 'terminal' && item.terminal === terminal);
    }

    const agentChildren = this.getAgentChildren(info.agentId, parentItem);
    return agentChildren.find(item => item.type === 'terminal' && item.terminal === terminal);
  }

  // -- TreeDataProvider implementation -------------------------------------

  getTreeItem(element: EditlessTreeItem): vscode.TreeItem {
    return element;
  }

  getParent(element: EditlessTreeItem): EditlessTreeItem | undefined {
    return element.parent;
  }

  getChildren(element?: EditlessTreeItem): EditlessTreeItem[] {
    if (!element) {
      return this.getRootItems();
    }
    if (element.type === 'default-agent' && element.squadId) {
      return this.getDefaultAgentChildren(element);
    }
    if ((element.type === 'squad' || element.type === 'agent-hidden') && element.squadId) {
      return this.getAgentChildren(element.squadId, element);
    }
    if (element.type === 'category' && element.categoryKind === 'hidden') {
      return this.getHiddenGroupChildren(element);
    }
    if (element.type === 'category' && element.squadId && element.categoryKind) {
      return this.getCategoryChildren(element.squadId, element.categoryKind, element);
    }
    return [];
  }

  // -- Root: one item per squad -------------------------------------------

  private getRootItems(): EditlessTreeItem[] {
    const items: EditlessTreeItem[] = [];

    // Built-in Copilot CLI — always present at top
    items.push(buildDefaultAgentItem(DEFAULT_COPILOT_CLI_ID, queryAgentNodeData(this.terminalManager, DEFAULT_COPILOT_CLI_ID)));

    // Visible agents at top level, hidden agents in collapsible group
    // Filter out worktree children (they appear under their parent)
    const rootItems = this.stateManager.getDiscoveredItems().filter(i => !i.parentId);
    const visible = rootItems.filter(i => !this.agentSettings.isHidden(i.id));
    const hidden = rootItems.filter(i => this.agentSettings.isHidden(i.id));

    for (const disc of visible) {
      items.push(this._buildDiscoveredRootItem(disc, false));
    }

    if (hidden.length > 0) {
      const hiddenGroup = new EditlessTreeItem(
        `Hidden (${hidden.length})`,
        'category',
        vscode.TreeItemCollapsibleState.Collapsed,
        'hidden-agents-group',
        'hidden',
      );
      hiddenGroup.iconPath = new vscode.ThemeIcon('eye-closed');
      items.push(hiddenGroup);
    }

    return items;
  }

  private _buildDiscoveredRootItem(disc: DiscoveredItem, isHidden: boolean): EditlessTreeItem {
    const settings = this.agentSettings.get(disc.id);
    const nodeData = queryAgentNodeData(this.terminalManager, disc.id);
    return buildDiscoveredRootItem(disc, isHidden, settings, nodeData);
  }

  private getDefaultAgentChildren(parentItem: EditlessTreeItem): EditlessTreeItem[] {
    if (!this.terminalManager) return [];

    const children: EditlessTreeItem[] = [];
    for (const data of queryTerminalNodes(this.terminalManager, this.labelManager, DEFAULT_COPILOT_CLI_ID)) {
      const tooltip = `${data.info.displayName} — started ${data.relative}`;
      const item = buildTerminalItem(data, tooltip);
      item.parent = parentItem;
      children.push(item);
    }

    for (const orphan of queryOrphansForAgent(this.terminalManager, DEFAULT_COPILOT_CLI_ID)) {
      const orphanItem = buildOrphanItem(orphan);
      orphanItem.parent = parentItem;
      children.push(orphanItem);
    }

    return children;
  }

  // -- Squad children: categories + terminal sessions ---------------------

  private getState(squadId: string) {
    return this.stateManager.getState(squadId);
  }

  private getAgentChildren(squadId: string, parentItem?: EditlessTreeItem): EditlessTreeItem[] {
    const state = this.getState(squadId);
    if (!state) return [];

    const children: EditlessTreeItem[] = [];

    if (this.terminalManager) {
      const sessionCtx = querySessionContext(this.sessionContextResolver, state.config.path);

      for (const data of queryTerminalNodes(this.terminalManager, this.labelManager, squadId)) {
        const tooltip = buildTerminalTooltip(data.info.displayName, data.relative, sessionCtx, data.sessionState, data.lastActivityAt);
        children.push(buildTerminalItem(data, tooltip));
      }

      for (const orphan of queryOrphansForAgent(this.terminalManager, squadId)) {
        children.push(buildOrphanItem(orphan));
      }

      // Hint when squad has no sessions yet
      const hasTerminals = this.terminalManager.getTerminalsForAgent(squadId).length > 0;
      const hasOrphans = this.terminalManager.getOrphanedSessions().some(o => o.agentId === squadId);
      if (!hasTerminals && !hasOrphans) {
        const hint = new EditlessTreeItem('No active sessions', 'category');
        hint.description = 'Click + to launch';
        hint.iconPath = new vscode.ThemeIcon('info');
        children.push(hint);
      }
    }

    // Roster — only for non-standalone squads
    if (state.config.universe !== 'standalone') {
      const rosterItem = new EditlessTreeItem(
        `Roster (${state.roster.length})`,
        'category',
        state.roster.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
        squadId,
        'roster',
      );
      rosterItem.iconPath = new vscode.ThemeIcon('organization');
      children.push(rosterItem);
    }

    // Worktree children
    const worktreeChildren = this.stateManager.getDiscoveredItems().filter(i => i.parentId === squadId);
    for (const wt of worktreeChildren) {
      const label = wt.branch || wt.name;
      const wtTerminalCount = this.terminalManager
        ? this.terminalManager.getTerminalsForAgent(wt.id).length
        : 0;
      const wtItem = new EditlessTreeItem(
        label,
        'squad',
        wtTerminalCount > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
        wt.id,
      );
      wtItem.iconPath = new vscode.ThemeIcon('git-branch');
      wtItem.contextValue = 'worktree';
      wtItem.description = wt.path;
      wtItem.tooltip = new vscode.MarkdownString(
        [`**${label}**`, `Path: \`${wt.path}\``].join('\n\n'),
      );
      children.push(wtItem);
    }

    if (parentItem) {
      for (const child of children) {
        child.parent = parentItem;
      }
    }

    return children;
  }

  // -- Hidden group children ------------------------------------------------

  private getHiddenGroupChildren(parentItem: EditlessTreeItem): EditlessTreeItem[] {
    const hidden = this.stateManager.getDiscoveredItems().filter(i => !i.parentId && this.agentSettings.isHidden(i.id));
    const children = hidden.map(disc => this._buildDiscoveredRootItem(disc, true));
    for (const child of children) {
      child.parent = parentItem;
    }
    return children;
  }

  // -- Category children --------------------------------------------------

  private getCategoryChildren(squadId: string, kind: 'roster' | 'hidden', parentItem?: EditlessTreeItem): EditlessTreeItem[] {
    const state = this.getState(squadId);
    if (!state) return [];

    let children: EditlessTreeItem[];
    switch (kind) {
      case 'roster':
        children = state.roster.map(a => {
          const squadPath = state.config.path ?? squadId;
          return buildAgentItem(a, squadId, squadPath);
        });
        break;
      default:
        children = [];
        break;
    }

    if (parentItem) {
      for (const child of children) {
        child.parent = parentItem;
      }
    }

    return children;
  }
}
