import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { scanSquad } from './scanner';
import { getLocalSquadVersion } from './squad-utils';
import { getStateIcon, getStateDescription } from './terminal-manager';
import type { TerminalManager, PersistedTerminalInfo, SessionState } from './terminal-manager';
import type { SessionLabelManager } from './session-labels';
import type { SessionContextResolver } from './session-context';
import type { AgentTeamConfig, SquadState, AgentInfo, SessionContext } from './types';
import type { DiscoveredItem } from './unified-discovery';
import type { AgentSettingsManager } from './agent-settings';

// ---------------------------------------------------------------------------
// Tree item types
// ---------------------------------------------------------------------------

export type TreeItemType = 'squad' | 'squad-hidden' | 'category' | 'agent' | 'terminal' | 'orphanedSession' | 'default-agent';

/** Sentinel ID for the built-in Copilot CLI entry. */
export const DEFAULT_COPILOT_CLI_ID = 'builtin:copilot-cli';
type CategoryKind = 'roster' | 'hidden';
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
  private _discoveredItems: DiscoveredItem[] = [];

  private readonly _terminalSub: vscode.Disposable | undefined;
  private readonly _labelSub: vscode.Disposable | undefined;

  constructor(
    private readonly agentSettings: AgentSettingsManager,
    private readonly terminalManager?: TerminalManager,
    private readonly labelManager?: SessionLabelManager,
    private readonly sessionContextResolver?: SessionContextResolver,
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

  setDiscoveredItems(items: DiscoveredItem[]): void {
    this._discoveredItems = items;
    this._onDidChangeTreeData.fire();
  }

  getDiscoveredItems(): readonly DiscoveredItem[] {
    return this._discoveredItems;
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
    const parentItem = rootItems.find(item =>
      (item.type === 'squad' || item.type === 'default-agent') && item.squadId === info.squadId,
    );
    if (!parentItem) return undefined;

    if (parentItem.type === 'default-agent') {
      return this.getDefaultAgentChildren(parentItem)
        .find(item => item.type === 'terminal' && item.terminal === terminal);
    }

    const squadChildren = this.getSquadChildren(info.squadId, parentItem);
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
    if (element.type === 'default-agent' && element.squadId) {
      return this.getDefaultAgentChildren(element);
    }
    if ((element.type === 'squad' || element.type === 'squad-hidden') && element.squadId) {
      return this.getSquadChildren(element.squadId, element);
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
    items.push(this.buildDefaultAgentItem());

    // All discovered items — visible ones first, hidden ones dimmed inline
    const visible = this._discoveredItems.filter(i => !this.agentSettings.isHidden(i.id));
    const hidden = this._discoveredItems.filter(i => this.agentSettings.isHidden(i.id));

    for (const disc of visible) {
      items.push(this.buildDiscoveredRootItem(disc, false));
    }
    for (const disc of hidden) {
      items.push(this.buildDiscoveredRootItem(disc, true));
    }

    if (items.length === 1) {
      // Only the default Copilot CLI entry — no discovered agents
      const hasHiddenItems = this.agentSettings.getHiddenIds().length > 0;
      if (hasHiddenItems) {
        const msg = new EditlessTreeItem(
          'All agents hidden — use Show Hidden to restore',
          'category',
          vscode.TreeItemCollapsibleState.None,
        );
        msg.iconPath = new vscode.ThemeIcon('eye-closed');
        items.push(msg);
      }
    }

    return items;
  }

  private buildDiscoveredRootItem(disc: DiscoveredItem, isHidden: boolean): EditlessTreeItem {
    const isSquad = disc.type === 'squad';
    const isStandalone = isSquad && disc.universe === 'standalone';

    // For squads with a path, build a full squad item from discovery + settings
    if (isSquad) {
      const settings = this.agentSettings.get(disc.id);
      const displayName = normalizeSquadDisplayName(settings?.name ?? disc.name, disc.id);
      const icon = settings?.icon ?? (isStandalone ? '🤖' : '🔷');

      const terminalCount = this.terminalManager
        ? this.terminalManager.getTerminalsForSquad(disc.id).length
        : 0;
      const orphanCount = this.terminalManager
        ? this.terminalManager.getOrphanedSessions()
            .filter(o => o.squadId === disc.id && !!o.agentSessionId)
            .length
        : 0;

      const itemType: TreeItemType = isHidden ? 'squad-hidden' : 'squad';

      const item = new EditlessTreeItem(
        `${icon} ${displayName}`,
        itemType,
        isStandalone
          ? ((terminalCount > 0 || orphanCount > 0) ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None)
          : vscode.TreeItemCollapsibleState.Collapsed,
        disc.id,
      );

      const descParts: string[] = [];
      if (!isStandalone && disc.universe) {
        descParts.push(disc.universe);
      }
      if (terminalCount > 0) {
        descParts.push(`${terminalCount} session${terminalCount === 1 ? '' : 's'}`);
      }
      if (orphanCount > 0) {
        descParts.push(`${orphanCount} resumable`);
      }
      if (isHidden) {
        descParts.push('(hidden)');
      }
      item.description = descParts.join(' · ');

      const originalIcon = isStandalone ? 'hubot' : 'organization';
      item.iconPath = isHidden
        ? new vscode.ThemeIcon(originalIcon, new vscode.ThemeColor('disabledForeground'))
        : new vscode.ThemeIcon(originalIcon);

      const tooltipLines = [
        `**${icon} ${displayName}**`,
        `Path: \`${disc.path}\``,
      ];
      if (disc.universe) tooltipLines.push(`Universe: ${disc.universe}`);
      const localVersion = getLocalSquadVersion(disc.path);
      if (localVersion) tooltipLines.push(`Squad Version: ${localVersion}`);
      item.tooltip = new vscode.MarkdownString(tooltipLines.join('\n\n'));

      return item;
    }

    // Standalone agent item
    const settings = this.agentSettings.get(disc.id);
    const displayName = settings?.name ?? disc.name;
    const itemType: TreeItemType = isHidden ? 'squad-hidden' : 'squad';

    const terminalCount = this.terminalManager
      ? this.terminalManager.getTerminalsForSquad(disc.id).length
      : 0;
    const orphanCount = this.terminalManager
      ? this.terminalManager.getOrphanedSessions()
          .filter(o => o.squadId === disc.id && !!o.agentSessionId)
          .length
      : 0;

    const item = new EditlessTreeItem(
      displayName,
      itemType,
      (terminalCount > 0 || orphanCount > 0)
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
      disc.id,
    );

    const descParts: string[] = [];
    if (disc.description) descParts.push(disc.description);
    else descParts.push(disc.source);
    if (terminalCount > 0) {
      descParts.push(`${terminalCount} session${terminalCount === 1 ? '' : 's'}`);
    }
    if (isHidden) {
      descParts.push('(hidden)');
    }
    item.description = descParts.join(' · ');

    item.iconPath = isHidden
      ? new vscode.ThemeIcon('hubot', new vscode.ThemeColor('disabledForeground'))
      : new vscode.ThemeIcon('hubot');

    item.tooltip = new vscode.MarkdownString(
      [`**🤖 ${displayName}**`, `Source: ${disc.source}`, `File: \`${disc.path}\``].join('\n\n'),
    );

    return item;
  }

  private buildDefaultAgentItem(): EditlessTreeItem {
    const terminalCount = this.terminalManager
      ? this.terminalManager.getTerminalsForSquad(DEFAULT_COPILOT_CLI_ID).length
      : 0;

    const orphanCount = this.terminalManager
      ? this.terminalManager.getOrphanedSessions()
          .filter(o => o.squadId === DEFAULT_COPILOT_CLI_ID && !!o.agentSessionId)
          .length
      : 0;

    const item = new EditlessTreeItem(
      'Copilot CLI',
      'default-agent',
      (terminalCount > 0 || orphanCount > 0)
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
      DEFAULT_COPILOT_CLI_ID,
    );
    item.id = DEFAULT_COPILOT_CLI_ID;
    item.iconPath = new vscode.ThemeIcon('terminal');

    const descParts: string[] = [];
    if (terminalCount > 0) {
      descParts.push(`${terminalCount} session${terminalCount === 1 ? '' : 's'}`);
    }
    if (orphanCount > 0) {
      descParts.push(`${orphanCount} resumable`);
    }
    item.description = descParts.length > 0 ? descParts.join(' · ') : 'Generic Copilot agent';

    item.tooltip = new vscode.MarkdownString(
      '**Copilot CLI**\n\nLaunch the generic Copilot CLI without a specific agent.',
    );
    return item;
  }

  private getDefaultAgentChildren(parentItem: EditlessTreeItem): EditlessTreeItem[] {
    if (!this.terminalManager) return [];

    const children: EditlessTreeItem[] = [];
    for (const { terminal, info } of this.terminalManager.getTerminalsForSquad(DEFAULT_COPILOT_CLI_ID)) {
      const sessionState = this.terminalManager.getSessionState(terminal) ?? 'inactive';

      const elapsed = Date.now() - info.createdAt.getTime();
      const mins = Math.floor(elapsed / 60_000);
      const relative = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;

      const customLabel = this.labelManager?.getLabel(info.labelKey);
      const title = customLabel ? `🏷️ ${customLabel}` : info.displayName;
      const item = new EditlessTreeItem(title, 'terminal');
      item.terminal = terminal;
      item.description = sessionState === 'launching' ? 'launching…'
        : sessionState === 'attention' ? 'waiting for input'
        : relative;
      item.iconPath = getStateIcon(sessionState);
      item.contextValue = 'terminal';
      item.tooltip = `${info.displayName} — started ${relative}`;
      item.command = {
        command: 'editless.focusTerminal',
        title: 'Focus',
        arguments: [terminal],
      };
      item.parent = parentItem;
      children.push(item);
    }

    return children;
  }

  // -- Squad children: categories + terminal sessions ---------------------

  private getState(squadId: string): SquadState | undefined {
    if (!this._cache.has(squadId)) {
      const disc = this._discoveredItems.find(d => d.id === squadId);
      if (!disc) return undefined;
      const settings = this.agentSettings.get(squadId);
      const cfg: AgentTeamConfig = {
        id: disc.id,
        name: settings?.name ?? disc.name,
        path: disc.path,
        icon: settings?.icon ?? (disc.type === 'squad' ? '🔷' : '🤖'),
        universe: disc.universe ?? 'standalone',
        description: disc.description,
        model: settings?.model,
        additionalArgs: settings?.additionalArgs,
      };
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
        item.description = sessionState === 'launching' ? 'launching…'
          : sessionState === 'attention' ? 'waiting for input'
          : relative;
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

      // Hint when squad has no sessions yet
      const hasTerminals = this.terminalManager.getTerminalsForSquad(squadId).length > 0;
      const hasOrphans = this.terminalManager.getOrphanedSessions().some(o => o.squadId === squadId);
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

  // -- Orphan item builder --------------------------------------------------

  private _buildOrphanItem(entry: PersistedTerminalInfo): EditlessTreeItem {
    const resumable = !!entry.agentSessionId;
    const item = new EditlessTreeItem(entry.displayName, 'orphanedSession');
    item.id = `orphan:${entry.id}`;
    item.persistedEntry = entry;
    item.description = resumable ? 'previous session — resume' : 'session ended';
    item.iconPath = resumable
      ? new vscode.ThemeIcon('history')
      : new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('disabledForeground'));
    item.contextValue = 'orphanedSession';
    item.tooltip = new vscode.MarkdownString(
      resumable
        ? [`**${entry.displayName}**`, `Squad: ${entry.squadName}`, 'Your conversation is saved. Click to pick up where you left off.'].join('\n\n')
        : [`**${entry.displayName}**`, `Squad: ${entry.squadName}`, 'This terminal was closed. The conversation cannot be resumed.'].join('\n\n'),
    );
    item.command = {
      command: 'editless.relaunchSession',
      title: 'Resume Session',
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
