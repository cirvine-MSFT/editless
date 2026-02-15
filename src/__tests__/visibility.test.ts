import { describe, it, expect, beforeEach, vi } from 'vitest';
import type * as vscode from 'vscode';

vi.mock('vscode', () => ({}));

import { AgentVisibilityManager } from '../visibility';

function createMockContext(): vscode.ExtensionContext {
  const store = new Map<string, unknown>();
  return {
    workspaceState: {
      get: vi.fn((key: string, defaultValue?: unknown) => store.get(key) ?? defaultValue),
      update: vi.fn((key: string, value: unknown) => { store.set(key, value); return Promise.resolve(); }),
      keys: vi.fn(() => [...store.keys()]),
    },
  } as unknown as vscode.ExtensionContext;
}

describe('AgentVisibilityManager', () => {
  let ctx: vscode.ExtensionContext;
  let mgr: AgentVisibilityManager;

  beforeEach(() => {
    ctx = createMockContext();
    mgr = new AgentVisibilityManager(ctx);
  });

  it('should return false for non-hidden agent', () => {
    expect(mgr.isHidden('agent-1')).toBe(false);
  });

  it('should return true after hide() is called', () => {
    mgr.hide('agent-1');
    expect(mgr.isHidden('agent-1')).toBe(true);
  });

  it('should persist hidden IDs to workspaceState', () => {
    mgr.hide('agent-1');
    expect(ctx.workspaceState.update).toHaveBeenCalledWith(
      'editless.hiddenAgents',
      expect.arrayContaining(['agent-1']),
    );
  });

  it('should remove ID from hidden set on show()', () => {
    mgr.hide('agent-1');
    mgr.show('agent-1');
    expect(mgr.isHidden('agent-1')).toBe(false);
  });

  it('should treat show() on non-hidden ID as a no-op', () => {
    mgr.show('agent-1');
    expect(mgr.isHidden('agent-1')).toBe(false);
    expect(ctx.workspaceState.update).toHaveBeenCalledWith(
      'editless.hiddenAgents',
      [],
    );
  });

  it('should return all hidden IDs from getHiddenIds()', () => {
    mgr.hide('a');
    mgr.hide('b');
    mgr.hide('c');
    expect(mgr.getHiddenIds()).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    expect(mgr.getHiddenIds()).toHaveLength(3);
  });

  it('should clear all hidden IDs on showAll()', () => {
    mgr.hide('a');
    mgr.hide('b');
    mgr.showAll();
    expect(mgr.getHiddenIds()).toEqual([]);
    expect(mgr.isHidden('a')).toBe(false);
    expect(mgr.isHidden('b')).toBe(false);
  });

  it('should treat showAll() on empty set as a no-op', () => {
    mgr.showAll();
    expect(mgr.getHiddenIds()).toEqual([]);
    expect(ctx.workspaceState.update).toHaveBeenCalledWith(
      'editless.hiddenAgents',
      [],
    );
  });

  it('should maintain consistent state across multiple hide/show operations', () => {
    mgr.hide('a');
    mgr.hide('b');
    mgr.hide('c');
    mgr.show('b');
    mgr.hide('d');
    mgr.show('a');

    expect(mgr.isHidden('a')).toBe(false);
    expect(mgr.isHidden('b')).toBe(false);
    expect(mgr.isHidden('c')).toBe(true);
    expect(mgr.isHidden('d')).toBe(true);
    expect(mgr.getHiddenIds()).toEqual(expect.arrayContaining(['c', 'd']));
    expect(mgr.getHiddenIds()).toHaveLength(2);
  });

  it('should read hidden IDs from workspaceState on construction', () => {
    mgr.hide('agent-1');
    mgr.hide('agent-2');

    const mgr2 = new AgentVisibilityManager(ctx);
    expect(mgr2.isHidden('agent-1')).toBe(true);
    expect(mgr2.isHidden('agent-2')).toBe(true);
    expect(mgr2.getHiddenIds()).toEqual(expect.arrayContaining(['agent-1', 'agent-2']));
  });
});
