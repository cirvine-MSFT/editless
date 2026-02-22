import * as vscode from 'vscode';
import * as crypto from 'crypto';
import type { AgentTeamConfig } from './types';
import type { SessionContextResolver, SessionEvent, SessionResumability } from './session-context';
import { getLaunchCommand } from './cli-settings';
import { buildCopilotCommand } from './copilot-cli-builder';

// ---------------------------------------------------------------------------
// Terminal tracking metadata
// ---------------------------------------------------------------------------

export type SessionState = 'launching' | 'active' | 'inactive' | 'orphaned';

export interface TerminalInfo {
  id: string;
  labelKey: string;
  displayName: string;
  originalName: string;
  squadId: string;
  squadName: string;
  squadIcon: string;
  index: number;
  createdAt: Date;
  agentSessionId?: string;
  launchCommand?: string;
  squadPath?: string;
}

export interface PersistedTerminalInfo {
  id: string;
  labelKey: string;
  displayName: string;
  originalName?: string;
  squadId: string;
  squadName: string;
  squadIcon: string;
  index: number;
  createdAt: string;
  terminalName: string;
  lastSeenAt: number;
  lastActivityAt?: number;
  rebootCount: number;
  agentSessionId?: string;
  launchCommand?: string;
  squadPath?: string;
}

const STORAGE_KEY = 'editless.terminalSessions';

/** Strip Unicode emoji (and variation selectors / ZWJ sequences) from a string. */
export function stripEmoji(str: string): string {
  return str
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]\uFE0F?(\u200D[\p{Emoji_Presentation}\p{Extended_Pictographic}]\uFE0F?)*/gu, '')
    .trim();
}

// ---------------------------------------------------------------------------
// TerminalManager
// ---------------------------------------------------------------------------

export class TerminalManager implements vscode.Disposable {
  private readonly _terminals = new Map<vscode.Terminal, TerminalInfo>();
  private readonly _counters = new Map<string, number>();
  private readonly _shellExecutionActive = new Map<vscode.Terminal, boolean>();
  private readonly _lastActivityAt = new Map<vscode.Terminal, number>();
  private readonly _sessionWatchers = new Map<vscode.Terminal, vscode.Disposable>();
  private readonly _lastSessionEvent = new Map<vscode.Terminal, SessionEvent>();
  private readonly _launchingTerminals = new Set<vscode.Terminal>();
  private readonly _launchTimers = new Map<vscode.Terminal, ReturnType<typeof setTimeout>>();
  private _matchTimer: ReturnType<typeof setTimeout> | undefined;
  private _persistTimer: ReturnType<typeof setInterval> | undefined;
  private _sessionResolver?: SessionContextResolver;

  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

