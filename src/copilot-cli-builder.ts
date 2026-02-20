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
  /** Arbitrary additional CLI arguments. Appended after typed flags. */
  extraArgs?: string[];
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

  // Append freeform extraArgs with intelligent dedup against typed flags
  if (options.extraArgs?.length) {
    const TYPED_FLAGS = new Set([
      '--agent', '--resume', '--continue', '--model', '--add-dir', '--allow-all-tools',
    ]);
    // Collect flags that were actually set by typed options
    const activeTypedFlags = new Set<string>();
    if (options.agent) { activeTypedFlags.add('--agent'); }
    if (options.resume) { activeTypedFlags.add('--resume'); }
    if (options.continue) { activeTypedFlags.add('--continue'); }
    if (options.model) { activeTypedFlags.add('--model'); }
    if (options.addDirs) { activeTypedFlags.add('--add-dir'); }
    if (options.allowAllTools) { activeTypedFlags.add('--allow-all-tools'); }

    for (const arg of options.extraArgs) {
      const flag = arg.startsWith('--') ? arg.split(/[= ]/)[0] : null;
      if (flag && TYPED_FLAGS.has(flag) && activeTypedFlags.has(flag)) {
        console.warn(`[editless] extraArgs flag "${flag}" dropped — already set by typed option`);
      } else {
        parts.push(arg);
      }
    }
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
