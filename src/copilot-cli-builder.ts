import * as vscode from 'vscode';
import type { AgentTeamConfig } from './types';

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
  /** Custom CLI command override (e.g. "my-wrapper copilot"). Not shell-quoted — may be multi-word. */
  command?: string;
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
 * Returns the CLI command to use.
 * Precedence: override parameter → `editless.cli.command` setting → `"copilot"`.
 */
export function getCliCommand(override?: string): string {
  if (override?.trim()) { return override; }
  return vscode.workspace.getConfiguration('editless.cli').get<string>('command', 'copilot')?.trim() || 'copilot';
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
  const parts: string[] = [getCliCommand(options.command)];

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
 * Build a launch command from structured config fields.
 * Merges per-config additionalArgs with global `editless.cli.additionalArgs`.
 */
export function buildLaunchCommandForConfig(config: Pick<AgentTeamConfig, 'id' | 'universe' | 'model' | 'additionalArgs' | 'command'>): string {
  // Derive --agent flag value from id/universe
  let agentFlag: string | undefined;
  if (config.id === 'builtin:copilot-cli') {
    agentFlag = undefined;
  } else if (config.universe === 'standalone') {
    agentFlag = config.id;
  } else {
    agentFlag = 'squad';
  }

  const globalAdditional = vscode.workspace
    .getConfiguration('editless.cli')
    .get<string>('additionalArgs', '');

  let allExtra = [config.additionalArgs, globalAdditional]
    .filter(Boolean)
    .join(' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  // Strip --model/--agent from additionalArgs when structured config fields set them
  const configFlags = new Map<string, string>();
  if (config.model) { configFlags.set('--model', 'config.model'); }
  if (agentFlag) { configFlags.set('--agent', 'agentFlag'); }

  if (configFlags.size > 0) {
    const filtered: string[] = [];
    for (let i = 0; i < allExtra.length; i++) {
      const flag = allExtra[i].startsWith('--') ? allExtra[i].split(/[= ]/)[0] : null;
      if (flag && configFlags.has(flag)) {
        console.warn(`[editless] additionalArgs flag "${flag}" dropped — already set by ${configFlags.get(flag)}`);
        // Skip dangling value (next arg if it's not a flag)
        if (i + 1 < allExtra.length && !allExtra[i + 1].startsWith('--')) {
          i++;
        }
      } else {
        filtered.push(allExtra[i]);
      }
    }
    allExtra = filtered;
  }

  const modelArgs = config.model ? ['--model', config.model] : [];
  const extraArgs = [...modelArgs, ...allExtra];

  return buildCopilotCommand({
    command: config.command,
    agent: agentFlag,
    extraArgs: extraArgs.length ? extraArgs : undefined,
  });
}

/**
 * @deprecated Use `buildLaunchCommandForConfig()` instead.
 * Build a default launch command with hardcoded agent type "squad".
 * Reads `editless.cli.additionalArgs` and appends them as extraArgs.
 */
export function buildDefaultLaunchCommand(): string {
  return buildLaunchCommandForConfig({ id: 'default', universe: 'unknown' });
}
