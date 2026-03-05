import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { AgentTeamConfig } from './types';
import type { SessionContextResolver, SessionEvent, SessionResumability } from './session-context';
import { CopilotEvents } from './copilot-sdk-types';
import { buildLaunchCommandForConfig, parseConfigDir, resolveShellPath } from './copilot-cli-builder';
import { type SessionState, isAttentionEvent, isWorkingEvent, getStateIcon, getStateDescription } from './terminal-state';
import { resolveTerminalCwd } from './cwd-resolver';
import { TerminalPersistence, MAX_REBOOT_COUNT, type TerminalMatchContext } from './terminal-persistence';
import { SessionRecovery, type SessionRecoveryContext } from './session-recovery';
import { detectAndAssignSessionIds } from './session-id-detector';
import type { TerminalInfo, PersistedTerminalInfo } from './terminal-types';

export const EDITLESS_INSTRUCTIONS_DIR = path.join(os.homedir(), '.copilot', 'editless');

// Re-exports for backward compatibility
export type { SessionState } from './terminal-state';
export { getStateIcon, getStateDescription } from './terminal-state';
export { resolveTerminalCwd } from './cwd-resolver';
export { stripEmoji } from './emoji-utils';
export type { TerminalInfo, PersistedTerminalInfo } from './terminal-types';

// ---------------------------------------------------------------------------
// TerminalManager
// ---------------------------------------------------------------------------

export class TerminalManager implements vscode.Disposable {
  static readonly MAX_REBOOT_COUNT = MAX_REBOOT_COUNT;
  
  private readonly _terminals = new Map<vscode.Terminal, TerminalInfo>();
  private readonly _counters = new Map<string, number>();
  private readonly _shellExecutionActive = new Map<vscode.Terminal, boolean>();
  private readonly _lastActivityAt = new Map<vscode.Terminal, number>();
  private readonly _sessionWatchers = new Map<vscode.Terminal, vscode.Disposable>();
  private readonly _lastSessionEvent = new Map<vscode.Terminal, SessionEvent>();
  private readonly _launchingTerminals = new Set<vscode.Terminal>();
  private readonly _launchTimers = new Map<vscode.Terminal, ReturnType<typeof setTimeout>>();
  private _changeTimer: ReturnType<typeof setTimeout> | undefined;
  private _persistTimer: ReturnType<typeof setInterval> | undefined;
  private _sessionResolver?: SessionContextResolver;

  private readonly _persistence: TerminalPersistence;
  private readonly _recovery: SessionRecovery;

  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

  private readonly _disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
    this._persistence = new TerminalPersistence(context);
    this._recovery = new SessionRecovery();
    
    // Crash-safe periodic persist (30s)
    this._persistTimer = setInterval(() => this._persist(), 30_000);

