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
  mockTerminals,
} = vi.hoisted(() => ({
  mockCreateTerminal: vi.fn(),
  mockOnDidCloseTerminal: vi.fn(),
  mockTerminals: [] as vscode.Terminal[],
}));

vi.mock('vscode', () => ({
  window: {
    createTerminal: mockCreateTerminal,
    onDidCloseTerminal: mockOnDidCloseTerminal,
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

import { TerminalManager } from '../terminal-manager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PersistedTerminalInfo {
  id: string;
  labelKey: string;
  displayName: string;
  squadId: string;
  squadName: string;
  squadIcon: string;
  index: number;
  createdAt: string;
  terminalName: string;
}

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
    ...overrides,
  };
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

  describe('reconcile skips unmatched saved entries', () => {
    it('should clean up saved entries that have no matching live terminal', () => {
      // No live terminals — the saved entry is orphaned
      const saved = [makePersistedEntry({ terminalName: '🧪 Ghost #1' })];
      const ctx = makeMockContext(saved);
      const mgr = new TerminalManager(ctx);

      mgr.reconcile();

      expect(mgr.getAllTerminals()).toHaveLength(0);
      // _persist was called — the orphan was cleaned out
      const lastCall = vi.mocked(ctx.workspaceState.update).mock.calls.at(-1);
      expect(lastCall![1]).toEqual([]);
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
});
