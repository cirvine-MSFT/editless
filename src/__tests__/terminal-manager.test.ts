import { describe, it, expect, beforeEach, vi } from 'vitest';
import type * as vscode from 'vscode';
import type { AgentTeamConfig } from '../types';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

type CloseListener = (terminal: vscode.Terminal) => void;
type ShellExecutionListener = (event: { terminal: vscode.Terminal; execution: vscode.TerminalShellExecution }) => void;

const {
  mockCreateTerminal,
  mockOnDidCloseTerminal,
  mockOnDidOpenTerminal,
  mockOnDidStartTerminalShellExecution,
  mockOnDidEndTerminalShellExecution,
  mockTerminals,
} = vi.hoisted(() => ({
  mockCreateTerminal: vi.fn(),
  mockOnDidCloseTerminal: vi.fn(),
  mockOnDidOpenTerminal: vi.fn(),
  mockOnDidStartTerminalShellExecution: vi.fn(),
  mockOnDidEndTerminalShellExecution: vi.fn(),
  mockTerminals: [] as vscode.Terminal[],
}));

vi.mock('vscode', () => ({
  window: {
    createTerminal: mockCreateTerminal,
    onDidCloseTerminal: mockOnDidCloseTerminal,
    onDidOpenTerminal: mockOnDidOpenTerminal,
    onDidStartTerminalShellExecution: mockOnDidStartTerminalShellExecution,
    onDidEndTerminalShellExecution: mockOnDidEndTerminalShellExecution,
    get terminals() { return mockTerminals; },
  },
  EventEmitter: class {
    private listeners: Function[] = [];
    get event() {
      return (listener: Function) => {
        this.listeners.push(listener);
        return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
      };
    }
    fire(value?: unknown) { this.listeners.forEach(l => l(value)); }
    dispose() { this.listeners = []; }
  },
  ThemeIcon: class {
    constructor(public id: string) {}
  },
}));

vi.mock('../cli-provider', () => ({
  getActiveProviderLaunchCommand: () => '',
}));

import { TerminalManager, type PersistedTerminalInfo, type SessionState } from '../terminal-manager';

function makeMockTerminal(name: string): vscode.Terminal {
  return {
    name,
    show: vi.fn(),
    sendText: vi.fn(),
    dispose: vi.fn(),
    processId: Promise.resolve(undefined),
    creationOptions: {},
    exitStatus: undefined,
    state: { isInteractedWith: false },
  } as unknown as vscode.Terminal;
}

function makeMockContext(savedState?: PersistedTerminalInfo[]): vscode.ExtensionContext {
  const state = new Map<string, unknown>();
  if (savedState) {
    state.set('editless.terminalSessions', savedState);
  }
  return {
    workspaceState: {
      get: vi.fn((key: string, defaultValue?: unknown) => state.get(key) ?? defaultValue),
      update: vi.fn((key: string, value: unknown) => {
        state.set(key, value);
        return Promise.resolve();
      }),
      keys: () => [...state.keys()],
    },
    subscriptions: [],
  } as unknown as vscode.ExtensionContext;
}

function makeSquadConfig(overrides: Partial<AgentTeamConfig> = {}): AgentTeamConfig {
  return {
    id: 'test-squad',
    name: 'Test Squad',
    path: '/tmp/test-squad',
    icon: '🧪',
    universe: 'test',
    ...overrides,
  };
}

function makePersistedEntry(overrides: Partial<PersistedTerminalInfo> = {}): PersistedTerminalInfo {
  return {
    id: 'test-squad-1234-1',
    labelKey: 'terminal:test-squad-1234-1',
    displayName: '🧪 Test Squad #1',
    squadId: 'test-squad',
    squadName: 'Test Squad',
    squadIcon: '🧪',
    index: 1,
    createdAt: '2026-02-16T00:00:00.000Z',
    terminalName: '🧪 Test Squad #1',
    originalName: '🧪 Test Squad #1',
    lastSeenAt: Date.now(),
    rebootCount: 0,
    ...overrides,
  };
}

function getLastPersistedState(ctx: vscode.ExtensionContext): PersistedTerminalInfo[] | undefined {
  const calls = vi.mocked(ctx.workspaceState.update).mock.calls;
  const persistCalls = calls.filter(c => c[0] === 'editless.terminalSessions');
  const lastCall = persistCalls.at(-1);
  return lastCall ? lastCall[1] as PersistedTerminalInfo[] : undefined;
}

