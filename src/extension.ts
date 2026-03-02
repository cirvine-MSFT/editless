import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createAgentSettings, migrateFromRegistry, type AgentSettings } from './agent-settings';
import { EditlessTreeProvider } from './editless-tree';
import { TerminalManager } from './terminal-manager';
import { SessionLabelManager } from './session-labels';


import { discoverAll, type DiscoveredItem } from './unified-discovery';
import type { AgentTeamConfig } from './types';
import { SquadWatcher } from './watcher';
import { EditlessStatusBar } from './status-bar';
import { SessionContextResolver } from './session-context';
import { CopilotSessionsProvider } from './copilot-sessions-provider';

import { initSquadUiContext } from './squad-ui-integration';
import { TEAM_DIR_NAMES } from './team-dir';
import { WorkItemsTreeProvider } from './work-items-tree';
import { PRsTreeProvider } from './prs-tree';
import { getEdition } from './vscode-compat';
import { getAdoToken, promptAdoSignIn, setAdoAuthOutput } from './ado-auth';
import { fetchAdoWorkItems, fetchAdoPRs, fetchAdoMe } from './ado-client';

import { register as registerAgentCommands } from './commands/agent-commands';
import { register as registerSessionCommands } from './commands/session-commands';
import { register as registerWorkItemCommands } from './commands/work-item-commands';

const execFileAsync = promisify(execFile);

function getCreateCommand(): string {
  return '';
}

/** Compute default AgentSettings for each discovered item and hydrate the settings file. */
function hydrateSettings(items: DiscoveredItem[], settings: import('./agent-settings').AgentSettingsManager): void {
  const entries = items.map(item => ({
    id: item.id,
    defaults: {
      name: item.name,
      icon: item.type === 'squad' ? '🔷' : '🤖',
      hidden: false,
      model: '',
      additionalArgs: '',
      command: '',
    } satisfies AgentSettings,
  }));
  settings.hydrateFromDiscovery(entries);
}

