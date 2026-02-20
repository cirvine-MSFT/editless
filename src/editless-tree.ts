import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { EditlessRegistry } from './registry';
import { scanSquad } from './scanner';
import { getLocalSquadVersion } from './squad-utils';
import { getStateIcon, getStateDescription } from './terminal-manager';
import type { TerminalManager, PersistedTerminalInfo, SessionState } from './terminal-manager';
import type { SessionLabelManager } from './session-labels';
import type { SessionContextResolver } from './session-context';
import type { AgentTeamConfig, SquadState, AgentInfo, SessionContext } from './types';
import type { DiscoveredAgent } from './agent-discovery';
import type { AgentVisibilityManager } from './visibility';

// ---------------------------------------------------------------------------
// Tree item types
// ---------------------------------------------------------------------------

export type TreeItemType = 'squad' | 'category' | 'agent' | 'terminal' | 'discovered-agent' | 'orphanedSession';
type CategoryKind = 'roster';
const TEAM_ROSTER_PREFIX = /^team\s+roster\s*[—\-:]\s*(.+)$/i;

function normalizeSquadDisplayName(name: string, fallback: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return fallback;
  }

  const prefixed = trimmed.match(TEAM_ROSTER_PREFIX);
  if (prefixed?.[1]?.trim()) {
    return prefixed[1].trim();
  }

  if (/^team\s+roster$/i.test(trimmed)) {
    return fallback;
  }

  return trimmed;
}

function stableHash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').substring(0, 8);
}

// ---------------------------------------------------------------------------
// EditlessTreeItem
// ---------------------------------------------------------------------------

export class EditlessTreeItem extends vscode.TreeItem {
  public terminal?: vscode.Terminal;
  public persistedEntry?: PersistedTerminalInfo;
  public parent?: EditlessTreeItem;

  constructor(
    label: string,
    public readonly type: TreeItemType,
    collapsible: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
    public readonly squadId?: string,
    public readonly categoryKind?: CategoryKind,
  ) {
    super(label, collapsible);
    this.contextValue = type;
    if (squadId) {
      this.id = categoryKind ? `${squadId}:${categoryKind}` : squadId;
    }
  }
}

// ---------------------------------------------------------------------------
// EditlessTreeProvider
// ---------------------------------------------------------------------------

export class EditlessTreeProvider implements vscode.TreeDataProvider<EditlessTreeItem>, vscode.Disposable {
  private _onDidChangeTreeData = new vscode.EventEmitter<EditlessTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _cache = new Map<string, SquadState>();
  private _discoveredAgents: DiscoveredAgent[] = [];

  private readonly _terminalSub: vscode.Disposable | undefined;
  private readonly _labelSub: vscode.Disposable | undefined;

  constructor(
    private readonly registry: EditlessRegistry,
    private readonly terminalManager?: TerminalManager,
    private readonly labelManager?: SessionLabelManager,
    private readonly sessionContextResolver?: SessionContextResolver,
    private readonly _visibility?: AgentVisibilityManager,
  ) {
    if (terminalManager) {
      this._terminalSub = terminalManager.onDidChange(() => this._onDidChangeTreeData.fire());
    }
    if (labelManager) {
      this._labelSub = labelManager.onDidChange(() => this._onDidChangeTreeData.fire());
    }
  }

  dispose(): void {
    this._terminalSub?.dispose();
    this._labelSub?.dispose();
    this._onDidChangeTreeData.dispose();
  }

  refresh(): void {
    this._cache.clear();
    this._onDidChangeTreeData.fire();
  }

  setDiscoveredAgents(agents: DiscoveredAgent[]): void {
    this._discoveredAgents = agents;
    this._onDidChangeTreeData.fire();
  }

  invalidate(squadId: string): void {
    this._cache.delete(squadId);
    this._onDidChangeTreeData.fire();
  }

  findTerminalItem(terminal: vscode.Terminal): EditlessTreeItem | undefined {
    const info = this.terminalManager?.getTerminalInfo(terminal);
    if (!info) return undefined;

    // Build the parent squad item so getParent() can traverse back to root
    const rootItems = this.getRootItems();
    const squadItem = rootItems.find(item => item.type === 'squad' && item.squadId === info.squadId);
    if (!squadItem) return undefined;

    const squadChildren = this.getSquadChildren(info.squadId, squadItem);
    return squadChildren.find(item => item.type === 'terminal' && item.terminal === terminal);
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
    if (element.type === 'squad' && element.squadId) {
      return this.getSquadChildren(element.squadId, element);
    }
    if (element.type === 'category' && element.squadId && element.categoryKind) {
      return this.getCategoryChildren(element.squadId, element.categoryKind, element);
    }
    return [];
  }

