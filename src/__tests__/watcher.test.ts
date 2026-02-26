import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockCreateFSWatcher, mockGetConfiguration } = vi.hoisted(() => ({
  mockCreateFSWatcher: vi.fn(),
  mockGetConfiguration: vi.fn(),
}));

vi.mock('vscode', () => {
  class RelativePattern {
    base: unknown;
    pattern: string;
    constructor(base: unknown, pattern: string) {
      this.base = base;
      this.pattern = pattern;
    }
  }
  return {
    RelativePattern,
    Uri: { file: (p: string) => ({ fsPath: p }) },
    workspace: {
      createFileSystemWatcher: mockCreateFSWatcher,
      getConfiguration: mockGetConfiguration,
    },
  };
});

import { SquadWatcher } from '../watcher';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSquad(id: string) {
  return { id, name: id, path: `/path/${id}`, icon: '🤖', universe: 'test' };
}

function makeFakeWatcher() {
  const handlers: Record<string, Function> = {};
  return {
    onDidChange: vi.fn((h: Function) => { handlers.change = h; }),
    onDidCreate: vi.fn((h: Function) => { handlers.create = h; }),
    onDidDelete: vi.fn((h: Function) => { handlers.delete = h; }),
    dispose: vi.fn(),
    _fire(event: 'change' | 'create' | 'delete') { handlers[event]?.(); },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockGetConfiguration.mockReturnValue({ get: (_k: string, def: number) => def });
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('SquadWatcher — constructor', () => {
  it('should create one file system watcher per squad', () => {
    const w1 = makeFakeWatcher();
    const w2 = makeFakeWatcher();
    mockCreateFSWatcher.mockReturnValueOnce(w1).mockReturnValueOnce(w2);

    const _watcher = new SquadWatcher([makeSquad('a'), makeSquad('b')], vi.fn());

    expect(mockCreateFSWatcher).toHaveBeenCalledTimes(2);
  });

  it('should handle empty squads array', () => {
    const _watcher = new SquadWatcher([], vi.fn());
    expect(mockCreateFSWatcher).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateSquads()
// ---------------------------------------------------------------------------

describe('SquadWatcher — updateSquads()', () => {
  it('should dispose old watchers and create new ones', () => {
    const oldWatcher = makeFakeWatcher();
    mockCreateFSWatcher.mockReturnValueOnce(oldWatcher);

    const watcher = new SquadWatcher([makeSquad('a')], vi.fn());
    expect(mockCreateFSWatcher).toHaveBeenCalledTimes(1);

    const newWatcher = makeFakeWatcher();
    mockCreateFSWatcher.mockReturnValueOnce(newWatcher);

    watcher.updateSquads([makeSquad('b')]);

    expect(oldWatcher.dispose).toHaveBeenCalled();
    expect(mockCreateFSWatcher).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Debounce behavior
// ---------------------------------------------------------------------------

describe('SquadWatcher — debounce', () => {
  it('should debounce rapid changes into one notification', () => {
    const fakeW = makeFakeWatcher();
    mockCreateFSWatcher.mockReturnValue(fakeW);
    const callback = vi.fn();

    const _watcher = new SquadWatcher([makeSquad('a')], callback);

    // Fire 5 rapid change events
    fakeW._fire('change');
    fakeW._fire('change');
    fakeW._fire('change');
    fakeW._fire('create');
    fakeW._fire('delete');

    // Before debounce elapses — nothing yet
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith('a');
  });

  it('should use configured debounce time', () => {
    mockGetConfiguration.mockReturnValue({ get: (_k: string, _def: number) => 200 });
    const fakeW = makeFakeWatcher();
    mockCreateFSWatcher.mockReturnValue(fakeW);
    const callback = vi.fn();

    const _watcher = new SquadWatcher([makeSquad('a')], callback);
    fakeW._fire('change');

    vi.advanceTimersByTime(199);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// dispose()
// ---------------------------------------------------------------------------

describe('SquadWatcher — dispose()', () => {
  it('should dispose all watchers and clear timers', () => {
    const fakeW = makeFakeWatcher();
    mockCreateFSWatcher.mockReturnValue(fakeW);
    const callback = vi.fn();

    const watcher = new SquadWatcher([makeSquad('a')], callback);

    // Trigger a change to create a pending timer
    fakeW._fire('change');

    watcher.dispose();

    expect(fakeW.dispose).toHaveBeenCalled();

    // Timer should have been cleared — advancing time should NOT fire callback
    vi.advanceTimersByTime(1000);
    expect(callback).not.toHaveBeenCalled();
  });

  it('should handle dispose with no squads', () => {
    const watcher = new SquadWatcher([], vi.fn());
    expect(() => watcher.dispose()).not.toThrow();
  });
});
