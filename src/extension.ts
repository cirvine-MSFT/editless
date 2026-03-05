import * as vscode from 'vscode';
import { TerminalManager } from './terminal-manager';
import { getEdition } from './vscode-compat';

import { register as registerAgentCommands } from './commands/agent-commands';
import { register as registerSessionCommands } from './commands/session-commands';
import { register as registerWorkItemCommands } from './commands/work-item-commands';

import { ensureEditlessInstructions, initSettings } from './extension-settings';
import { initCoreManagers } from './extension-managers';
import { setupDiscovery } from './extension-discovery';
import { setupWatchers } from './extension-watchers';
import { setupIntegrations, initAutoRefresh, initAdoIntegration } from './extension-integrations';

// Re-export for backward compatibility (used by auto-refresh.test.ts)
export { initAutoRefresh };

export function activate(context: vscode.ExtensionContext): { terminalManager: TerminalManager; context: vscode.ExtensionContext } {
  ensureEditlessInstructions();

  // --- Settings & output channel -------------------------------------------
  const { agentSettings, output } = initSettings(context);

  // --- Core managers & tree views ------------------------------------------
  const managers = initCoreManagers(context, agentSettings);
  const { terminalManager, labelManager, sessionContextResolver,
          treeProvider, workItemsProvider, prsProvider } = managers;
  _terminalManagerRef = terminalManager;

  // --- Discovery (agents + squads) -----------------------------------------
  const discovery = setupDiscovery(context, { treeProvider, agentSettings, terminalManager });

  // --- File watchers, status bar, settings sync ----------------------------
  const { statusBar } = setupWatchers(context, {
    agentSettings,
    terminalManager,
    treeProvider,
    getDiscoveredItems: discovery.getDiscoveredItems,
    debouncedRefreshDiscovery: discovery.debouncedRefreshDiscovery,
  });

  // Wire status bar into discovery refresh (late binding)
  discovery.setStatusBar(statusBar);

  // --- Commands (extracted to src/commands/) --------------------------------
  registerAgentCommands(context, {
    agentSettings,
    treeProvider,
    terminalManager,
    labelManager,
    refreshDiscovery: discovery.refreshDiscovery,
    ensureWorkspaceFolder: discovery.ensureWorkspaceFolder,
    output,
    getDiscoveredItems: discovery.getDiscoveredItems,
  });

  registerSessionCommands(context, {
    terminalManager,
    labelManager,
    sessionContextResolver,
    agentSettings,
  });

  registerWorkItemCommands(context, {
    agentSettings,
    terminalManager,
    labelManager,
    workItemsProvider,
    prsProvider,
    initAdoIntegration: () => initAdoIntegration(context, workItemsProvider, prsProvider),
    getDiscoveredItems: discovery.getDiscoveredItems,
  });

  // --- Integrations (GitHub, ADO, local tasks) -----------------------------
  setupIntegrations(context, { workItemsProvider, prsProvider });

  output.appendLine(`EditLess activated (${getEdition()})`);

  return { terminalManager, context };
}

export function deactivate(): void {
  _terminalManagerRef?.persist();
}

let _terminalManagerRef: TerminalManager | undefined;