export function activate(context: vscode.ExtensionContext): { terminalManager: TerminalManager; context: vscode.ExtensionContext } {
  const output = vscode.window.createOutputChannel('EditLess');
  context.subscriptions.push(output);
  setAdoAuthOutput(output);

  // --- Squad UI integration (#38) ------------------------------------------
  initSquadUiContext(context);

  // --- Agent settings (replaces registry + visibility) --------------------
  const agentSettings = createAgentSettings(context);

  // Migrate from old agent-registry.json if it exists (one-time, idempotent)
  const oldRegistryDir = context.globalStorageUri?.fsPath ?? context.extensionPath;
  const oldRegistryPath = path.resolve(oldRegistryDir, 'agent-registry.json');
  if (fs.existsSync(oldRegistryPath)) {
    migrateFromRegistry(oldRegistryPath, agentSettings);
  }

  // --- Terminal manager --------------------------------------------------
  const terminalManager = new TerminalManager(context);
  _terminalManagerRef = terminalManager;
  context.subscriptions.push(terminalManager);

  // --- Session label manager ---------------------------------------------
  const labelManager = new SessionLabelManager(context);

  // --- Session context resolver -------------------------------------------
  const sessionContextResolver = new SessionContextResolver();

  // Wire session resolver into terminal manager for session ID auto-detection
  terminalManager.setSessionResolver(sessionContextResolver);

  // --- Tree view ---------------------------------------------------------
  const treeProvider = new EditlessTreeProvider(agentSettings, terminalManager, labelManager, sessionContextResolver);
  const treeView = vscode.window.createTreeView('editlessTree', { treeDataProvider: treeProvider });
  context.subscriptions.push(treeView);
  context.subscriptions.push(treeProvider);

  // --- Work Items tree view ------------------------------------------------
  const workItemsProvider = new WorkItemsTreeProvider();
  const workItemsView = vscode.window.createTreeView('editlessWorkItems', { treeDataProvider: workItemsProvider });
  workItemsProvider.setTreeView(workItemsView);
  context.subscriptions.push(workItemsView);

  // --- PRs tree view -------------------------------------------------------
  const prsProvider = new PRsTreeProvider();
  const prsView = vscode.window.createTreeView('editlessPRs', { treeDataProvider: prsProvider });
  prsProvider.setTreeView(prsView);
  context.subscriptions.push(prsView);

  // --- Sessions tree view ----------------------------------------------------
  const sessionsProvider = new CopilotSessionsProvider(sessionContextResolver);
  const sessionsView = vscode.window.createTreeView('editlessSessions', { treeDataProvider: sessionsProvider });
  sessionsProvider.setTreeView(sessionsView);
  context.subscriptions.push(sessionsView);

  // Sessions tree commands
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.resumeCopilotSession', async (item: import('./copilot-sessions-provider').SessionTreeItem) => {
      const entry = item?.sessionEntry;
      if (!entry) return;
      const check = sessionContextResolver.isSessionResumable(entry.sessionId);
      if (!check.resumable) {
        vscode.window.showWarningMessage(`Cannot resume session: ${check.reason}`);
        return;
      }
      if (check.stale) {
        const proceed = await vscode.window.showWarningMessage(
          `This session hasn't been updated in over ${SessionContextResolver.STALE_SESSION_DAYS} days. Resume anyway?`,
          'Resume', 'Cancel',
        );
        if (proceed !== 'Resume') return;
      }
      const { buildCopilotCommand } = await import('./copilot-cli-builder');
      const launchCmd = buildCopilotCommand({ resume: entry.sessionId });
      const displayName = entry.summary ? `↩ ${entry.summary}`.slice(0, 50) : `↩ ${entry.sessionId.slice(0, 8)}`;
      const terminal = vscode.window.createTerminal({
        name: displayName,
        cwd: entry.cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
        isTransient: true,
        iconPath: new vscode.ThemeIcon('history'),
      });
      terminal.sendText(launchCmd);
      terminal.show(false);
    }),
    vscode.commands.registerCommand('editless.dismissSession', (item: import('./copilot-sessions-provider').SessionTreeItem) => {
      const entry = item?.sessionEntry;
      if (entry) sessionsProvider.dismiss(entry.sessionId);
    }),
    vscode.commands.registerCommand('editless.refreshSessions', () => {
      sessionsProvider.refresh();
    }),
    vscode.commands.registerCommand('editless.filterSessions', async () => {
      const pick = await vscode.window.showQuickPick(
        [
          { label: 'Filter by workspace CWD', value: 'workspace' },
          { label: 'Filter by squad name', value: 'squad' },
        ],
        { placeHolder: 'Select filter type' },
      );
      if (!pick) return;
      if (pick.value === 'workspace') {
        const cwd = await vscode.window.showInputBox({ prompt: 'Enter workspace CWD path to filter by' });
        if (cwd !== undefined) {
          sessionsProvider.filter = { ...sessionsProvider.filter, workspace: cwd || undefined };
          vscode.commands.executeCommand('setContext', 'editless.sessionsFiltered', true);
        }
      } else {
        const squad = await vscode.window.showInputBox({ prompt: 'Enter squad name to filter by' });
        if (squad !== undefined) {
          sessionsProvider.filter = { ...sessionsProvider.filter, squad: squad || undefined };
          vscode.commands.executeCommand('setContext', 'editless.sessionsFiltered', true);
        }
      }
    }),
    vscode.commands.registerCommand('editless.clearSessionsFilter', () => {
      sessionsProvider.filter = {};
      vscode.commands.executeCommand('setContext', 'editless.sessionsFiltered', false);
    }),
  );

  // Reconcile persisted terminal sessions with live terminals after reload.
  // Orphaned sessions appear in the tree view — users can resume individually.
  terminalManager.reconcile();

  // Sync tree selection when switching terminals via tab bar
  let revealTimer: ReturnType<typeof setTimeout> | undefined;
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTerminal(terminal => {
      if (revealTimer !== undefined) {
        clearTimeout(revealTimer);
      }
      if (!terminal) return;
      revealTimer = setTimeout(() => {
        revealTimer = undefined;
        const info = terminalManager.getTerminalInfo(terminal);
        if (!info) return;
        const matchingItem = treeProvider.findTerminalItem(terminal);
        if (matchingItem) {
          try {
            treeView.reveal(matchingItem, { select: true, focus: false });
          } catch {
            // reveal() may fail if tree is not visible or item is stale
          }
        }
      }, 100);
    }),
    { dispose() { if (revealTimer !== undefined) clearTimeout(revealTimer); } },
  );

  // --- Unified discovery — agents + squads in one pass (#317, #318) ----------
  let discoveredItems = discoverAll(vscode.workspace.workspaceFolders ?? []);
  treeProvider.setDiscoveredItems(discoveredItems);
  hydrateSettings(discoveredItems, agentSettings);

  /** Re-run unified discovery and update tree. */
  function refreshDiscovery(): void {
    discoveredItems = discoverAll(vscode.workspace.workspaceFolders ?? []);
    treeProvider.setDiscoveredItems(discoveredItems);
    statusBar.setDiscoveredItems(discoveredItems);
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

  /** Add a folder to the VS Code workspace if not already present. */
  function ensureWorkspaceFolder(dirPath: string): void {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const alreadyPresent = folders.some(f => f.uri.fsPath.toLowerCase() === dirPath.toLowerCase());
    if (!alreadyPresent) {
      // Persist terminal state before adding the folder — transitioning from
      // single-folder to multi-root workspace restarts the extension host,
      // which kills our in-memory state. Fresh persisted data lets reconcile()
      // re-match terminals on restart.
      terminalManager.persist();
      vscode.workspace.updateWorkspaceFolders(folders.length, 0, { uri: vscode.Uri.file(dirPath) });
    }
  }

  // --- Status bar ----------------------------------------------------------
  const statusBar = new EditlessStatusBar(agentSettings, terminalManager);
  context.subscriptions.push(statusBar);
  statusBar.setDiscoveredItems(discoveredItems);
  statusBar.update();

  terminalManager.onDidChange(() => statusBar.updateSessionsOnly());

  // --- Squad file watcher — live .squad/ (or .ai-team/) updates ----------
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
    statusBar.update();
  });
  context.subscriptions.push(squadWatcher);

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      debouncedRefreshDiscovery();
    }),
  );

  // --- Workspace watcher for new .ai-team/ or .squad/ directories ----------
  // Detects when squad init runs in-session (outside the addSquad command flow)
  for (const dirName of TEAM_DIR_NAMES) {
    for (const folder of (vscode.workspace.workspaceFolders ?? [])) {
      const pattern = new vscode.RelativePattern(folder, `${dirName}/team.md`);
      const teamMdWatcher = vscode.workspace.createFileSystemWatcher(pattern);
      teamMdWatcher.onDidCreate(() => {
        debouncedRefreshDiscovery();
        treeProvider.refresh();
        statusBar.update();
      });
      context.subscriptions.push(teamMdWatcher);
    }
  }

  // --- Settings file watcher for cross-window sync -------------------------
  // AgentSettingsManager handles the file watching and reloading internally.
  context.subscriptions.push(agentSettings);
  agentSettings.onDidChange(() => {
    treeProvider.refresh();
    statusBar.update();
  });

  // --- Commands (extracted to src/commands/) --------------------------------

  const commandDepsShared = {
    getDiscoveredItems: () => discoveredItems,
  };

  registerAgentCommands(context, {
    agentSettings,
    treeProvider,
    terminalManager,
    labelManager,
    refreshDiscovery,
    ensureWorkspaceFolder,
    output,
    ...commandDepsShared,
  });

  registerSessionCommands(context, {
    terminalManager,
    labelManager,
    sessionContextResolver,
  });

  registerWorkItemCommands(context, {
    agentSettings,
    terminalManager,
    labelManager,
    workItemsProvider,
    prsProvider,
    initAdoIntegration: () => initAdoIntegration(context, workItemsProvider, prsProvider),
    ...commandDepsShared,
  });

  // --- GitHub repo detection & data loading ---
  initGitHubIntegration(workItemsProvider, prsProvider);

  // --- ADO integration ---
  initAdoIntegration(context, workItemsProvider, prsProvider);

  // Re-initialize ADO when organization or project settings change (#417)
  // Debounced to avoid concurrent API calls from rapid keystroke changes
  let adoDebounceTimer: NodeJS.Timeout | undefined;
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('editless.ado.organization') || e.affectsConfiguration('editless.ado.project')) {
        if (adoDebounceTimer) clearTimeout(adoDebounceTimer);
        adoDebounceTimer = setTimeout(() => {
          initAdoIntegration(context, workItemsProvider, prsProvider);
        }, 500);
      }
    }),
  );

  // Re-initialize GitHub when repo list changes (#417)
  // Debounced to avoid concurrent API calls from rapid changes
  let githubDebounceTimer: NodeJS.Timeout | undefined;
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('editless.github.repos')) {
        if (githubDebounceTimer) clearTimeout(githubDebounceTimer);
        githubDebounceTimer = setTimeout(() => {
          initGitHubIntegration(workItemsProvider, prsProvider);
        }, 500);
      }
    }),
  );

  // --- Auto-refresh for Work Items & PRs ---
  const autoRefresh = initAutoRefresh(workItemsProvider, prsProvider);
  context.subscriptions.push(autoRefresh);

  output.appendLine(`EditLess activated (${getEdition()})`);

  return { terminalManager, context };
}

