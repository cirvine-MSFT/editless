import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockShow, mockDispose, mockScanSquad } = vi.hoisted(() => ({
  mockShow: vi.fn(),
  mockDispose: vi.fn(),
  mockScanSquad: vi.fn(),
}));

vi.mock('vscode', () => ({
  window: {
    createStatusBarItem: vi.fn(() => ({
      text: '',
      command: undefined as string | undefined,
      tooltip: undefined as string | undefined,
      show: mockShow,
      dispose: mockDispose,
    })),
  },
  StatusBarAlignment: { Left: 1, Right: 2 },
}));

vi.mock('../scanner', () => ({
  scanSquad: mockScanSquad,
}));

import { EditlessStatusBar } from '../status-bar';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSquad(id: string) {
  return { id, name: `Squad ${id}`, path: `/path/${id}`, icon: '🤖', universe: 'test' };
}

function makeRegistry(squads: ReturnType<typeof makeSquad>[]) {
  return { loadSquads: vi.fn(() => squads) } as any;
}

function makeTerminalManager(count: number) {
  return { getAllTerminals: vi.fn(() => Array(count).fill({ terminal: {} })) } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockScanSquad.mockReturnValue({ inboxCount: 0 });
});

// ---------------------------------------------------------------------------
// update()
// ---------------------------------------------------------------------------

describe('EditlessStatusBar — update()', () => {
  it('should scan squads and render agent/session counts', () => {
    const squads = [makeSquad('a'), makeSquad('b')];
    const bar = new EditlessStatusBar(makeRegistry(squads), makeTerminalManager(3));

    bar.update();

    expect(mockScanSquad).toHaveBeenCalledTimes(2);
    expect(mockShow).toHaveBeenCalled();
  });

  it('should show inbox badge when inbox count > 0', () => {
    const squads = [makeSquad('a')];
    mockScanSquad.mockReturnValue({ inboxCount: 5 });
    const bar = new EditlessStatusBar(makeRegistry(squads), makeTerminalManager(1));

    bar.update();

    // Access the status bar item through the mock
    const item = (bar as any)._item;
    expect(item.text).toContain('📥 5');
  });

  it('should not show inbox badge when inbox count is 0', () => {
    const squads = [makeSquad('a')];
    mockScanSquad.mockReturnValue({ inboxCount: 0 });
    const bar = new EditlessStatusBar(makeRegistry(squads), makeTerminalManager(1));

    bar.update();

    const item = (bar as any)._item;
    expect(item.text).not.toContain('📥');
  });

  it('should handle zero squads', () => {
    const bar = new EditlessStatusBar(makeRegistry([]), makeTerminalManager(0));

    bar.update();

    const item = (bar as any)._item;
    expect(item.text).toContain('0 agents');
    expect(item.text).toContain('0 sessions');
    expect(mockShow).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateSessionsOnly()
// ---------------------------------------------------------------------------

describe('EditlessStatusBar — updateSessionsOnly()', () => {
  it('should use cached inbox count instead of rescanning', () => {
    const squads = [makeSquad('a')];
    mockScanSquad.mockReturnValue({ inboxCount: 3 });
    const bar = new EditlessStatusBar(makeRegistry(squads), makeTerminalManager(1));

    bar.update();
    mockScanSquad.mockClear();

    bar.updateSessionsOnly();

    expect(mockScanSquad).not.toHaveBeenCalled();
    const item = (bar as any)._item;
    expect(item.text).toContain('📥 3');
  });
});

// ---------------------------------------------------------------------------
// dispose()
// ---------------------------------------------------------------------------

describe('EditlessStatusBar — dispose()', () => {
  it('should dispose the status bar item', () => {
    const bar = new EditlessStatusBar(makeRegistry([]), makeTerminalManager(0));
    bar.dispose();
    expect(mockDispose).toHaveBeenCalledOnce();
  });

  it('should tolerate being disposed twice', () => {
    const bar = new EditlessStatusBar(makeRegistry([]), makeTerminalManager(0));
    bar.dispose();
    // Second dispose — if the underlying mock throws, the test fails
    bar.dispose();
    expect(mockDispose).toHaveBeenCalledTimes(2);
  });
});
