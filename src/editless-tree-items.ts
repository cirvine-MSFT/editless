import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { getLocalSquadVersion } from './squad-utils';
import { getStateIcon, getStateDescription } from './terminal-manager';
import type { PersistedTerminalInfo, SessionState } from './terminal-manager';
import type { AgentInfo, AgentTeamConfig, SessionContext } from './types';
import { type DiscoveredItem } from './unified-discovery';
import { normalizeAgentName } from './discovery';
import type { AgentSettings } from './agent-settings';
import type { AgentNodeData, TerminalNodeData } from './editless-tree-data';
import { getTerminalDescription } from './editless-tree-data';

// ---------------------------------------------------------------------------
// Tree item types & class
// ---------------------------------------------------------------------------

export type TreeItemType = 'squad' | 'agent-hidden' | 'category' | 'agent' | 'terminal' | 'orphanedSession' | 'default-agent';

/** Sentinel ID for the built-in Copilot CLI entry. */
export const DEFAULT_COPILOT_CLI_ID = 'builtin:copilot-cli';

/** Build the AgentTeamConfig for the built-in Copilot CLI agent. */
export function buildCopilotCLIConfig(cwd?: string): AgentTeamConfig {
  return {
    id: DEFAULT_COPILOT_CLI_ID,
    name: 'Copilot CLI',
    path: cwd ?? '',
    icon: '🤖',
    universe: 'standalone',
  };
}

type CategoryKind = 'roster' | 'hidden';

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
// Helpers
// ---------------------------------------------------------------------------

function stableHash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').substring(0, 8);
}

// ---------------------------------------------------------------------------
// Tree item builders — pure construction, no manager access
// ---------------------------------------------------------------------------

/** Build the root tree item for a discovered squad or standalone agent. */
export function buildDiscoveredRootItem(
  disc: DiscoveredItem,
  isHidden: boolean,
  settings: AgentSettings | undefined,
  nodeData: AgentNodeData,
): EditlessTreeItem {
  const isSquad = disc.type === 'squad';
  const isStandalone = isSquad && disc.universe === 'standalone';

  if (isSquad) {
    const displayName = normalizeAgentName(settings?.name || disc.name, disc.id);
    const icon = settings?.icon || (isStandalone ? '🤖' : '🔷');
    const { terminalCount, orphanCount } = nodeData;
    const itemType: TreeItemType = isHidden ? 'agent-hidden' : 'squad';

    const item = new EditlessTreeItem(
      `${icon} ${displayName}`,
      itemType,
      isStandalone
        ? ((terminalCount > 0 || orphanCount > 0) ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None)
        : vscode.TreeItemCollapsibleState.Collapsed,
      disc.id,
    );

    const descParts: string[] = [];
    if (!isStandalone && disc.universe) descParts.push(disc.universe);
    if (terminalCount > 0) descParts.push(`${terminalCount} session${terminalCount === 1 ? '' : 's'}`);
    if (orphanCount > 0) descParts.push(`${orphanCount} resumable`);
    if (isHidden) descParts.push('(hidden)');
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
  const displayName = settings?.name || disc.name;
  const icon = settings?.icon || '🤖';
  const itemType: TreeItemType = isHidden ? 'agent-hidden' : 'squad';
  const { terminalCount, orphanCount } = nodeData;

  const item = new EditlessTreeItem(
    `${icon} ${displayName}`,
    itemType,
    (terminalCount > 0 || orphanCount > 0)
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None,
    disc.id,
  );

  const descParts: string[] = [];
  if (disc.description) descParts.push(disc.description);
  else descParts.push(disc.source);
  if (terminalCount > 0) descParts.push(`${terminalCount} session${terminalCount === 1 ? '' : 's'}`);
  if (isHidden) descParts.push('(hidden)');
  item.description = descParts.join(' · ');

  item.iconPath = isHidden
    ? new vscode.ThemeIcon('hubot', new vscode.ThemeColor('disabledForeground'))
    : new vscode.ThemeIcon('hubot');

  item.tooltip = new vscode.MarkdownString(
    [`**${icon} ${displayName}**`, `Source: ${disc.source}`, `File: \`${disc.path}\``].join('\n\n'),
  );

  return item;
}

/** Build the built-in Copilot CLI root item. */
export function buildDefaultAgentItem(
  defaultId: string,
  nodeData: AgentNodeData,
): EditlessTreeItem {
  const { terminalCount, orphanCount } = nodeData;

  const item = new EditlessTreeItem(
    'Copilot CLI',
    'default-agent',
    (terminalCount > 0 || orphanCount > 0)
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None,
    defaultId,
  );
  item.id = defaultId;
  item.iconPath = new vscode.ThemeIcon('terminal');

  const descParts: string[] = [];
  if (terminalCount > 0) descParts.push(`${terminalCount} session${terminalCount === 1 ? '' : 's'}`);
  if (orphanCount > 0) descParts.push(`${orphanCount} resumable`);
  item.description = descParts.length > 0 ? descParts.join(' · ') : 'Generic Copilot agent';

  item.tooltip = new vscode.MarkdownString(
    '**Copilot CLI**\n\nLaunch the generic Copilot CLI without a specific agent.',
  );
  return item;
}

/** Build a tree item for an active terminal session. */
export function buildTerminalItem(
  data: TerminalNodeData,
  tooltip: vscode.MarkdownString | string,
): EditlessTreeItem {
  const title = data.customLabel ? `🏷️ ${data.customLabel}` : data.info.displayName;
  const item = new EditlessTreeItem(title, 'terminal');
  item.terminal = data.terminal as unknown as vscode.Terminal;
  item.description = getTerminalDescription(data.sessionState, data.relative);
  item.iconPath = getStateIcon(data.sessionState);
  item.contextValue = 'terminal';
  item.tooltip = tooltip;
  item.command = {
    command: 'editless.focusTerminal',
    title: 'Focus',
    arguments: [data.terminal],
  };
  return item;
}

/** Build a tree item for an orphaned / resumable session. */
export function buildOrphanItem(entry: PersistedTerminalInfo): EditlessTreeItem {
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
      ? [`**${entry.displayName}**`, `Agent: ${entry.agentName}`, 'Your conversation is saved. Click to pick up where you left off.'].join('\n\n')
      : [`**${entry.displayName}**`, `Agent: ${entry.agentName}`, 'This terminal was closed. The conversation cannot be resumed.'].join('\n\n'),
  );
  item.command = {
    command: 'editless.relaunchSession',
    title: 'Resume Session',
    arguments: [item],
  };
  return item;
}

/** Build a rich markdown tooltip for a terminal session. */
export function buildTerminalTooltip(
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

/** Build a roster agent tree item. */
export function buildAgentItem(agent: AgentInfo, squadId?: string, squadPath?: string): EditlessTreeItem {
  const item = new EditlessTreeItem(agent.name, 'agent', vscode.TreeItemCollapsibleState.None);
  item.contextValue = 'roster-agent';
  if (squadId && squadPath) {
    item.id = `${stableHash(squadPath)}:agent:${agent.name}`;
  }
  item.description = agent.role;
  item.iconPath = new vscode.ThemeIcon('person');
  return item;
}
