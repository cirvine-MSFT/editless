import type * as vscode from 'vscode';
import type { TerminalManager } from './terminal-manager';
import type { SessionLabelManager } from './session-labels';
import type { AgentTeamConfig } from './types';

/**
 * Launches a terminal with the given config and raw name, and assigns a label.
 *
 * @param terminalManager The terminal manager instance
 * @param labelManager The session label manager instance
 * @param cfg The agent team configuration to launch
 * @param rawName The raw name for the session
 * @returns The created terminal
 */
export function launchAndLabel(
  terminalManager: TerminalManager,
  labelManager: SessionLabelManager,
  cfg: AgentTeamConfig,
  rawName: string,
  extraEnv?: Record<string, string>,
  initialPrompt?: string,
): vscode.Terminal {
  const terminal = initialPrompt === undefined
    ? terminalManager.launchTerminal(cfg, rawName, extraEnv)
    : terminalManager.launchTerminal(cfg, rawName, extraEnv, initialPrompt);
  labelManager.setLabel(terminalManager.getLabelKey(terminal), rawName);
  return terminal;
}