  private readonly _disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
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
          this._onDidChange.fire();
        }
      }),
      vscode.window.onDidStartTerminalShellExecution(e => {
        this._clearLaunching(e.terminal);
        this._shellExecutionActive.set(e.terminal, true);
        this._lastActivityAt.set(e.terminal, Date.now());
        this._onDidChange.fire();
      }),
      vscode.window.onDidEndTerminalShellExecution(e => {
        this._shellExecutionActive.set(e.terminal, false);
        this._lastActivityAt.set(e.terminal, Date.now());
        this._onDidChange.fire();
      }),
    );
  }

  // -- Launch state tracking (#337) ------------------------------------------

  private static readonly LAUNCH_TIMEOUT_MS = 10_000;

  private _setLaunching(terminal: vscode.Terminal): void {
    this._launchingTerminals.add(terminal);
    const timer = setTimeout(() => {
      this._clearLaunching(terminal);
      this._onDidChange.fire();
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

  launchTerminal(config: AgentTeamConfig, customName?: string): vscode.Terminal {
    const index = this._counters.get(config.id) || 1;
    const displayName = customName ?? `${config.icon} ${config.name} #${index}`;
    const id = `${config.id}-${Date.now()}-${index}`;
    const labelKey = `terminal:${id}`;

    // Pre-generate UUID for session tracking (#323, #326)
    const uuid = crypto.randomUUID();

    // Build launch command with --resume UUID
    let launchCmd: string;
    if (config.launchCommand) {
      launchCmd = `${config.launchCommand} --resume ${uuid}`;
    } else {
      const defaultAgent = vscode.workspace
        .getConfiguration('editless.cli')
        .get<string>('defaultAgent', 'squad');
      launchCmd = buildCopilotCommand({ agent: defaultAgent, resume: uuid });
    }

    const terminal = vscode.window.createTerminal({
      name: displayName,
      cwd: config.path,
      isTransient: true,
      iconPath: new vscode.ThemeIcon('terminal'),
      env: {
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
      squadId: config.id,
      squadName: config.name,
      squadIcon: config.icon,
      index,
      createdAt: new Date(),
      agentSessionId: uuid,
      launchCommand: config.launchCommand,
      squadPath: config.path,
    };

    this._terminals.set(terminal, info);
    this._setLaunching(terminal);

    // Start watching the session for activity (#324)
    if (this._sessionResolver) {
      const watcher = this._sessionResolver.watchSession(uuid, event => {
        this._clearLaunching(terminal);
        this._lastSessionEvent.set(terminal, event);
        this._lastActivityAt.set(terminal, Date.now());
        this._onDidChange.fire();
      });
      this._sessionWatchers.set(terminal, watcher);
    }

    terminal.sendText(launchCmd);
    terminal.show(false);

    this._counters.set(config.id, index + 1);
    this._persist();
    this._onDidChange.fire();

    return terminal;
  }

  getTerminalsForSquad(squadId: string): { terminal: vscode.Terminal; info: TerminalInfo }[] {
    const results: { terminal: vscode.Terminal; info: TerminalInfo }[] = [];
    for (const [terminal, info] of this._terminals) {
      if (info.squadId === squadId) {
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
    this._onDidChange.fire();
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
    return [...this._pendingSaved];
  }

  reconnectSession(entry: PersistedTerminalInfo): vscode.Terminal | undefined {
    const liveTerminals = vscode.window.terminals;
    const orig = entry.originalName ?? entry.displayName;

    const unclaimed = (t: vscode.Terminal): boolean => !this._terminals.has(t);
    const match = liveTerminals.find(t => unclaimed(t) && t.name === entry.terminalName)
      ?? liveTerminals.find(t => unclaimed(t) && t.name === orig)
      ?? liveTerminals.find(t => unclaimed(t) && t.name === entry.displayName)
      ?? liveTerminals.find(t => unclaimed(t) && (t.name.includes(orig) || entry.terminalName.includes(t.name)));

    if (!match) return undefined;

    this._terminals.set(match, {
      id: entry.id,
      labelKey: entry.labelKey,
      displayName: entry.displayName,
      originalName: orig,
      squadId: entry.squadId,
      squadName: entry.squadName,
      squadIcon: entry.squadIcon,
      index: entry.index,
      createdAt: new Date(entry.createdAt),
      agentSessionId: entry.agentSessionId,
      launchCommand: entry.launchCommand,
      squadPath: entry.squadPath,
    });

    // Start watching the reconnected session for activity
    if (entry.agentSessionId && this._sessionResolver) {
      const watcher = this._sessionResolver.watchSession(entry.agentSessionId, event => {
        this._lastSessionEvent.set(match, event);
        this._lastActivityAt.set(match, Date.now());
        this._onDidChange.fire();
      });
      this._sessionWatchers.set(match, watcher);
    }

    this._pendingSaved = this._pendingSaved.filter(e => e.id !== entry.id);
    this._persist();
    this._onDidChange.fire();
    return match;
  }

  /**
   * Resume an orphaned session. Validates session state before launching.
   * @param continueLatest When true, uses `--continue` instead of `--resume <id>`.
   */
  relaunchSession(entry: PersistedTerminalInfo, continueLatest = false): vscode.Terminal | undefined {
    const reconnected = this.reconnectSession(entry);
    if (reconnected) {
      reconnected.show();
      return reconnected;
    }

    // Pre-resume validation: check workspace.yaml + events.jsonl
    if (entry.agentSessionId && this._sessionResolver) {
      const check = this._sessionResolver.isSessionResumable(entry.agentSessionId);
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
      cwd: entry.squadPath,
      isTransient: true,
      iconPath: new vscode.ThemeIcon('terminal'),
      env: {
        ...env,
        EDITLESS_TERMINAL_ID: entry.id,
        EDITLESS_SQUAD_ID: entry.squadId,
        EDITLESS_SQUAD_NAME: entry.squadName,
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

    this._terminals.set(terminal, {
      id: entry.id,
      labelKey: entry.labelKey,
      displayName: entry.displayName,
      originalName: entry.originalName ?? entry.displayName,
      squadId: entry.squadId,
      squadName: entry.squadName,
      squadIcon: entry.squadIcon,
      index: entry.index,
      createdAt: new Date(),
      agentSessionId: entry.agentSessionId,
      launchCommand: entry.launchCommand,
      squadPath: entry.squadPath,
    });
    this._setLaunching(terminal);

    // Start watching the relaunched session for activity
    if (entry.agentSessionId && this._sessionResolver) {
      const watcher = this._sessionResolver.watchSession(entry.agentSessionId, event => {
        this._clearLaunching(terminal);
        this._lastSessionEvent.set(terminal, event);
        this._lastActivityAt.set(terminal, Date.now());
        this._onDidChange.fire();
      });
      this._sessionWatchers.set(terminal, watcher);
    }

    this._pendingSaved = this._pendingSaved.filter(e => e.id !== entry.id);
    this._persist();
    this._onDidChange.fire();
    return terminal;
  }

  dismissOrphan(entry: PersistedTerminalInfo): void {
    this._pendingSaved = this._pendingSaved.filter(e => e.id !== entry.id);
    this._persist();
    this._onDidChange.fire();
  }

  relaunchAllOrphans(): vscode.Terminal[] {
    const orphans = [...this._pendingSaved];
    return orphans.map(entry => this.relaunchSession(entry)).filter((t): t is vscode.Terminal => t !== undefined);
  }

  persist(): void {
    this._persist();
  }

  setSessionResolver(resolver: SessionContextResolver): void {
    this._sessionResolver = resolver;
  }

  setAgentSessionId(terminal: vscode.Terminal, sessionId: string): void {
    const info = this._terminals.get(terminal);
    if (!info) return;
    info.agentSessionId = sessionId;
    this._persist();
    this._onDidChange.fire();
  }

  /**
   * For terminals missing an agentSessionId, try to detect the Copilot session
   * by matching session-state directories whose cwd matches the terminal's squadPath.
   */
  detectSessionIds(): void {
    if (!this._sessionResolver) return;

    const squadPaths: string[] = [];
    for (const info of this._terminals.values()) {
      if (!info.agentSessionId && info.squadPath) {
        squadPaths.push(info.squadPath);
      }
    }
    if (squadPaths.length === 0) return;

    const sessions = this._sessionResolver.resolveAll(squadPaths);
    let changed = false;

    for (const [terminal, info] of this._terminals) {
      if (info.agentSessionId || !info.squadPath) continue;
      const ctx = sessions.get(info.squadPath);
      if (!ctx) continue;

      // Only claim sessions created after the terminal was launched
      const sessionCreated = new Date(ctx.createdAt).getTime();
      if (sessionCreated < info.createdAt.getTime()) continue;

      // Check this session ID isn't already claimed by another terminal
      const alreadyClaimed = [...this._terminals.values()].some(
        other => other !== info && other.agentSessionId === ctx.sessionId,
      );
      if (alreadyClaimed) continue;

      info.agentSessionId = ctx.sessionId;
      changed = true;
    }

    if (changed) {
      this._persist();
      this._onDidChange.fire();
    }
  }

  // -- Public API: state detection ------------------------------------------

  getSessionState(terminalOrId: vscode.Terminal | string): SessionState | undefined {
    if (typeof terminalOrId === 'string') {
      const orphan = this._pendingSaved.find(e => e.id === terminalOrId);
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

  private static readonly MAX_REBOOT_COUNT = 5;

  reconcile(): void {
    const saved = this.context.workspaceState.get<PersistedTerminalInfo[]>(STORAGE_KEY, []);
    if (saved.length === 0) return;

    // Increment rebootCount for unmatched entries; evict entries that exceeded TTL
    this._pendingSaved = saved
      .map(entry => ({
        ...entry,
        lastSeenAt: entry.lastSeenAt ?? Date.now(),
        rebootCount: (entry.rebootCount ?? 0) + 1,
      }))
      .filter(entry => entry.rebootCount < TerminalManager.MAX_REBOOT_COUNT)
      .slice(0, 50);

    this._tryMatchTerminals();

    // Terminals may not be available yet during activation — retry as they appear.
    // Debounce to batch rapid terminal arrivals and avoid off-by-one mismatches
    // when multiple terminals share the same shell-modified name (#148).
    this._disposables.push(
      vscode.window.onDidOpenTerminal(() => this._scheduleMatch()),
    );
  }

  private _pendingSaved: PersistedTerminalInfo[] = [];

  private _scheduleMatch(): void {
    if (this._matchTimer !== undefined) {
      clearTimeout(this._matchTimer);
    }
    this._matchTimer = setTimeout(() => {
      this._matchTimer = undefined;
      this._tryMatchTerminals();
    }, 200);
  }

  private _tryMatchTerminals(): void {
    if (this._pendingSaved.length === 0) return;

    const liveTerminals = vscode.window.terminals;
    const claimed = new Set<vscode.Terminal>();
    // Sort by creation time so positional matching aligns with
    // vscode.window.terminals creation order — prevents off-by-one
    // when terminal names are non-unique (e.g., shell-modified to "pwsh").
    let unmatched = [...this._pendingSaved].sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    const claimMatch = (match: vscode.Terminal, persisted: PersistedTerminalInfo): void => {
      claimed.add(match);
      this._terminals.set(match, {
        id: persisted.id,
        labelKey: persisted.labelKey,
        displayName: persisted.displayName,
        originalName: persisted.originalName ?? persisted.displayName,
        squadId: persisted.squadId,
        squadName: persisted.squadName,
        squadIcon: persisted.squadIcon,
        index: persisted.index,
        createdAt: new Date(persisted.createdAt),
        agentSessionId: persisted.agentSessionId,
        launchCommand: persisted.launchCommand,
        squadPath: persisted.squadPath,
      });
      // Restore persisted activity time so state reflects actual history
      this._lastActivityAt.set(match, persisted.lastActivityAt ?? persisted.lastSeenAt);
    };

    const runPass = (matcher: (t: vscode.Terminal, p: PersistedTerminalInfo) => boolean): void => {
      const stillUnmatched: PersistedTerminalInfo[] = [];
      for (const persisted of unmatched) {
        const match = liveTerminals.find(t => !claimed.has(t) && !this._terminals.has(t) && matcher(t, persisted));
        if (!match) {
          stillUnmatched.push(persisted);
          continue;
        }
        claimMatch(match, persisted);
      }
      unmatched = stillUnmatched;
    };

    // Multi-signal matching: each stage only considers unclaimed terminals
    // Pass 1: Index-based — match by squadId + terminal index
    runPass((t, p) => {
      for (const [, info] of this._terminals) {
        if (info.squadId === p.squadId && info.index === p.index - 1) return true;
        if (info.squadId === p.squadId && info.index === p.index + 1) return true;
      }
      return false;
    });
    // Pass 2–4: Name-based matching
    runPass((t, p) => t.name === p.terminalName);
    runPass((t, p) => t.name === (p.originalName ?? p.displayName));
    runPass((t, p) => t.name === p.displayName);
    // Pass 5: Emoji-stripped name comparison
    runPass((t, p) => {
      const stripped = stripEmoji(t.name);
      if (stripped.length === 0) return false;
      return stripped === stripEmoji(p.terminalName)
        || stripped === stripEmoji(p.originalName ?? p.displayName)
        || stripped === stripEmoji(p.displayName);
    });

    this._pendingSaved = unmatched;

    for (const info of this._terminals.values()) {
      const current = this._counters.get(info.squadId) || 0;
      if (info.index >= current) {
        this._counters.set(info.squadId, info.index + 1);
      }
    }

    if (this._terminals.size > 0) {
      this._persist();
      this._onDidChange.fire();
    }
  }

  private _persist(): void {
    // Run session ID detection before persisting
    this.detectSessionIds();

    const now = Date.now();
    const entries: PersistedTerminalInfo[] = [];
    for (const [terminal, info] of this._terminals) {
      entries.push({
        ...info,
        createdAt: info.createdAt.toISOString(),
        terminalName: terminal.name,
        lastSeenAt: now,
        lastActivityAt: this._lastActivityAt.get(terminal),
        rebootCount: 0,
        agentSessionId: info.agentSessionId,
        launchCommand: info.launchCommand,
        squadPath: info.squadPath,
      });
    }
    // Preserve unmatched saved entries so they aren't lost during timing races
    for (const pending of this._pendingSaved) {
      if (!entries.some(e => e.id === pending.id)) {
        entries.push(pending);
      }
    }
    this.context.workspaceState.update(STORAGE_KEY, entries);
  }

  // -- Disposable -----------------------------------------------------------

  dispose(): void {
    if (this._matchTimer !== undefined) {
      clearTimeout(this._matchTimer);
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
    for (const d of this._disposables) {
      d.dispose();
    }
    this._onDidChange.dispose();
  }
}

// -- Exported helpers for tree view and testability -------------------------

/** Returns true if the event type indicates the agent is actively working. */
function isWorkingEvent(eventType: string): boolean {
  switch (eventType) {
    case 'assistant.turn_start':
    case 'assistant.message':
    case 'assistant.thinking':
    case 'assistant.code_edit':
    case 'tool.execution_start':
    case 'tool.execution_complete':
    case 'tool.result':
    case 'user.message':
    case 'session.resume':
      return true;
    default:
      return false;
  }
}

export function getStateIcon(state: SessionState, resumable = false): vscode.ThemeIcon {
  switch (state) {
    case 'launching':
    case 'active':
      return new vscode.ThemeIcon('loading~spin');
    case 'inactive':
      return new vscode.ThemeIcon('circle-outline');
    case 'orphaned':
      return resumable
        ? new vscode.ThemeIcon('history')
        : new vscode.ThemeIcon('circle-outline');
    default:
      return new vscode.ThemeIcon('terminal');
  }
}

export function getStateDescription(state: SessionState, lastActivityAt?: number, resumable = false): string {
  switch (state) {
    case 'launching':
      return 'launching…';
    case 'orphaned':
      return resumable ? 'previous session — resume' : 'session ended';
    case 'active':
    case 'inactive': {
      if (!lastActivityAt) {
        return '';
      }
      const ageMs = Date.now() - lastActivityAt;
      const mins = Math.floor(ageMs / 60_000);
      if (mins < 1) {
        return 'just now';
      }
      if (mins < 60) {
        return `${mins}m`;
      }
      const hours = Math.floor(mins / 60);
      return `${hours}h`;
    }
    default:
      return '';
  }
}


