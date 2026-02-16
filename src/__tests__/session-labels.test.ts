import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as vscode from 'vscode';

vi.mock('vscode', () => ({
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

import { SessionLabelManager } from '../session-labels';

function createMockContext(savedLabels?: Record<string, string>): vscode.ExtensionContext {
  const store = new Map<string, unknown>();
  if (savedLabels) {
    store.set('editless.sessionLabels', savedLabels);
  }
  return {
    workspaceState: {
      get: vi.fn((key: string, defaultValue?: unknown) => store.get(key) ?? defaultValue),
      update: vi.fn((key: string, value: unknown) => { store.set(key, value); return Promise.resolve(); }),
      keys: vi.fn(() => [...store.keys()]),
    },
  } as unknown as vscode.ExtensionContext;
}

describe('SessionLabelManager', () => {
  let ctx: vscode.ExtensionContext;
  let mgr: SessionLabelManager;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    mgr = new SessionLabelManager(ctx);
  });

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  it('loads saved labels from workspaceState', () => {
    const saved = { 'key-1': 'Label One', 'key-2': 'Label Two' };
    const ctxWithLabels = createMockContext(saved);
    const manager = new SessionLabelManager(ctxWithLabels);

    expect(manager.getLabel('key-1')).toBe('Label One');
    expect(manager.getLabel('key-2')).toBe('Label Two');
  });

  it('fresh install (empty workspaceState) — no crash', () => {
    const freshCtx = createMockContext();
    const manager = new SessionLabelManager(freshCtx);

    expect(manager.getLabel('anything')).toBeUndefined();
    expect(manager.hasLabel('anything')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // getLabel
  // -------------------------------------------------------------------------

  describe('getLabel', () => {
    it('returns label when set', () => {
      mgr.setLabel('session-1', 'My Session');
      expect(mgr.getLabel('session-1')).toBe('My Session');
    });

    it('returns undefined for missing key', () => {
      expect(mgr.getLabel('nonexistent')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // setLabel
  // -------------------------------------------------------------------------

  describe('setLabel', () => {
    it('persists and fires onDidChange', () => {
      const listener = vi.fn();
      mgr.onDidChange(listener);

      mgr.setLabel('session-1', 'New Label');

      expect(ctx.workspaceState.update).toHaveBeenCalledWith(
        'editless.sessionLabels',
        expect.objectContaining({ 'session-1': 'New Label' }),
      );
      expect(listener).toHaveBeenCalledOnce();
    });

    it('overwrites existing label', () => {
      mgr.setLabel('session-1', 'First');
      mgr.setLabel('session-1', 'Second');

      expect(mgr.getLabel('session-1')).toBe('Second');
    });
  });

  // -------------------------------------------------------------------------
  // clearLabel
  // -------------------------------------------------------------------------

  describe('clearLabel', () => {
    it('removes label, persists, and fires event', () => {
      mgr.setLabel('session-1', 'Label');
      const listener = vi.fn();
      mgr.onDidChange(listener);

      mgr.clearLabel('session-1');

      expect(mgr.getLabel('session-1')).toBeUndefined();
      expect(listener).toHaveBeenCalledOnce();
      expect(ctx.workspaceState.update).toHaveBeenCalled();
    });

    it('no-op for non-existent key', () => {
      const listener = vi.fn();
      mgr.onDidChange(listener);

      mgr.clearLabel('nonexistent');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // hasLabel
  // -------------------------------------------------------------------------

  describe('hasLabel', () => {
    it('returns true when label exists', () => {
      mgr.setLabel('session-1', 'Label');
      expect(mgr.hasLabel('session-1')).toBe(true);
    });

    it('returns false when label does not exist', () => {
      expect(mgr.hasLabel('session-1')).toBe(false);
    });

    it('returns false after label is cleared', () => {
      mgr.setLabel('session-1', 'Label');
      mgr.clearLabel('session-1');
      expect(mgr.hasLabel('session-1')).toBe(false);
    });
  });
});
