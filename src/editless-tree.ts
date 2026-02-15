import * as vscode from 'vscode';
import { EditlessRegistry } from './registry';
import { scanSquad } from './scanner';
import { getLocalSquadVersion } from './squad-upgrader';
import { getStateIcon, getStateDescription } from './terminal-manager';
import type { TerminalManager, PersistedTerminalInfo, SessionState } from './terminal-manager';
import type { SessionLabelManager } from './session-labels';
import type { SessionContextResolver } from './session-context';
import type { AgentTeamConfig, SquadState, AgentInfo, DecisionEntry, RecentActivity, SessionContext } from './types';
import type { DiscoveredAgent } from './agent-discovery';
import type { AgentVisibilityManager } from './visibility';

// ---------------------------------------------------------------------------
// Tree item types
// ---------------------------------------------------------------------------

export type TreeItemType = 'squad' | 'category' | 'agent' | 'decision' | 'activity' | 'terminal' | 'discovered-agent' | 'orphanedSession';
type CategoryKind = 'roster' | 'decisions' | 'activity';
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

// ---------------------------------------------------------------------------
// EditlessTreeItem
// ---------------------------------------------------------------------------

export class EditlessTreeItem extends vscode.TreeItem {
  public terminal?: vscode.Terminal;
  public persistedEntry?: PersistedTerminalInfo;

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

export class EditlessTreeProvider implements vscode.TreeDataProvider<EditlessTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<EditlessTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _cache = new Map<string, SquadState>();
  private _discoveredAgents: DiscoveredAgent[] = [];

  private readonly _terminalSub: vscode.Disposable | undefined;

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
      labelManager.onDidChange(() => this._onDidChangeTreeData.fire());
    }
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
    
    const squadChildren = this.getSquadChildren(info.squadId);
    return squadChildren.find(item => item.type === 'terminal' && item.terminal === terminal);
  }

  // -- TreeDataProvider implementation -------------------------------------

  getTreeItem(element: EditlessTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: EditlessTreeItem): EditlessTreeItem[] {
    if (!element) {
      return this.getRootItems();
    }
    if (element.type === 'squad' && element.squadId) {
      return this.getSquadChildren(element.squadId);
    }
    if (element.type === 'category' && element.squadId && element.categoryKind) {
      return this.getCategoryChildren(element.squadId, element.categoryKind);
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
    if (cached) {
      descParts.push(cached.status);
      if (cached.inboxCount > 0) {
        descParts.push(`📥 ${cached.inboxCount}`);
      }
    }
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

    if (cached) {
      tooltipLines.push(`Status: ${cached.status}`);
      if (cached.lastActivity) {
        tooltipLines.push(`Last activity: ${cached.lastActivity}`);
      }
      if (cached.inboxCount > 0) {
        tooltipLines.push(`Inbox: ${cached.inboxCount} item(s)`);
      }
    }
    item.tooltip = new vscode.MarkdownString(tooltipLines.join('\n\n'));
    item.iconPath = new vscode.ThemeIcon('organization');

    item.command = {
      command: 'editless.launchSession',
      title: 'Launch Session',
      arguments: [cfg.id],
    };

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

  private getSquadChildren(squadId: string): EditlessTreeItem[] {
    const state = this.getState(squadId);
    if (!state) return [];

    const children: EditlessTreeItem[] = [];

    if (this.terminalManager) {
      const sessionCtx = this.sessionContextResolver && state.config.path
        ? this.sessionContextResolver.resolveForSquad(state.config.path)
        : null;

      for (const { terminal, info } of this.terminalManager.getTerminalsForSquad(squadId)) {
        const sessionState = this.terminalManager.getSessionState(terminal, state.inboxCount);
        const lastActivityAt = this.terminalManager['_lastActivityAt'].get(terminal);

        const elapsed = Date.now() - info.createdAt.getTime();
        const mins = Math.floor(elapsed / 60_000);
        const relative = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;

        const customLabel = this.labelManager?.getLabel(info.labelKey);
        const renamedTitle = sessionCtx?.summary?.trim();
        const fallbackTitle = renamedTitle && renamedTitle.length > 0 ? renamedTitle : info.displayName;
        const title = customLabel ? `🏷️ ${customLabel}` : fallbackTitle;
        const item = new EditlessTreeItem(title, 'terminal');
        item.terminal = terminal;
        item.description = this._buildTerminalDescription(null, relative, sessionCtx, sessionState, lastActivityAt);
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

    // Decisions
    const decisionItem = new EditlessTreeItem(
      `Recent Decisions (${state.recentDecisions.length})`,
      'category',
      state.recentDecisions.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
      squadId,
      'decisions',
    );
    decisionItem.iconPath = new vscode.ThemeIcon('law');
    children.push(decisionItem);

    // Activity
    const activityItem = new EditlessTreeItem(
      `Recent Activity (${state.recentActivity.length})`,
      'category',
      state.recentActivity.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
      squadId,
      'activity',
    );
    activityItem.iconPath = new vscode.ThemeIcon('pulse');
    children.push(activityItem);

    return children;
  }

  // -- Category children --------------------------------------------------

  private getCategoryChildren(squadId: string, kind: CategoryKind): EditlessTreeItem[] {
    const state = this.getState(squadId);
    if (!state) return [];

    switch (kind) {
      case 'roster':
        return state.roster.map(a => this.buildAgentItem(a));
      case 'decisions':
        return state.recentDecisions.map(d => this.buildDecisionItem(d));
      case 'activity':
        return state.recentActivity.map(a => this.buildActivityItem(a));
    }
  }

  private buildAgentItem(agent: AgentInfo): EditlessTreeItem {
    const item = new EditlessTreeItem(agent.name, 'agent');
    item.description = agent.role;
    item.iconPath = new vscode.ThemeIcon('person');
    return item;
  }

  private buildDecisionItem(decision: DecisionEntry): EditlessTreeItem {
    const item = new EditlessTreeItem(decision.title, 'decision');
    item.description = `${decision.date} by ${decision.author}`;
    item.iconPath = new vscode.ThemeIcon('law');
    item.tooltip = decision.summary || undefined;
    return item;
  }

  private buildActivityItem(activity: RecentActivity): EditlessTreeItem {
    const item = new EditlessTreeItem(`${activity.agent}: ${activity.task}`, 'activity');
    item.description = activity.outcome;
    item.iconPath = new vscode.ThemeIcon('pulse');
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

  private _buildTerminalDescription(
    terminalName: string | null,
    relative: string,
    ctx: SessionContext | null,
    sessionState: SessionState,
    lastActivityAt?: number,
  ): string {
    const parts: string[] = [];
    if (terminalName) parts.push(terminalName);
    
    const stateDesc = getStateDescription(sessionState, lastActivityAt);
    if (stateDesc) parts.push(stateDesc);

    if (ctx) {
      if (ctx.summary) {
        parts.push(ctx.summary);
      } else if (ctx.branch) {
        parts.push(`⎇ ${ctx.branch}`);
      }
      if (ctx.references.length > 0) {
        parts.push(ctx.references.map(r => r.label).join(' · '));
      }
    }

    parts.push(relative);
    return parts.join(' · ');
  }

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
