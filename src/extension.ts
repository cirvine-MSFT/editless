import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createRegistry, watchRegistry } from './registry';
import { EditlessTreeProvider, EditlessTreeItem } from './editless-tree';
import { TerminalManager } from './terminal-manager';
import { SessionLabelManager, promptClearLabel } from './session-labels';
import { registerSquadUpgradeCommand, registerSquadUpgradeAllCommand, checkSquadUpgradesOnStartup, clearLatestVersionCache } from './squad-upgrader';
import { registerCliUpdateCommand, checkProviderUpdatesOnStartup, probeAllProviders, resolveActiveProvider, getActiveCliProvider } from './cli-provider';
import { registerDiscoveryCommand, checkDiscoveryOnStartup, autoRegisterWorkspaceSquads } from './discovery';
import { discoverAllAgents } from './agent-discovery';
import { AgentVisibilityManager } from './visibility';
import { SquadWatcher } from './watcher';
import { EditlessStatusBar } from './status-bar';
import { NotificationManager } from './notifications';
import { SessionContextResolver } from './session-context';
import { scanSquad } from './scanner';
import { flushDecisionsInbox } from './inbox-flusher';
import { initSquadUiContext, openSquadUiDashboard } from './squad-ui-integration';
import { resolveTeamDir } from './team-dir';
import { WorkItemsTreeProvider, WorkItemsTreeItem, type UnifiedState } from './work-items-tree';
import { PRsTreeProvider, PRsTreeItem } from './prs-tree';
import { fetchLinkedPRs } from './github-client';
import { getEdition } from './vscode-compat';
import { TerminalLayoutManager } from './terminal-layout';
import { getAdoToken, promptAdoSignIn } from './ado-auth';
import { fetchAdoWorkItems, fetchAdoPRs } from './ado-client';

const execFileAsync = promisify(execFile);

