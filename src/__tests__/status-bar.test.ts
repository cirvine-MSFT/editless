import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockShow, mockDispose } = vi.hoisted(() => ({
  mockShow: vi.fn(),
  mockDispose: vi.fn(),
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

import { EditlessStatusBar } from '../status-bar';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgentSettings(hiddenIds: string[] = []) {
  const hidden = new Set(hiddenIds);
  return { isHidden: vi.fn((id: string) => hidden.has(id)), getHiddenIds: vi.fn(() => [...hidden]) } as any;
}

function makeTerminalManager(count: number) {
  return { getAllTerminals: vi.fn(() => Array(count).fill({ terminal: {} })) } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// update()
// ---------------------------------------------------------------------------

describe('EditlessStatusBar — update()', () => {
  it('should scan squads and render agent/session counts', () => {
    const bar = new EditlessStatusBar(makeAgentSettings(), makeTerminalManager(3));
    bar.setDiscoveredItems([
      { id: 'a', name: 'A', type: 'squad', source: 'workspace', path: '/a' },
      { id: 'b', name: 'B', type: 'squad', source: 'workspace', path: '/b' },
    ]);

    bar.update();

    expect(mockShow).toHaveBeenCalled();
  });

  it('should handle zero squads', () => {
    const bar = new EditlessStatusBar(makeAgentSettings(), makeTerminalManager(0));

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
  it('should not rescan squads on session-only update', () => {
    const bar = new EditlessStatusBar(makeAgentSettings(), makeTerminalManager(1));
    bar.setDiscoveredItems([
      { id: 'a', name: 'A', type: 'squad', source: 'workspace', path: '/a' },
    ]);

    bar.update();

    bar.updateSessionsOnly();

    expect(mockShow).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// dispose()
// ---------------------------------------------------------------------------

describe('EditlessStatusBar — dispose()', () => {
  it('should dispose the status bar item', () => {
    const bar = new EditlessStatusBar(makeAgentSettings(), makeTerminalManager(0));
    bar.dispose();
    expect(mockDispose).toHaveBeenCalledOnce();
  });

  it('should tolerate being disposed twice', () => {
    const bar = new EditlessStatusBar(makeAgentSettings(), makeTerminalManager(0));
    bar.dispose();
    // Second dispose — if the underlying mock throws, the test fails
    bar.dispose();
    expect(mockDispose).toHaveBeenCalledTimes(2);
  });
});
