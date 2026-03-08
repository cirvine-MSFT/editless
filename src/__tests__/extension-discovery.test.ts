import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Controllable async discovery mock ------------------------------------
let discoverResolve: (() => void) | undefined;
let discoverAllAsyncCallCount = 0;

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [],
    getConfiguration: () => ({ get: () => false }),
    updateWorkspaceFolders: vi.fn(),
  },
  Uri: { file: (p: string) => ({ fsPath: p }) },
  EventEmitter: class {
    private listeners: Array<() => void> = [];
    event = (listener: () => void) => {
      this.listeners.push(listener);
      return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
    };
    fire = () => { for (const l of this.listeners) l(); };
    dispose = vi.fn();
  },
}));

vi.mock('../unified-discovery', () => ({
  discoverAll: vi.fn().mockReturnValue([]),
  enrichWithWorktrees: vi.fn((items: unknown[]) => items),
  discoverAllAsync: vi.fn(() => {
    discoverAllAsyncCallCount++;
    return new Promise<never[]>((resolve) => {
      discoverResolve = () => resolve([]);
    });
  }),
  enrichWithWorktreesAsync: vi.fn(async (items: unknown[]) => items),
}));

vi.mock('../watcher', () => ({
  SquadWatcher: vi.fn(function () {
    return { dispose: vi.fn(), updateSquads: vi.fn() };
  }),
}));

vi.mock('../extension-settings', () => ({
  hydrateSettings: vi.fn(),
}));

import { setupDiscovery } from '../extension-discovery';
import { discoverAllAsync } from '../unified-discovery';

function makeMockDeps() {
  return {
    treeProvider: {
      setDiscoveredItems: vi.fn(),
      invalidate: vi.fn(),
    },
    agentSettings: {},
    terminalManager: { persist: vi.fn() },
  };
}

function makeMockContext() {
  return {
    subscriptions: [] as { dispose: () => void }[],
  };
}

describe('refreshDiscovery — refreshInFlight guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    discoverAllAsyncCallCount = 0;
    discoverResolve = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('coalesces concurrent calls — second call triggers re-run after first completes', async () => {
    const deps = makeMockDeps();
    const ctx = makeMockContext();
    const result = setupDiscovery(ctx as never, deps as never);

    // First refresh starts
    result.refreshDiscovery();
    expect(discoverAllAsyncCallCount).toBe(1);

    // Second refresh while first is in flight → sets pendingRefresh
    result.refreshDiscovery();
    // Still only 1 actual call to discoverAllAsync
    expect(discoverAllAsyncCallCount).toBe(1);

    // Complete the first refresh
    discoverResolve!();
    await new Promise(r => setTimeout(r, 10));

    // The pending refresh should have triggered a second call
    expect(discoverAllAsyncCallCount).toBe(2);

    // Complete the second refresh
    discoverResolve!();
    await new Promise(r => setTimeout(r, 10));

    // No more pending → stays at 2
    expect(discoverAllAsyncCallCount).toBe(2);
  });

  it('refreshInFlight resets after error — not permanently blocked', async () => {
    const deps = makeMockDeps();
    const ctx = makeMockContext();

    // Make discoverAllAsync reject on first call
    vi.mocked(discoverAllAsync).mockRejectedValueOnce(new Error('network error'));

    const result = setupDiscovery(ctx as never, deps as never);

    // First refresh → will reject
    result.refreshDiscovery();
    await new Promise(r => setTimeout(r, 10));

    // Should be able to refresh again (not blocked)
    result.refreshDiscovery();
    expect(discoverAllAsync).toHaveBeenCalledTimes(2);
  });
});
