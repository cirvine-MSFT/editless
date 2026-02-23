import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createRegistry, watchRegistry } from './registry';
import { EditlessTreeProvider, EditlessTreeItem, DEFAULT_COPILOT_CLI_ID } from './editless-tree';
import { TerminalManager } from './terminal-manager';
import { SessionLabelManager, promptClearLabel } from './session-labels';


import { discoverAgentTeams, parseTeamMd, toKebabCase } from './discovery';
import { discoverAllAgents } from './agent-discovery';
import { discoverAll } from './unified-discovery';
import type { DiscoveredItem } from './unified-discovery';
import type { AgentTeamConfig } from './types';
import { AgentVisibilityManager } from './visibility';
import { SquadWatcher } from './watcher';
import { EditlessStatusBar } from './status-bar';
import { SessionContextResolver } from './session-context';
import { scanSquad } from './scanner';
import { initSquadUiContext, openSquadUiDashboard } from './squad-ui-integration';
import { resolveTeamDir, TEAM_DIR_NAMES } from './team-dir';
import { WorkItemsTreeProvider, WorkItemsTreeItem, type UnifiedState, type LevelFilter } from './work-items-tree';
import { PRsTreeProvider, PRsTreeItem, type PRsFilter, type PRLevelFilter } from './prs-tree';
import { fetchLinkedPRs } from './github-client';
import { getEdition } from './vscode-compat';
import { getAdoToken, promptAdoSignIn, setAdoAuthOutput } from './ado-auth';
import { fetchAdoWorkItems, fetchAdoPRs, fetchAdoMe } from './ado-client';

import { launchAndLabel } from './launch-utils';

const execFileAsync = promisify(execFile);

function getCreateCommand(): string {
  return '';
}

/** For a discovered agent file path, derive the project root.
 *  e.g. C:\project\.github\agents\foo.agent.md → C:\project
 *  Falls back to dirname if not inside .github/agents/. */
function deriveProjectRoot(agentFilePath: string): string {
  const dir = path.dirname(agentFilePath);
  const normalized = dir.replace(/\\/g, '/').toLowerCase();
  if (normalized.endsWith('/.github/agents') || normalized.endsWith('/.github/agents/')) {
    return path.resolve(dir, '..', '..');
  }
  return dir;
}

