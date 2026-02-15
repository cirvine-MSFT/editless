import { describe, it, expect, beforeEach, vi } from 'vitest';
import type * as vscode from 'vscode';
import type { AgentTeamConfig } from '../types';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

type CloseListener = (terminal: vscode.Terminal) => void;

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
}));

import { TerminalManager, type PersistedTerminalInfo } from '../terminal-manager';

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

  mockOnDidStartTerminalShellExecution.mockImplementation(() => {
    return { dispose: vi.fn() };
  });

  mockOnDidEndTerminalShellExecution.mockImplementation(() => {
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
});
