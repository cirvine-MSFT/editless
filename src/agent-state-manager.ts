import * as vscode from 'vscode';
import { scanSquad } from './scanner';
import { toAgentTeamConfig, type DiscoveredItem } from './unified-discovery';
import type { SquadState } from './types';
import type { AgentSettingsManager } from './agent-settings';

/**
 * Owns discovered-item state and the per-squad scan cache.
 * Fires `onDidChange` whenever the data changes so consumers (tree, status bar, etc.) can react.
 */
export class AgentStateManager {
  private _cache = new Map<string, SquadState>();
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
    if (!this._cache.has(squadId)) {
      const disc = this._discoveredItems.find(d => d.id === squadId);
      if (!disc) return undefined;
      const settings = this.agentSettings.get(squadId);
      const cfg = toAgentTeamConfig(disc, settings);
      this._cache.set(squadId, scanSquad(cfg));
    }
    return this._cache.get(squadId);
  }

  invalidate(squadId: string): void {
    this._cache.delete(squadId);
    this._onDidChange.fire();
  }

  invalidateAll(): void {
    this._cache.clear();
    this._onDidChange.fire();
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
