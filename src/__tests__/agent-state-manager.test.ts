import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({
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

vi.mock('../scanner', () => ({
  scanSquad: vi.fn((cfg: unknown) => ({
    config: cfg,
    lastActivity: null,
    roster: [{ name: 'Alice', role: 'Dev' }],
    charter: '',
  })),
}));

import { AgentStateManager } from '../agent-state-manager';
import { scanSquad } from '../scanner';
import type { DiscoveredItem } from '../unified-discovery';

function makeItem(id: string, overrides?: Partial<DiscoveredItem>): DiscoveredItem {
  return {
    id,
    name: id,
    type: 'squad',
    source: 'workspace',
    path: `/path/${id}`,
    universe: 'test',
    ...overrides,
  };
}

function makeMockSettings(items: DiscoveredItem[] = []) {
  return {
    get: vi.fn((id: string) => {
      const item = items.find(i => i.id === id);
      return item ? { name: item.name, icon: '🔷' } : undefined;
    }),
  };
}

describe('AgentStateManager', () => {
  let mgr: AgentStateManager;
  let mockSettings: ReturnType<typeof makeMockSettings>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings = makeMockSettings();
    mgr = new AgentStateManager(mockSettings as never);
  });

  // -- setDiscoveredItems / getDiscoveredItems --------------------------------

  it('starts with empty discovered items', () => {
    expect(mgr.getDiscoveredItems()).toEqual([]);
  });

  it('setDiscoveredItems stores and returns items', () => {
    const items = [makeItem('a'), makeItem('b')];
    mgr.setDiscoveredItems(items);
    expect(mgr.getDiscoveredItems()).toEqual(items);
  });

  it('setDiscoveredItems replaces previous items', () => {
    mgr.setDiscoveredItems([makeItem('a')]);
    mgr.setDiscoveredItems([makeItem('b')]);
    expect(mgr.getDiscoveredItems()).toHaveLength(1);
    expect(mgr.getDiscoveredItems()[0].id).toBe('b');
  });

  // -- getState ---------------------------------------------------------------

  it('returns undefined for unknown squad', () => {
    expect(mgr.getState('nonexistent')).toBeUndefined();
  });

  it('resolves state from discovered items + settings', () => {
    const items = [makeItem('squad-a')];
    mockSettings = makeMockSettings(items);
    mgr = new AgentStateManager(mockSettings as never);
    mgr.setDiscoveredItems(items);

    const state = mgr.getState('squad-a');
    expect(state).toBeDefined();
    expect(state!.config.id).toBe('squad-a');
    expect(state!.roster).toEqual([{ name: 'Alice', role: 'Dev' }]);
    expect(scanSquad).toHaveBeenCalledOnce();
  });

  it('caches state on second call', () => {
    mgr.setDiscoveredItems([makeItem('squad-a')]);
    mgr.getState('squad-a');
    mgr.getState('squad-a');
    expect(scanSquad).toHaveBeenCalledOnce();
  });

  // -- invalidate -------------------------------------------------------------

  it('invalidate clears specific cache entry', () => {
    mgr.setDiscoveredItems([makeItem('a'), makeItem('b')]);
    mgr.getState('a');
    mgr.getState('b');
    expect(scanSquad).toHaveBeenCalledTimes(2);

    mgr.invalidate('a');
    mgr.getState('a');
    expect(scanSquad).toHaveBeenCalledTimes(3);
    // 'b' still cached
    mgr.getState('b');
    expect(scanSquad).toHaveBeenCalledTimes(3);
  });

  // -- invalidateAll ----------------------------------------------------------

  it('invalidateAll clears all cache entries', () => {
    mgr.setDiscoveredItems([makeItem('a'), makeItem('b')]);
    mgr.getState('a');
    mgr.getState('b');
    expect(scanSquad).toHaveBeenCalledTimes(2);

    mgr.invalidateAll();
    mgr.getState('a');
    mgr.getState('b');
    expect(scanSquad).toHaveBeenCalledTimes(4);
  });

  // -- onDidChange event ------------------------------------------------------

  it('fires onDidChange when discovered items are set', () => {
    const listener = vi.fn();
    mgr.onDidChange(listener);
    mgr.setDiscoveredItems([makeItem('a')]);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('fires onDidChange on invalidate', () => {
    const listener = vi.fn();
    mgr.onDidChange(listener);
    mgr.invalidate('x');
    expect(listener).toHaveBeenCalledOnce();
  });

  it('fires onDidChange on invalidateAll', () => {
    const listener = vi.fn();
    mgr.onDidChange(listener);
    mgr.invalidateAll();
    expect(listener).toHaveBeenCalledOnce();
  });
});
