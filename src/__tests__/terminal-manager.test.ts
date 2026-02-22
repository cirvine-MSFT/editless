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
  mockRandomUUID,
} = vi.hoisted(() => ({
  mockCreateTerminal: vi.fn(),
  mockOnDidCloseTerminal: vi.fn(),
  mockOnDidOpenTerminal: vi.fn(),
  mockOnDidStartTerminalShellExecution: vi.fn(),
  mockOnDidEndTerminalShellExecution: vi.fn(),
  mockTerminals: [] as vscode.Terminal[],
  mockRandomUUID: vi.fn<() => `${string}-${string}-${string}-${string}-${string}`>(),
}));

vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>();
  return { ...actual, randomUUID: mockRandomUUID };
});

vi.mock('vscode', () => ({
  window: {
    createTerminal: mockCreateTerminal,
    onDidCloseTerminal: mockOnDidCloseTerminal,
    onDidOpenTerminal: mockOnDidOpenTerminal,
    onDidStartTerminalShellExecution: mockOnDidStartTerminalShellExecution,
    onDidEndTerminalShellExecution: mockOnDidEndTerminalShellExecution,
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    get terminals() { return mockTerminals; },
  },
  workspace: {
    getConfiguration: () => ({
      get: (key: string, defaultValue?: unknown) => {
        if (key === 'command') return 'copilot';
        if (key === 'defaultAgent') return 'squad';
        return defaultValue;
      },
    }),
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

import { TerminalManager, type PersistedTerminalInfo, type SessionState, stripEmoji } from '../terminal-manager';
import * as vscodeModule from 'vscode';

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
type OpenListener = (terminal: vscode.Terminal) => void;
let capturedOpenListener: OpenListener | undefined;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockTerminals.length = 0;
  capturedOpenListener = undefined;

  mockOnDidCloseTerminal.mockImplementation((listener: CloseListener) => {
    capturedCloseListener = listener;
    return { dispose: vi.fn() };
  });

  mockOnDidOpenTerminal.mockImplementation((listener: OpenListener) => {
    capturedOpenListener = listener;
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

  mockCreateTerminal.mockImplementation((opts: vscode.TerminalOptions) => {
    return makeMockTerminal(opts.name ?? 'terminal');
  });

  mockRandomUUID.mockReturnValue('00000000-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`);
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

    it('should auto-clean orphaned entry with rebootCount >= 4 on fifth reboot', () => {
      const orphanEntry = makePersistedEntry({
        id: 'orphan-reboot-2',
        terminalName: '🧪 Orphan #2',
        rebootCount: 4,
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

    it('should NOT reconcile via contains-match (substring fallback removed #327)', () => {
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

      expect(mgr.getAllTerminals()).toHaveLength(0);
      const orphans = mgr.getOrphanedSessions();
      expect(orphans.find(e => e.id === 'signal-contains-1')).toBeDefined();
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
          'launching',
          'active',
          'inactive',
          'orphaned',
        ];
        expect(validStates).toHaveLength(4);
      });
    });

    describe('shell integration tracking', () => {
      it('should remain inactive when shell execution starts (events.jsonl drives state)', () => {
        const ctx = makeMockContext();
        const mgr = new TerminalManager(ctx);
        const config = makeSquadConfig();
        const terminal = mgr.launchTerminal(config);

        const execution = {
          commandLine: { value: 'npm test' },
        } as vscode.TerminalShellExecution;

        capturedShellStartListener({ terminal, execution });

        const state = mgr.getSessionState(terminal);
        expect(state).toBe('inactive');
      });

      it('should show inactive immediately after shell execution ends', () => {
        const ctx = makeMockContext();
        const mgr = new TerminalManager(ctx);
        const config = makeSquadConfig();
        const terminal = mgr.launchTerminal(config);

        const execution = {
          commandLine: { value: 'npm test' },
        } as vscode.TerminalShellExecution;

        capturedShellStartListener({ terminal, execution });
        // Shell execution alone no longer drives state — events.jsonl does
        expect(mgr.getSessionState(terminal)).toBe('inactive');

        capturedShellEndListener({ terminal, execution });
        
        const state = mgr.getSessionState(terminal);
        expect(state).toBe('inactive');
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

        // Shell execution alone no longer drives state — events.jsonl does
        expect(mgr.getSessionState(terminal)).toBe('inactive');
      });
    });

    describe('state computation', () => {
      it('should return inactive for terminal with shell execution in progress', () => {
        const ctx = makeMockContext();
        const mgr = new TerminalManager(ctx);
        const config = makeSquadConfig();
        const terminal = mgr.launchTerminal(config);

        const execution = { commandLine: { value: 'npm run build' } } as vscode.TerminalShellExecution;
        capturedShellStartListener({ terminal, execution });

        // Shell execution alone no longer drives state — events.jsonl does
        expect(mgr.getSessionState(terminal)).toBe('inactive');
      });

      it('should return launching for terminal with no events yet (#337)', () => {
        const ctx = makeMockContext();
        const mgr = new TerminalManager(ctx);
        const config = makeSquadConfig();
        const terminal = mgr.launchTerminal(config);

        // Simulate recent activity (just created) — still in launching state
        const state = mgr.getSessionState(terminal);
        expect(state).toBe('launching');
      });

      it('should return inactive for recently-reconnected terminal with old lastSeenAt', () => {
        const staleEntry = makePersistedEntry({
          id: 'old-session-1',
          terminalName: '🧪 Old #1',
          lastSeenAt: Date.now() - 61 * 60 * 1000,
        });
        const liveTerminal = makeMockTerminal('🧪 Old #1');
        mockTerminals.push(liveTerminal);

        const ctx = makeMockContext([staleEntry]);
        const mgr = new TerminalManager(ctx);
        mgr.reconcile();

        const state = mgr.getSessionState(liveTerminal);
        expect(state).toBe('inactive');
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
      it('should return launching state for newly-tracked terminal (#337)', () => {
        const ctx = makeMockContext();
        const mgr = new TerminalManager(ctx);
        const config = makeSquadConfig();
        const terminal = mgr.launchTerminal(config);

        const state = mgr.getSessionState(terminal);
        expect(state).toBe('launching');
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

        const launchingIcon = mgr.getStateIcon('launching');
        expect(launchingIcon).toBeDefined();
        expect(launchingIcon.id).toBe('loading~spin');

        const activeIcon = mgr.getStateIcon('active');
        expect(activeIcon).toBeDefined();
        expect(activeIcon.id).toBe('loading~spin');

        const inactiveIcon = mgr.getStateIcon('inactive');
        expect(inactiveIcon).toBeDefined();
        expect(inactiveIcon.id).toBe('circle-outline');

        const nonResumableInfo = makePersistedEntry();
        const orphanedIcon = mgr.getStateIcon('orphaned', nonResumableInfo);
        expect(orphanedIcon).toBeDefined();
        expect(orphanedIcon.id).toBe('circle-outline');

        const resumableInfo = makePersistedEntry({ agentSessionId: 'session-123' });
        const resumableIcon = mgr.getStateIcon('orphaned', resumableInfo);
        expect(resumableIcon).toBeDefined();
        expect(resumableIcon.id).toBe('history');
      });

      it('should return unique icons for non-transient session states', () => {
        const ctx = makeMockContext();
        const mgr = new TerminalManager(ctx);
        // active and inactive should have distinct icons
        const activeIcon = mgr.getStateIcon('active').id;
        const inactiveIcon = mgr.getStateIcon('inactive').id;
        expect(activeIcon).not.toBe(inactiveIcon);
        // resumable orphan should have a distinct icon
        const resumableInfo = makePersistedEntry({ agentSessionId: 'session-123' });
        const orphanedIcon = mgr.getStateIcon('orphaned', resumableInfo).id;
        expect(orphanedIcon).not.toBe(activeIcon);
      });

      it('should return human-readable description for each state', () => {
        const ctx = makeMockContext();
        const mgr = new TerminalManager(ctx);

        const info = makePersistedEntry();

        const launchingDesc = mgr.getStateDescription('launching', info);
        expect(launchingDesc).toContain('launching');

        const activeDesc = mgr.getStateDescription('active', info);
        expect(activeDesc.length).toBeGreaterThan(0);

        const inactiveDesc = mgr.getStateDescription('inactive', info);
        expect(inactiveDesc.length).toBeGreaterThan(0);

        const orphanedDesc = mgr.getStateDescription('orphaned', info);
        expect(orphanedDesc).toContain('session ended');

        const resumableInfo = makePersistedEntry({ agentSessionId: 'session-123' });
        const resumableDesc = mgr.getStateDescription('orphaned', resumableInfo);
        expect(resumableDesc).toContain('previous session');
        expect(resumableDesc).toContain('resume');
      });

      it('should include time elapsed in inactive state description', () => {
        const ctx = makeMockContext();
        const mgr = new TerminalManager(ctx);

        const info = makePersistedEntry({
          lastSeenAt: Date.now() - 23 * 60 * 1000, // 23 minutes ago
        });

        const desc = mgr.getStateDescription('inactive', info);
        expect(desc).toMatch(/\d+m/);
      });
    });

    describe('session state defaults (regression tests for #226)', () => {
      it('should show launching state immediately after launchTerminal (#337)', () => {
        const ctx = makeMockContext();
        const mgr = new TerminalManager(ctx);
        const config = makeSquadConfig();
        const terminal = mgr.launchTerminal(config);

        const state = mgr.getSessionState(terminal);
        expect(state).toBe('launching');
      });

      it('should show inactive after shell execution completes', () => {
        const ctx = makeMockContext();
        const mgr = new TerminalManager(ctx);
        const config = makeSquadConfig();
        const terminal = mgr.launchTerminal(config);

        const execution = { commandLine: { value: 'echo "test"' } } as vscode.TerminalShellExecution;
        capturedShellStartListener({ terminal, execution });
        // Shell execution clears launching state
        expect(mgr.getSessionState(terminal)).toBe('inactive');

        capturedShellEndListener({ terminal, execution });
        const state = mgr.getSessionState(terminal);
        expect(state).toBe('inactive');
      });

      it('should transition from launching to inactive when execution starts (#337)', () => {
        const ctx = makeMockContext();
        const mgr = new TerminalManager(ctx);
        const config = makeSquadConfig();
        const terminal = mgr.launchTerminal(config);

        expect(mgr.getSessionState(terminal)).toBe('launching');

        const execution = { commandLine: { value: 'npm test' } } as vscode.TerminalShellExecution;
        capturedShellStartListener({ terminal, execution });
        
        // Shell execution clears launching state → inactive (events.jsonl drives active)
        expect(mgr.getSessionState(terminal)).toBe('inactive');
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

      expect(terminal!.sendText).toHaveBeenCalledWith('copilot --agent squad');
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

      expect(terminal!.sendText).toHaveBeenCalledWith(
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

      expect(terminal!.sendText).not.toHaveBeenCalled();
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

      const info = mgr.getTerminalInfo(terminal!);
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
      expect(relaunched!.sendText).toHaveBeenCalledWith('copilot --yolo --resume session-abc-123');
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
        watchSession: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        watchSessionDir: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      };
    }

    it('should no-op when no session resolver is set', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig({ path: '/project' });
      const terminal = mgr.launchTerminal(config);
      // Simulate legacy terminal without pre-set agentSessionId
      mgr.getTerminalInfo(terminal)!.agentSessionId = undefined;

      vi.mocked(ctx.workspaceState.update).mockClear();
      mgr.detectSessionIds();
      expect(ctx.workspaceState.update).not.toHaveBeenCalled();
    });

    it('should no-op when all terminals already have session IDs', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig({ path: '/project' });
      const terminal = mgr.launchTerminal(config);
      // launchTerminal now pre-sets agentSessionId — this tests the no-op path
      mgr.setAgentSessionId(terminal, 'existing-session');

      const resolver = makeResolver(new Map());
      mgr.setSessionResolver(resolver as unknown as import('../session-context').SessionContextResolver);

      vi.mocked(ctx.workspaceState.update).mockClear();
      mgr.detectSessionIds();
      expect(resolver.resolveAll).not.toHaveBeenCalled();
    });

    it('should assign session ID when squad path matches a resolved session (legacy terminal)', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig({ path: '/project' });
      const terminal = mgr.launchTerminal(config);
      // Simulate legacy terminal without pre-set agentSessionId
      mgr.getTerminalInfo(terminal)!.agentSessionId = undefined;

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

    it('should not assign session created before terminal launch (legacy terminal)', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig({ path: '/project' });
      const terminal = mgr.launchTerminal(config);
      // Simulate legacy terminal
      mgr.getTerminalInfo(terminal)!.agentSessionId = undefined;

      const sessions = new Map([
        ['/project', { sessionId: 'old-session', createdAt: '2020-01-01T00:00:00.000Z' }],
      ]);
      const resolver = makeResolver(sessions);
      mgr.setSessionResolver(resolver as unknown as import('../session-context').SessionContextResolver);

      mgr.detectSessionIds();

      const info = mgr.getTerminalInfo(terminal);
      expect(info?.agentSessionId).toBeUndefined();
    });

    it('should not double-claim a session already assigned to another terminal (legacy terminals)', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig({ path: '/project' });

      const terminal1 = mgr.launchTerminal(config);
      const terminal2 = mgr.launchTerminal(config, 'Second');
      // Simulate legacy terminals
      mgr.getTerminalInfo(terminal1)!.agentSessionId = undefined;
      mgr.getTerminalInfo(terminal2)!.agentSessionId = undefined;

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

    it('should fire onDidChange and persist when sessions are detected (legacy terminal)', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig({ path: '/project' });
      const terminal = mgr.launchTerminal(config);
      // Simulate legacy terminal
      mgr.getTerminalInfo(terminal)!.agentSessionId = undefined;

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
      const terminal = mgr.launchTerminal(config);
      // Simulate legacy terminal
      mgr.getTerminalInfo(terminal)!.agentSessionId = undefined;

      const resolver = makeResolver(new Map());
      mgr.setSessionResolver(resolver as unknown as import('../session-context').SessionContextResolver);

      mgr.detectSessionIds();
      // resolveAll should not be called since there are no valid squad paths
      expect(resolver.resolveAll).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // events.jsonl-based state detection
  // =========================================================================

  // =========================================================================
  // Session resume validation (#322)
  // =========================================================================

  describe('session resume validation (#322)', () => {
    function makeResumableResolver(result: { resumable: boolean; reason?: string; stale: boolean }) {
      return {
        isSessionResumable: vi.fn().mockReturnValue(result),
        resolveAll: vi.fn().mockReturnValue(new Map()),
        watchSession: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        watchSessionDir: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      };
    }

    it('should show error message when session is not resumable', () => {
      const orphanEntry = makePersistedEntry({
        id: 'resume-validate-1',
        terminalName: '🧪 No Match',
        launchCommand: 'copilot --agent squad',
        agentSessionId: 'bad-session',
      });
      const ctx = makeMockContext([orphanEntry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      const resolver = makeResumableResolver({
        resumable: false,
        reason: 'Session bad-session has no workspace.yaml — session state is missing or corrupted.',
        stale: false,
      });
      mgr.setSessionResolver(resolver as unknown as import('../session-context').SessionContextResolver);

      mgr.relaunchSession(orphanEntry);

      expect(vscodeModule.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Cannot resume session'),
      );
    });

    it('should show stale warning when session is older than 7 days', () => {
      const orphanEntry = makePersistedEntry({
        id: 'resume-stale-1',
        terminalName: '🧪 No Match',
        launchCommand: 'copilot --agent squad',
        agentSessionId: 'stale-session',
      });
      const ctx = makeMockContext([orphanEntry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      const resolver = makeResumableResolver({ resumable: true, stale: true });
      mgr.setSessionResolver(resolver as unknown as import('../session-context').SessionContextResolver);

      mgr.relaunchSession(orphanEntry);

      expect(vscodeModule.window.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('not been updated in over 7 days'),
      );
    });

    it('should call sendText BEFORE show to queue command before terminal is visible', () => {
      const orphanEntry = makePersistedEntry({
        id: 'resume-order-1',
        terminalName: '🧪 No Match',
        launchCommand: 'copilot --agent squad',
        agentSessionId: 'order-session',
      });
      const ctx = makeMockContext([orphanEntry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      const terminal = mgr.relaunchSession(orphanEntry);

      const sendTextMock = vi.mocked(terminal!.sendText);
      const showMock = vi.mocked(terminal!.show);

      expect(sendTextMock).toHaveBeenCalled();
      expect(showMock).toHaveBeenCalled();

      // sendText must have been called before show
      const sendTextOrder = sendTextMock.mock.invocationCallOrder[0];
      const showOrder = showMock.mock.invocationCallOrder[0];
      expect(sendTextOrder).toBeLessThan(showOrder);
    });

    it('should use --continue flag when continueLatest is true', () => {
      const orphanEntry = makePersistedEntry({
        id: 'resume-continue-1',
        terminalName: '🧪 No Match',
        launchCommand: 'copilot --agent squad',
        agentSessionId: 'continue-session',
      });
      const ctx = makeMockContext([orphanEntry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      const terminal = mgr.relaunchSession(orphanEntry, true);

      expect(terminal!.sendText).toHaveBeenCalledWith('copilot --agent squad --continue');
    });

    it('should pass EDITLESS env vars via TerminalOptions.env', () => {
      const orphanEntry = makePersistedEntry({
        id: 'resume-env-1',
        terminalName: '🧪 No Match',
        launchCommand: 'copilot --agent squad',
        agentSessionId: 'env-session',
      });
      const ctx = makeMockContext([orphanEntry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      mgr.relaunchSession(orphanEntry);

      expect(mockCreateTerminal).toHaveBeenCalledWith(
        expect.objectContaining({
          env: expect.objectContaining({
            EDITLESS_SESSION_ID: 'resume-env-1',
            EDITLESS_AGENT_SESSION_ID: 'env-session',
            EDITLESS_TERMINAL_ID: 'resume-env-1',
            EDITLESS_SQUAD_ID: 'test-squad',
            EDITLESS_SQUAD_NAME: 'Test Squad',
          }),
        }),
      );
    });

    it('should still pass terminal/squad env vars when no agentSessionId', () => {
      const orphanEntry = makePersistedEntry({
        id: 'resume-no-env-1',
        terminalName: '🧪 No Match',
        launchCommand: 'copilot --agent squad',
      });
      const ctx = makeMockContext([orphanEntry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      mgr.relaunchSession(orphanEntry);

      expect(mockCreateTerminal).toHaveBeenCalledWith(
        expect.objectContaining({
          env: expect.objectContaining({
            EDITLESS_TERMINAL_ID: 'resume-no-env-1',
            EDITLESS_SQUAD_ID: 'test-squad',
            EDITLESS_SQUAD_NAME: 'Test Squad',
          }),
        }),
      );
      // Should NOT include session-specific env vars
      const createOpts = mockCreateTerminal.mock.calls[0][0] as vscode.TerminalOptions;
      expect(createOpts.env?.EDITLESS_SESSION_ID).toBeUndefined();
      expect(createOpts.env?.EDITLESS_AGENT_SESSION_ID).toBeUndefined();
    });

    it('should skip validation when no session resolver is set', () => {
      const orphanEntry = makePersistedEntry({
        id: 'resume-no-resolver-1',
        terminalName: '🧪 No Match',
        launchCommand: 'copilot --agent squad',
        agentSessionId: 'some-session',
      });
      const ctx = makeMockContext([orphanEntry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();
      // No setSessionResolver call

      const terminal = mgr.relaunchSession(orphanEntry);

      // Should still launch without errors
      expect(terminal!.sendText).toHaveBeenCalledWith('copilot --agent squad --resume some-session');
    });
  });

  // -------------------------------------------------------------------------
  // Phase 2: Terminal integration with --resume UUID
  // -------------------------------------------------------------------------

  describe('launchTerminal with --resume UUID', () => {
    it('should set agentSessionId immediately on launch', () => {
      const mockUuid = 'test-uuid-12345';
      mockRandomUUID.mockReturnValue(mockUuid as `${string}-${string}-${string}-${string}-${string}`);

      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig();

      const terminal = mgr.launchTerminal(config);

      const info = mgr.getTerminalInfo(terminal);
      expect(info?.agentSessionId).toBe(mockUuid);
    });

    it('should pass --resume UUID in the terminal sendText command', () => {
      const mockUuid = 'test-uuid-67890';
      mockRandomUUID.mockReturnValue(mockUuid as `${string}-${string}-${string}-${string}-${string}`);

      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig();

      const terminal = mgr.launchTerminal(config);

      expect(terminal.sendText).toHaveBeenCalledWith(expect.stringContaining(`--resume ${mockUuid}`));
    });

    it('should include EDITLESS_TERMINAL_ID in terminal env', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig();

      mgr.launchTerminal(config);

      const createOpts = mockCreateTerminal.mock.calls[0][0] as vscode.TerminalOptions;
      expect(createOpts.env).toBeDefined();
      expect(createOpts.env?.EDITLESS_TERMINAL_ID).toBeDefined();
    });

    it('should include EDITLESS_SQUAD_ID and EDITLESS_SQUAD_NAME in terminal env', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig({ id: 'my-squad', name: 'My Squad' });

      mgr.launchTerminal(config);

      const createOpts = mockCreateTerminal.mock.calls[0][0] as vscode.TerminalOptions;
      expect(createOpts.env?.EDITLESS_SQUAD_ID).toBe('my-squad');
      expect(createOpts.env?.EDITLESS_SQUAD_NAME).toBe('My Squad');
    });

    it('should set isTransient: true on created terminal', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig();

      mgr.launchTerminal(config);

      const createOpts = mockCreateTerminal.mock.calls[0][0] as vscode.TerminalOptions;
      expect(createOpts.isTransient).toBe(true);
    });
  });

  describe('Phase 2: watcher lifecycle', () => {
    function makeMockResolver() {
      return {
        resolveAll: vi.fn().mockReturnValue(new Map()),
        resolveForSquad: vi.fn(),
        clearCache: vi.fn(),
        getLastEvent: vi.fn(),
        isSessionResumable: vi.fn().mockReturnValue({ resumable: true, stale: false }),
        watchSession: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        watchSessionDir: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        _sessionStateDir: '/tmp/sessions',
      };
    }

    it('launchTerminal calls watchSession when resolver is set', () => {
      const mockUuid = 'test-uuid-value' as `${string}-${string}-${string}-${string}-${string}`;
      mockRandomUUID.mockReturnValue(mockUuid);

      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const mockResolver = makeMockResolver();
      mgr.setSessionResolver(mockResolver as any);

      mgr.launchTerminal(makeSquadConfig());

      expect(mockResolver.watchSession).toHaveBeenCalledWith(
        'test-uuid-value',
        expect.any(Function),
      );
    });

    it('watcher is disposed when terminal closes', () => {
      const mockUuid = 'close-uuid' as `${string}-${string}-${string}-${string}-${string}`;
      mockRandomUUID.mockReturnValue(mockUuid);

      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const watcherDispose = vi.fn();
      const mockResolver = makeMockResolver();
      mockResolver.watchSession.mockReturnValue({ dispose: watcherDispose });
      mgr.setSessionResolver(mockResolver as any);

      const terminal = mgr.launchTerminal(makeSquadConfig());

      // Fire close listener
      capturedCloseListener(terminal);

      expect(watcherDispose).toHaveBeenCalled();
    });

    it('dispose() clears all session watchers', () => {
      const disposeFn1 = vi.fn();
      const disposeFn2 = vi.fn();
      const mockResolver = makeMockResolver();
      let callCount = 0;
      mockResolver.watchSession.mockImplementation(() => {
        callCount++;
        return { dispose: callCount === 1 ? disposeFn1 : disposeFn2 };
      });

      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      mgr.setSessionResolver(mockResolver as any);

      mockRandomUUID.mockReturnValue('uuid-1' as `${string}-${string}-${string}-${string}-${string}`);
      mgr.launchTerminal(makeSquadConfig());

      mockRandomUUID.mockReturnValue('uuid-2' as `${string}-${string}-${string}-${string}-${string}`);
      mgr.launchTerminal(makeSquadConfig());

      expect(mockResolver.watchSession).toHaveBeenCalledTimes(2);

      mgr.dispose();

      expect(disposeFn1).toHaveBeenCalled();
      expect(disposeFn2).toHaveBeenCalled();
    });

    it('reconnectSession and relaunchSession wire up watchers when agentSessionId is present', () => {
      const mockResolver = makeMockResolver();
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      mgr.setSessionResolver(mockResolver as any);

      // --- reconnectSession path ---
      const reconnectEntry = makePersistedEntry({
        id: 'watcher-reconnect-1',
        terminalName: '🧪 Test Squad #1',
        displayName: '🧪 Test Squad #1',
        agentSessionId: 'reconnect-session-id',
      });
      const ctxReconnect = makeMockContext([reconnectEntry]);
      const mgrReconnect = new TerminalManager(ctxReconnect);
      mgrReconnect.setSessionResolver(mockResolver as any);
      mgrReconnect.reconcile();

      const liveTerminal = makeMockTerminal('🧪 Test Squad #1');
      mockTerminals.push(liveTerminal);

      mockResolver.watchSession.mockClear();
      mgrReconnect.reconnectSession(reconnectEntry);

      expect(mockResolver.watchSession).toHaveBeenCalledWith(
        'reconnect-session-id',
        expect.any(Function),
      );

      // --- relaunchSession path (new terminal, no live match) ---
      mockTerminals.length = 0;
      const relaunchEntry = makePersistedEntry({
        id: 'watcher-relaunch-1',
        terminalName: '🧪 No Match',
        displayName: '🧪 Relaunch Test',
        launchCommand: 'copilot --agent squad',
        agentSessionId: 'relaunch-session-id',
      });
      const ctxRelaunch = makeMockContext([relaunchEntry]);
      const mgrRelaunch = new TerminalManager(ctxRelaunch);
      mgrRelaunch.setSessionResolver(mockResolver as any);
      mgrRelaunch.reconcile();

      mockResolver.watchSession.mockClear();
      mgrRelaunch.relaunchSession(relaunchEntry);

      expect(mockResolver.watchSession).toHaveBeenCalledWith(
        'relaunch-session-id',
        expect.any(Function),
      );
    });

    it('launchTerminal with custom config.launchCommand appends --resume UUID', () => {
      const mockUuid = 'custom-cmd-uuid' as `${string}-${string}-${string}-${string}-${string}`;
      mockRandomUUID.mockReturnValue(mockUuid);

      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig({ launchCommand: 'my-cli --agent custom' });

      const terminal = mgr.launchTerminal(config);

      expect(terminal.sendText).toHaveBeenCalledWith('my-cli --agent custom --resume custom-cmd-uuid');
    });
  });

  describe('focusTerminal with stable ID lookup', () => {
    it('should focus terminal when passed a vscode.Terminal object directly', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig();

      const terminal = mgr.launchTerminal(config);
      mockTerminals.push(terminal); // Must be in terminals for alive check

      vi.mocked(terminal.show).mockClear();
      mgr.focusTerminal(terminal);

      expect(terminal.show).toHaveBeenCalledWith(false);
    });

    it('should look up and focus terminal when passed a string ID', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig();

      const terminal = mgr.launchTerminal(config);
      mockTerminals.push(terminal); // Must be in terminals for alive check
      const info = mgr.getTerminalInfo(terminal)!;

      vi.mocked(terminal.show).mockClear();
      mgr.focusTerminal(info.id);

      expect(terminal.show).toHaveBeenCalledWith(false);
    });

    it('should handle unknown string ID gracefully (not throw)', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);

      expect(() => mgr.focusTerminal('unknown-id')).not.toThrow();
    });

    it('should not call show() on a terminal not in vscode.window.terminals', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig();

      const terminal = mgr.launchTerminal(config);
      const info = mgr.getTerminalInfo(terminal)!;

      // Remove terminal from mockTerminals to simulate it being closed
      const idx = mockTerminals.indexOf(terminal);
      if (idx !== -1) mockTerminals.splice(idx, 1);

      mgr.focusTerminal(info.id);

      // Should not have called show after removal
      expect(terminal.show).toHaveBeenCalledTimes(1); // Only from launchTerminal
    });
  });

  describe('session ID detection with --resume', () => {
    it('should NOT overwrite agentSessionId that was pre-set at launch', () => {
      const mockUuid = 'preset-uuid';
      mockRandomUUID.mockReturnValue(mockUuid as `${string}-${string}-${string}-${string}-${string}`);

      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      
      // Create mock resolver that would return different session
      const mockResolver = {
        resolveAll: vi.fn().mockReturnValue(new Map()),
        resolveForSquad: vi.fn(),
        clearCache: vi.fn(),
        getLastEvent: vi.fn(),
        isSessionResumable: vi.fn(),
        watchSession: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        watchSessionDir: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        _sessionStateDir: '/tmp/sessions',
      };
      mgr.setSessionResolver(mockResolver as any);

      const config = makeSquadConfig({ path: '/test/path' });
      const terminal = mgr.launchTerminal(config);

      // Verify agentSessionId was set
      const infoBefore = mgr.getTerminalInfo(terminal);
      expect(infoBefore?.agentSessionId).toBe(mockUuid);

      // Configure resolver to return a different session ID
      mockResolver.resolveAll.mockReturnValue(new Map([['/test/path', {
        sessionId: 'different-session',
        summary: 'Test',
        cwd: '/test/path',
        branch: 'main',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        references: [],
      }]]));

      // Trigger detection
      mgr.detectSessionIds();

      // Should NOT have changed
      const infoAfter = mgr.getTerminalInfo(terminal);
      expect(infoAfter?.agentSessionId).toBe(mockUuid);
    });

    it('should still detect session IDs for terminals without pre-set agentSessionId', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);

      // Manually add a terminal without agentSessionId (simulate old behavior)
      const config = makeSquadConfig({ path: '/test/path' });
      const terminal = makeMockTerminal('Legacy Terminal');
      
      // Manually register without agentSessionId
      const info = {
        id: 'legacy-1',
        labelKey: 'terminal:legacy-1',
        displayName: 'Legacy Terminal',
        originalName: 'Legacy Terminal',
        squadId: config.id,
        squadName: config.name,
        squadIcon: config.icon,
        index: 1,
        createdAt: new Date(),
        squadPath: config.path,
      };
      (mgr as any)._terminals.set(terminal, info);

      // Create mock resolver
      const mockResolver = {
        resolveAll: vi.fn().mockReturnValue(new Map([['/test/path', {
          sessionId: 'detected-session',
          summary: 'Test',
          cwd: '/test/path',
          branch: 'main',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          references: [],
        }]])),
        resolveForSquad: vi.fn(),
        clearCache: vi.fn(),
        getLastEvent: vi.fn(),
        isSessionResumable: vi.fn(),
        watchSession: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        watchSessionDir: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        _sessionStateDir: '/tmp/sessions',
      };
      mgr.setSessionResolver(mockResolver as any);

      mgr.detectSessionIds();

      const infoAfter = mgr.getTerminalInfo(terminal);
      expect(infoAfter?.agentSessionId).toBe('detected-session');
    });
  });

  // ---------------------------------------------------------------------------
  // #327 — Strengthened orphan matching
  // ---------------------------------------------------------------------------

  describe('stripEmoji helper (#327)', () => {
    it('should strip emoji from a string', () => {
      expect(stripEmoji('🧪 Test Squad #1')).toBe('Test Squad #1');
    });

    it('should handle strings with no emoji', () => {
      expect(stripEmoji('Test Squad #1')).toBe('Test Squad #1');
    });

    it('should handle emoji-only strings', () => {
      expect(stripEmoji('🧪🚀')).toBe('');
    });

    it('should handle empty strings', () => {
      expect(stripEmoji('')).toBe('');
    });
  });

  describe('emoji-stripped name matching (#327)', () => {
    it('should match when shell strips emoji from terminal name', () => {
      const entry = makePersistedEntry({
        id: 'emoji-strip-1',
        terminalName: '🧪 Test Squad #1',
        displayName: '🧪 Test Squad #1',
        originalName: '🧪 Test Squad #1',
      });
      const liveTerminal = makeMockTerminal('Test Squad #1');
      mockTerminals.push(liveTerminal);

      const ctx = makeMockContext([entry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      const all = mgr.getAllTerminals();
      expect(all).toHaveLength(1);
      expect(all[0].terminal).toBe(liveTerminal);
      expect(all[0].info.id).toBe('emoji-strip-1');
    });

    it('should NOT emoji-match when stripped names differ', () => {
      const entry = makePersistedEntry({
        id: 'emoji-strip-2',
        terminalName: '🧪 Alpha #1',
        displayName: '🧪 Alpha #1',
        originalName: '🧪 Alpha #1',
      });
      const liveTerminal = makeMockTerminal('Beta #1');
      mockTerminals.push(liveTerminal);

      const ctx = makeMockContext([entry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      expect(mgr.getAllTerminals()).toHaveLength(0);
    });
  });

  describe('index-based matching (#327)', () => {
    it('should match by squadId + sequential index when a sibling is already tracked', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const config = makeSquadConfig({ id: 'idx-squad', name: 'Idx Squad', icon: '🔢' });

      // Launch a terminal so there's a tracked terminal with index 1
      mockRandomUUID.mockReturnValueOnce('00000000-0000-0000-0000-aaaaaaaaaaaa' as any);
      const t1 = mgr.launchTerminal(config);

      // Simulate a persisted entry with index 2 that has mismatched names
      const entry = makePersistedEntry({
        id: 'idx-match-2',
        squadId: 'idx-squad',
        index: 2,
        terminalName: 'shell-mangled-name',
        displayName: 'shell-mangled-name',
        originalName: 'shell-mangled-name',
      });
      const liveTerminal = makeMockTerminal('completely-different');
      mockTerminals.push(liveTerminal);

      // Load persisted entry manually to trigger matching
      (mgr as any)._pendingSaved = [entry];
      (mgr as any)._tryMatchTerminals();

      const all = mgr.getAllTerminals();
      // Should have the launched terminal + the index-matched one
      const matched = all.find(a => a.info.id === 'idx-match-2');
      expect(matched).toBeDefined();
      expect(matched!.terminal).toBe(liveTerminal);
    });
  });

  describe('pendingSaved cap at 50 (#327)', () => {
    it('should cap _pendingSaved at 50 entries', () => {
      const entries = Array.from({ length: 60 }, (_, i) =>
        makePersistedEntry({
          id: `cap-${i}`,
          terminalName: `term-${i}`,
          displayName: `term-${i}`,
          rebootCount: 0,
        }),
      );

      const ctx = makeMockContext(entries);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      const orphans = mgr.getOrphanedSessions();
      expect(orphans.length).toBeLessThanOrEqual(50);
    });
  });

  describe('substring fallback removal (#327)', () => {
    it('should NOT match via permissive substring includes', () => {
      const entry = makePersistedEntry({
        id: 'substr-false-positive',
        terminalName: 'bash',
        displayName: 'bash',
        originalName: 'bash',
      });
      // "bash" would have matched "bash: 🧪 Squad #1" with old .includes()
      const liveTerminal = makeMockTerminal('bash: 🧪 Squad #1');
      mockTerminals.push(liveTerminal);

      const ctx = makeMockContext([entry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      expect(mgr.getAllTerminals()).toHaveLength(0);
      const orphans = mgr.getOrphanedSessions();
      expect(orphans.find(e => e.id === 'substr-false-positive')).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // #337 — Launch timeout edge case
  // ---------------------------------------------------------------------------

  describe('launch timeout (#337)', () => {
    it('should auto-clear launching state after LAUNCH_TIMEOUT_MS', () => {
      vi.useFakeTimers();
      try {
        const ctx = makeMockContext();
        const mgr = new TerminalManager(ctx);
        const config = makeSquadConfig();
        const terminal = mgr.launchTerminal(config);

        expect(mgr.getSessionState(terminal)).toBe('launching');

        // Advance just under the timeout — still launching
        vi.advanceTimersByTime(9_999);
        expect(mgr.getSessionState(terminal)).toBe('launching');

        // Advance past the timeout — should be inactive
        vi.advanceTimersByTime(1);
        expect(mgr.getSessionState(terminal)).toBe('inactive');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // #338 — Resumable detection edge cases
  // ---------------------------------------------------------------------------

  describe('resumable detection edge cases (#338)', () => {
    it('should treat undefined agentSessionId as non-resumable', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const info = makePersistedEntry({ agentSessionId: undefined });

      const icon = mgr.getStateIcon('orphaned', info);
      expect(icon.id).toBe('circle-outline');

      const desc = mgr.getStateDescription('orphaned', info);
      expect(desc).toBe('session ended');
    });

    it('should treat empty string agentSessionId as non-resumable', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const info = makePersistedEntry({ agentSessionId: '' });

      const icon = mgr.getStateIcon('orphaned', info);
      expect(icon.id).toBe('circle-outline');

      const desc = mgr.getStateDescription('orphaned', info);
      expect(desc).toBe('session ended');
    });

    it('should treat populated agentSessionId as resumable', () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);
      const info = makePersistedEntry({ agentSessionId: 'abc-123' });

      const icon = mgr.getStateIcon('orphaned', info);
      expect(icon.id).toBe('history');

      const desc = mgr.getStateDescription('orphaned', info);
      expect(desc).toContain('resume');
    });
  });

  // ---------------------------------------------------------------------------
  // #328 — Bumped MAX_REBOOT_COUNT to 5
  // ---------------------------------------------------------------------------

  describe('MAX_REBOOT_COUNT = 5 (#328)', () => {
    it('should keep entries alive through 4 reboots then evict on 5th', () => {
      const entry = makePersistedEntry({ rebootCount: 3 });

      const ctx = makeMockContext([entry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      // rebootCount was 3, incremented to 4 — still < 5
      const orphans = mgr.getOrphanedSessions();
      expect(orphans).toHaveLength(1);
    });

    it('should evict entry when rebootCount reaches 5', () => {
      const entry = makePersistedEntry({ rebootCount: 4 });

      const ctx = makeMockContext([entry]);
      const mgr = new TerminalManager(ctx);
      mgr.reconcile();

      // rebootCount was 4, incremented to 5 — evicted
      const orphans = mgr.getOrphanedSessions();
      expect(orphans).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // waitForReconciliation — deferred orphan check (#race-fix)
  // ---------------------------------------------------------------------------

  describe('waitForReconciliation', () => {
    it('resolves immediately when no pending saved entries exist', async () => {
      const ctx = makeMockContext();
      const mgr = new TerminalManager(ctx);

      // No reconcile() called — _pendingSaved is empty
      await expect(mgr.waitForReconciliation()).resolves.toBeUndefined();
    });

    it('resolves immediately when all entries matched during reconcile()', async () => {
      const liveTerminal = makeMockTerminal('🧪 Test Squad #1');
      mockTerminals.push(liveTerminal);

      const saved = [makePersistedEntry()];
      const ctx = makeMockContext(saved);
      const mgr = new TerminalManager(ctx);

      mgr.reconcile();

      // All matched synchronously — should resolve immediately
      await expect(mgr.waitForReconciliation()).resolves.toBeUndefined();
    });

    it('resolves after debounced match succeeds for late-arriving terminals', async () => {
      vi.useFakeTimers();

      const saved = [makePersistedEntry({ terminalName: '🧪 Test Squad #1' })];
      const ctx = makeMockContext(saved);
      const mgr = new TerminalManager(ctx);

      mgr.reconcile();

      // No live terminals yet — entry is pending
      expect(mgr.getOrphanedSessions()).toHaveLength(1);

      const promise = mgr.waitForReconciliation();

      // Simulate a late-arriving terminal via onDidOpenTerminal
      const lateTerminal = makeMockTerminal('🧪 Test Squad #1');
      mockTerminals.push(lateTerminal);
      capturedOpenListener!(lateTerminal);

      // Advance past the 200ms debounce in _scheduleMatch
      vi.advanceTimersByTime(250);

      await promise;

      // Now the entry should be matched, not orphaned
      expect(mgr.getOrphanedSessions()).toHaveLength(0);
      expect(mgr.getAllTerminals()).toHaveLength(1);

      vi.useRealTimers();
    });

    it('resolves on max timeout when terminals never appear', async () => {
      vi.useFakeTimers();

      const saved = [makePersistedEntry({ terminalName: '🧪 Ghost #1' })];
      const ctx = makeMockContext(saved);
      const mgr = new TerminalManager(ctx);

      mgr.reconcile();

      const promise = mgr.waitForReconciliation();

      // Advance past the 2000ms max timeout
      vi.advanceTimersByTime(2100);

      await promise;

      // Entry is still orphaned — but the promise resolved
      expect(mgr.getOrphanedSessions()).toHaveLength(1);

      vi.useRealTimers();
    });

    it('no orphan toast when terminals match during debounce window', async () => {
      vi.useFakeTimers();

      const saved = [makePersistedEntry({
        terminalName: '🧪 Test Squad #1',
        agentSessionId: 'session-abc',
      })];
      const ctx = makeMockContext(saved);
      const mgr = new TerminalManager(ctx);

      mgr.reconcile();

      const promise = mgr.waitForReconciliation();

      // Terminal arrives late
      const lateTerminal = makeMockTerminal('🧪 Test Squad #1');
      mockTerminals.push(lateTerminal);
      capturedOpenListener!(lateTerminal);

      vi.advanceTimersByTime(250);
      await promise;

      // After reconciliation settles, no resumable orphans should exist
      const orphans = mgr.getOrphanedSessions();
      const resumable = orphans.filter(o => o.agentSessionId);
      expect(resumable).toHaveLength(0);

      vi.useRealTimers();
    });

    it('relaunchSession still works for truly dead sessions after timeout', async () => {
      vi.useFakeTimers();

      const entry = makePersistedEntry({
        id: 'dead-session-1',
        terminalName: '🧪 Dead #1',
        displayName: '🧪 Dead #1',
        agentSessionId: 'dead-uuid',
        launchCommand: 'copilot --agent squad',
      });
      const ctx = makeMockContext([entry]);
      const mgr = new TerminalManager(ctx);

      mgr.reconcile();

      const promise = mgr.waitForReconciliation();
      vi.advanceTimersByTime(2100);
      await promise;

      // Entry is truly orphaned — relaunch should create new terminal
      const terminal = mgr.relaunchSession(entry);
      expect(terminal).toBeDefined();
      expect(mockCreateTerminal).toHaveBeenCalledWith(
        expect.objectContaining({ name: '🧪 Dead #1' }),
      );
      expect(terminal!.sendText).toHaveBeenCalledWith('copilot --agent squad --resume dead-uuid');

      // Orphan should be removed after relaunch
      expect(mgr.getOrphanedSessions().find(e => e.id === 'dead-session-1')).toBeUndefined();

      vi.useRealTimers();
    });
  });
});