export function deactivate(): void {
  // Flush in-flight state — workspaceState is SQLite-backed and survives crash
  _terminalManagerRef?.persist();
}

let _terminalManagerRef: TerminalManager | undefined;

export function initAutoRefresh(
  workItemsProvider: WorkItemsTreeProvider,
  prsProvider: PRsTreeProvider,
): vscode.Disposable {
  const disposables: vscode.Disposable[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;

  function refreshAll(): void {
    workItemsProvider.refresh();
    prsProvider.refresh();
  }

  function startTimer(): void {
    if (timer) clearInterval(timer);
    const minutes = vscode.workspace.getConfiguration('editless').get<number>('refreshInterval', 5);
    if (minutes > 0) {
      timer = setInterval(refreshAll, minutes * 60_000);
    }
  }

  startTimer();

  disposables.push(
    vscode.window.onDidChangeWindowState(state => {
      if (state.focused) refreshAll();
    }),
  );

  disposables.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('editless.refreshInterval')) startTimer();
    }),
  );

  return {
    dispose(): void {
      if (timer) clearInterval(timer);
      disposables.forEach(d => d.dispose());
    },
  };
}

async function initGitHubIntegration(
  workItemsProvider: WorkItemsTreeProvider,
  prsProvider: PRsTreeProvider,
): Promise<void> {
  const config = vscode.workspace.getConfiguration('editless');
  let repos = config.get<string[]>('github.repos', []);

  if (repos.length === 0) {
    try {
      const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (cwd) {
        const { stdout } = await execFileAsync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], { cwd });
        const detected = stdout.trim();
        if (detected) repos = [detected];
      }
    } catch {
      // gh not available or not in a repo
    }
  }

  workItemsProvider.setRepos(repos);
  prsProvider.setRepos(repos);
}

