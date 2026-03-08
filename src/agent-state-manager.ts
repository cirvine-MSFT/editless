import * as vscode from 'vscode';
import { scanSquad, scanSquadAsync } from './scanner';
import { toAgentTeamConfig, type DiscoveredItem } from './unified-discovery';
import type { SquadState } from './types';
import type { AgentSettingsManager } from './agent-settings';

/**
 * Owns discovered-item state and the per-squad scan cache.
 * Fires `onDidChange` whenever the data changes so consumers (tree, status bar, etc.) can react.
 */
export class AgentStateManager implements vscode.Disposable {
  private _cache = new Map<string, SquadState>();
  private _pending = new Set<string>();
  private _discoveredItems: DiscoveredItem[] = [];

  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

  constructor(private readonly agentSettings: AgentSettingsManager) {}

  // -- Discovered items -----------------------------------------------------

  setDiscoveredItems(items: DiscoveredItem[]): void {
    this._discoveredItems = items;
    this._onDidChange.fire();
  }

  getDiscoveredItems(): readonly DiscoveredItem[] {
    return this._discoveredItems;
  }

  // -- Squad state cache ----------------------------------------------------

  getState(squadId: string): SquadState | undefined {
    if (this._cache.has(squadId)) return this._cache.get(squadId);

    // Use sync scan for immediate cache population on first access
    // (keeps getChildren() synchronous)
    const disc = this._discoveredItems.find(d => d.id === squadId);
    if (!disc) return undefined;
    const settings = this.agentSettings.get(squadId);
    const cfg = toAgentTeamConfig(disc, settings);
    this._cache.set(squadId, scanSquad(cfg));
    return this._cache.get(squadId);
  }

  /**
   * Async refresh of a squad's cached state.
   * Does not block the extension host — fires onDidChange when complete.
   */
  async refreshStateAsync(squadId: string): Promise<void> {
    if (this._pending.has(squadId)) return;
    const disc = this._discoveredItems.find(d => d.id === squadId);
    if (!disc) return;

    this._pending.add(squadId);
    try {
      const settings = this.agentSettings.get(squadId);
      const cfg = toAgentTeamConfig(disc, settings);
      const state = await scanSquadAsync(cfg);
      this._cache.set(squadId, state);
      this._onDidChange.fire();
    } finally {
      this._pending.delete(squadId);
    }
  }

  invalidate(squadId: string): void {
    this._cache.delete(squadId);
    // Trigger async re-scan so the cache repopulates without blocking
    this.refreshStateAsync(squadId);
  }

  invalidateAll(): void {
    this._cache.clear();
    // Re-scan all known squads asynchronously
    for (const disc of this._discoveredItems) {
      if (disc.type === 'squad') {
        this.refreshStateAsync(disc.id);
      }
    }
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
