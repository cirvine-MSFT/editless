import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Copilot CLI Command Builder
// ---------------------------------------------------------------------------
// Builds fully-formed `copilot` CLI commands from typed options.
// Replaces $(agent) variable interpolation with direct string construction.
// ---------------------------------------------------------------------------

export interface CopilotCommandOptions {
  /** Agent type to launch (e.g. "squad", "my-agent"). Maps to --agent flag. */
  agent?: string;
  /** Session ID to resume. Maps to --resume flag. */
  resume?: string;
  /** Continue the most recent session. Maps to --continue flag. */
  continue?: boolean;
  /** Model override. Maps to --model flag. */
  model?: string;
  /** Additional directories to include. Each maps to an --add-dir flag. */
  addDirs?: string[];
  /** Skip tool confirmation prompts. Maps to --allow-all-tools flag. */
  allowAllTools?: boolean;
}

/**
 * Returns the base CLI binary name from VS Code settings.
 * Defaults to `"copilot"` if not configured.
 */
export function getCliCommand(): string {
  return vscode.workspace
    .getConfiguration('editless.cli')
    .get<string>('command', 'copilot');
}

/**
 * Build a full `copilot` CLI command string from typed options.
 *
 * ```ts
 * buildCopilotCommand({ agent: 'squad', model: 'gpt-5' })
 * // → "copilot --agent squad --model gpt-5"
 * ```
 */
export function buildCopilotCommand(options: CopilotCommandOptions = {}): string {
  const parts: string[] = [getCliCommand()];

  if (options.agent) {
    parts.push('--agent', options.agent);
  }
  if (options.resume) {
    parts.push('--resume', options.resume);
  }
  if (options.continue) {
    parts.push('--continue');
  }
  if (options.model) {
    parts.push('--model', options.model);
  }
  if (options.addDirs) {
    for (const dir of options.addDirs) {
      parts.push('--add-dir', dir);
    }
  }
  if (options.allowAllTools) {
    parts.push('--allow-all-tools');
  }

  return parts.join(' ');
}

/**
 * Build a default launch command using the VS Code setting for agent type.
 * This is the replacement for `getLaunchCommand()` / `$(agent)` interpolation.
 */
export function buildDefaultLaunchCommand(): string {
  const agentType = vscode.workspace
    .getConfiguration('editless.cli')
    .get<string>('defaultAgent', 'squad');

  return buildCopilotCommand({ agent: agentType });
}