async function initAdoIntegration(
  context: vscode.ExtensionContext,
  workItemsProvider: WorkItemsTreeProvider,
  prsProvider: PRsTreeProvider,
): Promise<void> {
  const config = vscode.workspace.getConfiguration('editless');
  const org = String(config.get<string>('ado.organization') ?? '').trim();
  const project = String(config.get<string>('ado.project') ?? '').trim();

  if (!org || !project) {
    workItemsProvider.setAdoConfig(undefined, undefined);
    prsProvider.setAdoConfig(undefined, undefined);
    return;
  }

  workItemsProvider.setAdoConfig(org, project);
  prsProvider.setAdoConfig(org, project);

  async function fetchAdoData(): Promise<void> {
    let token = await getAdoToken(context.secrets);
    if (!token) {
      // Auto-prompt Microsoft SSO before falling back to warning toast
      token = await promptAdoSignIn();
    }
    if (!token) {
      vscode.window.showWarningMessage(
        'Azure DevOps: authentication required',
        'Sign In',
        'Set PAT',
      ).then(choice => {
        if (choice === 'Sign In') vscode.commands.executeCommand('editless.adoSignIn');
        else if (choice === 'Set PAT') vscode.commands.executeCommand('editless.setAdoPat');
      });
      return;
    }

    try {
      const [workItems, prs, adoMe] = await Promise.all([
        fetchAdoWorkItems(org, project, token),
        fetchAdoPRs(org, project, token),
        fetchAdoMe(org, token),
      ]);
      workItemsProvider.setAdoItems(workItems);
      if (adoMe) prsProvider.setAdoMe(adoMe);
      prsProvider.setAdoPRs(prs);
    } catch (err) {
      console.error('[EditLess] ADO fetch failed:', err);
      vscode.window.showWarningMessage(
        `Azure DevOps: failed to fetch data — check organization and project settings`,
        'Configure',
      ).then(choice => {
        if (choice === 'Configure') vscode.commands.executeCommand('editless.configureAdo');
      });
    }
  }

  // Wire up refresh callback so providers can re-fetch ADO data
  workItemsProvider.setAdoRefresh(fetchAdoData);
  prsProvider.setAdoRefresh(fetchAdoData);

  // Initial fetch
  await fetchAdoData();
}
