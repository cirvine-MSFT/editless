import * as vscode from 'vscode';
import type { AgentSettingsManager } from './agent-settings';
import type { TerminalManager } from './terminal-manager';
import type { EditlessTreeProvider } from './editless-tree';
import { EditlessStatusBar } from './status-bar';
import { TEAM_DIR_NAMES } from './team-dir';
import type { DiscoveredItem } from './unified-discovery';

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface WatcherDeps {
  agentSettings: AgentSettingsManager;
  terminalManager: TerminalManager;
  treeProvider: EditlessTreeProvider;
  getDiscoveredItems(): DiscoveredItem[];
  debouncedRefreshDiscovery(): void;
}

// ---------------------------------------------------------------------------
// setupWatchers — status bar, file watchers, settings sync, tree sync
// ---------------------------------------------------------------------------

export function setupWatchers(
  context: vscode.ExtensionContext,
  deps: WatcherDeps,
): { statusBar: EditlessStatusBar } {
  const { agentSettings, terminalManager, treeProvider, getDiscoveredItems, debouncedRefreshDiscovery } = deps;

  // --- Status bar ----------------------------------------------------------
  const statusBar = new EditlessStatusBar(agentSettings, terminalManager);
  context.subscriptions.push(statusBar);
  statusBar.setDiscoveredItems(getDiscoveredItems());
  statusBar.update();

  terminalManager.onDidChange(() => statusBar.updateSessionsOnly());

  // --- Workspace folder changes → re-discover ------------------------------
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      debouncedRefreshDiscovery();
    }),
  );

  // --- team.md watchers — detect squad init in-session ---------------------
  for (const dirName of TEAM_DIR_NAMES) {
    for (const folder of (vscode.workspace.workspaceFolders ?? [])) {
      const pattern = new vscode.RelativePattern(folder, `${dirName}/team.md`);
      const teamMdWatcher = vscode.workspace.createFileSystemWatcher(pattern);
      teamMdWatcher.onDidCreate(() => {
        debouncedRefreshDiscovery();
      });
      context.subscriptions.push(teamMdWatcher);
    }
  }

  // --- Worktree directory watcher — detect new/removed worktrees -----------
  for (const folder of (vscode.workspace.workspaceFolders ?? [])) {
    const wtPattern = new vscode.RelativePattern(folder, '.git/worktrees/*');
    const wtWatcher = vscode.workspace.createFileSystemWatcher(wtPattern);
    const onWtChange = (): void => { debouncedRefreshDiscovery(); };
    wtWatcher.onDidCreate(onWtChange);
    wtWatcher.onDidDelete(onWtChange);
    context.subscriptions.push(wtWatcher);
  }

  // --- Settings file watcher for cross-window sync -------------------------
  context.subscriptions.push(agentSettings);
  agentSettings.onDidChange(() => {
    treeProvider.refresh();
    statusBar.update();
  });

  return { statusBar };
}
