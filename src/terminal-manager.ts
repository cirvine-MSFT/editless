import * as vscode from 'vscode';
import type { AgentTeamConfig } from './types';

// ---------------------------------------------------------------------------
// Terminal tracking metadata
// ---------------------------------------------------------------------------

export type SessionState = 'active' | 'idle' | 'stale' | 'needs-attention' | 'orphaned';

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
  rebootCount: number;
}

const STORAGE_KEY = 'editless.terminalSessions';
const IDLE_THRESHOLD_MS = 5 * 60 * 1000;
const STALE_THRESHOLD_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// TerminalManager
// ---------------------------------------------------------------------------

export class TerminalManager implements vscode.Disposable {
  private readonly _terminals = new Map<vscode.Terminal, TerminalInfo>();
  private readonly _counters = new Map<string, number>();
  private readonly _shellExecutionActive = new Map<vscode.Terminal, boolean>();
  private readonly _lastActivityAt = new Map<vscode.Terminal, number>();

  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

  private readonly _disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
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

    terminal.sendText(config.launchCommand || 'agency copilot --agent squad --yolo -s');
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
    return results;
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

    const terminal = vscode.window.createTerminal({ name: entry.displayName });
    terminal.show();

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

  getSessionState(terminal: vscode.Terminal, inboxCount: number = 0): SessionState {
    const isExecuting = this._shellExecutionActive.get(terminal);
    if (isExecuting) {
      return 'active';
    }

    if (inboxCount > 0 && !isExecuting) {
      return 'needs-attention';
    }

    const lastActivity = this._lastActivityAt.get(terminal);
    if (!lastActivity) {
      return 'idle';
    }

    const ageMs = Date.now() - lastActivity;
    if (ageMs < IDLE_THRESHOLD_MS) {
      return 'active';
    }
    if (ageMs < STALE_THRESHOLD_MS) {
      return 'idle';
    }
    return 'stale';
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

    // Terminals may not be available yet during activation — retry as they appear
    this._disposables.push(
      vscode.window.onDidOpenTerminal(() => this._tryMatchTerminals()),
    );
  }

  private _pendingSaved: PersistedTerminalInfo[] = [];

  private _tryMatchTerminals(): void {
    if (this._pendingSaved.length === 0) return;

    const liveTerminals = vscode.window.terminals;
    const claimed = new Set<vscode.Terminal>();
    let unmatched = [...this._pendingSaved];

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
      });
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
    const now = Date.now();
    const entries: PersistedTerminalInfo[] = [];
    for (const [terminal, info] of this._terminals) {
      entries.push({
        ...info,
        createdAt: info.createdAt.toISOString(),
        terminalName: terminal.name,
        lastSeenAt: now,
        rebootCount: 0,
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
      return new vscode.ThemeIcon('debug-start');
    case 'needs-attention':
      return new vscode.ThemeIcon('warning');
    case 'orphaned':
      return new vscode.ThemeIcon('debug-disconnect', new vscode.ThemeColor('disabledForeground'));
    case 'stale':
    case 'idle':
    default:
      return new vscode.ThemeIcon('terminal');
  }
}

export function getStateDescription(state: SessionState, lastActivityAt?: number): string {
  switch (state) {
    case 'active':
      return '· active';
    case 'needs-attention':
      return '· needs attention';
    case 'orphaned':
      return '· orphaned — re-launch?';
    case 'stale':
      return '· stale — re-launch?';
    case 'idle': {
      if (!lastActivityAt) {
        return '· idle';
      }
      const ageMs = Date.now() - lastActivityAt;
      const mins = Math.floor(ageMs / 60_000);
      if (mins < 1) {
        return '· idle just now';
      }
      if (mins < 60) {
        return `· idle ${mins}m`;
      }
      const hours = Math.floor(mins / 60);
      return `· idle ${hours}h`;
    }
    default:
      return '';
  }
}
