import * as vscode from 'vscode';
import { discoverAll, enrichWithWorktrees, type DiscoveredItem } from './unified-discovery';
import type { AgentTeamConfig } from './types';
import type { AgentSettingsManager } from './agent-settings';
import { SquadWatcher } from './watcher';
import type { EditlessTreeProvider } from './editless-tree';
import type { EditlessStatusBar } from './status-bar';
import type { TerminalManager } from './terminal-manager';
import { hydrateSettings } from './extension-settings';

// ---------------------------------------------------------------------------
// Dependencies & result types
// ---------------------------------------------------------------------------

export interface DiscoveryDeps {
  treeProvider: EditlessTreeProvider;
  agentSettings: AgentSettingsManager;
  terminalManager: TerminalManager;
}

export interface DiscoveryResult {
  getDiscoveredItems(): DiscoveredItem[];
  refreshDiscovery(): void;
  debouncedRefreshDiscovery(): void;
  ensureWorkspaceFolder(dirPath: string): void;
  /** Wire the status bar after it's constructed (late binding). */
  setStatusBar(bar: EditlessStatusBar): void;
}

// ---------------------------------------------------------------------------
// setupDiscovery — unified discovery, squad watcher, refresh helpers
// ---------------------------------------------------------------------------

export function setupDiscovery(
  context: vscode.ExtensionContext,
  deps: DiscoveryDeps,
): DiscoveryResult {
  const { treeProvider, agentSettings, terminalManager } = deps;

  let statusBar: EditlessStatusBar | undefined;

  // --- Initial discovery ---------------------------------------------------
  const wsFolders = vscode.workspace.workspaceFolders ?? [];
  const includeOutsideWs = vscode.workspace.getConfiguration('editless').get<boolean>('discovery.worktreesOutsideWorkspace', false);
  let discoveredItems = enrichWithWorktrees(discoverAll(wsFolders), wsFolders, includeOutsideWs);
  treeProvider.setDiscoveredItems(discoveredItems);
  hydrateSettings(discoveredItems, agentSettings);

  // --- refreshDiscovery ----------------------------------------------------
  function refreshDiscovery(): void {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const outsideWs = vscode.workspace.getConfiguration('editless').get<boolean>('discovery.worktreesOutsideWorkspace', false);
    discoveredItems = enrichWithWorktrees(discoverAll(folders), folders, outsideWs);
    treeProvider.setDiscoveredItems(discoveredItems);
    statusBar?.setDiscoveredItems(discoveredItems);
    hydrateSettings(discoveredItems, agentSettings);
    // Update squad watcher with new discovery results
    const newSquadConfigs = discoveredItems.filter(d => d.type === 'squad').map(d => ({
      id: d.id,
      name: d.name,
      path: d.path,
      icon: '🔷',
      universe: d.universe ?? 'unknown',
    }) as AgentTeamConfig);
    squadWatcher.updateSquads(newSquadConfigs);
  }

  let discoveryTimer: NodeJS.Timeout | undefined;
  function debouncedRefreshDiscovery(): void {
    clearTimeout(discoveryTimer);
    discoveryTimer = setTimeout(() => refreshDiscovery(), 300);
  }

  // --- ensureWorkspaceFolder -----------------------------------------------
  function ensureWorkspaceFolder(dirPath: string): void {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const alreadyPresent = folders.some(f => f.uri.fsPath.toLowerCase() === dirPath.toLowerCase());
    if (!alreadyPresent) {
      terminalManager.persist();
      vscode.workspace.updateWorkspaceFolders(folders.length, 0, { uri: vscode.Uri.file(dirPath) });
    }
  }

  // --- Squad file watcher --------------------------------------------------
  const squadConfigs = discoveredItems.filter(d => d.type === 'squad').map(d => ({
    id: d.id,
    name: d.name,
    path: d.path,
    icon: '🔷',
    universe: d.universe ?? 'unknown',
  }) as AgentTeamConfig);

  const squadWatcher = new SquadWatcher(squadConfigs, (squadId) => {
    treeProvider.invalidate(squadId);
    treeProvider.refresh();
    statusBar?.update();
  });
  context.subscriptions.push(squadWatcher);
  context.subscriptions.push({ dispose() { clearTimeout(discoveryTimer); } });

  return {
    getDiscoveredItems: () => discoveredItems,
    refreshDiscovery,
    debouncedRefreshDiscovery,
    ensureWorkspaceFolder,
    setStatusBar(bar: EditlessStatusBar) { statusBar = bar; },
  };
}