  // -- Root: one item per squad -------------------------------------------

  private getRootItems(): EditlessTreeItem[] {
    const squads = this.registry.loadSquads();
    const items = squads
      .filter(cfg => !this._visibility?.isHidden(cfg.id))
      .map(cfg => this.buildSquadItem(cfg));

    const visibleAgents = this._discoveredAgents.filter(a => !this._visibility?.isHidden(a.id));
    if (visibleAgents.length > 0) {
      const header = new EditlessTreeItem(
        'Discovered Agents',
        'category',
        vscode.TreeItemCollapsibleState.None,
      );
      header.iconPath = new vscode.ThemeIcon('search');
      items.push(header);

      for (const agent of visibleAgents) {
        items.push(this.buildDiscoveredAgentItem(agent));
      }
    }

    if (items.length === 0) {
      const msg = new EditlessTreeItem(
        'All agents hidden — use Show Hidden to restore',
        'category',
        vscode.TreeItemCollapsibleState.None,
      );
      msg.iconPath = new vscode.ThemeIcon('eye-closed');
      items.push(msg);
    }

    return items;
  }

  private buildSquadItem(cfg: AgentTeamConfig): EditlessTreeItem {
    const displayName = normalizeSquadDisplayName(cfg.name, cfg.id);
    const item = new EditlessTreeItem(
      `${cfg.icon} ${displayName}`,
      'squad',
      vscode.TreeItemCollapsibleState.Collapsed,
      cfg.id,
    );

    const descParts: string[] = [cfg.universe];

    const cached = this._cache.get(cfg.id);
    if (this.terminalManager) {
      const count = this.terminalManager.getTerminalsForSquad(cfg.id).length;
      if (count > 0) {
        descParts.push(`${count} session${count === 1 ? '' : 's'}`);
      }
    }

    item.description = descParts.join(' · ');

    const tooltipLines = [
      `**${cfg.icon} ${displayName}**`,
      `Path: \`${cfg.path}\``,
      `Universe: ${cfg.universe}`,
    ];

    const localVersion = getLocalSquadVersion(cfg.path);
    if (localVersion) {
      tooltipLines.push(`Squad Version: ${localVersion}`);
    }

    if (cached?.lastActivity) {
      tooltipLines.push(`Last activity: ${cached.lastActivity}`);
    }
    item.tooltip = new vscode.MarkdownString(tooltipLines.join('\n\n'));
    item.iconPath = new vscode.ThemeIcon('organization');

    return item;
  }

  // -- Squad children: categories + terminal sessions ---------------------

  private getState(squadId: string): SquadState | undefined {
    if (!this._cache.has(squadId)) {
      const cfg = this.registry.getSquad(squadId);
      if (!cfg) return undefined;
      this._cache.set(squadId, scanSquad(cfg));
    }
    return this._cache.get(squadId);
  }

  private getSquadChildren(squadId: string, parentItem?: EditlessTreeItem): EditlessTreeItem[] {
    const state = this.getState(squadId);
    if (!state) return [];

    const children: EditlessTreeItem[] = [];

    if (this.terminalManager) {
      const sessionCtx = this.sessionContextResolver && state.config.path
        ? this.sessionContextResolver.resolveForSquad(state.config.path)
        : null;

      for (const { terminal, info } of this.terminalManager.getTerminalsForSquad(squadId)) {
        const sessionState = this.terminalManager.getSessionState(terminal) ?? 'inactive';
        const lastActivityAt = this.terminalManager.getLastActivityAt(terminal);

        const elapsed = Date.now() - info.createdAt.getTime();
        const mins = Math.floor(elapsed / 60_000);
        const relative = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;

        const customLabel = this.labelManager?.getLabel(info.labelKey);
        const title = customLabel ? `🏷️ ${customLabel}` : info.displayName;
        const item = new EditlessTreeItem(title, 'terminal');
        item.terminal = terminal;
        item.description = relative;
        item.iconPath = getStateIcon(sessionState);
        item.contextValue = 'terminal';
        item.tooltip = this._buildTerminalTooltip(info.displayName, relative, sessionCtx, sessionState, lastActivityAt);
        item.command = {
          command: 'editless.focusTerminal',
          title: 'Focus',
          arguments: [terminal],
        };
        children.push(item);
      }

      for (const orphan of this.terminalManager.getOrphanedSessions().filter(o => o.squadId === squadId)) {
        children.push(this._buildOrphanItem(orphan));
      }
    }

    // Roster
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

    if (parentItem) {
      for (const child of children) {
        child.parent = parentItem;
      }
    }

    return children;
  }

