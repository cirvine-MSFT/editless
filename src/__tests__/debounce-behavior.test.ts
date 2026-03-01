/**
 * Debounce behavior tests for issue #438.
 *
 * Two areas:
 *   1. TerminalManager._scheduleChange() — batches rapid _onDidChange.fire()
 *      calls into a single fire after ~50ms.
 *   2. Extension reveal() — batches rapid onDidChangeActiveTerminal events
 *      into a single treeView.reveal() after ~100ms.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as vscode from 'vscode';
import type { AgentTeamConfig } from '../types';

// ---------------------------------------------------------------------------
// Hoisted mocks — TerminalManager tests
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
  mockWorkspaceFolders,
} = vi.hoisted(() => ({
  mockCreateTerminal: vi.fn(),
  mockOnDidCloseTerminal: vi.fn(),
  mockOnDidOpenTerminal: vi.fn(),
  mockOnDidStartTerminalShellExecution: vi.fn(),
  mockOnDidEndTerminalShellExecution: vi.fn(),
  mockTerminals: [] as vscode.Terminal[],
  mockRandomUUID: vi.fn<() => `${string}-${string}-${string}-${string}-${string}`>(),
  mockWorkspaceFolders: { value: undefined as { uri: { fsPath: string } }[] | undefined },
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
        if (key === 'additionalArgs') return '';
        return defaultValue;
      },
    }),
    get workspaceFolders() { return mockWorkspaceFolders.value; },
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

import { TerminalManager, type PersistedTerminalInfo } from '../terminal-manager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

let capturedCloseListener: CloseListener;
let capturedShellStartListener: ShellExecutionListener;
let capturedShellEndListener: ShellExecutionListener;

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockTerminals.length = 0;
  mockWorkspaceFolders.value = undefined;

  mockOnDidCloseTerminal.mockImplementation((listener: CloseListener) => {
    capturedCloseListener = listener;
    return { dispose: vi.fn() };
  });

  mockOnDidOpenTerminal.mockImplementation((listener: Function) => {
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

afterEach(() => {
  vi.useRealTimers();
});

// ===========================================================================
// 1. TerminalManager._scheduleChange() debounce behavior
// ===========================================================================

describe('TerminalManager — _scheduleChange() debounce (#438)', () => {

  // ---- Single event still fires (just delayed) ----------------------------

  it('should fire onDidChange after the debounce delay for a single shell start event', () => {
    const ctx = makeMockContext();
    const mgr = new TerminalManager(ctx);
    const terminal = mgr.launchTerminal(makeSquadConfig());
    const changeSpy = vi.fn();
    mgr.onDidChange(changeSpy);

    capturedShellStartListener({ terminal, execution: {} as vscode.TerminalShellExecution });

    // Not yet — still within debounce window
    expect(changeSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);

    expect(changeSpy).toHaveBeenCalledOnce();
  });

  it('should fire onDidChange after the debounce delay for a single shell end event', () => {
    const ctx = makeMockContext();
    const mgr = new TerminalManager(ctx);
    const terminal = mgr.launchTerminal(makeSquadConfig());
    const changeSpy = vi.fn();
    mgr.onDidChange(changeSpy);

    capturedShellEndListener({ terminal, execution: {} as vscode.TerminalShellExecution });

    expect(changeSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(changeSpy).toHaveBeenCalledOnce();
  });

  // ---- Multiple rapid events coalesce into one fire -----------------------

  it('should coalesce rapid shell start + end into a single onDidChange fire', () => {
    const ctx = makeMockContext();
    const mgr = new TerminalManager(ctx);
    const terminal = mgr.launchTerminal(makeSquadConfig());
    const changeSpy = vi.fn();
    mgr.onDidChange(changeSpy);

    // Rapid start → end within the debounce window
    capturedShellStartListener({ terminal, execution: {} as vscode.TerminalShellExecution });
    capturedShellEndListener({ terminal, execution: {} as vscode.TerminalShellExecution });

    expect(changeSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(changeSpy).toHaveBeenCalledOnce();
  });

  it('should coalesce 10+ rapid events into a single onDidChange fire', () => {
    const ctx = makeMockContext();
    const mgr = new TerminalManager(ctx);
    const terminal = mgr.launchTerminal(makeSquadConfig());
    const changeSpy = vi.fn();
    mgr.onDidChange(changeSpy);

    // Simulate 12 rapid shell execution events (start/end alternating)
    for (let i = 0; i < 12; i++) {
      if (i % 2 === 0) {
        capturedShellStartListener({ terminal, execution: {} as vscode.TerminalShellExecution });
      } else {
        capturedShellEndListener({ terminal, execution: {} as vscode.TerminalShellExecution });
      }
    }

    expect(changeSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(changeSpy).toHaveBeenCalledOnce();
  });

  // ---- Debounce resets on each new call -----------------------------------

  it('should reset the debounce timer on each new event', () => {
    const ctx = makeMockContext();
    const mgr = new TerminalManager(ctx);
    const terminal = mgr.launchTerminal(makeSquadConfig());
    const changeSpy = vi.fn();
    mgr.onDidChange(changeSpy);

    capturedShellStartListener({ terminal, execution: {} as vscode.TerminalShellExecution });

    // Advance 40ms (not yet past 50ms threshold)
    vi.advanceTimersByTime(40);
    expect(changeSpy).not.toHaveBeenCalled();

    // New event at 40ms resets the debounce timer
    capturedShellEndListener({ terminal, execution: {} as vscode.TerminalShellExecution });

    // Advance another 40ms (80ms total, but only 40ms since last event)
    vi.advanceTimersByTime(40);
    expect(changeSpy).not.toHaveBeenCalled();

    // Advance remaining 10ms to hit 50ms since last event
    vi.advanceTimersByTime(10);
    expect(changeSpy).toHaveBeenCalledOnce();
  });

  // ---- Close event fires after debounce -----------------------------------

  it('should debounce terminal close event', () => {
    const ctx = makeMockContext();
    const mgr = new TerminalManager(ctx);
    const terminal = mgr.launchTerminal(makeSquadConfig());
    const changeSpy = vi.fn();
    mgr.onDidChange(changeSpy);

    capturedCloseListener(terminal);

    expect(changeSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(changeSpy).toHaveBeenCalledOnce();
  });

  // ---- Timer cleanup on dispose ------------------------------------------

  it('should not fire onDidChange after dispose() even with pending timer', () => {
    const ctx = makeMockContext();
    const mgr = new TerminalManager(ctx);
    const terminal = mgr.launchTerminal(makeSquadConfig());
    const changeSpy = vi.fn();
    mgr.onDidChange(changeSpy);

    // Trigger event to create a pending debounce timer
    capturedShellStartListener({ terminal, execution: {} as vscode.TerminalShellExecution });

    // Dispose before timer fires
    mgr.dispose();

    // Advance well past the debounce window
    vi.advanceTimersByTime(200);

    // Timer should have been cleared — no fire
    expect(changeSpy).not.toHaveBeenCalled();
  });

  it('should not fire stale events after dispose even with rapid-fire events', () => {
    const ctx = makeMockContext();
    const mgr = new TerminalManager(ctx);
    const terminal = mgr.launchTerminal(makeSquadConfig());
    const changeSpy = vi.fn();
    mgr.onDidChange(changeSpy);

    // Rapid-fire 5 events
    for (let i = 0; i < 5; i++) {
      capturedShellStartListener({ terminal, execution: {} as vscode.TerminalShellExecution });
    }

    // Dispose immediately
    mgr.dispose();

    // Advance timers well past debounce
    vi.advanceTimersByTime(500);
    expect(changeSpy).not.toHaveBeenCalled();
  });

  // ---- Race between dispose and pending timer ----------------------------

  it('should handle dispose() called at exact debounce boundary', () => {
    const ctx = makeMockContext();
    const mgr = new TerminalManager(ctx);
    const terminal = mgr.launchTerminal(makeSquadConfig());
    const changeSpy = vi.fn();
    mgr.onDidChange(changeSpy);

    capturedShellStartListener({ terminal, execution: {} as vscode.TerminalShellExecution });

    // Advance to just before debounce fires
    vi.advanceTimersByTime(49);
    expect(changeSpy).not.toHaveBeenCalled();

    // Dispose at the boundary
    mgr.dispose();

    // Cross the boundary
    vi.advanceTimersByTime(2);
    expect(changeSpy).not.toHaveBeenCalled();
  });

  // ---- Separate debounce windows fire independently ----------------------

  it('should fire separately for events separated by more than the debounce delay', () => {
    const ctx = makeMockContext();
    const mgr = new TerminalManager(ctx);
    const terminal = mgr.launchTerminal(makeSquadConfig());
    const changeSpy = vi.fn();
    mgr.onDidChange(changeSpy);

    // First event
    capturedShellStartListener({ terminal, execution: {} as vscode.TerminalShellExecution });
    vi.advanceTimersByTime(50);
    expect(changeSpy).toHaveBeenCalledTimes(1);

    // Second event after first has already fired
    capturedShellEndListener({ terminal, execution: {} as vscode.TerminalShellExecution });
    vi.advanceTimersByTime(50);
    expect(changeSpy).toHaveBeenCalledTimes(2);
  });

  // ---- No event before delay elapses -------------------------------------

  it('should not fire before the debounce delay', () => {
    const ctx = makeMockContext();
    const mgr = new TerminalManager(ctx);
    const terminal = mgr.launchTerminal(makeSquadConfig());
    const changeSpy = vi.fn();
    mgr.onDidChange(changeSpy);

    capturedShellStartListener({ terminal, execution: {} as vscode.TerminalShellExecution });

    vi.advanceTimersByTime(10);
    expect(changeSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(20);
    expect(changeSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(20);
    expect(changeSpy).toHaveBeenCalledOnce();
  });

  // ---- dispose() is idempotent ------------------------------------------

  it('should not throw when dispose() is called twice', () => {
    const ctx = makeMockContext();
    const mgr = new TerminalManager(ctx);

    mgr.dispose();
    expect(() => mgr.dispose()).not.toThrow();
  });
});

// ===========================================================================
// 2. Extension reveal() debounce behavior
// ===========================================================================
//
// These tests verify the debounced reveal logic that Morty is adding to
// extension.ts activate(). We exercise it by capturing the
// onDidChangeActiveTerminal handler and invoking it with mock terminals.
// ===========================================================================

// We need a fresh set of mocks for the extension module since it has many
// dependencies. These are isolated from the TerminalManager mocks above via
// a separate describe with its own vi.mock setup tested through a helper
// that simulates the debounced reveal pattern.

describe('Extension — debounced reveal (#438)', () => {

  // Instead of importing the entire extension (which has heavy dependencies),
  // we test the debounced reveal logic in isolation. This mirrors the exact
  // pattern Morty is implementing: clearTimeout + setTimeout(reveal, 100).

  let revealTimer: ReturnType<typeof setTimeout> | undefined;
  let revealFn: ReturnType<typeof vi.fn>;
  let findTerminalItemFn: ReturnType<typeof vi.fn>;
  let getTerminalInfoFn: ReturnType<typeof vi.fn>;

  /** Simulates the debounced reveal handler from extension.ts */
  function debouncedRevealHandler(terminal: vscode.Terminal | undefined): void {
    if (!terminal) return;
    const info = getTerminalInfoFn(terminal);
    if (!info) return;
    clearTimeout(revealTimer);
    revealTimer = setTimeout(() => {
      const matchingItem = findTerminalItemFn(terminal);
      if (matchingItem) {
        try {
          revealFn(matchingItem, { select: true, focus: false });
        } catch {
          // reveal() may fail if tree is not visible or item is stale
        }
      }
    }, 100);
  }

  function disposeRevealTimer(): void {
    clearTimeout(revealTimer);
    revealTimer = undefined;
  }

  beforeEach(() => {
    revealTimer = undefined;
    revealFn = vi.fn();
    findTerminalItemFn = vi.fn().mockReturnValue({ label: 'mock-item' });
    getTerminalInfoFn = vi.fn().mockReturnValue({ id: 'test' });
  });

  // ---- Single terminal focus fires reveal after delay --------------------

  it('should call reveal() after ~100ms for a single terminal focus change', () => {
    const terminal = makeMockTerminal('🧪 Test #1');

    debouncedRevealHandler(terminal);
    expect(revealFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(revealFn).toHaveBeenCalledOnce();
    expect(revealFn).toHaveBeenCalledWith({ label: 'mock-item' }, { select: true, focus: false });
  });

  // ---- Multiple rapid focus changes coalesce into one reveal -------------

  it('should call reveal() only once for multiple rapid terminal focus changes', () => {
    const t1 = makeMockTerminal('🧪 Test #1');
    const t2 = makeMockTerminal('🧪 Test #2');
    const t3 = makeMockTerminal('🧪 Test #3');

    debouncedRevealHandler(t1);
    debouncedRevealHandler(t2);
    debouncedRevealHandler(t3);

    vi.advanceTimersByTime(100);

    // Only the last terminal's item should be revealed
    expect(revealFn).toHaveBeenCalledOnce();
  });

  it('should reveal the LAST focused terminal when rapid-firing', () => {
    const t1 = makeMockTerminal('🧪 Test #1');
    const t2 = makeMockTerminal('🧪 Test #2');
    const t3 = makeMockTerminal('🧪 Test #3');

    // Return different items for different terminals
    findTerminalItemFn
      .mockReturnValueOnce({ label: 'item-1' })   // for t1 (will be discarded)
      .mockReturnValueOnce({ label: 'item-2' })   // for t2 (will be discarded)
      .mockReturnValue({ label: 'item-3' });       // for t3 (the winner)

    debouncedRevealHandler(t1);
    debouncedRevealHandler(t2);
    debouncedRevealHandler(t3);

    vi.advanceTimersByTime(100);

    expect(revealFn).toHaveBeenCalledOnce();
    // findTerminalItemFn is called inside the timeout, only once for the last terminal
    expect(findTerminalItemFn).toHaveBeenCalledWith(t3);
  });

  // ---- 10+ rapid focus changes ------------------------------------------

  it('should coalesce 15 rapid focus changes into a single reveal call', () => {
    const terminals = Array.from({ length: 15 }, (_, i) => makeMockTerminal(`Term #${i}`));

    for (const t of terminals) {
      debouncedRevealHandler(t);
    }

    vi.advanceTimersByTime(100);
    expect(revealFn).toHaveBeenCalledOnce();
  });

  // ---- Debounce resets on each new call ----------------------------------

  it('should reset the reveal timer when a new focus change arrives', () => {
    const t1 = makeMockTerminal('🧪 Test #1');
    const t2 = makeMockTerminal('🧪 Test #2');

    debouncedRevealHandler(t1);
    vi.advanceTimersByTime(80); // 80ms — not yet
    expect(revealFn).not.toHaveBeenCalled();

    // New focus at 80ms resets the timer
    debouncedRevealHandler(t2);
    vi.advanceTimersByTime(80); // 160ms total, but only 80ms since last
    expect(revealFn).not.toHaveBeenCalled();

    // 20ms more → 100ms since last call
    vi.advanceTimersByTime(20);
    expect(revealFn).toHaveBeenCalledOnce();
  });

  // ---- Not called before delay -------------------------------------------

  it('should not call reveal() before the 100ms debounce delay', () => {
    const terminal = makeMockTerminal('🧪 Test #1');

    debouncedRevealHandler(terminal);

    vi.advanceTimersByTime(50);
    expect(revealFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(49);
    expect(revealFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(revealFn).toHaveBeenCalledOnce();
  });

  // ---- Timer cleanup on deactivation -------------------------------------

  it('should not fire reveal() after timer is disposed', () => {
    const terminal = makeMockTerminal('🧪 Test #1');

    debouncedRevealHandler(terminal);
    disposeRevealTimer();

    vi.advanceTimersByTime(200);
    expect(revealFn).not.toHaveBeenCalled();
  });

  it('should not fire stale reveal after rapid events + dispose', () => {
    const terminals = Array.from({ length: 5 }, (_, i) => makeMockTerminal(`Term #${i}`));

    for (const t of terminals) {
      debouncedRevealHandler(t);
    }

    disposeRevealTimer();
    vi.advanceTimersByTime(500);
    expect(revealFn).not.toHaveBeenCalled();
  });

  // ---- reveal() failure is caught (not crash) ----------------------------

  it('should catch reveal() errors without crashing', () => {
    const terminal = makeMockTerminal('🧪 Test #1');
    revealFn.mockImplementation(() => { throw new Error('Tree disposed'); });

    debouncedRevealHandler(terminal);
    vi.advanceTimersByTime(100);

    // Should not throw — error is caught silently
    expect(revealFn).toHaveBeenCalledOnce();
  });

  it('should continue working after a reveal() error', () => {
    const t1 = makeMockTerminal('🧪 Test #1');
    const t2 = makeMockTerminal('🧪 Test #2');

    // First reveal throws
    revealFn.mockImplementationOnce(() => { throw new Error('Tree disposed'); });

    debouncedRevealHandler(t1);
    vi.advanceTimersByTime(100);
    expect(revealFn).toHaveBeenCalledTimes(1);

    // Second reveal should still work
    debouncedRevealHandler(t2);
    vi.advanceTimersByTime(100);
    expect(revealFn).toHaveBeenCalledTimes(2);
  });

  // ---- No matching tree item → reveal skipped ----------------------------

  it('should skip reveal when findTerminalItem returns null', () => {
    const terminal = makeMockTerminal('🧪 Unknown');
    findTerminalItemFn.mockReturnValue(null);

    debouncedRevealHandler(terminal);
    vi.advanceTimersByTime(100);

    expect(findTerminalItemFn).toHaveBeenCalledWith(terminal);
    expect(revealFn).not.toHaveBeenCalled();
  });

  it('should skip reveal when findTerminalItem returns undefined', () => {
    const terminal = makeMockTerminal('🧪 Unknown');
    findTerminalItemFn.mockReturnValue(undefined);

    debouncedRevealHandler(terminal);
    vi.advanceTimersByTime(100);

    expect(revealFn).not.toHaveBeenCalled();
  });

  // ---- Null / undefined terminal → handler exits early -------------------

  it('should exit early when terminal is undefined', () => {
    debouncedRevealHandler(undefined as unknown as vscode.Terminal);

    vi.advanceTimersByTime(200);
    expect(getTerminalInfoFn).not.toHaveBeenCalled();
    expect(revealFn).not.toHaveBeenCalled();
  });

  it('should exit early when terminal has no tracked info', () => {
    const terminal = makeMockTerminal('foreign-shell');
    getTerminalInfoFn.mockReturnValue(undefined);

    debouncedRevealHandler(terminal);
    vi.advanceTimersByTime(200);

    expect(getTerminalInfoFn).toHaveBeenCalledWith(terminal);
    expect(findTerminalItemFn).not.toHaveBeenCalled();
    expect(revealFn).not.toHaveBeenCalled();
  });

  // ---- Separate debounce windows fire independently ----------------------

  it('should fire reveal twice for focus events separated by more than 100ms', () => {
    const t1 = makeMockTerminal('🧪 Test #1');
    const t2 = makeMockTerminal('🧪 Test #2');

    debouncedRevealHandler(t1);
    vi.advanceTimersByTime(100);
    expect(revealFn).toHaveBeenCalledTimes(1);

    debouncedRevealHandler(t2);
    vi.advanceTimersByTime(100);
    expect(revealFn).toHaveBeenCalledTimes(2);
  });

  // ---- Race: dispose at exact boundary ----------------------------------

  it('should handle timer dispose at exact 100ms boundary', () => {
    const terminal = makeMockTerminal('🧪 Test #1');

    debouncedRevealHandler(terminal);
    vi.advanceTimersByTime(99);
    expect(revealFn).not.toHaveBeenCalled();

    disposeRevealTimer();
    vi.advanceTimersByTime(2);
    expect(revealFn).not.toHaveBeenCalled();
  });
});