export function activate(context: vscode.ExtensionContext): { terminalManager: TerminalManager; context: vscode.ExtensionContext } {
  const output = vscode.window.createOutputChannel('EditLess');
  context.subscriptions.push(output);

  // --- CLI provider detection (async, non-blocking) -------------------------
  vscode.commands.executeCommand('setContext', 'editless.cliUpdateAvailable', false);
  probeAllProviders().then(() => resolveActiveProvider());

  // --- Squad UI integration (#38) ------------------------------------------
  initSquadUiContext(context);

  // --- Registry ----------------------------------------------------------
  const registry = createRegistry(context);
  registry.loadSquads();

  // --- Auto-register workspace squads (#201) --------------------------------
  autoRegisterWorkspaceSquads(registry);

  // --- Auto-flush decisions inbox (#66) ------------------------------------
  for (const squad of registry.loadSquads()) {
    const teamDir = resolveTeamDir(squad.path);
    if (teamDir) {
      const result = flushDecisionsInbox(teamDir);
      if (result.flushed > 0) {
        output.appendLine(`[inbox-flush] ${squad.name}: flushed ${result.flushed} decision(s)`);
      }
      for (const err of result.errors) {
        output.appendLine(`[inbox-flush] ${squad.name}: ${err}`);
      }
    }
  }

  // --- Terminal manager --------------------------------------------------
  const terminalManager = new TerminalManager(context);
  _terminalManagerRef = terminalManager;
  context.subscriptions.push(terminalManager);

  // --- Session label manager ---------------------------------------------
  const labelManager = new SessionLabelManager(context);

  // --- Notification manager -----------------------------------------------
  const notificationManager = new NotificationManager();

  // --- Session context resolver -------------------------------------------
  const sessionContextResolver = new SessionContextResolver();

  // Wire session resolver into terminal manager for session ID auto-detection
  terminalManager.setSessionResolver(sessionContextResolver);

  // --- Visibility manager ------------------------------------------------
  const visibilityManager = new AgentVisibilityManager(context);

  // --- Tree view ---------------------------------------------------------
  const treeProvider = new EditlessTreeProvider(registry, terminalManager, labelManager, sessionContextResolver, visibilityManager);
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
  context.subscriptions.push(vscode.window.registerTreeDataProvider('editlessPRs', prsProvider));

  // Reconcile persisted terminal sessions with live terminals after reload
  terminalManager.reconcile();

  // Crash recovery notification (fire-and-forget, non-blocking)
  const orphans = terminalManager.getOrphanedSessions();
  const resumable = orphans.filter(o => o.agentSessionId);
  if (resumable.length > 0) {
    void vscode.window.showInformationMessage(
      `EditLess found ${resumable.length} previous session(s) that can be resumed.`,
      'Resume All', 'Dismiss',
    ).then(action => {
      if (action === 'Resume All') {
        terminalManager.relaunchAllOrphans();
        treeProvider.refresh();
      }
    });
  }

  // Sync tree selection when switching terminals via tab bar
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTerminal(terminal => {
      if (!terminal) return;
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
    }),
  );

  // --- Agent discovery — workspace .agent.md files -------------------------
  let discoveredAgents = discoverAllAgents(vscode.workspace.workspaceFolders ?? []);
  treeProvider.setDiscoveredAgents(discoveredAgents);

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      discoveredAgents = discoverAllAgents(vscode.workspace.workspaceFolders ?? []);
      treeProvider.setDiscoveredAgents(discoveredAgents);
    }),
  );

  // --- Config change listener — re-scan when discovery.scanPaths changes ----
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('editless.discovery.scanPaths') || 
          e.affectsConfiguration('editless.discoveryDir')) {
        checkDiscoveryOnStartup(context, registry);
      }
    }),
  );

  // --- Status bar ----------------------------------------------------------
  const statusBar = new EditlessStatusBar(registry, terminalManager);
  context.subscriptions.push(statusBar);
  statusBar.update();

  terminalManager.onDidChange(() => statusBar.updateSessionsOnly());

  // --- Squad file watcher — live .squad/ (or .ai-team/) updates ----------
  const squadWatcher = new SquadWatcher(registry.loadSquads(), (squadId) => {
    const config = registry.getSquad(squadId);
    if (config) {
      const state = scanSquad(config);
      notificationManager.checkAndNotify(config, state);
    }
    treeProvider.invalidate(squadId);
    treeProvider.refresh();
    statusBar.update();
  });
  context.subscriptions.push(squadWatcher);

  // --- Registry file watcher — refresh tree on changes -------------------
  const registryWatcher = watchRegistry(registry, () => {
    treeProvider.refresh();
    squadWatcher.updateSquads(registry.loadSquads());
    statusBar.update();
  });
  context.subscriptions.push(registryWatcher);

  // --- Commands ----------------------------------------------------------

  // Squad upgrade commands
  const onUpgradeComplete = (squadId: string): void => {
    clearLatestVersionCache();
    treeProvider.setUpgradeAvailable(squadId, false);
    treeProvider.invalidate(squadId);
    
    // Re-check all squads after upgrade to update the context key
    checkSquadUpgradesOnStartup(registry.loadSquads(), (sid, available) => {
      treeProvider.setUpgradeAvailable(sid, available);
    });
  };
  context.subscriptions.push(registerSquadUpgradeCommand(context, registry, onUpgradeComplete));
  context.subscriptions.push(registerSquadUpgradeAllCommand(context, registry, onUpgradeComplete));

  // CLI provider update command
  context.subscriptions.push(registerCliUpdateCommand(context));

  // Check for CLI provider updates on startup
  checkProviderUpdatesOnStartup(context);

  // Check for squad upgrades on startup (async, non-blocking)
  checkSquadUpgradesOnStartup(registry.loadSquads(), (squadId, available) => {
    treeProvider.setUpgradeAvailable(squadId, available);
  });

  // Squad discovery command
  context.subscriptions.push(registerDiscoveryCommand(context, registry));

  // Check for new squads on startup
  checkDiscoveryOnStartup(context, registry);

  // Rename squad (context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.renameSquad', async (item?: EditlessTreeItem) => {
      if (!item?.squadId) return;
      const config = registry.getSquad(item.squadId);
      if (!config) return;

      const newName = await vscode.window.showInputBox({
        prompt: `Rename "${config.name}"`,
        value: config.name,
        validateInput: v => v.trim() ? undefined : 'Name cannot be empty',
      });
      if (newName && newName !== config.name) {
        registry.updateSquad(item.squadId, { name: newName });
        treeProvider.refresh();
      }
    }),
  );

  // Go to squad settings in registry JSON (context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.goToSquadSettings', async (item?: EditlessTreeItem) => {
      if (!item?.squadId) return;

      const doc = await vscode.workspace.openTextDocument(registry.registryPath);
      const editor = await vscode.window.showTextDocument(doc);

      const text = doc.getText();
      const needle = `"id": "${item.squadId}"`;
      const offset = text.indexOf(needle);
      if (offset !== -1) {
        const pos = doc.positionAt(offset);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      }
    }),
  );

  // Change model (context menu)
  const modelChoices = [
    { label: 'claude-opus-4.6', description: 'Premium' },
    { label: 'claude-opus-4.6-fast', description: 'Premium (fast)' },
    { label: 'claude-opus-4.5', description: 'Premium' },
    { label: 'claude-sonnet-4.5', description: 'Standard' },
    { label: 'claude-sonnet-4', description: 'Standard' },
    { label: 'gpt-5.2-codex', description: 'Standard' },
    { label: 'gpt-5.2', description: 'Standard' },
    { label: 'gpt-5.1-codex-max', description: 'Standard' },
    { label: 'gpt-5.1-codex', description: 'Standard' },
    { label: 'gpt-5.1', description: 'Standard' },
    { label: 'gpt-5', description: 'Standard' },
    { label: 'gemini-3-pro-preview', description: 'Standard' },
    { label: 'claude-haiku-4.5', description: 'Fast/Cheap' },
    { label: 'gpt-5.1-codex-mini', description: 'Fast/Cheap' },
    { label: 'gpt-5-mini', description: 'Fast/Cheap' },
    { label: 'gpt-4.1', description: 'Fast/Cheap' },
  ];
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.changeModel', async (item?: EditlessTreeItem) => {
      if (!item?.squadId) return;
      const config = registry.getSquad(item.squadId);
      if (!config?.launchCommand) return;

      const currentModel = config.launchCommand.match(/--model\s+(\S+)/)?.[1];
      const picks = modelChoices.map(m => ({
        ...m,
        description: m.label === currentModel ? `${m.description} ✓ current` : m.description,
      }));

      const pick = await vscode.window.showQuickPick(picks, {
        placeHolder: `Model for ${config.name} (current: ${currentModel ?? 'unknown'})`,
      });
      if (!pick || pick.label === currentModel) return;

      const newCmd = currentModel
        ? config.launchCommand.replace(`--model ${currentModel}`, `--model ${pick.label}`)
        : `${config.launchCommand} --model ${pick.label}`;

      registry.updateSquad(item.squadId, { launchCommand: newCmd });
      treeProvider.refresh();
      vscode.window.showInformationMessage(`${config.icon} ${config.name} model → ${pick.label}`);
    }),
  );

  // Refresh
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.refresh', () => {
      treeProvider.refresh();
      output.appendLine('[refresh] Tree refreshed');
    }),
  );

  // Launch session
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.launchSession', async (squadIdOrItem?: string | EditlessTreeItem) => {
      const squads = registry.loadSquads();
      if (squads.length === 0) {
        vscode.window.showWarningMessage('No agents registered yet.');
        return;
      }

      let chosen: string | undefined = typeof squadIdOrItem === 'string'
        ? squadIdOrItem
        : squadIdOrItem?.squadId;
      if (!chosen) {
        const pick = await vscode.window.showQuickPick(
          squads.map(s => ({ label: `${s.icon} ${s.name}`, description: s.universe, id: s.id })),
          { placeHolder: 'Select an agent to launch' },
        );
        chosen = pick?.id;
      }

      if (chosen) {
        const cfg = registry.getSquad(chosen);
        if (cfg) {
          terminalManager.launchTerminal(cfg);
        }
      }
    }),
  );

  // Focus session
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.focusSession', async () => {
      const all = terminalManager.getAllTerminals();
      if (all.length === 0) {
        vscode.window.showInformationMessage('No active sessions.');
        return;
      }

      const items = all.map(({ terminal, info }) => {
        const elapsed = Date.now() - info.createdAt.getTime();
        const mins = Math.floor(elapsed / 60_000);
        const relative = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
        const customLabel = labelManager.getLabel(info.labelKey);
        return {
          label: customLabel ? `🏷️ ${customLabel}` : info.displayName,
          description: customLabel ? `${info.displayName} · started ${relative}` : `started ${relative}`,
          terminal,
        };
      });

      const pick = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a session to focus',
      });

      if (pick) {
        terminalManager.focusTerminal(pick.terminal);
      }
    }),
  );

  // Helper: context menu passes EditlessTreeItem, not vscode.Terminal
  function resolveTerminal(arg: unknown): vscode.Terminal | undefined {
    if (arg instanceof EditlessTreeItem) return arg.terminal;
    return arg as vscode.Terminal | undefined;
  }

  // Focus terminal (tree item click)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.focusTerminal', (arg: vscode.Terminal | EditlessTreeItem) => {
      const terminal = resolveTerminal(arg);
      if (terminal) terminalManager.focusTerminal(terminal);
    }),
  );

  // Close terminal (context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.closeTerminal', (arg: vscode.Terminal | EditlessTreeItem) => {
      const terminal = resolveTerminal(arg);
      if (terminal) terminalManager.closeTerminal(terminal);
    }),
  );

  // Rename session (context menu or command palette)
  async function renameTerminalTab(terminal: vscode.Terminal, newName: string): Promise<void> {
    terminal.show(false);
    await vscode.commands.executeCommand('workbench.action.terminal.renameWithArg', { name: newName });
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('editless.renameSession', async (arg?: vscode.Terminal | EditlessTreeItem) => {
      const previousTerminal = vscode.window.activeTerminal;
      const terminal = resolveTerminal(arg) ?? vscode.window.activeTerminal;
      if (terminal) {
        terminal.show(true);
        const labelKey = terminalManager.getLabelKey(terminal);
        const current = labelManager.getLabel(labelKey) ?? terminalManager.getDisplayName(terminal);
        const value = await vscode.window.showInputBox({
          prompt: 'Enter a label for this session',
          value: current,
        });
        if (value !== undefined && value.length > 0) {
          const info = terminalManager.getTerminalInfo(terminal);
          const iconPrefix = info?.squadIcon ? `${info.squadIcon} ` : '';
          await renameTerminalTab(terminal, `${iconPrefix}${value}`);
          labelManager.setLabel(labelKey, value);
          terminalManager.renameSession(terminal, value);
        }
        if (previousTerminal && previousTerminal !== terminal) {
          previousTerminal.show(false);
        }
        return;
      }
      // No terminal arg — show QuickPick
      const all = terminalManager.getAllTerminals();
      if (all.length === 0) {
        vscode.window.showInformationMessage('No active sessions.');
        return;
      }
      const pick = await vscode.window.showQuickPick(
        all.map(({ terminal: t, info }) => ({
          label: labelManager.getLabel(info.labelKey) ?? info.displayName,
          description: info.displayName,
          terminal: t,
          labelKey: info.labelKey,
        })),
        { placeHolder: 'Select a session to rename' },
      );
      if (pick) {
        pick.terminal.show(true);
        const current = labelManager.getLabel(pick.labelKey) ?? terminalManager.getDisplayName(pick.terminal);
        const value = await vscode.window.showInputBox({
          prompt: 'Enter a label for this session',
          value: current,
        });
        if (value !== undefined && value.length > 0) {
          const info = terminalManager.getTerminalInfo(pick.terminal);
          const iconPrefix = info?.squadIcon ? `${info.squadIcon} ` : '';
          await renameTerminalTab(pick.terminal, `${iconPrefix}${value}`);
          labelManager.setLabel(pick.labelKey, value);
          terminalManager.renameSession(pick.terminal, value);
        }
        if (previousTerminal && previousTerminal !== pick.terminal) {
          previousTerminal.show(false);
        }
      }
    }),
  );

  // Clear session label (context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.clearSessionLabel', async (arg?: vscode.Terminal | EditlessTreeItem) => {
      const terminal = resolveTerminal(arg);
      if (terminal) {
        await promptClearLabel(terminal, labelManager, terminalManager.getLabelKey(terminal));
      }
    }),
  );

  // Open squad registry file
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.openRegistry', async () => {
      const registryPath = registry.registryPath;
      const doc = await vscode.workspace.openTextDocument(registryPath);
      await vscode.window.showTextDocument(doc);
    }),
  );

  // Hide agent (context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.hideAgent', (item?: EditlessTreeItem) => {
      if (!item) return;
      const id = item.squadId ?? item.id;
      if (!id) return;
      visibilityManager.hide(id);
      treeProvider.refresh();
    }),
  );

  // Show hidden agents (QuickPick)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.showHiddenAgents', async () => {
      const hiddenIds = visibilityManager.getHiddenIds();
      if (hiddenIds.length === 0) {
        vscode.window.showInformationMessage('No hidden agents.');
        return;
      }

      const picks = hiddenIds.map(id => {
        const squad = registry.getSquad(id);
        if (squad) {
          return { label: `${squad.icon} ${squad.name}`, description: squad.universe, id };
        }
        const agent = discoveredAgents.find(a => a.id === id);
        if (agent) {
          return { label: agent.name, description: agent.source, id };
        }
        return { label: id, description: 'unknown', id };
      });

      const selected = await vscode.window.showQuickPick(picks, {
        placeHolder: 'Select agents to show',
        canPickMany: true,
      });
      if (selected) {
        for (const pick of selected) {
          visibilityManager.show(pick.id);
        }
        treeProvider.refresh();
      }
    }),
  );

  // Refresh work items / PRs
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.refreshWorkItems', () => workItemsProvider.refresh()),
    vscode.commands.registerCommand('editless.refreshPRs', () => prsProvider.refresh()),
  );

  // Filter work items (#132)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.filterWorkItems', async () => {
      const current = workItemsProvider.filter;
      const allRepos = workItemsProvider.getAllRepos();
      const allLabels = workItemsProvider.getAllLabels();
      const stateOptions: { label: string; value: UnifiedState }[] = [
        { label: 'Open (New)', value: 'open' },
        { label: 'Active / In Progress', value: 'active' },
      ];

      const items: vscode.QuickPickItem[] = [];
      if (allRepos.length > 0) {
        items.push({ label: 'Repos', kind: vscode.QuickPickItemKind.Separator });
        for (const repo of allRepos) {
          items.push({ label: repo, description: 'repo', picked: current.repos.includes(repo) });
        }
      }
      items.push({ label: 'State', kind: vscode.QuickPickItemKind.Separator });
      for (const s of stateOptions) {
        items.push({ label: s.label, description: 'state', picked: current.states.includes(s.value) });
      }
      if (allLabels.length > 0) {
        items.push({ label: 'Labels', kind: vscode.QuickPickItemKind.Separator });
        for (const label of allLabels) {
          items.push({ label, description: 'label', picked: current.labels.includes(label) });
        }
      }

      const picks = await vscode.window.showQuickPick(items, {
        title: 'Filter Work Items',
        canPickMany: true,
        placeHolder: 'Select filters (leave empty to show all)',
      });
      if (picks === undefined) return;

      const repos = picks.filter(p => p.description === 'repo').map(p => p.label);
      const labels = picks.filter(p => p.description === 'label').map(p => p.label);
      const states = picks.filter(p => p.description === 'state')
        .map(p => stateOptions.find(s => s.label === p.label)?.value)
        .filter((s): s is UnifiedState => s !== undefined);

      workItemsProvider.setFilter({ repos, labels, states });
    }),
    vscode.commands.registerCommand('editless.clearWorkItemsFilter', () => workItemsProvider.clearFilter()),
  );
  vscode.commands.executeCommand('setContext', 'editless.workItemsFiltered', false);

  // Configure GitHub repos (opens settings)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.configureRepos', async () => {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'editless.github');
    }),
  );

  // Configure ADO (opens settings)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.configureAdo', async () => {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'editless.ado');
    }),
  );

  // Configure Work Items (quick pick between GitHub and ADO)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.configureWorkItems', async () => {
      const choice = await vscode.window.showQuickPick(
        [
          { label: 'GitHub', description: 'Configure GitHub repositories for work items', command: 'editless.configureRepos' },
          { label: 'Azure DevOps', description: 'Configure Azure DevOps project and PAT', command: 'editless.configureAdo' },
        ],
        { placeHolder: 'Choose a provider to configure' },
      );
      if (choice) {
        await vscode.commands.executeCommand(choice.command);
      }
    }),
  );

  // Configure PRs (quick pick between GitHub and ADO)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.configurePRs', async () => {
      const choice = await vscode.window.showQuickPick(
        [
          { label: 'GitHub', description: 'Configure GitHub repositories for pull requests', command: 'editless.configureRepos' },
          { label: 'Azure DevOps', description: 'Configure Azure DevOps project and PAT', command: 'editless.configureAdo' },
        ],
        { placeHolder: 'Choose a provider to configure' },
      );
      if (choice) {
        await vscode.commands.executeCommand(choice.command);
      }
    }),
  );

  // Set ADO PAT (stored in secret storage)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.setAdoPat', async () => {
      const pat = await vscode.window.showInputBox({
        prompt: 'Enter your Azure DevOps Personal Access Token',
        password: true,
        placeHolder: 'Paste your PAT here',
        ignoreFocusOut: true,
      });
      if (pat) {
        await context.secrets.store('editless.ado.pat', pat);
        vscode.window.showInformationMessage('ADO PAT saved. Refreshing work items...');
        initAdoIntegration(context, workItemsProvider, prsProvider);
      }
    }),
  );

  // Sign in to ADO (triggers Microsoft auth flow)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.adoSignIn', async () => {
      const token = await promptAdoSignIn();
      if (token) {
        vscode.window.showInformationMessage('Signed in to Azure DevOps. Refreshing...');
        initAdoIntegration(context, workItemsProvider, prsProvider);
      }
    }),
  );

  // Open in Squad UI (context menu on squads — visible only when SquadUI is installed)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.openInSquadUi', () => openSquadUiDashboard()),
  );

  // Open in Browser (context menu for work items and PRs)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.openInBrowser', async (arg: WorkItemsTreeItem | PRsTreeItem) => {
      const wiItem = arg as WorkItemsTreeItem;
      const prItem = arg as PRsTreeItem;
      const url = wiItem.issue?.url ?? wiItem.adoWorkItem?.url ?? prItem.pr?.url ?? prItem.adoPR?.url;
      if (url) {
        await vscode.env.openExternal(vscode.Uri.parse(url));
      }
    }),
  );

  // Launch from Work Item (context menu on work items)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.launchFromWorkItem', async (item?: WorkItemsTreeItem) => {
      const issue = item?.issue;
      if (!issue) return;

      const squads = registry.loadSquads();
      if (squads.length === 0) {
        vscode.window.showWarningMessage('No agents registered.');
        return;
      }

      const pick = await vscode.window.showQuickPick(
        squads.map(s => ({ label: `${s.icon} ${s.name}`, description: s.universe, squad: s })),
        { placeHolder: `Launch agent for #${issue.number} ${issue.title}` },
      );
      if (!pick) return;

      const cfg = pick.squad;
      const MAX_SESSION_NAME = 50;
      const rawName = `#${issue.number} ${issue.title}`;
      const terminalName = rawName.length <= MAX_SESSION_NAME
        ? rawName
        : rawName.slice(0, rawName.lastIndexOf(' ', MAX_SESSION_NAME)) + '…';
      terminalManager.launchTerminal(cfg, terminalName);

      await vscode.env.clipboard.writeText(issue.url);
      vscode.window.showInformationMessage(`Copied ${issue.url} to clipboard`);
    }),
  );

  // --- GitHub repo detection & data loading ---
  initGitHubIntegration(workItemsProvider, prsProvider);

  // --- ADO integration ---
  initAdoIntegration(context, workItemsProvider, prsProvider);

  // --- Auto-refresh for Work Items & PRs ---
  const autoRefresh = initAutoRefresh(workItemsProvider, prsProvider);
  context.subscriptions.push(autoRefresh);

  // Open file in markdown preview
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.openFilePreview', (uri: vscode.Uri) => {
      vscode.commands.executeCommand('markdown.showPreviewToSide', uri);
    }),
  );

  // Go to PR (context menu on work items)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.goToPR', async (item?: WorkItemsTreeItem) => {
      const issue = item?.issue;
      if (!issue) return;

      const prs = await fetchLinkedPRs(issue.repository, issue.number);
      if (prs.length === 0) {
        vscode.window.showInformationMessage(`No linked PRs found for #${issue.number}`);
        return;
      }
      if (prs.length === 1) {
        await vscode.env.openExternal(vscode.Uri.parse(prs[0].url));
        return;
      }
      const pick = await vscode.window.showQuickPick(
        prs.map(p => ({ label: `#${p.number} ${p.title}`, description: p.state, url: p.url })),
        { placeHolder: 'Select a PR to open' },
      );
      if (pick) await vscode.env.openExternal(vscode.Uri.parse(pick.url));
    }),
  );

  // Show all agents
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.showAllAgents', () => {
      visibilityManager.showAll();
      treeProvider.refresh();
    }),
  );

  // Re-launch orphaned session
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.relaunchSession', (arg?: EditlessTreeItem) => {
      const entry = arg?.persistedEntry;
      if (entry) {
        terminalManager.relaunchSession(entry);
      }
    }),
  );

  // Dismiss orphaned session
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.dismissOrphan', (arg?: EditlessTreeItem) => {
      const entry = arg?.persistedEntry;
      if (entry) {
        terminalManager.dismissOrphan(entry);
      }
    }),
  );

  // Re-launch all orphaned sessions
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.relaunchAllOrphans', () => {
      terminalManager.relaunchAllOrphans();
    }),
  );

  // Add New — QuickPick to choose between Agent or Squad
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.addNew', async () => {
      const pick = await vscode.window.showQuickPick(
        [
          { label: '$(file-code) Agent', description: 'Create an agent template file', value: 'agent' as const },
          { label: '$(terminal) Session', description: 'Launch a new agent session', value: 'session' as const },
          { label: '$(rocket) Squad', description: 'Initialize a new Squad project', value: 'squad' as const },
        ],
        { placeHolder: 'What would you like to add?' },
      );
      if (!pick) return;
      if (pick.value === 'agent') {
        await vscode.commands.executeCommand('editless.addAgent');
      } else if (pick.value === 'session') {
        await vscode.commands.executeCommand('editless.launchSession');
      } else {
        await vscode.commands.executeCommand('editless.addSquad');
      }
    }),
  );

  // Add Agent — choose mode (repo template or CLI provider), then create
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.addAgent', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showWarningMessage('No workspace folder open.');
        return;
      }

      const name = await vscode.window.showInputBox({
        prompt: 'Agent name',
        placeHolder: 'my-agent',
        validateInput: v => {
          if (!v.trim()) return 'Name cannot be empty';
          if (!/^[a-zA-Z0-9_-]+$/.test(v.trim())) return 'Use only letters, numbers, hyphens, underscores';
          return undefined;
        },
      });
      if (!name) return;

      const customCommand = vscode.workspace.getConfiguration('editless').get<string>('agentCreationCommand');
      if (typeof customCommand === 'string' && customCommand.trim()) {
        const command = customCommand
          .replace(/\$\{workspaceFolder\}/g, workspaceFolder.uri.fsPath)
          .replace(/\$\{agentName\}/g, name.trim());
        const terminal = vscode.window.createTerminal({
          name: `Add Agent: ${name.trim()}`,
          cwd: workspaceFolder.uri.fsPath,
        });
        terminal.show();
        terminal.sendText(command);
        return;
      }

      const provider = getActiveCliProvider();
      const hasProviderCreate = !!provider?.createCommand?.trim();

      type ModeValue = 'repo' | 'provider';
      const modeItems: { label: string; description: string; value: ModeValue }[] = [
        { label: '$(repo) Repo template', description: 'Create .github/agents/ markdown file', value: 'repo' },
      ];
      if (hasProviderCreate) {
        modeItems.unshift({
          label: `$(terminal) ${provider!.name}`,
          description: `Create via ${provider!.name} CLI`,
          value: 'provider',
        });
      }

      let mode: ModeValue = 'repo';
      if (modeItems.length > 1) {
        const modePick = await vscode.window.showQuickPick(modeItems, {
          placeHolder: 'How should the agent be created?',
        });
        if (!modePick) return;
        mode = modePick.value;
      }

      if (mode === 'provider' && provider?.createCommand) {
        const command = provider.createCommand
          .replace(/\$\(agent\)/g, name.trim())
          .replace(/\$\{agentName\}/g, name.trim());
        const terminal = vscode.window.createTerminal({
          name: `Add Agent: ${name.trim()}`,
          cwd: workspaceFolder.uri.fsPath,
        });
        terminal.show();
        terminal.sendText(command);
        return;
      }

      const agentsDir = path.join(workspaceFolder.uri.fsPath, '.github', 'agents');
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(agentsDir));

      const filePath = path.join(agentsDir, `${name.trim()}.agent.md`);
      if (fs.existsSync(filePath)) {
        vscode.window.showWarningMessage(`Agent file already exists: ${filePath}`);
        return;
      }

      const template = [
        '---',
        `description: "${name.trim()} agent"`,
        '---',
        '',
        `# ${name.trim()}`,
        '',
        '> Describe what this agent does',
        '',
        '## Instructions',
        '',
        'Add your agent instructions here.',
        '',
      ].join('\n');

      fs.writeFileSync(filePath, template, 'utf-8');
      const doc = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(doc);

      discoveredAgents = discoverAllAgents(vscode.workspace.workspaceFolders ?? []);
      treeProvider.setDiscoveredAgents(discoveredAgents);
    }),
  );

  // Add Squad — open a folder picker, git init, and run squad init in a terminal
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.addSquad', async () => {
      const { checkNpxAvailable, promptInstallNode, isSquadInitialized } = await import('./squad-upgrader');
      
      const npxAvailable = await checkNpxAvailable();
      if (!npxAvailable) {
        await promptInstallNode();
        return;
      }

      const uris = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: 'Select directory for new squad',
      });
      if (!uris || uris.length === 0) return;

      const dirPath = uris[0].fsPath;
      const squadExists = isSquadInitialized(dirPath);
      const command = squadExists 
        ? 'npx github:bradygaster/squad upgrade'
        : 'git init && npx github:bradygaster/squad init';
      const action = squadExists ? 'Upgrade' : 'Init';

      const terminal = vscode.window.createTerminal({
        name: `Squad ${action}: ${path.basename(dirPath)}`,
        cwd: dirPath,
        hideFromUser: true,
      });
      terminal.sendText(command);

      vscode.window.showInformationMessage(
        squadExists
          ? `Squad upgrade started in ${path.basename(dirPath)}.`
          : `Squad initialization started in ${path.basename(dirPath)}. After it completes, use "Discover Squads" to add it to the registry.`,
      );
    }),
  );

  // --- Terminal layout restore — maximize panel when editors close -----------
  const terminalLayoutManager = new TerminalLayoutManager();
  context.subscriptions.push(terminalLayoutManager);

  output.appendLine(`EditLess activated (${getEdition()})`);

  return { terminalManager, context };
}

export function deactivate(): void {
  // Flush in-flight state — workspaceState is SQLite-backed and survives crash
  _terminalManagerRef?.persist();
}

let _terminalManagerRef: TerminalManager | undefined;

function initAutoRefresh(
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
    return;
  }

  async function fetchAdoData(): Promise<void> {
    const token = await getAdoToken(context.secrets);
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
      const [workItems, prs] = await Promise.all([
        fetchAdoWorkItems(org, project, token),
        fetchAdoPRs(org, project, token),
      ]);
      workItemsProvider.setAdoItems(workItems);
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
