import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Copilot CLI Command Builder
// ---------------------------------------------------------------------------
// Builds fully-formed `copilot` CLI commands from typed options.
// Replaces $(agent) variable interpolation with direct string construction.
// ---------------------------------------------------------------------------

/** Quote an argument if it contains spaces, so shell parsing won't split it. */
function shellQuote(arg: string): string {
  return arg.includes(' ') ? `"${arg}"` : arg;
}

export interface CopilotCommandOptions {
  /** Agent type to launch (e.g. "squad", "my-agent"). Maps to --agent flag. */
  agent?: string;
  /** Session ID to resume. Maps to --resume flag. */
  resume?: string;
  /** Additional directories to include. Each maps to an --add-dir flag. */
  addDirs?: string[];
  /** Arbitrary additional CLI arguments (e.g. --model, --yolo, --continue). */
  extraArgs?: string[];
}

/**
 * Returns the base CLI binary name.
 * Always returns `"copilot"`.
 */
export function getCliCommand(): string {
  return 'copilot';
}

/**
 * Build a full `copilot` CLI command string from typed options.
 *
 * ```ts
 * buildCopilotCommand({ agent: 'squad', extraArgs: ['--model', 'gpt-5'] })
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
  if (options.addDirs) {
    for (const dir of options.addDirs) {
      parts.push('--add-dir', shellQuote(dir));
    }
  }

  // Append freeform extraArgs with intelligent dedup against typed flags
  if (options.extraArgs?.length) {
    const safeArgs = options.extraArgs.filter((a): a is string => typeof a === 'string' && a.length > 0);
    const TYPED_FLAGS = new Set(['--agent', '--resume', '--add-dir']);
    const activeTypedFlags = new Set<string>();
    if (options.agent) { activeTypedFlags.add('--agent'); }
    if (options.resume) { activeTypedFlags.add('--resume'); }
    if (options.addDirs) { activeTypedFlags.add('--add-dir'); }

    for (let i = 0; i < safeArgs.length; i++) {
      const arg = safeArgs[i];
      const flag = arg.startsWith('--') ? arg.split(/[= ]/)[0] : null;
      if (flag && TYPED_FLAGS.has(flag) && activeTypedFlags.has(flag)) {
        console.warn(`[editless] extraArgs flag "${flag}" dropped — already set by typed option`);
        // Skip the next arg too if it's a dangling value (not a flag)
        if (i + 1 < safeArgs.length && !safeArgs[i + 1].startsWith('--')) {
          i++;
        }
      } else {
        parts.push(arg.startsWith('--') ? arg : shellQuote(arg));
      }
    }
  }

  return parts.join(' ');
}

/**
 * Build a default launch command with hardcoded agent type "squad".
 * Reads `editless.cli.additionalArgs` and appends them as extraArgs.
 */
export function buildDefaultLaunchCommand(): string {
  const additionalArgs = vscode.workspace
    .getConfiguration('editless.cli')
    .get<string>('additionalArgs', '');

  const extraArgs = additionalArgs.trim()
    ? additionalArgs.trim().split(/\s+/)
    : undefined;

  return buildCopilotCommand({ agent: 'squad', extraArgs });
}