export function activate(context: vscode.ExtensionContext): { terminalManager: TerminalManager; context: vscode.ExtensionContext } {
  const output = vscode.window.createOutputChannel('EditLess');
  context.subscriptions.push(output);
  setAdoAuthOutput(output);

  // --- Squad UI integration (#38) ------------------------------------------
  initSquadUiContext(context);

  // --- Registry ----------------------------------------------------------
  const registry = createRegistry(context);
  registry.loadSquads();

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
  const prsView = vscode.window.createTreeView('editlessPRs', { treeDataProvider: prsProvider });
  prsProvider.setTreeView(prsView);
  context.subscriptions.push(prsView);

  // Reconcile persisted terminal sessions with live terminals after reload.
  // Orphaned sessions appear in the tree view — users can resume individually.
  terminalManager.reconcile();

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

  // --- Unified discovery — agents + squads in one pass (#317, #318) ----------
  let discoveredAgents = discoverAllAgents(vscode.workspace.workspaceFolders ?? []);
  treeProvider.setDiscoveredAgents(discoveredAgents);

  let discoveredItems = discoverAll(vscode.workspace.workspaceFolders ?? [], registry);
  treeProvider.setDiscoveredItems(discoveredItems);

  /** Re-run unified discovery and update tree. */
  function refreshDiscovery(): void {
    discoveredAgents = discoverAllAgents(vscode.workspace.workspaceFolders ?? []);
    treeProvider.setDiscoveredAgents(discoveredAgents);
    discoveredItems = discoverAll(vscode.workspace.workspaceFolders ?? [], registry);
    treeProvider.setDiscoveredItems(discoveredItems);
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      refreshDiscovery();
    }),
  );

  // --- Workspace watcher for new .ai-team/ or .squad/ directories ----------
  // Detects when squad init runs in-session (outside the addSquad command flow)
  for (const dirName of TEAM_DIR_NAMES) {
    for (const folder of (vscode.workspace.workspaceFolders ?? [])) {
      const pattern = new vscode.RelativePattern(folder, `${dirName}/team.md`);
      const teamMdWatcher = vscode.workspace.createFileSystemWatcher(pattern);
      teamMdWatcher.onDidCreate(() => {
        // Auto-register workspace folder squads when team.md is created via + button
        const folderPath = folder.uri.fsPath;
        const existing = registry.loadSquads();
        const alreadyRegistered = existing.some(s => s.path.toLowerCase() === folderPath.toLowerCase());
        if (!alreadyRegistered) {
          const teamMdPath = path.join(folderPath, dirName, 'team.md');
          try {
            const content = fs.readFileSync(teamMdPath, 'utf-8');
            const parsed = parseTeamMd(content, path.basename(folderPath));
            const id = toKebabCase(path.basename(folderPath));
            registry.addSquads([{
              id,
              name: parsed.name,
              path: folderPath,
              icon: '🔷',
              universe: parsed.universe ?? 'unknown',
              description: parsed.description,
            }]);
          } catch {
            // team.md may not be readable yet; fall through to discovery
          }
        }
        refreshDiscovery();
        treeProvider.refresh();
        squadWatcher.updateSquads(registry.loadSquads());
        statusBar.update();
      });
      context.subscriptions.push(teamMdWatcher);
    }
  }

  // --- Status bar ----------------------------------------------------------
  const statusBar = new EditlessStatusBar(registry, terminalManager);
  context.subscriptions.push(statusBar);
  statusBar.update();

  terminalManager.onDidChange(() => statusBar.updateSessionsOnly());

  // --- Squad file watcher — live .squad/ (or .ai-team/) updates ----------
  const squadWatcher = new SquadWatcher(registry.loadSquads(), (squadId) => {
    const config = registry.getSquad(squadId);
    if (config) {
      scanSquad(config);
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

  // Squad discovery command — triggers unified discovery (#317)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.discoverSquads', () => {
      refreshDiscovery();
    }),
  );

  // Discovery populates the tree — no toast notifications (#317)

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
      if (!config) return;

      const currentModel = config.model;
      const picks = modelChoices.map(m => ({
        ...m,
        description: m.label === currentModel ? `${m.description} ✓ current` : m.description,
      }));

      const pick = await vscode.window.showQuickPick(picks, {
        placeHolder: `Model for ${config.name} (current: ${currentModel ?? 'unknown'})`,
      });
      if (!pick || pick.label === currentModel) return;

      registry.updateSquad(item.squadId, { model: pick.label });
      treeProvider.refresh();
      vscode.window.showInformationMessage(`${config.icon} ${config.name} model → ${pick.label}`);
    }),
  );

  // Refresh
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.refresh', () => {
      refreshDiscovery();
      treeProvider.refresh();
      output.appendLine('[refresh] Tree refreshed');
    }),
  );

  // Launch session
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.launchSession', async (squadIdOrItem?: string | EditlessTreeItem) => {
      // Handle the built-in Copilot CLI default agent
      const isDefaultAgent = (typeof squadIdOrItem !== 'string' && squadIdOrItem?.type === 'default-agent')
        || squadIdOrItem === DEFAULT_COPILOT_CLI_ID;
      if (isDefaultAgent) {
        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const defaultCfg: AgentTeamConfig = {
          id: DEFAULT_COPILOT_CLI_ID,
          name: 'Copilot CLI',
          path: cwd ?? '',
          icon: '🤖',
          universe: 'standalone',
        };
        terminalManager.launchTerminal(defaultCfg);
        return;
      }

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
      const rawId = item.squadId ?? item.id;
      if (!rawId) return;
      // Discovered agents use 'discovered:{id}' as item.id but visibility checks raw id
      const id = rawId.replace(/^discovered:/, '');
      visibilityManager.hide(id);
      treeProvider.refresh();
    }),
  );

  // Promote discovered item to registry (#250, #317)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.promoteDiscoveredAgent', (item?: EditlessTreeItem) => {
      if (!item?.id) return;
      const itemId = item.id.replace(/^discovered:/, '');

      // Check unified discovered items first
      const disc = discoveredItems.find(d => d.id === itemId);
      if (disc) {
        const config: AgentTeamConfig = disc.type === 'squad'
          ? { id: disc.id, name: disc.name, path: disc.path, icon: '🔷', universe: disc.universe ?? 'unknown', description: disc.description }
          : { id: disc.id, name: disc.name, path: deriveProjectRoot(disc.path), icon: '🤖', universe: 'standalone', description: disc.description };
        registry.addSquads([config]);
        refreshDiscovery();
        treeProvider.refresh();
        return;
      }

      // Fallback to legacy discovered agents
      const agent = discoveredAgents.find(a => a.id === itemId);
      if (!agent) return;

      const config: AgentTeamConfig = {
        id: agent.id,
        name: agent.name,
        path: path.dirname(agent.filePath),
        icon: '🤖',
        universe: 'standalone',
        description: agent.description,
      };

      registry.addSquads([config]);
      refreshDiscovery();
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
        const disc = discoveredItems.find(d => d.id === id);
        if (disc) {
          return { label: disc.type === 'squad' ? `🔷 ${disc.name}` : disc.name, description: disc.source, id };
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

  // Global source filter — top-level cascading principle (#390)
  // Detailed filters (type, state, labels, tags) live on per-level inline [≡] icons
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.filterWorkItems', async () => {
      const current = workItemsProvider.filter;
      const allRepos = workItemsProvider.getAllRepos();

      const items: vscode.QuickPickItem[] = [];
      items.push({ label: 'Sources', kind: vscode.QuickPickItemKind.Separator });
      for (const repo of allRepos) {
        const desc = repo === '(ADO)' ? 'Azure DevOps' : 'GitHub';
        items.push({ label: repo, description: desc, picked: current.repos.includes(repo) });
      }

      const picks = await vscode.window.showQuickPick(items, {
        title: 'Show/Hide Sources',
        canPickMany: true,
        placeHolder: 'Select sources to show (leave empty to show all)',
      });
      if (picks === undefined) return;

      const repos = picks.map(p => p.label);
      workItemsProvider.setFilter({ repos, labels: [], states: [], types: [] });
    }),
    vscode.commands.registerCommand('editless.clearWorkItemsFilter', () => {
      workItemsProvider.clearFilter();
      workItemsProvider.clearAllLevelFilters();
    }),
    // Per-level filtering (#390)
    vscode.commands.registerCommand('editless.filterLevel', async (item: WorkItemsTreeItem) => {
      if (!item?.id || !item.contextValue) return;
      
      const nodeId = item.id;
      const contextValue = item.contextValue;
      const options = workItemsProvider.getAvailableOptions(nodeId, contextValue);
      const currentFilter = workItemsProvider.getLevelFilter(nodeId) ?? {};

      const items: vscode.QuickPickItem[] = [];

      // Owners (GitHub backend)
      if (options.owners && options.owners.length > 0) {
        items.push({ label: 'Owners', kind: vscode.QuickPickItemKind.Separator });
        for (const owner of options.owners) {
          items.push({ label: owner, description: 'owner', picked: currentFilter.selectedChildren?.includes(owner) });
        }
      }

      // Orgs (ADO backend)
      if (options.orgs && options.orgs.length > 0) {
        items.push({ label: 'Organizations', kind: vscode.QuickPickItemKind.Separator });
        for (const org of options.orgs) {
          items.push({ label: org, description: 'org', picked: currentFilter.selectedChildren?.includes(org) });
        }
      }

      // Projects (ADO org)
      if (options.projects && options.projects.length > 0) {
        items.push({ label: 'Projects', kind: vscode.QuickPickItemKind.Separator });
        for (const project of options.projects) {
          items.push({ label: project, description: 'project', picked: currentFilter.selectedChildren?.includes(project) });
        }
      }

      // Repos (GitHub org)
      if (options.repos && options.repos.length > 0) {
        items.push({ label: 'Repositories', kind: vscode.QuickPickItemKind.Separator });
        for (const repo of options.repos) {
          items.push({ label: repo, description: 'repo', picked: currentFilter.selectedChildren?.includes(repo) });
        }
      }

      // Types (ADO project)
      if (options.types && options.types.length > 0) {
        items.push({ label: 'Type', kind: vscode.QuickPickItemKind.Separator });
        for (const type of options.types) {
          items.push({ label: type, description: 'type', picked: currentFilter.types?.includes(type) });
        }
      }

      // Labels (GitHub repo)
      if (options.labels && options.labels.length > 0) {
        items.push({ label: 'Labels', kind: vscode.QuickPickItemKind.Separator });
        for (const label of options.labels) {
          items.push({ label, description: 'label', picked: currentFilter.labels?.includes(label) });
        }
      }

      // Tags (ADO project)
      if (options.tags && options.tags.length > 0) {
        items.push({ label: 'Tags', kind: vscode.QuickPickItemKind.Separator });
        for (const tag of options.tags) {
          items.push({ label: tag, description: 'tag', picked: currentFilter.tags?.includes(tag) });
        }
      }

      // States
      if (options.states && options.states.length > 0) {
        items.push({ label: 'State', kind: vscode.QuickPickItemKind.Separator });
        const stateLabels = { open: 'Open (New)', active: 'Active / In Progress', closed: 'Closed' };
        for (const state of options.states) {
          items.push({ label: stateLabels[state], description: 'state', picked: currentFilter.states?.includes(state) });
        }
      }

      if (items.length === 0) {
        vscode.window.showInformationMessage('No filter options available for this level');
        return;
      }

      const picks = await vscode.window.showQuickPick(items, {
        title: `Filter ${item.label}`,
        canPickMany: true,
        placeHolder: 'Select sources to display (leave empty to show all)',
      });
      if (picks === undefined) return;

      const filter: LevelFilter = {};
      filter.selectedChildren = picks.filter(p => p.description === 'owner' || p.description === 'org' || p.description === 'project' || p.description === 'repo').map(p => p.label);
      filter.types = picks.filter(p => p.description === 'type').map(p => p.label);
      filter.labels = picks.filter(p => p.description === 'label').map(p => p.label);
      filter.tags = picks.filter(p => p.description === 'tag').map(p => p.label);
      const stateLabels = { 'Open (New)': 'open', 'Active / In Progress': 'active', 'Closed': 'closed' };
      filter.states = picks.filter(p => p.description === 'state')
        .map(p => stateLabels[p.label as keyof typeof stateLabels])
        .filter((s): s is UnifiedState => s !== undefined);

      if (filter.selectedChildren?.length === 0) delete filter.selectedChildren;
      if (filter.types?.length === 0) delete filter.types;
      if (filter.labels?.length === 0) delete filter.labels;
      if (filter.tags?.length === 0) delete filter.tags;
      if (filter.states?.length === 0) delete filter.states;

      if (Object.keys(filter).length === 0) {
        workItemsProvider.clearLevelFilter(nodeId);
      } else {
        workItemsProvider.setLevelFilter(nodeId, filter);
      }
    }),
    vscode.commands.registerCommand('editless.clearLevelFilter', (item: WorkItemsTreeItem) => {
      if (item?.id) {
        workItemsProvider.clearLevelFilter(item.id);
      }
    }),
    // Keep command registered for backward compat — delegates to unified filter
    vscode.commands.registerCommand('editless.workItems.filterByType', () =>
      vscode.commands.executeCommand('editless.filterWorkItems'),
    ),
  );

  vscode.commands.executeCommand('setContext', 'editless.workItemsFiltered', false);

  // Filter PRs — global filter = sources only, detailed filters on per-level [≡] icons (#390)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.filterPRs', async () => {
      const current = prsProvider.filter;
      const allRepos = prsProvider.getAllRepos();

      const items: vscode.QuickPickItem[] = [];
      items.push({ label: 'Sources', kind: vscode.QuickPickItemKind.Separator });
      for (const repo of allRepos) {
        const desc = repo === '(ADO)' ? 'Azure DevOps' : 'GitHub';
        items.push({ label: repo, description: desc, picked: current.repos.includes(repo) });
      }

      const picks = await vscode.window.showQuickPick(items, {
        title: 'Show/Hide Sources',
        canPickMany: true,
        placeHolder: 'Select sources to show (leave empty to show all)',
      });
      if (picks === undefined) return;

      const repos = picks.map(p => p.label);
      prsProvider.setFilter({ repos, labels: [], statuses: [], author: prsProvider.filter.author });
    }),
    vscode.commands.registerCommand('editless.clearPRsFilter', () => {
      prsProvider.clearFilter();
      prsProvider.clearAllLevelFilters();
    }),
    // Per-level filtering (#390)
    vscode.commands.registerCommand('editless.filterPRLevel', async (item: PRsTreeItem) => {
      if (!item?.id || !item.contextValue) return;

      const nodeId = item.id;
      const contextValue = item.contextValue;
      const options = prsProvider.getAvailableOptions(nodeId, contextValue);
      const currentFilter = prsProvider.getLevelFilter(nodeId) ?? {};

      const quickPickItems: vscode.QuickPickItem[] = [];

      // Owners (GitHub PR backend)
      if (options.owners && options.owners.length > 0) {
        quickPickItems.push({ label: 'Owners', kind: vscode.QuickPickItemKind.Separator });
        for (const owner of options.owners) {
          quickPickItems.push({ label: owner, description: 'owner', picked: currentFilter.selectedChildren?.includes(owner) });
        }
      }

      // Orgs (ADO PR backend)
      if (options.orgs && options.orgs.length > 0) {
        quickPickItems.push({ label: 'Organizations', kind: vscode.QuickPickItemKind.Separator });
        for (const org of options.orgs) {
          quickPickItems.push({ label: org, description: 'org', picked: currentFilter.selectedChildren?.includes(org) });
        }
      }

      // Projects (ADO PR org)
      if (options.projects && options.projects.length > 0) {
        quickPickItems.push({ label: 'Projects', kind: vscode.QuickPickItemKind.Separator });
        for (const project of options.projects) {
          quickPickItems.push({ label: project, description: 'project', picked: currentFilter.selectedChildren?.includes(project) });
        }
      }

      // Repos (GitHub PR org)
      if (options.repos && options.repos.length > 0) {
        quickPickItems.push({ label: 'Repositories', kind: vscode.QuickPickItemKind.Separator });
        for (const repo of options.repos) {
          quickPickItems.push({ label: repo, description: 'repo', picked: currentFilter.selectedChildren?.includes(repo) });
        }
      }

      // Statuses (project/repo level)
      if (options.statuses && options.statuses.length > 0) {
        quickPickItems.push({ label: 'Status', kind: vscode.QuickPickItemKind.Separator });
        for (const status of options.statuses) {
          quickPickItems.push({ label: status, description: 'status', picked: currentFilter.statuses?.includes(status) });
        }
      }

      // Labels (GitHub repo level)
      if (options.labels && options.labels.length > 0) {
        quickPickItems.push({ label: 'Labels', kind: vscode.QuickPickItemKind.Separator });
        for (const label of options.labels) {
          quickPickItems.push({ label, description: 'label', picked: currentFilter.labels?.includes(label) });
        }
      }

      if (quickPickItems.length === 0) {
        vscode.window.showInformationMessage('No filter options available for this level');
        return;
      }

      const picks = await vscode.window.showQuickPick(quickPickItems, {
        title: `Filter ${item.label}`,
        canPickMany: true,
        placeHolder: 'Select filters (leave empty to show all)',
      });
      if (picks === undefined) return;

      const filter: PRLevelFilter = {};
      filter.selectedChildren = picks.filter(p => p.description === 'owner' || p.description === 'org' || p.description === 'project' || p.description === 'repo').map(p => p.label);
      filter.statuses = picks.filter(p => p.description === 'status').map(p => p.label);
      filter.labels = picks.filter(p => p.description === 'label').map(p => p.label);

      if (filter.selectedChildren?.length === 0) delete filter.selectedChildren;
      if (filter.statuses?.length === 0) delete filter.statuses;
      if (filter.labels?.length === 0) delete filter.labels;

      if (Object.keys(filter).length === 0) {
        prsProvider.clearLevelFilter(nodeId);
      } else {
        prsProvider.setLevelFilter(nodeId, filter);
      }
    }),
    vscode.commands.registerCommand('editless.clearPRLevelFilter', (item: PRsTreeItem) => {
      if (item?.id) {
        prsProvider.clearLevelFilter(item.id);
      }
    }),
  );
  vscode.commands.executeCommand('setContext', 'editless.prsFiltered', false);
  vscode.commands.executeCommand('setContext', 'editless.prsMyOnly', false);

  // Toggle "created by me" PR filter (#280)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.prs.toggleMyPRs', () => {
      const current = prsProvider.filter;
      const newAuthor = current.author ? '' : '@me';
      prsProvider.setFilter({ ...current, author: newAuthor });
    }),
  );

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
          { label: 'Azure DevOps', description: 'Configure Azure DevOps project', command: 'editless.configureAdo' },
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
          { label: 'Azure DevOps', description: 'Configure Azure DevOps project', command: 'editless.configureAdo' },
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
    vscode.commands.registerCommand('editless.openInSquadUi', (item?: EditlessTreeItem) => {
      const config = item?.squadId ? registry.getSquad(item.squadId) : undefined;
      return openSquadUiDashboard(config?.path);
    }),
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
      const adoItem = item?.adoWorkItem;
      if (!issue && !adoItem) return;

      const squads = registry.loadSquads();
      if (squads.length === 0) {
        vscode.window.showWarningMessage('No agents registered.');
        return;
      }

      const number = issue?.number ?? adoItem?.id;
      const title = issue?.title ?? adoItem?.title ?? '';
      const url = issue?.url ?? adoItem?.url ?? '';

      const pick = await vscode.window.showQuickPick(
        squads.map(s => ({ label: `${s.icon} ${s.name}`, description: s.universe, squad: s })),
        { placeHolder: `Launch agent for #${number} ${title}` },
      );
      if (!pick) return;

      const cfg = pick.squad;
      const rawName = `#${number} ${title}`;
      launchAndLabel(terminalManager, labelManager, cfg, rawName);

      if (url) {
        await vscode.env.clipboard.writeText(url);
        vscode.window.showInformationMessage(`Copied ${url} to clipboard`);
      }
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

  // Go to Work Item (context menu on work items)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.goToWorkItem', async (item?: WorkItemsTreeItem) => {
      const url = item?.issue?.url ?? item?.adoWorkItem?.url;
      if (url) await vscode.env.openExternal(vscode.Uri.parse(url));
    }),
  );

  // Launch from PR (context menu on PRs)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.launchFromPR', async (item?: PRsTreeItem) => {
      const pr = item?.pr;
      const adoPR = item?.adoPR;
      if (!pr && !adoPR) return;

      const squads = registry.loadSquads();
      if (squads.length === 0) {
        vscode.window.showWarningMessage('No agents registered.');
        return;
      }

      const number = pr?.number ?? adoPR?.id;
      const title = pr?.title ?? adoPR?.title ?? '';
      const url = pr?.url ?? adoPR?.url ?? '';

      const pick = await vscode.window.showQuickPick(
        squads.map(s => ({ label: `${s.icon} ${s.name}`, description: s.universe, squad: s })),
        { placeHolder: `Launch agent for PR #${number} ${title}` },
      );
      if (!pick) return;

      const cfg = pick.squad;
      const rawName = `PR #${number} ${title}`;
      launchAndLabel(terminalManager, labelManager, cfg, rawName);

      if (url) {
        await vscode.env.clipboard.writeText(url);
        vscode.window.showInformationMessage(`Copied ${url} to clipboard`);
      }
    }),
  );

  // Go to PR in Browser(context menu on PRs)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.goToPRInBrowser', async (item?: PRsTreeItem) => {
      const url = item?.pr?.url ?? item?.adoPR?.url;
      if (url) await vscode.env.openExternal(vscode.Uri.parse(url));
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
          { label: '$(organization) Squad', description: 'Initialize a new Squad project', value: 'squad' as const },
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

  // Add Agent — pick personal vs workspace location, then create
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.addAgent', async () => {
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

      type LocationValue = 'personal' | 'project';
      const locationItems: { label: string; description: string; value: LocationValue }[] = [
        { label: '$(account) Personal agent', description: '~/.copilot/agents/', value: 'personal' },
        { label: '$(root-folder) Project agent', description: '.github/agents/ in a project directory', value: 'project' },
      ];
      const locationPick = await vscode.window.showQuickPick(locationItems, {
        placeHolder: 'Where should the agent live?',
      });
      if (!locationPick) return;

      let agentsDir: string;
      let projectRoot: string | undefined;

      if (locationPick.value === 'personal') {
        agentsDir = path.join(os.homedir(), '.copilot', 'agents');
      } else {
        const picked = await vscode.window.showOpenDialog({
          canSelectFolders: true,
          canSelectFiles: false,
          canSelectMany: false,
          openLabel: 'Select project root',
          title: 'Select the project root directory',
        });
        if (!picked || picked.length === 0) return;
        projectRoot = picked[0].fsPath;
        agentsDir = path.join(projectRoot, '.github', 'agents');
      }

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

      try {
        fs.writeFileSync(filePath, template, 'utf-8');
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to create agent file: ${err instanceof Error ? err.message : err}`);
        return;
      }
      const doc = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(doc);

      const agentId = name.trim().replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[\s_]+/g, '-').toLowerCase();
      registry.addSquads([{
        id: agentId,
        name: name.trim(),
        path: projectRoot ?? agentsDir,
        icon: '🤖',
        universe: 'standalone',
      }]);
      refreshDiscovery();
      treeProvider.refresh();
    }),
  );

  // Add Squad — open a folder picker, git init, and run squad init in a terminal
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.addSquad', async () => {
      const { checkNpxAvailable, promptInstallNode, isSquadInitialized } = await import('./squad-utils');
      
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

      if (isSquadInitialized(dirPath)) {
        // Already initialized — discover and register without running a terminal
        const parentDir = path.dirname(dirPath);
        const discovered = discoverAgentTeams(parentDir, registry.loadSquads());
        const match = discovered.filter(s => s.path.toLowerCase() === dirPath.toLowerCase());
        if (match.length > 0) {
          registry.addSquads(match);
          treeProvider.refresh();
        } else {
          const existing = registry.loadSquads();
          const alreadyRegistered = existing.some(s => s.path.toLowerCase() === dirPath.toLowerCase());
          if (!alreadyRegistered) {
            const folderName = path.basename(dirPath);
            registry.addSquads([{
              id: folderName.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[\s_]+/g, '-').toLowerCase(),
              name: folderName,
              path: dirPath,
              icon: '🔷',
              universe: 'unknown',
            }]);
            treeProvider.refresh();
          }
        }
        return;
      }

      const terminal = vscode.window.createTerminal({
        name: `Squad Init: ${path.basename(dirPath)}`,
        cwd: dirPath,
        hideFromUser: true,
      });
      terminal.sendText('git init && npx -y github:bradygaster/squad init; exit');

      const listener = vscode.window.onDidCloseTerminal(closedTerminal => {
        if (closedTerminal !== terminal) { return; }
        listener.dispose();

        const parentDir = path.dirname(dirPath);
        const discovered = discoverAgentTeams(parentDir, registry.loadSquads());
        const match = discovered.filter(s => s.path.toLowerCase() === dirPath.toLowerCase());
        if (match.length > 0) {
          registry.addSquads(match);
          treeProvider.refresh();
        } else if (resolveTeamDir(dirPath)) {
          const existing = registry.loadSquads();
          const alreadyRegistered = existing.some(s => s.path.toLowerCase() === dirPath.toLowerCase());
          if (!alreadyRegistered) {
            const folderName = path.basename(dirPath);
            registry.addSquads([{
              id: folderName.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[\s_]+/g, '-').toLowerCase(),
              name: folderName,
              path: dirPath,
              icon: '🔷',
              universe: 'unknown',
            }]);
            treeProvider.refresh();
          }
        }
      });
      context.subscriptions.push(listener);
    }),
  );

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
