import type * as vscode from 'vscode';
import type { TerminalManager } from './terminal-manager';
import type { SessionLabelManager } from './session-labels';
import type { AgentTeamConfig } from './types';

/**
 * Maximum allowed length for session names before truncation.
 */
export const MAX_SESSION_NAME = 50;

/**
 * Builds a session name from a raw name, truncating at word boundaries if needed.
 * If the raw name exceeds MAX_SESSION_NAME, truncates at the last space before the limit,
 * or at the limit itself if no space is found, and appends an ellipsis character.
 *
 * @param rawName The raw session name to process
 * @returns The final session name, truncated with ellipsis if needed
 */
export function buildSessionName(rawName: string): string {
  if (rawName.length <= MAX_SESSION_NAME) {
    return rawName;
  }
  const spaceIdx = rawName.lastIndexOf(' ', MAX_SESSION_NAME);
  const truncateAt = spaceIdx > 0 ? spaceIdx : MAX_SESSION_NAME;
  return rawName.slice(0, truncateAt) + '…';
}

/**
 * Launches a terminal with the given config and raw name, and assigns a label.
 * Automatically builds the session name using buildSessionName(), then launches
 * the terminal and stores the label.
 *
 * @param terminalManager The terminal manager instance
 * @param labelManager The session label manager instance
 * @param cfg The agent team configuration to launch
 * @param rawName The raw name for the session (will be truncated if needed)
 * @returns The created terminal
 */
export function launchAndLabel(
  terminalManager: TerminalManager,
  labelManager: SessionLabelManager,
  cfg: AgentTeamConfig,
  rawName: string,
): vscode.Terminal {
  const terminalName = buildSessionName(rawName);
  const terminal = terminalManager.launchTerminal(cfg, terminalName);
  labelManager.setLabel(terminalManager.getLabelKey(terminal), terminalName);
  return terminal;
}