  // -- Category children --------------------------------------------------

  private getCategoryChildren(squadId: string, kind: CategoryKind, parentItem?: EditlessTreeItem): EditlessTreeItem[] {
    const state = this.getState(squadId);
    if (!state) return [];

    let children: EditlessTreeItem[];
    switch (kind) {
      case 'roster':
        children = state.roster.map(a => this.buildAgentItem(a, squadId));
        break;
    }

    if (parentItem) {
      for (const child of children) {
        child.parent = parentItem;
      }
    }

    return children;
  }

  private buildAgentItem(agent: AgentInfo, squadId?: string): EditlessTreeItem {
    const item = new EditlessTreeItem(agent.name, 'agent', vscode.TreeItemCollapsibleState.None);
    if (squadId) {
      const state = this.getState(squadId);
      const squadPath = state?.config.path ?? squadId;
      item.id = `${stableHash(squadPath)}:agent:${agent.name}`;
    }
    item.description = agent.role;
    item.iconPath = new vscode.ThemeIcon('person');
    return item;
  }

  private buildDiscoveredAgentItem(agent: DiscoveredAgent): EditlessTreeItem {
    const item = new EditlessTreeItem(agent.name, 'discovered-agent');
    item.id = `discovered:${agent.id}`;
    item.description = agent.description ?? agent.source;
    item.iconPath = new vscode.ThemeIcon('hubot');
    item.tooltip = new vscode.MarkdownString(
      [`**🤖 ${agent.name}**`, `Source: ${agent.source}`, `File: \`${agent.filePath}\``].join('\n\n'),
    );
    const uri = vscode.Uri.file(agent.filePath);
    if (agent.filePath.endsWith('.md')) {
      item.command = {
        command: 'editless.openFilePreview',
        title: 'Preview Agent File',
        arguments: [uri],
      };
    } else {
      item.command = {
        command: 'vscode.open',
        title: 'Open Agent File',
        arguments: [uri],
      };
    }
    return item;
  }

  // -- Orphan item builder --------------------------------------------------

  private _buildOrphanItem(entry: PersistedTerminalInfo): EditlessTreeItem {
    const item = new EditlessTreeItem(entry.displayName, 'orphanedSession');
    item.id = `orphan:${entry.id}`;
    item.persistedEntry = entry;
    item.description = '· orphaned — re-launch?';
    item.iconPath = new vscode.ThemeIcon('debug-disconnect', new vscode.ThemeColor('disabledForeground'));
    item.contextValue = 'orphanedSession';
    item.tooltip = new vscode.MarkdownString(
      [`**👻 ${entry.displayName}**`, `Squad: ${entry.squadName}`, 'This session has no live terminal. Re-launch or dismiss it.'].join('\n\n'),
    );
    item.command = {
      command: 'editless.relaunchSession',
      title: 'Re-launch Session',
      arguments: [item],
    };
    return item;
  }

  // -- Session context helpers ----------------------------------------------

  private _buildTerminalTooltip(
    terminalName: string,
    relative: string,
    ctx: SessionContext | null,
    sessionState: SessionState,
    lastActivityAt?: number,
  ): vscode.MarkdownString | string {
    const stateDesc = getStateDescription(sessionState, lastActivityAt);
    if (!ctx) return `${terminalName} — ${stateDesc} — started ${relative}`;

    const lines: string[] = [`**${terminalName}**`, `State: ${stateDesc}`, `Started: ${relative}`];
    if (ctx.summary) lines.push(`Summary: ${ctx.summary}`);
    if (ctx.branch) lines.push(`Branch: \`${ctx.branch}\``);
    if (ctx.references.length > 0) {
      lines.push(`References: ${ctx.references.map(r => r.label).join(', ')}`);
    }
    if (ctx.createdAt) lines.push(`Session created: ${ctx.createdAt}`);
    if (ctx.updatedAt) lines.push(`Session updated: ${ctx.updatedAt}`);
    return new vscode.MarkdownString(lines.join('\n\n'));
  }
}