let capturedCloseListener: CloseListener;
let capturedShellStartListener: ShellExecutionListener;
let capturedShellEndListener: ShellExecutionListener;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockTerminals.length = 0;

  mockOnDidCloseTerminal.mockImplementation((listener: CloseListener) => {
    capturedCloseListener = listener;
    return { dispose: vi.fn() };
  });

  mockOnDidOpenTerminal.mockImplementation(() => {
    return { dispose: vi.fn() };
  });

  mockOnDidStartTerminalShellExecution.mockImplementation((listener: ShellExecutionListener) => {
    capturedShellStartListener = listener;
    return { dispose: vi.fn() };
  });

  mockOnDidEndTerminalShellExecution.mockImplementation((listener: ShellExecutionListener) => {
    capturedShellEndListener = listener;
    return { dispose: vi.fn() };
  });

  mockCreateTerminal.mockImplementation((opts: { name: string }) => {
    return makeMockTerminal(opts.name);
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TerminalManager', () => {

  describe('persistence on launch', () => {
    it('should persist terminal info to workspaceState after launchTerminal', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig();

      mgr.launchTerminal(config);

      expect(ctx.workspaceState.update).toHaveBeenCalledWith(
        'editless.terminalSessions',
        expect.arrayContaining([
          expect.objectContaining({
            squadId: 'test-squad',
            squadName: 'Test Squad',
            squadIcon: '🧪',
            index: 1,
            terminalName: '🧪 Test Squad #1',
          }),
        ]),
      );
    });
  });

  describe('persistence on close', () => {
    it('should remove terminal entry from workspaceState when terminal closes', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig();

      const terminal = mgr.launchTerminal(config);

      // Simulate close
      capturedCloseListener(terminal);

      // After close, persisted state should be empty
      const lastCall = vi.mocked(ctx.workspaceState.update).mock.calls.at(-1);
      expect(lastCall).toBeDefined();
      expect(lastCall![0]).toBe('editless.terminalSessions');
      expect(lastCall![1]).toEqual([]);
    });
  });

  describe('reconcile matches saved to live terminals', () => {
    it('should restore mappings when saved entries match live terminals', () => {
      const liveTerminal = makeMockTerminal('🧪 Test Squad #1');
      mockTerminals.push(liveTerminal);

      const saved = [makePersistedEntry()];
      const ctx = makeMockContext(saved);
      const mgr = new TerminalManager(ctx);

      mgr.reconcile();

      const all = mgr.getAllTerminals();
      expect(all).toHaveLength(1);
      expect(all[0].terminal).toBe(liveTerminal);
      expect(all[0].info.squadId).toBe('test-squad');
      expect(all[0].info.index).toBe(1);
    });
  });

  describe('reconcile preserves unmatched saved entries', () => {
    it('should keep saved entries when no matching live terminal exists yet', () => {
      // No live terminals — saved entry should be preserved for later matching
      const saved = [makePersistedEntry({ terminalName: '🧪 Ghost #1' })];
      const ctx = makeMockContext(saved);
      const mgr = new TerminalManager(ctx);

      mgr.reconcile();

      expect(mgr.getAllTerminals()).toHaveLength(0);
      // Saved entry is NOT deleted — it's kept for retry via onDidOpenTerminal
    });
  });

  describe('reconcile ignores unmatched live terminals', () => {
    it('should not track live terminals that are not in saved state', () => {
      const foreignTerminal = makeMockTerminal('zsh - user shell');
      mockTerminals.push(foreignTerminal);

      const ctx = makeMockContext([]);
      const mgr = new TerminalManager(ctx);

      mgr.reconcile();

      expect(mgr.getAllTerminals()).toHaveLength(0);
      expect(mgr.getTerminalInfo(foreignTerminal)).toBeUndefined();
    });
  });

  describe('reconcile restores counters', () => {
    it('should set the next launch index correctly after reconcile', () => {
      const liveTerminal = makeMockTerminal('🧪 Test Squad #3');
      mockTerminals.push(liveTerminal);

      const saved = [makePersistedEntry({ index: 3, terminalName: '🧪 Test Squad #3', displayName: '🧪 Test Squad #3' })];
      const ctx = makeMockContext(saved);
      const mgr = new TerminalManager(ctx);

      mgr.reconcile();

      // Next launch should be #4, not #1
      const config = makeSquadConfig();
      const newTerminal = mgr.launchTerminal(config);

      const all = mgr.getAllTerminals();
      const launched = all.find(t => t.terminal === newTerminal);
      expect(launched).toBeDefined();
      expect(launched!.info.index).toBe(4);
      expect(launched!.info.displayName).toBe('🧪 Test Squad #4');
    });
  });

  describe('reconcile with empty saved state', () => {
    it('should be a no-op without errors when no saved state exists', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);

      expect(() => mgr.reconcile()).not.toThrow();
      expect(mgr.getAllTerminals()).toHaveLength(0);
      // workspaceState.update should not have been called (early return)
      expect(ctx.workspaceState.update).not.toHaveBeenCalled();
    });
  });

  describe('reconcile fires onDidChange when terminals restored', () => {
    it('should fire the change event after successful reconciliation', () => {
      const liveTerminal = makeMockTerminal('🧪 Test Squad #1');
      mockTerminals.push(liveTerminal);

      const saved = [makePersistedEntry()];
      const ctx = makeMockContext(saved);
      const mgr = new TerminalManager(ctx);

      const changeSpy = vi.fn();
      mgr.onDidChange(changeSpy);

      mgr.reconcile();

      expect(changeSpy).toHaveBeenCalledOnce();
    });

    it('should not fire the change event when no terminals are restored', () => {
      // Saved entry has no matching live terminal
      const saved = [makePersistedEntry({ terminalName: '🧪 Ghost #1' })];
      const ctx = makeMockContext(saved);
      const mgr = new TerminalManager(ctx);

      const changeSpy = vi.fn();
      mgr.onDidChange(changeSpy);

      mgr.reconcile();

      expect(changeSpy).not.toHaveBeenCalled();
    });
  });

  describe('renameSession preserves icon', () => {
    it('should update displayName and persist when renaming', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig();

      const terminal = mgr.launchTerminal(config);

      // Clear call history from launch
      vi.mocked(ctx.workspaceState.update).mockClear();

      mgr.renameSession(terminal, 'My Custom Name');

      const info = mgr.getTerminalInfo(terminal);
      expect(info).toBeDefined();
      expect(info!.displayName).toBe('My Custom Name');
      // squadIcon must be preserved
      expect(info!.squadIcon).toBe('🧪');

      expect(ctx.workspaceState.update).toHaveBeenCalledWith(
        'editless.terminalSessions',
        expect.arrayContaining([
          expect.objectContaining({
            displayName: 'My Custom Name',
            squadIcon: '🧪',
          }),
        ]),
      );
    });

    it('should fire onDidChange when renaming', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig();

      const terminal = mgr.launchTerminal(config);

      const changeSpy = vi.fn();
      mgr.onDidChange(changeSpy);

      mgr.renameSession(terminal, 'Renamed');
      expect(changeSpy).toHaveBeenCalledOnce();
    });

    it('should be a no-op for an untracked terminal', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const untracked = makeMockTerminal('random');

      vi.mocked(ctx.workspaceState.update).mockClear();

      mgr.renameSession(untracked, 'Renamed');
      expect(ctx.workspaceState.update).not.toHaveBeenCalled();
    });
  });

  describe('multiple terminals for same squad', () => {
    it('should persist and reconcile multiple terminals for the same squad', () => {
      const live1 = makeMockTerminal('🧪 Test Squad #1');
      const live2 = makeMockTerminal('🧪 Test Squad #2');
      mockTerminals.push(live1, live2);

      const saved = [
        makePersistedEntry({ id: 'test-squad-1000-1', index: 1, terminalName: '🧪 Test Squad #1', displayName: '🧪 Test Squad #1' }),
        makePersistedEntry({ id: 'test-squad-1000-2', index: 2, terminalName: '🧪 Test Squad #2', displayName: '🧪 Test Squad #2' }),
      ];
      const ctx = makeMockContext(saved);
      const mgr = new TerminalManager(ctx);

      mgr.reconcile();

      const forSquad = mgr.getTerminalsForSquad('test-squad');
      expect(forSquad).toHaveLength(2);

      const indices = forSquad.map(t => t.info.index).sort();
      expect(indices).toEqual([1, 2]);
    });

    it('should persist correctly after launching multiple terminals for the same squad', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig();

      mgr.launchTerminal(config);
      mgr.launchTerminal(config);

      const lastCall = vi.mocked(ctx.workspaceState.update).mock.calls.at(-1);
      const persisted = lastCall![1] as PersistedTerminalInfo[];
      expect(persisted).toHaveLength(2);

      const indices = persisted.map(e => e.index).sort();
      expect(indices).toEqual([1, 2]);
    });
  });

  // =========================================================================
  // TDD — Orphan cleanup, defensive persist, re-launch, dismiss (#53)
  // Tests written before implementation (Morty is building in parallel).
  // =========================================================================

  describe('orphan cleanup — TTL enforcement', () => {
    it('should keep entry in pendingSaved after first reconcile (rebootCount increments)', () => {
      const staleEntry = makePersistedEntry({
        id: 'stale-orphan-1',
        terminalName: '🧪 Stale #1',
        lastSeenAt: Date.now() - 25 * 60 * 60 * 1000,
      });
      const ctx = makeMockContext([staleEntry]);
      const mgr = new TerminalManager(ctx);

      mgr.reconcile();

      const orphans = mgr.getOrphanedSessions();
      expect(orphans.find(e => e.id === 'stale-orphan-1')).toBeDefined();
    });

    it('should keep recent entries in pendingSaved after reconcile', () => {
      const recentEntry = makePersistedEntry({
        id: 'recent-pending-1',
        terminalName: '🧪 Recent #1',
        lastSeenAt: Date.now() - 1 * 60 * 60 * 1000,
      });
      const ctx = makeMockContext([recentEntry]);
      const mgr = new TerminalManager(ctx);

      mgr.reconcile();

      const orphans = mgr.getOrphanedSessions();
      expect(orphans.find(e => e.id === 'recent-pending-1')).toBeDefined();
    });
  });

  describe('rebootCount tracking', () => {
    it('should increment rebootCount to 1 on first reboot and keep entry', () => {
      const orphanEntry = makePersistedEntry({
        id: 'orphan-reboot-1',
        terminalName: '🧪 Orphan #1',
        rebootCount: 0,
        lastSeenAt: Date.now() - 48 * 60 * 60 * 1000,
      });
      const ctx = makeMockContext([orphanEntry]);
      const mgr = new TerminalManager(ctx);

      mgr.reconcile();

      const orphans = mgr.getOrphanedSessions();
      const entry = orphans.find(e => e.id === 'orphan-reboot-1');
      expect(entry).toBeDefined();
      expect(entry!.rebootCount).toBe(1);
    });

    it('should auto-clean orphaned entry with rebootCount >= 1 on second reboot', () => {
      const orphanEntry = makePersistedEntry({
        id: 'orphan-reboot-2',
        terminalName: '🧪 Orphan #2',
        rebootCount: 1,
        lastSeenAt: Date.now() - 72 * 60 * 60 * 1000,
      });
      const ctx = makeMockContext([orphanEntry]);
      const mgr = new TerminalManager(ctx);

      mgr.reconcile();

      const orphans = mgr.getOrphanedSessions();
      expect(orphans.find(e => e.id === 'orphan-reboot-2')).toBeUndefined();
    });

    it('should reset rebootCount when orphaned entry gets re-matched before second reboot', () => {
      const orphanEntry = makePersistedEntry({
        id: 'orphan-rematch-1',
        terminalName: '🧪 Test Squad #1',
        rebootCount: 0,
        lastSeenAt: Date.now() - 48 * 60 * 60 * 1000,
      });
      const liveTerminal = makeMockTerminal('🧪 Test Squad #1');
      mockTerminals.push(liveTerminal);

      const ctx = makeMockContext([orphanEntry]);
      const mgr = new TerminalManager(ctx);

      mgr.reconcile();

      const info = mgr.getTerminalInfo(liveTerminal);
      expect(info).toBeDefined();
      expect(info!.squadId).toBe('test-squad');

      const orphans = mgr.getOrphanedSessions();
      expect(orphans.find(e => e.id === 'orphan-rematch-1')).toBeUndefined();
    });
  });

  describe('defensive persist', () => {
    it('should save current state to workspaceState via _persist', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig();

      mgr.launchTerminal(config);

      expect(ctx.workspaceState.update).toHaveBeenCalledWith(
        'editless.terminalSessions',
        expect.any(Array),
      );
    });

    it('should trigger persist on explicit persist() call', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig();
      mgr.launchTerminal(config);

      vi.mocked(ctx.workspaceState.update).mockClear();

      mgr.persist();

      expect(ctx.workspaceState.update).toHaveBeenCalledWith(
        'editless.terminalSessions',
        expect.any(Array),
      );
    });
  });

  describe('re-launch orphaned session', () => {
    it('should create a new terminal with the same name pattern', () => {
      const orphanEntry = makePersistedEntry({
        id: 'orphan-relaunch-1',
        terminalName: '🧪 Test Squad #1',
        displayName: '🧪 Test Squad #1',
      });
      const ctx = makeMockContext([orphanEntry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      mgr.relaunchSession(orphanEntry);

      expect(mockCreateTerminal).toHaveBeenCalledWith(
        expect.objectContaining({ name: '🧪 Test Squad #1' }),
      );
    });

    it('should assign correct squad association from the orphaned entry', () => {
      const orphanEntry = makePersistedEntry({
        id: 'orphan-relaunch-2',
        squadId: 'my-squad',
        squadName: 'My Squad',
        squadIcon: '🚀',
        terminalName: '🚀 My Squad #1',
        displayName: '🚀 My Squad #1',
      });
      const ctx = makeMockContext([orphanEntry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      const terminal = mgr.relaunchSession(orphanEntry);

      expect(terminal).toBeDefined();
      const info = mgr.getTerminalInfo(terminal!);
      expect(info).toBeDefined();
      expect(info!.squadId).toBe('my-squad');
      expect(info!.squadName).toBe('My Squad');
      expect(info!.squadIcon).toBe('🚀');
    });

    it('should remove the orphaned entry from orphan list after re-launch', () => {
      const orphanEntry = makePersistedEntry({
        id: 'orphan-relaunch-3',
      });
      const ctx = makeMockContext([orphanEntry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      mgr.relaunchSession(orphanEntry);

      const orphans = mgr.getOrphanedSessions();
      expect(orphans.find(e => e.id === 'orphan-relaunch-3')).toBeUndefined();
    });
  });

  describe('dismiss orphan', () => {
    it('should remove orphan from pendingSaved and from persisted workspaceState', () => {
      const orphanEntry = makePersistedEntry({
        id: 'orphan-dismiss-1',
        terminalName: '🧪 Dismiss Me #1',
      });
      const ctx = makeMockContext([orphanEntry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      vi.mocked(ctx.workspaceState.update).mockClear();

      mgr.dismissOrphan(orphanEntry);

      const persisted = getLastPersistedState(ctx);
      expect(persisted).toBeDefined();
      expect(persisted!.find(e => e.id === 'orphan-dismiss-1')).toBeUndefined();
    });

    it('should NOT affect other persisted sessions when dismissing', () => {
      const orphanEntry = makePersistedEntry({
        id: 'orphan-dismiss-2',
        terminalName: '🧪 Dismiss Me #2',
      });
      const activeEntry = makePersistedEntry({
        id: 'active-keep-1',
        terminalName: '🧪 Active #1',
        displayName: '🧪 Active #1',
      });

      const liveTerminal = makeMockTerminal('🧪 Active #1');
      mockTerminals.push(liveTerminal);

      const ctx = makeMockContext([orphanEntry, activeEntry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      vi.mocked(ctx.workspaceState.update).mockClear();

      mgr.dismissOrphan(orphanEntry);

      const persisted = getLastPersistedState(ctx);
      expect(persisted).toBeDefined();
      expect(persisted!.find(e => e.id === 'orphan-dismiss-2')).toBeUndefined();
      expect(persisted!.find(e => e.id === 'active-keep-1')).toBeDefined();
      expect(mgr.getAllTerminals()).toHaveLength(1);
    });
  });

  // =========================================================================
  // TDD — Reconciliation bug fixes: name matching, collision, reconnect (#84)
  // Tests written before implementation (Morty is fixing in parallel).
  // =========================================================================

  describe('multi-signal name matching (#84 bug 1)', () => {
    it('should reconcile when terminal.name matches persisted.terminalName (exact match)', () => {
      const entry = makePersistedEntry({
        id: 'signal-exact-1',
        terminalName: '🧪 Test Squad #1',
      });
      const liveTerminal = makeMockTerminal('🧪 Test Squad #1');
      mockTerminals.push(liveTerminal);

      const ctx = makeMockContext([entry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      const all = mgr.getAllTerminals();
      expect(all).toHaveLength(1);
      expect(all[0].terminal).toBe(liveTerminal);
      expect(all[0].info.id).toBe('signal-exact-1');
    });

    it('should reconcile when terminal.name matches persisted.displayName but not terminalName', () => {
      const entry = makePersistedEntry({
        id: 'signal-display-1',
        terminalName: 'cli-modified-name',
        displayName: '🧪 Test Squad #1',
      });
      const liveTerminal = makeMockTerminal('🧪 Test Squad #1');
      mockTerminals.push(liveTerminal);

      const ctx = makeMockContext([entry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      const all = mgr.getAllTerminals();
      expect(all).toHaveLength(1);
      expect(all[0].terminal).toBe(liveTerminal);
      expect(all[0].info.id).toBe('signal-display-1');
    });

    it('should reconcile when terminal.name matches persisted.originalName', () => {
      const entry = makePersistedEntry({
        id: 'signal-original-1',
        terminalName: 'cli-modified',
        displayName: 'cli-modified',
        originalName: '🧪 Test Squad #1',
      });
      const liveTerminal = makeMockTerminal('🧪 Test Squad #1');
      mockTerminals.push(liveTerminal);

      const ctx = makeMockContext([entry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      const all = mgr.getAllTerminals();
      expect(all).toHaveLength(1);
      expect(all[0].terminal).toBe(liveTerminal);
      expect(all[0].info.id).toBe('signal-original-1');
    });

    it('should reconcile via contains-match when terminal name is substring', () => {
      const entry = makePersistedEntry({
        id: 'signal-contains-1',
        terminalName: 'no-match',
        displayName: 'no-match',
        originalName: '🧪 Test Squad #1',
      });
      const liveTerminal = makeMockTerminal('bash: 🧪 Test Squad #1');
      mockTerminals.push(liveTerminal);

      const ctx = makeMockContext([entry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      const all = mgr.getAllTerminals();
      expect(all).toHaveLength(1);
      expect(all[0].terminal).toBe(liveTerminal);
      expect(all[0].info.id).toBe('signal-contains-1');
    });

    it('should NOT match terminals that have no signal overlap', () => {
      const entry = makePersistedEntry({
        id: 'signal-nomatch-1',
        terminalName: 'Squad A',
        displayName: 'Squad A',
        originalName: 'Squad A',
      });
      const liveTerminal = makeMockTerminal('Completely Different');
      mockTerminals.push(liveTerminal);

      const ctx = makeMockContext([entry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      expect(mgr.getAllTerminals()).toHaveLength(0);
      const orphans = mgr.getOrphanedSessions();
      expect(orphans.find(e => e.id === 'signal-nomatch-1')).toBeDefined();
    });
  });

  describe('name collision handling (#84 bug 2)', () => {
    it('should not silently drop entries when multiple persisted sessions match same terminal name', () => {
      const entries = [
        makePersistedEntry({ id: 'collision-1', terminalName: '🧪 Test Squad', displayName: '🧪 Test Squad' }),
        makePersistedEntry({ id: 'collision-2', terminalName: '🧪 Test Squad', displayName: '🧪 Test Squad' }),
        makePersistedEntry({ id: 'collision-3', terminalName: '🧪 Test Squad', displayName: '🧪 Test Squad' }),
      ];
      const liveTerminal = makeMockTerminal('🧪 Test Squad');
      mockTerminals.push(liveTerminal);

      const ctx = makeMockContext(entries);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      expect(mgr.getAllTerminals()).toHaveLength(1);
      const orphans = mgr.getOrphanedSessions();
      expect(orphans).toHaveLength(2);
    });

    it('should match multiple live terminals to multiple persisted entries when names differ', () => {
      const entries = [
        makePersistedEntry({ id: 'multi-1', terminalName: '🧪 Alpha #1', displayName: '🧪 Alpha #1' }),
        makePersistedEntry({ id: 'multi-2', terminalName: '🧪 Beta #1', displayName: '🧪 Beta #1' }),
        makePersistedEntry({ id: 'multi-3', terminalName: '🧪 Gamma #1', displayName: '🧪 Gamma #1' }),
      ];
      mockTerminals.push(
        makeMockTerminal('🧪 Alpha #1'),
        makeMockTerminal('🧪 Beta #1'),
        makeMockTerminal('🧪 Gamma #1'),
      );

      const ctx = makeMockContext(entries);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      expect(mgr.getAllTerminals()).toHaveLength(3);
      expect(mgr.getOrphanedSessions()).toHaveLength(0);
    });
  });

  describe('off-by-one reconciliation fix (#148)', () => {
    it('should sort persisted entries by creation time before matching to prevent off-by-one', () => {
      // Persisted entries deliberately OUT of creation order
      // (simulating state drift from previous bad reconciliation)
      const entries = [
        makePersistedEntry({ id: 's3', index: 3, terminalName: 'pwsh', originalName: '🧪 Test Squad #3', displayName: '🧪 Test Squad #3', createdAt: '2026-02-16T00:03:00.000Z' }),
        makePersistedEntry({ id: 's1', index: 1, terminalName: 'pwsh', originalName: '🧪 Test Squad #1', displayName: '🧪 Test Squad #1', createdAt: '2026-02-16T00:01:00.000Z' }),
        makePersistedEntry({ id: 's4', index: 4, terminalName: 'pwsh', originalName: '🧪 Test Squad #4', displayName: '🧪 Test Squad #4', createdAt: '2026-02-16T00:04:00.000Z' }),
        makePersistedEntry({ id: 's2', index: 2, terminalName: 'pwsh', originalName: '🧪 Test Squad #2', displayName: '🧪 Test Squad #2', createdAt: '2026-02-16T00:02:00.000Z' }),
      ];

      // Live terminals in creation order (as vscode.window.terminals returns them)
      const t1 = makeMockTerminal('pwsh');
      const t2 = makeMockTerminal('pwsh');
      const t3 = makeMockTerminal('pwsh');
      const t4 = makeMockTerminal('pwsh');
      mockTerminals.push(t1, t2, t3, t4);

      const ctx = makeMockContext(entries);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      const all = mgr.getAllTerminals();
      expect(all).toHaveLength(4);

      // Entries should be matched in creation order:
      // s1 (oldest, created 00:01) → t1 (first in terminals)
      // s2 (00:02) → t2
      // s3 (00:03) → t3
      // s4 (00:04) → t4
      const matchMap = new Map(all.map(({ terminal, info }) => [info.id, terminal]));
      expect(matchMap.get('s1')).toBe(t1);
      expect(matchMap.get('s2')).toBe(t2);
      expect(matchMap.get('s3')).toBe(t3);
      expect(matchMap.get('s4')).toBe(t4);
    });

    it('should match correctly when all terminals share identical shell-modified names', () => {
      // All entries and terminals have the same name — matching relies entirely on order
      const entries = [
        makePersistedEntry({ id: 'a1', index: 1, terminalName: 'PowerShell', originalName: '🧪 Test Squad #1', displayName: '🧪 Test Squad #1', createdAt: '2026-02-16T01:00:00.000Z' }),
        makePersistedEntry({ id: 'a2', index: 2, terminalName: 'PowerShell', originalName: '🧪 Test Squad #2', displayName: '🧪 Test Squad #2', createdAt: '2026-02-16T02:00:00.000Z' }),
      ];

      const t1 = makeMockTerminal('PowerShell');
      const t2 = makeMockTerminal('PowerShell');
      mockTerminals.push(t1, t2);

      const ctx = makeMockContext(entries);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      const all = mgr.getAllTerminals();
      expect(all).toHaveLength(2);

      const matchMap = new Map(all.map(({ terminal, info }) => [info.id, terminal]));
      expect(matchMap.get('a1')).toBe(t1);
      expect(matchMap.get('a2')).toBe(t2);
    });
  });

  describe('reconnect before relaunch (#84 bug 3)', () => {
    it('should reconnect to existing live terminal instead of creating new one when calling relaunchSession', () => {
      const orphanEntry = makePersistedEntry({
        id: 'reconnect-1',
        terminalName: '🧪 Test Squad #1',
        displayName: '🧪 Test Squad #1',
      });
      const ctx = makeMockContext([orphanEntry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      expect(mgr.getOrphanedSessions()).toHaveLength(1);

      const liveTerminal = makeMockTerminal('🧪 Test Squad #1');
      mockTerminals.push(liveTerminal);
      mockCreateTerminal.mockClear();

      mgr.relaunchSession(orphanEntry);

      expect(mockCreateTerminal).not.toHaveBeenCalled();
      expect(mgr.getAllTerminals()).toHaveLength(1);
      expect(mgr.getAllTerminals()[0].terminal).toBe(liveTerminal);
      expect(mgr.getOrphanedSessions()).toHaveLength(0);
    });

    it('should create new terminal when no live terminal matches during relaunchSession', () => {
      const orphanEntry = makePersistedEntry({
        id: 'reconnect-2',
        terminalName: '🧪 Test Squad #1',
        displayName: '🧪 Test Squad #1',
      });
      const ctx = makeMockContext([orphanEntry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      expect(mgr.getOrphanedSessions()).toHaveLength(1);
      mockCreateTerminal.mockClear();

      mgr.relaunchSession(orphanEntry);

      expect(mockCreateTerminal).toHaveBeenCalled();
      expect(mgr.getAllTerminals()).toHaveLength(1);
    });
  });

  // =========================================================================
  // TDD — Session state detection (#50)
  // Tests written before implementation (Morty will implement).
  // =========================================================================

  describe('session state detection', () => {
    
    describe('SessionState type', () => {
      it('should export SessionState type with expected values', () => {
        const validStates: Array<import('../terminal-manager').SessionState> = [
          'working',
          'waiting-on-input',
          'idle',
          'stale',
          'needs-attention',
          'orphaned',
        ];
        expect(validStates).toHaveLength(6);
      });
    });

    describe('shell integration tracking', () => {
      it('should transition to working state when shell execution starts', () => {
        const ctx = makeMockContext();
        const mgr = new TerminalManager(ctx);
        const config = makeSquadConfig();
        const terminal = mgr.launchTerminal(config);

        const execution = {
          commandLine: { value: 'npm test' },
        } as vscode.TerminalShellExecution;

        capturedShellStartListener({ terminal, execution });

        const state = mgr.getSessionState(terminal);
        expect(state).toBe('working');
      });

      it('should show waiting-on-input immediately after shell execution ends', () => {
        const ctx = makeMockContext();
        const mgr = new TerminalManager(ctx);
        const config = makeSquadConfig();
        const terminal = mgr.launchTerminal(config);

        const execution = {
          commandLine: { value: 'npm test' },
        } as vscode.TerminalShellExecution;

        capturedShellStartListener({ terminal, execution });
        expect(mgr.getSessionState(terminal)).toBe('working');

        capturedShellEndListener({ terminal, execution });
        
        // Immediately after ending: waiting-on-input (execution no longer active)
        const state = mgr.getSessionState(terminal);
        expect(state).toBe('waiting-on-input');
      });

      it('should handle multiple rapid start/end cycles correctly', () => {
        const ctx = makeMockContext();
        const mgr = new TerminalManager(ctx);
        const config = makeSquadConfig();
        const terminal = mgr.launchTerminal(config);

        const exec1 = { commandLine: { value: 'git status' } } as vscode.TerminalShellExecution;
        const exec2 = { commandLine: { value: 'git diff' } } as vscode.TerminalShellExecution;
        const exec3 = { commandLine: { value: 'git commit' } } as vscode.TerminalShellExecution;

        capturedShellStartListener({ terminal, execution: exec1 });
        capturedShellEndListener({ terminal, execution: exec1 });
        
        capturedShellStartListener({ terminal, execution: exec2 });
        capturedShellEndListener({ terminal, execution: exec2 });
        
        capturedShellStartListener({ terminal, execution: exec3 });

        // Last execution is still running — should be working
        expect(mgr.getSessionState(terminal)).toBe('working');
      });
    });

    describe('state computation', () => {
      it('should return working for terminal with shell execution in progress', () => {
        const ctx = makeMockContext();
        const mgr = new TerminalManager(ctx);
        const config = makeSquadConfig();
        const terminal = mgr.launchTerminal(config);

        const execution = { commandLine: { value: 'npm run build' } } as vscode.TerminalShellExecution;
        capturedShellStartListener({ terminal, execution });

        expect(mgr.getSessionState(terminal)).toBe('working');
      });

      it('should return idle for terminal with recent activity but no execution', () => {
        const ctx = makeMockContext();
        const mgr = new TerminalManager(ctx);
        const config = makeSquadConfig();
        const terminal = mgr.launchTerminal(config);

        // Simulate recent activity (just created, <5 min)
        const state = mgr.getSessionState(terminal);
        expect(['waiting-on-input', 'idle']).toContain(state);
      });

      it('should return stale for recently-reconnected terminal with old lastSeenAt', () => {
        const staleEntry = makePersistedEntry({
          id: 'stale-session-1',
          terminalName: '🧪 Stale #1',
          lastSeenAt: Date.now() - 61 * 60 * 1000,
        });
        const liveTerminal = makeMockTerminal('🧪 Stale #1');
        mockTerminals.push(liveTerminal);

        const ctx = makeMockContext([staleEntry]);
        const mgr = new TerminalManager(ctx);
        mgr.reconcile();

        const state = mgr.getSessionState(liveTerminal);
        expect(state).toBe('stale');
      });

      it('should return orphaned for persisted session with no live terminal', () => {
        const orphanEntry = makePersistedEntry({
          id: 'orphaned-1',
          terminalName: '🧪 Orphan #1',
        });
        const ctx = makeMockContext([orphanEntry]);
        const mgr = new TerminalManager(ctx);
        mgr.reconcile();

        const state = mgr.getSessionState(orphanEntry.id);
        expect(state).toBe('orphaned');
      });
    });

    describe('getSessionState API', () => {
      it('should return correct state for tracked terminal', () => {
        const ctx = makeMockContext();
        const mgr = new TerminalManager(ctx);
        const config = makeSquadConfig();
        const terminal = mgr.launchTerminal(config);

        const state = mgr.getSessionState(terminal);
        expect(['waiting-on-input', 'idle']).toContain(state);
      });

      it('should return orphaned for persisted-only session', () => {
        const orphanEntry = makePersistedEntry({
          id: 'orphan-state-1',
          terminalName: '🧪 Orphan #1',
        });
        const ctx = makeMockContext([orphanEntry]);
        const mgr = new TerminalManager(ctx);
        mgr.reconcile();

        const state = mgr.getSessionState(orphanEntry.id);
        expect(state).toBe('orphaned');
      });

      it('should return undefined for unknown terminal', () => {
        const ctx = makeMockContext();
        const mgr = new TerminalManager(ctx);
        const unknownTerminal = makeMockTerminal('unknown');

        const state = mgr.getSessionState(unknownTerminal);
        expect(state).toBeUndefined();
      });

      it('should accept terminal ID string and return correct state', () => {
        const orphanEntry = makePersistedEntry({
          id: 'orphan-by-id',
          terminalName: '🧪 By ID',
        });
        const ctx = makeMockContext([orphanEntry]);
        const mgr = new TerminalManager(ctx);
        mgr.reconcile();

        const state = mgr.getSessionState('orphan-by-id');
        expect(state).toBe('orphaned');
      });
    });

    describe('tree integration helpers', () => {
      it('should return correct ThemeIcon for each state', () => {
        const ctx = makeMockContext();
        const mgr = new TerminalManager(ctx);

        const workingIcon = mgr.getStateIcon('working');
        expect(workingIcon).toBeDefined();
        expect(workingIcon.id).toBe('loading~spin');

        const waitingIcon = mgr.getStateIcon('waiting-on-input');
        expect(waitingIcon).toBeDefined();
        expect(waitingIcon.id).toBe('bell-dot');

        const idleIcon = mgr.getStateIcon('idle');
        expect(idleIcon).toBeDefined();
        expect(idleIcon.id).toBe('check');

        const staleIcon = mgr.getStateIcon('stale');
        expect(staleIcon).toBeDefined();
        expect(staleIcon.id).toBe('clock');

        const needsAttentionIcon = mgr.getStateIcon('needs-attention');
        expect(needsAttentionIcon).toBeDefined();
        expect(needsAttentionIcon.id).toBe('warning');

        const orphanedIcon = mgr.getStateIcon('orphaned');
        expect(orphanedIcon).toBeDefined();
        expect(orphanedIcon.id).toBe('debug-disconnect');
      });

      it('should return unique icons for all session states', () => {
        const ctx = makeMockContext();
        const mgr = new TerminalManager(ctx);
        const states: SessionState[] = ['working', 'waiting-on-input', 'idle', 'stale', 'needs-attention', 'orphaned'];
        const icons = states.map(s => mgr.getStateIcon(s).id);
        expect(new Set(icons).size).toBe(states.length);
      });

      it('should return human-readable description for each state', () => {
        const ctx = makeMockContext();
        const mgr = new TerminalManager(ctx);

        const info = makePersistedEntry();

        const workingDesc = mgr.getStateDescription('working', info);
        expect(workingDesc).toContain('working');

        const waitingDesc = mgr.getStateDescription('waiting-on-input', info);
        expect(waitingDesc).toContain('waiting');

        const idleDesc = mgr.getStateDescription('idle', info);
        expect(idleDesc).toMatch(/idle/i);

        const staleDesc = mgr.getStateDescription('stale', info);
        expect(staleDesc).toMatch(/stale/i);

        const needsAttentionDesc = mgr.getStateDescription('needs-attention', info);
        expect(needsAttentionDesc).toMatch(/attention/i);

        const orphanedDesc = mgr.getStateDescription('orphaned', info);
        expect(orphanedDesc).toMatch(/orphan/i);
      });

      it('should include time elapsed in idle state description', () => {
        const ctx = makeMockContext();
        const mgr = new TerminalManager(ctx);

        const info = makePersistedEntry({
          lastSeenAt: Date.now() - 23 * 60 * 1000, // 23 minutes ago
        });

        const desc = mgr.getStateDescription('idle', info);
        expect(desc).toMatch(/\d+m/);
      });
    });

    describe('needs-attention integration', () => {
      it('should return needs-attention when squad has inbox items', () => {
        const ctx = makeMockContext();
        const mgr = new TerminalManager(ctx);
        const config = makeSquadConfig();
        const terminal = mgr.launchTerminal(config);

        // Simulate squad having inbox items
        mgr.setSquadInboxCount('test-squad', 2);

        const state = mgr.getSessionState(terminal);
        expect(state).toBe('needs-attention');
      });

      it('should override stale with needs-attention when inbox has items', () => {
        const staleEntry = makePersistedEntry({
          id: 'stale-needs-attention',
          terminalName: '🧪 Stale #1',
          lastSeenAt: Date.now() - 61 * 60 * 1000,
        });
        const liveTerminal = makeMockTerminal('🧪 Stale #1');
        mockTerminals.push(liveTerminal);

        const ctx = makeMockContext([staleEntry]);
        const mgr = new TerminalManager(ctx);
        mgr.reconcile();

        // Reconnected terminal with old lastSeenAt shows as stale
        const beforeState = mgr.getSessionState(liveTerminal);
        expect(beforeState).toBe('stale');

        // After inbox items — needs-attention overrides
        mgr.setSquadInboxCount('test-squad', 3);
        const afterState = mgr.getSessionState(liveTerminal);
        expect(afterState).toBe('needs-attention');
      });

      it('should NOT override working with needs-attention', () => {
        const ctx = makeMockContext();
        const mgr = new TerminalManager(ctx);
        const config = makeSquadConfig();
        const terminal = mgr.launchTerminal(config);

        const execution = { commandLine: { value: 'npm test' } } as vscode.TerminalShellExecution;
        capturedShellStartListener({ terminal, execution });

        mgr.setSquadInboxCount('test-squad', 5);

        // Working takes precedence over needs-attention
        const state = mgr.getSessionState(terminal);
        expect(state).toBe('working');
      });

      it('should clear needs-attention when inbox count becomes zero', () => {
        const ctx = makeMockContext();
        const mgr = new TerminalManager(ctx);
        const config = makeSquadConfig();
        const terminal = mgr.launchTerminal(config);

        mgr.setSquadInboxCount('test-squad', 2);
        expect(mgr.getSessionState(terminal)).toBe('needs-attention');

        mgr.setSquadInboxCount('test-squad', 0);
        const state = mgr.getSessionState(terminal);
        expect(['idle', 'waiting-on-input']).toContain(state);
      });
    });
  });

  // =========================================================================
  // Session ID persistence and resume (#94)
  // =========================================================================

  describe('agent session ID tracking (#94)', () => {
    it('should store agentSessionId via setAgentSessionId and persist it', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig();
      const terminal = mgr.launchTerminal(config);

      vi.mocked(ctx.workspaceState.update).mockClear();

      mgr.setAgentSessionId(terminal, 'copilot-session-abc123');

      const info = mgr.getTerminalInfo(terminal);
      expect(info?.agentSessionId).toBe('copilot-session-abc123');

      const persisted = getLastPersistedState(ctx);
      expect(persisted).toBeDefined();
      expect(persisted![0].agentSessionId).toBe('copilot-session-abc123');
    });

    it('should fire onDidChange when setting agent session ID', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig();
      const terminal = mgr.launchTerminal(config);

      const changeSpy = vi.fn();
      mgr.onDidChange(changeSpy);

      mgr.setAgentSessionId(terminal, 'session-xyz');
      expect(changeSpy).toHaveBeenCalledOnce();
    });

    it('should be a no-op for an untracked terminal', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const untracked = makeMockTerminal('random');

      vi.mocked(ctx.workspaceState.update).mockClear();

      mgr.setAgentSessionId(untracked, 'session-xyz');
      expect(ctx.workspaceState.update).not.toHaveBeenCalled();
    });

    it('should restore agentSessionId after reconciliation', () => {
      const liveTerminal = makeMockTerminal('🧪 Test Squad #1');
      mockTerminals.push(liveTerminal);

      const saved = [makePersistedEntry({ agentSessionId: 'restored-session-id' })];
      const ctx = makeMockContext(saved);
      const mgr = new TerminalManager(ctx);

      mgr.reconcile();

      const info = mgr.getTerminalInfo(liveTerminal);
      expect(info?.agentSessionId).toBe('restored-session-id');
    });

    it('should preserve agentSessionId through reconnectSession', () => {
      const orphanEntry = makePersistedEntry({
        id: 'reconnect-session-id',
        terminalName: '🧪 Test Squad #1',
        displayName: '🧪 Test Squad #1',
        agentSessionId: 'reconnect-abc',
      });
      const ctx = makeMockContext([orphanEntry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      const liveTerminal = makeMockTerminal('🧪 Test Squad #1');
      mockTerminals.push(liveTerminal);

      const result = mgr.reconnectSession(orphanEntry);
      expect(result).toBe(liveTerminal);

      const info = mgr.getTerminalInfo(liveTerminal);
      expect(info?.agentSessionId).toBe('reconnect-abc');
    });
  });

  describe('launch command persistence (#94)', () => {
    it('should persist launchCommand from squad config', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig({ launchCommand: 'copilot --agent squad' });

      mgr.launchTerminal(config);

      const persisted = getLastPersistedState(ctx);
      expect(persisted).toBeDefined();
      expect(persisted![0].launchCommand).toBe('copilot --agent squad');
    });

    it('should restore launchCommand after reconciliation', () => {
      const liveTerminal = makeMockTerminal('🧪 Test Squad #1');
      mockTerminals.push(liveTerminal);

      const saved = [makePersistedEntry({ launchCommand: 'copilot --agent squad' })];
      const ctx = makeMockContext(saved);
      const mgr = new TerminalManager(ctx);

      mgr.reconcile();

      const info = mgr.getTerminalInfo(liveTerminal);
      expect(info?.launchCommand).toBe('copilot --agent squad');
    });
  });

  describe('relaunch with command (#94)', () => {
    it('should send launchCommand when relaunching orphaned session', () => {
      const orphanEntry = makePersistedEntry({
        id: 'relaunch-cmd-1',
        terminalName: '🧪 No Match',
        displayName: '🧪 Test Squad #1',
        launchCommand: 'copilot --agent squad',
      });
      const ctx = makeMockContext([orphanEntry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      const terminal = mgr.relaunchSession(orphanEntry);

      expect(terminal.sendText).toHaveBeenCalledWith('copilot --agent squad');
    });

    it('should send resume command with agentSessionId when available', () => {
      const orphanEntry = makePersistedEntry({
        id: 'relaunch-resume-1',
        terminalName: '🧪 No Match',
        displayName: '🧪 Test Squad #1',
        launchCommand: 'copilot --agent squad',
        agentSessionId: 'session-to-resume',
      });
      const ctx = makeMockContext([orphanEntry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      const terminal = mgr.relaunchSession(orphanEntry);

      expect(terminal.sendText).toHaveBeenCalledWith(
        'copilot --agent squad --resume session-to-resume',
      );
    });

    it('should NOT send any command when launchCommand is not set', () => {
      const orphanEntry = makePersistedEntry({
        id: 'relaunch-no-cmd',
        terminalName: '🧪 No Match',
        displayName: '🧪 Test Squad #1',
      });
      const ctx = makeMockContext([orphanEntry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      const terminal = mgr.relaunchSession(orphanEntry);

      expect(terminal.sendText).not.toHaveBeenCalled();
    });

    it('should preserve agentSessionId and launchCommand in relaunched terminal info', () => {
      const orphanEntry = makePersistedEntry({
        id: 'relaunch-preserve-1',
        terminalName: '🧪 No Match',
        displayName: '🧪 Test Squad #1',
        launchCommand: 'copilot --agent squad',
        agentSessionId: 'preserved-session',
      });
      const ctx = makeMockContext([orphanEntry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      const terminal = mgr.relaunchSession(orphanEntry);

      const info = mgr.getTerminalInfo(terminal);
      expect(info?.agentSessionId).toBe('preserved-session');
      expect(info?.launchCommand).toBe('copilot --agent squad');
    });
  });

  // ---------------------------------------------------------------------------
  // Session persistence scenarios (#53)
  // ---------------------------------------------------------------------------

  describe('session persistence across reload (#53)', () => {
    it('should restore multiple squads with correct association after reload', () => {
      // Pre-seed saved state with two squads
      const alphaEntry = makePersistedEntry({
        id: 'alpha-1', squadId: 'squad-alpha', squadName: 'Alpha', squadIcon: '🅰️',
        terminalName: '🅰️ Alpha #1', displayName: '🅰️ Alpha #1', originalName: '🅰️ Alpha #1',
      });
      const betaEntry = makePersistedEntry({
        id: 'beta-1', squadId: 'squad-beta', squadName: 'Beta', squadIcon: '🅱️',
        terminalName: '🅱️ Beta #1', displayName: '🅱️ Beta #1', originalName: '🅱️ Beta #1',
      });
      // Simulate live terminals that survived the reload
      mockTerminals.push(makeMockTerminal('🅰️ Alpha #1'), makeMockTerminal('🅱️ Beta #1'));

      const ctx = makeMockContext([alphaEntry, betaEntry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      const all = mgr.getAllTerminals();
      expect(all).toHaveLength(2);
      expect(all.map(t => t.info.squadId).sort()).toEqual(['squad-alpha', 'squad-beta']);
    });

    it('should mark entries as orphaned when terminals are gone (close/reopen)', () => {
      // Saved state exists but no live terminals
      const saved = [makePersistedEntry({ terminalName: '🧪 Gone #1' })];
      const ctx = makeMockContext(saved);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      const orphans = mgr.getOrphanedSessions();
      expect(orphans).toHaveLength(1);
      expect(orphans[0].squadId).toBe('test-squad');
    });

    it('should persist squadPath from config and carry it through reconcile', () => {
      const entry = makePersistedEntry({
        terminalName: '🧪 Test Squad #1',
        squadPath: '/home/user/project',
      });
      const liveTerminal = makeMockTerminal('🧪 Test Squad #1');
      mockTerminals.push(liveTerminal);

      const ctx = makeMockContext([entry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      const all = mgr.getAllTerminals();
      expect(all[0].info.squadPath).toBe('/home/user/project');
    });

    it('should recover session ID through persist/orphan/relaunch cycle', () => {
      const orphanEntry = makePersistedEntry({
        id: 'crash-recovery-1',
        terminalName: '🧪 No Match',
        displayName: '🧪 Test Squad #1',
        launchCommand: 'copilot --yolo',
        agentSessionId: 'session-abc-123',
      });
      const ctx = makeMockContext([orphanEntry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      const orphans = mgr.getOrphanedSessions();
      expect(orphans).toHaveLength(1);
      expect(orphans[0].agentSessionId).toBe('session-abc-123');

      const relaunched = mgr.relaunchSession(orphanEntry);
      expect(relaunched.sendText).toHaveBeenCalledWith('copilot --yolo --resume session-abc-123');
    });

    it('should use squadPath as cwd when relaunching orphaned session', () => {
      const orphanEntry = makePersistedEntry({
        id: 'relaunch-cwd-1',
        terminalName: '🧪 No Match',
        displayName: '🧪 Test Squad #1',
        squadPath: '/project/dir',
        launchCommand: 'copilot chat',
      });
      const ctx = makeMockContext([orphanEntry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      mgr.relaunchSession(orphanEntry);
      expect(mockCreateTerminal).toHaveBeenCalledWith(
        expect.objectContaining({ cwd: '/project/dir' }),
      );
    });
  });

  describe('periodic persist timer (#94)', () => {
    it('should set up periodic persist interval on construction', () => {
      const spy = vi.spyOn(global, 'setInterval');
      const _mgr = new TerminalManager(makeMockContext());
      expect(spy).toHaveBeenCalledWith(expect.any(Function), 30_000);
      spy.mockRestore();
    });

    it('should clear persist interval on dispose', () => {
      const spy = vi.spyOn(global, 'clearInterval');
      const mgr = new TerminalManager(makeMockContext());
      mgr.dispose();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  // =========================================================================
  // detectSessionIds — auto-link sessions to terminals (#217)
  // =========================================================================

  describe('detectSessionIds', () => {
    function makeResolver(sessions: Map<string, { sessionId: string; createdAt: string }>) {
      return {
        resolveAll: vi.fn((paths: string[]) => {
          const result = new Map<string, { sessionId: string; createdAt: string }>();
          for (const p of paths) {
            const s = sessions.get(p);
            if (s) result.set(p, s);
          }
          return result;
        }),
      };
    }

    it('should no-op when no session resolver is set', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig({ path: '/project' });
      mgr.launchTerminal(config);

      vi.mocked(ctx.workspaceState.update).mockClear();
      mgr.detectSessionIds();
      expect(ctx.workspaceState.update).not.toHaveBeenCalled();
    });

    it('should no-op when all terminals already have session IDs', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig({ path: '/project' });
      const terminal = mgr.launchTerminal(config);
      mgr.setAgentSessionId(terminal, 'existing-session');

      const resolver = makeResolver(new Map());
      mgr.setSessionResolver(resolver as unknown as import('../session-context').SessionContextResolver);

      vi.mocked(ctx.workspaceState.update).mockClear();
      mgr.detectSessionIds();
      expect(resolver.resolveAll).not.toHaveBeenCalled();
    });

    it('should assign session ID when squad path matches a resolved session', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig({ path: '/project' });
      const terminal = mgr.launchTerminal(config);

      const now = new Date();
      const sessions = new Map([
        ['/project', { sessionId: 'detected-session-1', createdAt: new Date(now.getTime() + 1000).toISOString() }],
      ]);
      const resolver = makeResolver(sessions);
      mgr.setSessionResolver(resolver as unknown as import('../session-context').SessionContextResolver);

      mgr.detectSessionIds();

      const info = mgr.getTerminalInfo(terminal);
      expect(info?.agentSessionId).toBe('detected-session-1');
    });

    it('should not assign session created before terminal launch', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig({ path: '/project' });
      const terminal = mgr.launchTerminal(config);

      const sessions = new Map([
        ['/project', { sessionId: 'old-session', createdAt: '2020-01-01T00:00:00.000Z' }],
      ]);
      const resolver = makeResolver(sessions);
      mgr.setSessionResolver(resolver as unknown as import('../session-context').SessionContextResolver);

      mgr.detectSessionIds();

      const info = mgr.getTerminalInfo(terminal);
      expect(info?.agentSessionId).toBeUndefined();
    });

    it('should not double-claim a session already assigned to another terminal', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig({ path: '/project' });

      const terminal1 = mgr.launchTerminal(config);
      const terminal2 = mgr.launchTerminal(config, 'Second');

      const now = new Date();
      const sessions = new Map([
        ['/project', { sessionId: 'shared-session', createdAt: new Date(now.getTime() + 1000).toISOString() }],
      ]);
      const resolver = makeResolver(sessions);
      mgr.setSessionResolver(resolver as unknown as import('../session-context').SessionContextResolver);

      // First detect claims the session
      mgr.detectSessionIds();
      const info1 = mgr.getTerminalInfo(terminal1);
      const info2 = mgr.getTerminalInfo(terminal2);

      // Only one should have the session ID
      const assigned = [info1?.agentSessionId, info2?.agentSessionId].filter(Boolean);
      expect(assigned).toHaveLength(1);
      expect(assigned[0]).toBe('shared-session');
    });

    it('should fire onDidChange and persist when sessions are detected', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig({ path: '/project' });
      mgr.launchTerminal(config);

      const changeSpy = vi.fn();
      mgr.onDidChange(changeSpy);
      changeSpy.mockClear();

      const now = new Date();
      const sessions = new Map([
        ['/project', { sessionId: 'new-session', createdAt: new Date(now.getTime() + 1000).toISOString() }],
      ]);
      const resolver = makeResolver(sessions);
      mgr.setSessionResolver(resolver as unknown as import('../session-context').SessionContextResolver);

      vi.mocked(ctx.workspaceState.update).mockClear();
      mgr.detectSessionIds();

      expect(changeSpy).toHaveBeenCalled();
      expect(ctx.workspaceState.update).toHaveBeenCalled();
    });

    it('should skip terminals without a squadPath', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      // Launch without path (squadPath will be undefined)
      const config = makeSquadConfig({ path: undefined });
      mgr.launchTerminal(config);

      const resolver = makeResolver(new Map());
      mgr.setSessionResolver(resolver as unknown as import('../session-context').SessionContextResolver);

      mgr.detectSessionIds();
      // resolveAll should not be called since there are no valid squad paths
      expect(resolver.resolveAll).not.toHaveBeenCalled();
    });
  });
});
