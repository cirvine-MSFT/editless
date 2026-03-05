import * as vscode from 'vscode';
import type { TerminalManager, TerminalInfo, PersistedTerminalInfo, SessionState } from './terminal-manager';
import type { SessionLabelManager } from './session-labels';
import type { SessionContextResolver } from './session-context';
import type { SessionContext } from './types';

// ---------------------------------------------------------------------------
// Data types — computed from manager queries
// ---------------------------------------------------------------------------

/** Aggregated terminal + orphan counts for a single agent node. */
export interface AgentNodeData {
  terminalCount: number;
  orphanCount: number;
}

/** Pre-fetched data for rendering a single terminal tree item. */
export interface TerminalNodeData {
  terminal: vscode.Terminal;
  info: TerminalInfo;
  sessionState: SessionState;
  lastActivityAt?: number;
  relative: string;
  customLabel?: string;
}

// ---------------------------------------------------------------------------
// Query helpers — read from managers, return plain data
// ---------------------------------------------------------------------------

/** Get terminal + orphan counts for a given agent. */
export function queryAgentNodeData(
  tm: TerminalManager | undefined,
  agentId: string,
): AgentNodeData {
  if (!tm) return { terminalCount: 0, orphanCount: 0 };
  return {
    terminalCount: tm.getTerminalsForAgent(agentId).length,
    orphanCount: tm.getOrphanedSessions()
      .filter(o => o.agentId === agentId && !!o.agentSessionId).length,
  };
}

/** Enrich each terminal for an agent with session state, timing, and label. */
export function queryTerminalNodes(
  tm: TerminalManager,
  labelManager: SessionLabelManager | undefined,
  agentId: string,
): TerminalNodeData[] {
  return tm.getTerminalsForAgent(agentId).map(({ terminal, info }) => ({
    terminal,
    info,
    sessionState: (tm.getSessionState(terminal) ?? 'inactive') as SessionState,
    lastActivityAt: tm.getLastActivityAt(terminal),
    relative: formatRelativeTime(info.createdAt),
    customLabel: labelManager?.getLabel(info.labelKey),
  }));
}

/** Filter orphaned sessions belonging to a specific agent. */
export function queryOrphansForAgent(
  tm: TerminalManager,
  agentId: string,
): PersistedTerminalInfo[] {
  return tm.getOrphanedSessions().filter(o => o.agentId === agentId);
}

/** Resolve session context for a squad path (null-safe). */
export function querySessionContext(
  resolver: SessionContextResolver | undefined,
  path: string | undefined,
): SessionContext | null {
  if (!resolver || !path) return null;
  return resolver.resolveForSquad(path);
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Turn a creation timestamp into a human-readable relative string. */
export function formatRelativeTime(createdAt: Date): string {
  const elapsed = Date.now() - createdAt.getTime();
  const mins = Math.floor(elapsed / 60_000);
  return mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
}

/** Build the description string shown next to a terminal tree item. */
export function getTerminalDescription(sessionState: SessionState, relative: string): string {
  return sessionState === 'launching' ? 'launching…'
    : sessionState === 'attention' ? 'waiting for input'
    : relative;
}
