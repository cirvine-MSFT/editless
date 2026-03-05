import * as vscode from 'vscode';
import type { TerminalInfo, PersistedTerminalInfo } from './terminal-types';
import { resolveShellPath } from './copilot-cli-builder';
import { stripEmoji } from './emoji-utils';

const STORAGE_KEY = 'editless.terminalSessions';
export const MAX_REBOOT_COUNT = 5;

export interface TerminalMatchContext {
  terminals: Map<vscode.Terminal, TerminalInfo>;
  lastActivityAt: Map<vscode.Terminal, number>;
  counters: Map<string, number>;
}

/**
 * Handles persistence and reconciliation of terminal sessions across VS Code restarts.
 * Responsible for saving terminal state to workspace storage and matching
 * persisted entries to live terminals on activation.
 */
export class TerminalPersistence {
  private _pendingSaved: PersistedTerminalInfo[] = [];
  private _matchTimer: ReturnType<typeof setTimeout> | undefined;
  private _reconcileResolve?: () => void;
  private _reconcileTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly context: vscode.ExtensionContext,
  ) {}

  /**
   * Load persisted terminals from storage and attempt to match them to live terminals.
   * Returns disposables for watching terminal open events to retry matching.
   */
  reconcile(
    matchContext: TerminalMatchContext,
    sessionResolver?: { addSessionStateDir(dir: string): void },
  ): vscode.Disposable[] {
    const saved = this.context.workspaceState.get<PersistedTerminalInfo[]>(STORAGE_KEY, []);
    if (saved.length === 0) return [];

    // Increment rebootCount for unmatched entries; evict entries that exceeded TTL
    this._pendingSaved = saved
      .map(entry => ({
        ...entry,
        lastSeenAt: entry.lastSeenAt ?? Date.now(),
        rebootCount: (entry.rebootCount ?? 0) + 1,
      }))
      .filter(entry => entry.rebootCount < MAX_REBOOT_COUNT)
      .slice(0, 50);

    // Re-register custom config dirs so isSessionResumable works after restart (#465)
    // Also resolve shell variables in legacy persisted configDir values (#467)
    if (sessionResolver) {
      for (const entry of this._pendingSaved) {
        if (entry.configDir) {
          const resolved = resolveShellPath(entry.configDir);
          if (resolved !== entry.configDir) {
            entry.configDir = resolved;
          }
          sessionResolver.addSessionStateDir(resolved + '/session-state');
        }
      }
    }

    this._tryMatchTerminals(matchContext);

    // Terminals may not be available yet during activation — retry as they appear.
    // Debounce to batch rapid terminal arrivals and avoid off-by-one mismatches
    // when multiple terminals share the same shell-modified name (#148).
    return [
      vscode.window.onDidOpenTerminal(() => this._scheduleMatch(matchContext)),
    ];
  }

  /**
   * Save all tracked terminals to workspace storage.
   */
  persist(
    matchContext: TerminalMatchContext,
    detectSessionIds?: () => void,
  ): void {
    // Run session ID detection before persisting
    if (detectSessionIds) {
      detectSessionIds();
    }

    const now = Date.now();
    const entries: PersistedTerminalInfo[] = [];
    for (const [terminal, info] of matchContext.terminals) {
      entries.push({
        ...info,
        createdAt: info.createdAt.toISOString(),
        terminalName: terminal.name,
        lastSeenAt: now,
        lastActivityAt: matchContext.lastActivityAt.get(terminal),
        rebootCount: 0,
        agentSessionId: info.agentSessionId,
        launchCommand: info.launchCommand,
        agentPath: info.agentPath,
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

  /**
   * Get orphaned sessions that haven't been matched to live terminals.
   */
  getOrphanedSessions(): PersistedTerminalInfo[] {
    return [...this._pendingSaved];
  }

  /**
   * Remove an orphaned session from pending list.
   */
  dismissOrphan(entry: PersistedTerminalInfo): void {
    this._pendingSaved = this._pendingSaved.filter(e => e.id !== entry.id);
  }

  /**
   * Mark a persisted entry as matched (remove from pending).
   */
  markAsMatched(entryId: string): void {
    this._pendingSaved = this._pendingSaved.filter(e => e.id !== entryId);
  }

  /**
   * Returns a Promise that resolves once terminal matching has settled after
   * reconcile(). Resolves immediately if there are no pending saved entries.
   * Has a max timeout (2 s) so the caller never waits forever.
   */
  waitForReconciliation(): Promise<void> {
    if (this._pendingSaved.length === 0) { return Promise.resolve(); }
    return new Promise<void>(resolve => {
      this._reconcileResolve = resolve;
      this._reconcileTimer = setTimeout(() => {
        this._reconcileResolve = undefined;
        resolve();
      }, 2000);
    });
  }

  /**
   * Clean up timers on disposal.
   */
  dispose(): void {
    if (this._matchTimer !== undefined) {
      clearTimeout(this._matchTimer);
    }
    if (this._reconcileTimer !== undefined) {
      clearTimeout(this._reconcileTimer);
      this._reconcileResolve = undefined;
      this._reconcileTimer = undefined;
    }
  }

  private _scheduleMatch(matchContext: TerminalMatchContext): void {
    if (this._matchTimer !== undefined) {
      clearTimeout(this._matchTimer);
    }
    this._matchTimer = setTimeout(() => {
      this._matchTimer = undefined;
      this._tryMatchTerminals(matchContext);
    }, 200);
  }

  private _tryMatchTerminals(matchContext: TerminalMatchContext): void {
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
      matchContext.terminals.set(match, {
        id: persisted.id,
        labelKey: persisted.labelKey,
        displayName: persisted.displayName,
        originalName: persisted.originalName ?? persisted.displayName,
        agentId: persisted.agentId,
        agentName: persisted.agentName,
        agentIcon: persisted.agentIcon,
        index: persisted.index,
        createdAt: new Date(persisted.createdAt),
        agentSessionId: persisted.agentSessionId,
        launchCommand: persisted.launchCommand,
        agentPath: persisted.agentPath,
        configDir: persisted.configDir,
      });
      matchContext.lastActivityAt.set(match, persisted.lastActivityAt ?? persisted.lastSeenAt);
    };

    const runPass = (matcher: (t: vscode.Terminal, p: PersistedTerminalInfo) => boolean): void => {
      const stillUnmatched: PersistedTerminalInfo[] = [];
      for (const persisted of unmatched) {
        const match = liveTerminals.find(t => !claimed.has(t) && !matchContext.terminals.has(t) && matcher(t, persisted));
        if (!match) {
          stillUnmatched.push(persisted);
          continue;
        }
        claimMatch(match, persisted);
      }
      unmatched = stillUnmatched;
    };

    // Multi-signal matching: each stage only considers unclaimed terminals
    // TODO(pre-existing): Index-based matching (Pass 1) runs before name-based matching,
    // but index-matching is heuristic and should ideally be the last fallback.
    // Changing the order is out of scope for this refactor — see #470 review.
    // Pass 1: Index-based — match by agentId + terminal index
    runPass((t, p) => {
      for (const [, info] of matchContext.terminals) {
        if (info.agentId === p.agentId && info.index === p.index - 1) return true;
        if (info.agentId === p.agentId && info.index === p.index + 1) return true;
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

    // TODO(pre-existing): Reconciled terminals don't get watchSession() called,
    // so they won't receive events.jsonl updates until the next relaunch/reconnect.
    // The original terminal-manager.ts had the same gap. See #470 review.

    // Resolve the waitForReconciliation() promise when all entries are matched
    if (this._pendingSaved.length === 0 && this._reconcileResolve) {
      clearTimeout(this._reconcileTimer);
      const resolve = this._reconcileResolve;
      this._reconcileResolve = undefined;
      this._reconcileTimer = undefined;
      resolve();
    }

    // Update counters based on matched terminals
    for (const info of matchContext.terminals.values()) {
      const current = matchContext.counters.get(info.agentId) || 0;
      if (info.index >= current) {
        matchContext.counters.set(info.agentId, info.index + 1);
      }
    }
  }
}
