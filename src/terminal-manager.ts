import * as vscode from 'vscode';
import type { AgentTeamConfig } from './types';
import type { SessionContextResolver, SessionEvent } from './session-context';
import { getLaunchCommand } from './cli-settings';

// ---------------------------------------------------------------------------
// Terminal tracking metadata
// ---------------------------------------------------------------------------

export type SessionState = 'active' | 'inactive' | 'orphaned';

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

// ---------------------------------------------------------------------------
// TerminalManager
// ---------------------------------------------------------------------------

export class TerminalManager implements vscode.Disposable {
  private readonly _terminals = new Map<vscode.Terminal, TerminalInfo>();
  private readonly _counters = new Map<string, number>();
  private readonly _shellExecutionActive = new Map<vscode.Terminal, boolean>();
  private readonly _lastActivityAt = new Map<vscode.Terminal, number>();
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
        this._shellExecutionActive.delete(terminal);
        this._lastActivityAt.delete(terminal);
        if (this._terminals.delete(terminal)) {
          this._persist();
          this._onDidChange.fire();
        }
      }),
      vscode.window.onDidStartTerminalShellExecution(e => {
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

  // -- Public API -----------------------------------------------------------

  launchTerminal(config: AgentTeamConfig, customName?: string): vscode.Terminal {
    const index = this._counters.get(config.id) || 1;
    const displayName = customName ?? `${config.icon} ${config.name} #${index}`;
    const id = `${config.id}-${Date.now()}-${index}`;
    const labelKey = `terminal:${id}`;

    const terminal = vscode.window.createTerminal({
      name: displayName,
      cwd: config.path,
    });

    terminal.sendText(config.launchCommand || getLaunchCommand());
    terminal.show();

    this._terminals.set(terminal, {
      id,
      labelKey,
      displayName,
      originalName: displayName,
      squadId: config.id,
      squadName: config.name,
      squadIcon: config.icon,
      index,
      createdAt: new Date(),
      launchCommand: config.launchCommand,
      squadPath: config.path,
    });

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

  focusTerminal(terminal: vscode.Terminal): void {
    terminal.show();
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

    this._pendingSaved = this._pendingSaved.filter(e => e.id !== entry.id);
    this._persist();
    this._onDidChange.fire();
    return match;
  }

  relaunchSession(entry: PersistedTerminalInfo): vscode.Terminal {
    const reconnected = this.reconnectSession(entry);
    if (reconnected) {
      reconnected.show();
      return reconnected;
    }

    const terminal = vscode.window.createTerminal({
      name: entry.displayName,
      cwd: entry.squadPath,
    });
    terminal.show();

    if (entry.launchCommand) {
      if (entry.agentSessionId) {
        terminal.sendText(`${entry.launchCommand} --resume ${entry.agentSessionId}`);
      } else {
        terminal.sendText(entry.launchCommand);
      }
    }

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
    return orphans.map(entry => this.relaunchSession(entry));
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

    const isExecuting = this._shellExecutionActive.get(terminal);
    return isExecuting ? 'active' : 'inactive';
  }

  getStateIcon(state: SessionState): vscode.ThemeIcon {
    return getStateIcon(state);
  }

  getStateDescription(state: SessionState, info: PersistedTerminalInfo | TerminalInfo): string {
    const lastActivityAt = 'lastSeenAt' in info ? (info as PersistedTerminalInfo).lastSeenAt : undefined;
    return getStateDescription(state, lastActivityAt);
  }

  // -- Persistence & reconciliation -----------------------------------------

  private static readonly MAX_REBOOT_COUNT = 2;

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
      .filter(entry => entry.rebootCount < TerminalManager.MAX_REBOOT_COUNT);

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
    runPass((t, p) => t.name === p.terminalName);
    runPass((t, p) => t.name === (p.originalName ?? p.displayName));
    runPass((t, p) => t.name === p.displayName);
    runPass((t, p) => {
      const orig = p.originalName ?? p.displayName;
      return t.name.includes(orig) || p.terminalName.includes(t.name);
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
    for (const d of this._disposables) {
      d.dispose();
    }
    this._onDidChange.dispose();
  }
}

// -- Exported helpers for tree view and testability -------------------------

export function getStateIcon(state: SessionState): vscode.ThemeIcon {
  switch (state) {
    case 'active':
      return new vscode.ThemeIcon('loading~spin');
    case 'inactive':
      return new vscode.ThemeIcon('circle-outline');
    case 'orphaned':
      return new vscode.ThemeIcon('eye-closed');
    default:
      return new vscode.ThemeIcon('terminal');
  }
}

export function getStateDescription(state: SessionState, lastActivityAt?: number): string {
  switch (state) {
    case 'orphaned':
      return 'previous session';
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


