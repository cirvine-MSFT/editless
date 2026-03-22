import * as vscode from 'vscode';
import * as path from 'path';
import type { TerminalInfo, PersistedTerminalInfo } from './terminal-types';
import type { SessionContextResolver, SessionEvent } from './session-context';
import { resolveTerminalCwd } from './cwd-resolver';
import { resolveShellPath } from './copilot-cli-builder';
import { buildEditlessCustomInstructionsDirs } from './terminal-manager';

export interface SessionRecoveryContext {
  terminals: Map<vscode.Terminal, TerminalInfo>;
  lastActivityAt: Map<vscode.Terminal, number>;
  lastSessionEvent: Map<vscode.Terminal, SessionEvent>;
  sessionWatchers: Map<vscode.Terminal, vscode.Disposable>;
  sessionResolver?: SessionContextResolver;
  setLaunching(terminal: vscode.Terminal): void;
  clearLaunching(terminal: vscode.Terminal): void;
  scheduleChange(): void;
}

/**
 * Handles reconnection and relaunching of orphaned terminal sessions.
 * Responsible for matching persisted sessions to existing terminals or creating new ones.
 */
export class SessionRecovery {
  /**
   * Attempt to reconnect to an existing terminal that matches the persisted entry.
   * Returns the terminal if a match is found, undefined otherwise.
   */
  reconnectSession(
    entry: PersistedTerminalInfo,
    context: SessionRecoveryContext,
  ): vscode.Terminal | undefined {
    const liveTerminals = vscode.window.terminals;
    const orig = entry.originalName ?? entry.displayName;

    const unclaimed = (t: vscode.Terminal): boolean => !context.terminals.has(t);
    const match = liveTerminals.find(t => unclaimed(t) && t.name === entry.terminalName)
      ?? liveTerminals.find(t => unclaimed(t) && t.name === orig)
      ?? liveTerminals.find(t => unclaimed(t) && t.name === entry.displayName)
      ?? liveTerminals.find(t => unclaimed(t) && (t.name.includes(orig) || entry.terminalName.includes(t.name)));

    if (!match) return undefined;

    context.terminals.set(match, {
      id: entry.id,
      labelKey: entry.labelKey,
      displayName: entry.displayName,
      originalName: orig,
      agentId: entry.agentId,
      agentName: entry.agentName,
      agentIcon: entry.agentIcon,
      index: entry.index,
      createdAt: new Date(entry.createdAt),
      agentSessionId: entry.agentSessionId,
      launchCommand: entry.launchCommand,
      agentPath: entry.agentPath,
      configDir: entry.configDir,
    });

    // Start watching the reconnected session for activity
    if (entry.agentSessionId && context.sessionResolver) {
      const watcher = context.sessionResolver.watchSession(entry.agentSessionId, event => {
        context.lastSessionEvent.set(match, event);
        context.lastActivityAt.set(match, Date.now());
        context.scheduleChange();
      });
      context.sessionWatchers.set(match, watcher);
    }

    context.scheduleChange();
    return match;
  }

  /**
   * Resume an orphaned session. Validates session state before launching.
   * @param continueLatest When true, uses `--continue` instead of `--resume <id>`.
   */
  relaunchSession(
    entry: PersistedTerminalInfo,
    context: SessionRecoveryContext,
    continueLatest = false,
  ): vscode.Terminal | undefined {
    const reconnected = this.reconnectSession(entry, context);
    if (reconnected) {
      reconnected.show();
      return reconnected;
    }

    // Register custom config dir so isSessionResumable can find the session (#465)
    // Resolve shell variables in legacy persisted values (#467)
    if (entry.configDir && context.sessionResolver) {
      const resolved = resolveShellPath(entry.configDir);
      if (resolved !== entry.configDir) {
        entry.configDir = resolved;
      }
      context.sessionResolver.addSessionStateDir(path.join(resolved, 'session-state'));
    }

    // Pre-resume validation: check workspace.yaml + events.jsonl
    if (entry.agentSessionId && context.sessionResolver) {
      const check = context.sessionResolver.isSessionResumable(entry.agentSessionId);
      if (!check.resumable) {
        vscode.window.showErrorMessage(`Cannot resume session: ${check.reason}`);
        return undefined;
      }
      if (check.stale) {
        vscode.window.showWarningMessage(
          `Session ${entry.agentSessionId} has not been updated in over 7 days. It may be outdated.`,
        );
      }
    }

    // Build env vars for the new terminal
    const env: Record<string, string> = {};
    if (entry.agentSessionId) {
      env['EDITLESS_SESSION_ID'] = entry.id;
      env['EDITLESS_AGENT_SESSION_ID'] = entry.agentSessionId;
    }

    const terminal = vscode.window.createTerminal({
      name: entry.displayName,
      cwd: resolveTerminalCwd(entry.agentPath),
      isTransient: true,
      iconPath: new vscode.ThemeIcon('terminal'),
      env: {
        ...env,
        COPILOT_CUSTOM_INSTRUCTIONS_DIRS: buildEditlessCustomInstructionsDirs(
          process.env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS,
        ),
        EDITLESS_TERMINAL_ID: entry.id,
        EDITLESS_SQUAD_ID: entry.agentId,
        EDITLESS_SQUAD_NAME: entry.agentName,
      },
    });

    // Queue sendText BEFORE show() to avoid race condition where shell
    // isn't ready when the terminal becomes visible (#322)
    if (entry.launchCommand) {
      if (continueLatest) {
        terminal.sendText(`${entry.launchCommand} --continue`);
      } else if (entry.agentSessionId) {
        terminal.sendText(`${entry.launchCommand} --resume ${entry.agentSessionId}`);
      } else {
        terminal.sendText(entry.launchCommand);
      }
    }
    terminal.show(false);

    context.terminals.set(terminal, {
      id: entry.id,
      labelKey: entry.labelKey,
      displayName: entry.displayName,
      originalName: entry.originalName ?? entry.displayName,
      agentId: entry.agentId,
      agentName: entry.agentName,
      agentIcon: entry.agentIcon,
      index: entry.index,
      createdAt: new Date(),
      agentSessionId: entry.agentSessionId,
      launchCommand: entry.launchCommand,
      agentPath: entry.agentPath,
      configDir: entry.configDir,
    });
    context.setLaunching(terminal);

    // Start watching the relaunched session for activity
    if (entry.agentSessionId && context.sessionResolver) {
      const watcher = context.sessionResolver.watchSession(entry.agentSessionId, event => {
        context.clearLaunching(terminal);
        context.lastSessionEvent.set(terminal, event);
        context.lastActivityAt.set(terminal, Date.now());
        context.scheduleChange();
      });
      context.sessionWatchers.set(terminal, watcher);
    }

    context.scheduleChange();
    return terminal;
  }

  /**
   * Relaunch all orphaned sessions.
   */
  relaunchAllOrphans(
    orphans: PersistedTerminalInfo[],
    context: SessionRecoveryContext,
  ): vscode.Terminal[] {
    return orphans.map(entry => this.relaunchSession(entry, context)).filter((t): t is vscode.Terminal => t !== undefined);
  }
}