    this._disposables.push(
      vscode.window.onDidCloseTerminal(terminal => {
        this._clearLaunching(terminal);
        this._shellExecutionActive.delete(terminal);
        this._lastActivityAt.delete(terminal);
        this._lastSessionEvent.delete(terminal);
        const watcher = this._sessionWatchers.get(terminal);
        if (watcher) {
          watcher.dispose();
          this._sessionWatchers.delete(terminal);
        }
        if (this._terminals.delete(terminal)) {
          this._persist();
          this._scheduleChange();
        }
      }),
      vscode.window.onDidStartTerminalShellExecution(e => {
        this._clearLaunching(e.terminal);
        this._shellExecutionActive.set(e.terminal, true);
        this._lastActivityAt.set(e.terminal, Date.now());
        this._scheduleChange();
      }),
      vscode.window.onDidEndTerminalShellExecution(e => {
        this._shellExecutionActive.set(e.terminal, false);
        this._lastActivityAt.set(e.terminal, Date.now());
        this._scheduleChange();
      }),
    );
  }

  /** Batch rapid-fire change events into a single tree refresh (~50ms). */
  private _scheduleChange(): void {
    if (this._changeTimer !== undefined) {
      clearTimeout(this._changeTimer);
    }
    this._changeTimer = setTimeout(() => {
      this._changeTimer = undefined;
      this._onDidChange.fire();
    }, 50);
  }

  // -- Launch state tracking (#337) ------------------------------------------

  private static readonly LAUNCH_TIMEOUT_MS = 10_000;

  private _setLaunching(terminal: vscode.Terminal): void {
    this._launchingTerminals.add(terminal);
    const timer = setTimeout(() => {
      this._clearLaunching(terminal);
      this._scheduleChange();
    }, TerminalManager.LAUNCH_TIMEOUT_MS);
    this._launchTimers.set(terminal, timer);
  }

  private _clearLaunching(terminal: vscode.Terminal): void {
    this._launchingTerminals.delete(terminal);
    const timer = this._launchTimers.get(terminal);
    if (timer) {
      clearTimeout(timer);
      this._launchTimers.delete(terminal);
    }
  }

  // -- Public API -----------------------------------------------------------

  launchTerminal(config: AgentTeamConfig, customName?: string, extraEnv?: Record<string, string>): vscode.Terminal {
    const index = this._counters.get(config.id) || 1;
    const displayName = customName ?? `${config.icon} ${config.name} #${index}`;
    const id = `${config.id}-${Date.now()}-${index}`;
    const labelKey = `terminal:${id}`;

    // Pre-generate UUID for session tracking (#323, #326)
    const uuid = crypto.randomUUID();

    // Build launch command with --resume UUID
    const baseCmd = buildLaunchCommandForConfig(config);
    const launchCmd = `${baseCmd} --resume ${uuid}`;

    // Detect --config-dir flag from merged additionalArgs (#432)
    const globalAdditional = vscode.workspace.getConfiguration('editless.cli').get<string>('additionalArgs', '');
    const mergedArgs = [config.additionalArgs, globalAdditional].filter(Boolean).join(' ');
    const configDir = parseConfigDir(mergedArgs);

    const terminal = vscode.window.createTerminal({
      name: displayName,
      cwd: resolveTerminalCwd(config.path),
      isTransient: true,
      iconPath: new vscode.ThemeIcon('terminal'),
      env: {
        ...extraEnv,
        COPILOT_CUSTOM_INSTRUCTIONS_DIRS: [process.env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS, EDITLESS_INSTRUCTIONS_DIR].filter(Boolean).join(path.delimiter),
        EDITLESS_TERMINAL_ID: id,
        EDITLESS_SQUAD_ID: config.id,
        EDITLESS_SQUAD_NAME: config.name,
      },
    });

    const info: TerminalInfo = {
      id,
      labelKey,
      displayName,
      originalName: displayName,
      agentId: config.id,
      agentName: config.name,
      agentIcon: config.icon,
      index,
      createdAt: new Date(),
      agentSessionId: uuid,
      launchCommand: baseCmd,
      agentPath: config.path,
      configDir,
    };

    this._terminals.set(terminal, info);
    this._setLaunching(terminal);

    // Register custom config dir with the session resolver (#432)
    if (configDir && this._sessionResolver) {
      const customSessionStateDir = path.join(configDir, 'session-state');
      this._sessionResolver.addSessionStateDir(customSessionStateDir);
    }

    // Start watching the session for activity (#324)
    if (this._sessionResolver) {
      const watcher = this._sessionResolver.watchSession(uuid, event => {
        this._clearLaunching(terminal);
        this._lastSessionEvent.set(terminal, event);
        this._lastActivityAt.set(terminal, Date.now());
        this._scheduleChange();
      });
      this._sessionWatchers.set(terminal, watcher);
    }

    terminal.sendText(launchCmd);
    terminal.show(false);

    this._counters.set(config.id, index + 1);
    this._persist();
    this._scheduleChange();

    return terminal;
  }

  /**
   * Register a terminal that was created externally (e.g., via editless.resumeSession).
   * This allows the terminal to appear in the tree view under the correct agent.
   */
  registerExternalTerminal(
    terminal: vscode.Terminal,
    metadata: {
      agentId: string;
      agentName: string;
      agentIcon: string;
      agentSessionId?: string;
      launchCommand?: string;
      agentPath?: string;
    },
  ): void {
    const index = this._counters.get(metadata.agentId) || 1;
    const id = `${metadata.agentId}-${Date.now()}-${index}`;
    const labelKey = `terminal:${id}`;

    const info: TerminalInfo = {
      id,
      labelKey,
      displayName: terminal.name,
      originalName: terminal.name,
      agentId: metadata.agentId,
      agentName: metadata.agentName,
      agentIcon: metadata.agentIcon,
      index,
      createdAt: new Date(),
      agentSessionId: metadata.agentSessionId,
      launchCommand: metadata.launchCommand,
      agentPath: metadata.agentPath,
    };

    this._terminals.set(terminal, info);

    // Start watching the session for activity
    if (metadata.agentSessionId && this._sessionResolver) {
      const watcher = this._sessionResolver.watchSession(metadata.agentSessionId, event => {
        this._clearLaunching(terminal);
        this._lastSessionEvent.set(terminal, event);
        this._lastActivityAt.set(terminal, Date.now());
        this._scheduleChange();
      });
      this._sessionWatchers.set(terminal, watcher);
    }

    this._counters.set(metadata.agentId, index + 1);
    this._persist();
    this._scheduleChange();
  }

  getTerminalsForAgent(agentId: string): { terminal: vscode.Terminal; info: TerminalInfo }[] {
    const results: { terminal: vscode.Terminal; info: TerminalInfo }[] = [];
    for (const [terminal, info] of this._terminals) {
      if (info.agentId === agentId) {
        results.push({ terminal, info });
      }
    }
    return results.sort((a, b) => a.info.index - b.info.index);
  }

  getAllTerminals(): { terminal: vscode.Terminal; info: TerminalInfo }[] {
    const results: { terminal: vscode.Terminal; info: TerminalInfo }[] = [];
    for (const [terminal, info] of this._terminals) {
      results.push({ terminal, info });
    }
    return results;
  }

  getTerminalInfo(terminal: vscode.Terminal): TerminalInfo | undefined {
    return this._terminals.get(terminal);
  }

  getLabelKey(terminal: vscode.Terminal): string {
    return this._terminals.get(terminal)?.labelKey ?? `terminal:${terminal.name}`;
  }

  getDisplayName(terminal: vscode.Terminal): string {
    return this._terminals.get(terminal)?.displayName ?? terminal.name;
  }

  getLastActivityAt(terminal: vscode.Terminal): number | undefined {
    return this._lastActivityAt.get(terminal);
  }

  renameSession(terminal: vscode.Terminal, newDisplayName: string): void {
    const info = this._terminals.get(terminal);
    if (!info) return;
    info.displayName = newDisplayName;
    this._persist();
    this._scheduleChange();
  }

  focusTerminal(terminal: vscode.Terminal | string): void {
    let actualTerminal: vscode.Terminal | undefined;

    if (typeof terminal === 'string') {
      // Lookup terminal by ID from TerminalInfo
      for (const [t, info] of this._terminals) {
        if (info.id === terminal) {
          actualTerminal = t;
          break;
        }
      }
      if (!actualTerminal) {
        console.warn(`[editless] focusTerminal: No terminal found with id "${terminal}"`);
        return;
      }
    } else {
      actualTerminal = terminal;
    }

    // Verify terminal is still alive
    if (!vscode.window.terminals.includes(actualTerminal)) {
      console.warn('[editless] focusTerminal: Terminal no longer exists');
      return;
    }

    actualTerminal.show(false);
  }

  closeTerminal(terminal: vscode.Terminal): void {
    terminal.dispose();
  }

  // -- Public API: orphan management ----------------------------------------

  getOrphanedSessions(): PersistedTerminalInfo[] {
    return this._persistence.getOrphanedSessions();
  }

  reconnectSession(entry: PersistedTerminalInfo): vscode.Terminal | undefined {
    const terminal = this._recovery.reconnectSession(entry, this._getRecoveryContext());
    if (terminal) {
      this._persistence.markAsMatched(entry.id);
      this._persist();
    }
    return terminal;
  }

  /**
   * Resume an orphaned session. Validates session state before launching.
   * @param continueLatest When true, uses `--continue` instead of `--resume <id>`.
   */
  relaunchSession(entry: PersistedTerminalInfo, continueLatest = false): vscode.Terminal | undefined {
    const terminal = this._recovery.relaunchSession(entry, this._getRecoveryContext(), continueLatest);
    if (terminal) {
      this._persistence.markAsMatched(entry.id);
      this._persist();
    }
    return terminal;
  }

  dismissOrphan(entry: PersistedTerminalInfo): void {
    this._persistence.dismissOrphan(entry);
    this._persist();
    this._scheduleChange();
  }

  relaunchAllOrphans(): vscode.Terminal[] {
    const orphans = this._persistence.getOrphanedSessions();
    return this._recovery.relaunchAllOrphans(orphans, this._getRecoveryContext());
  }

  persist(): void {
    this._persist();
  }

  setSessionResolver(resolver: SessionContextResolver): void {
    this._sessionResolver = resolver;
  }

  /**
   * Returns a Promise that resolves once terminal matching has settled after
   * reconcile().  Resolves immediately if there are no pending saved entries.
   * Has a max timeout (2 s) so the caller never waits forever.
   */
  waitForReconciliation(): Promise<void> {
    return this._persistence.waitForReconciliation();
  }

  setAgentSessionId(terminal: vscode.Terminal, sessionId: string): void {
    const info = this._terminals.get(terminal);
    if (!info) return;
    info.agentSessionId = sessionId;
    this._persist();
    this._scheduleChange();
  }

  /**
   * For terminals missing an agentSessionId, try to detect the Copilot session
   * by matching session-state directories whose cwd matches the terminal's agentPath.
   */
  detectSessionIds(): void {
    if (!this._sessionResolver) return;

    const changed = detectAndAssignSessionIds(this._terminals, this._sessionResolver);
    if (changed) {
      this._persist();
      this._scheduleChange();
    }
  }

  // -- Public API: state detection ------------------------------------------

  getSessionState(terminalOrId: vscode.Terminal | string): SessionState | undefined {
    if (typeof terminalOrId === 'string') {
      const orphan = this._persistence.getOrphanedSessions().find(e => e.id === terminalOrId);
      return orphan ? 'orphaned' : undefined;
    }

    const terminal = terminalOrId;
    const info = this._terminals.get(terminal);
    if (!info) { return undefined; }

    // Show launching spinner until events arrive or timeout (#337)
    if (this._launchingTerminals.has(terminal)) {
      return 'launching';
    }

    // Prefer events.jsonl data over shell execution tracking — it reflects
    // the actual copilot agent state rather than the outer shell process.
    const lastEvent = this._lastSessionEvent.get(terminal);
    if (lastEvent) {
      if (isAttentionEvent(lastEvent)) return 'attention';
      return isWorkingEvent(lastEvent.type) ? 'active' : 'inactive';
    }

    // No events yet — the copilot CLI is a long-running process so
    // shellExecutionActive is always true while it's alive.  Don't
    // show the spinner just because the process is running; wait for
    // actual working events from events.jsonl before spinning.
    return 'inactive';
  }

  getStateIcon(state: SessionState, info?: PersistedTerminalInfo | TerminalInfo): vscode.ThemeIcon {
    const resumable = state === 'orphaned' && !!info?.agentSessionId;
    return getStateIcon(state, resumable);
  }

  getStateDescription(state: SessionState, info: PersistedTerminalInfo | TerminalInfo): string {
    const lastActivityAt = 'lastSeenAt' in info ? (info as PersistedTerminalInfo).lastSeenAt : undefined;
    const resumable = state === 'orphaned' && !!info.agentSessionId;
    return getStateDescription(state, lastActivityAt, resumable);
  }

  // -- Persistence & reconciliation -----------------------------------------

  reconcile(): void {
    const disposables = this._persistence.reconcile(
      this._getMatchContext(),
      this._sessionResolver,
    );
    this._disposables.push(...disposables);
    
    if (this._terminals.size > 0) {
      this._persist();
      this._scheduleChange();
    }
  }

  // NOTE(pre-existing): _persist() → detectSessionIds() → _persist() is mutually recursive.
  // It converges because detectAndAssignSessionIds only assigns IDs to terminals that lack one,
  // so the second _persist() call finds no new changes and doesn't recurse further.
  private _persist(): void {
    this._persistence.persist(this._getMatchContext(), () => this.detectSessionIds());
  }

  /**
   * Returns a snapshot of internal Maps by reference — callers mutate shared state directly.
   * This intentional coupling avoids copying large Maps on every reconciliation/persist cycle.
   */
  private _getMatchContext(): TerminalMatchContext {
    return {
      terminals: this._terminals,
      lastActivityAt: this._lastActivityAt,
      counters: this._counters,
    };
  }

  /**
   * Returns internal Maps/state by reference — the SessionRecovery module mutates
   * TerminalManager's state directly through these references (intentional coupling).
   */
  private _getRecoveryContext(): SessionRecoveryContext {
    return {
      terminals: this._terminals,
      lastActivityAt: this._lastActivityAt,
      lastSessionEvent: this._lastSessionEvent,
      sessionWatchers: this._sessionWatchers,
      sessionResolver: this._sessionResolver,
      setLaunching: (terminal: vscode.Terminal) => this._setLaunching(terminal),
      clearLaunching: (terminal: vscode.Terminal) => this._clearLaunching(terminal),
      scheduleChange: () => this._scheduleChange(),
    };
  }

  // -- Disposable -----------------------------------------------------------

  dispose(): void {
    if (this._changeTimer !== undefined) {
      clearTimeout(this._changeTimer);
    }
    if (this._persistTimer !== undefined) {
      clearInterval(this._persistTimer);
    }
    for (const timer of this._launchTimers.values()) {
      clearTimeout(timer);
    }
    this._launchTimers.clear();
    this._launchingTerminals.clear();
    for (const w of this._sessionWatchers.values()) {
      w.dispose();
    }
    this._sessionWatchers.clear();
    this._persistence.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
    this._onDidChange.dispose();
  }
}


