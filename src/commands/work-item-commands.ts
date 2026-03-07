import * as vscode from 'vscode';
import type { AgentSettingsManager } from '../agent-settings';
import type { TerminalManager } from '../terminal-manager';
import type { SessionLabelManager } from '../session-labels';
import { WorkItemsTreeItem } from '../work-items-tree';
import type { WorkItemsTreeProvider } from '../work-items-tree';
import { PRsTreeItem } from '../prs-tree';
import type { PRsTreeProvider } from '../prs-tree';
import { fetchLinkedPRs } from '../github-client';
import type { DiscoveredItem } from '../unified-discovery';
import { promptAdoSignIn } from '../ado-auth';
import { buildLevelFilterPicker, buildPRLevelFilterPicker } from './level-filter-picker';
import { launchFromWorkItem, launchFromPR } from './work-item-launcher';

export interface WorkItemCommandDeps {
  agentSettings: AgentSettingsManager;
  terminalManager: TerminalManager;
  labelManager: SessionLabelManager;
  workItemsProvider: WorkItemsTreeProvider;
  prsProvider: PRsTreeProvider;
  getDiscoveredItems: () => DiscoveredItem[];
  initAdoIntegration: () => Promise<void>;
}

export function register(context: vscode.ExtensionContext, deps: WorkItemCommandDeps): void {
  const {
    agentSettings, terminalManager, labelManager,
    workItemsProvider, prsProvider, getDiscoveredItems,
    initAdoIntegration,
  } = deps;

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
      workItemsProvider.setFilter({ repos, labels: [], states: [], types: [], projects: [] });
    }),
    vscode.commands.registerCommand('editless.clearWorkItemsFilter', () => {
      workItemsProvider.clearFilter();
      workItemsProvider.clearAllLevelFilters();
    }),
    // Per-level filtering (#390)
    vscode.commands.registerCommand('editless.filterLevel', (item: WorkItemsTreeItem) =>
      buildLevelFilterPicker(workItemsProvider, item),
    ),
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
      prsProvider.setFilter({ repos, labels: [], statuses: [], author: prsProvider.filter.author, projects: [] });
    }),
    vscode.commands.registerCommand('editless.clearPRsFilter', () => {
      prsProvider.clearFilter();
      prsProvider.clearAllLevelFilters();
    }),
    // Per-level filtering (#390)
    vscode.commands.registerCommand('editless.filterPRLevel', (item: PRsTreeItem) =>
      buildPRLevelFilterPicker(prsProvider, item),
    ),
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

  // Configure Local Tasks (opens settings)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.configureLocalTasks', async () => {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'editless.local');
    }),
  );

  // Open local task file in editor
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.openTaskFile', async (item?: WorkItemsTreeItem) => {
      const filePath = item?.localTask?.filePath;
      if (filePath) {
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);
      }
    }),
  );

  // Configure Work Items (quick pick between GitHub and ADO)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.configureWorkItems', async () => {
      const choice = await vscode.window.showQuickPick(
        [
          { label: 'GitHub', description: 'Configure GitHub repositories for work items', command: 'editless.configureRepos' },
          { label: 'Azure DevOps', description: 'Configure Azure DevOps project', command: 'editless.configureAdo' },
          { label: 'Local Tasks', description: 'Configure local task file directories', command: 'editless.configureLocalTasks' },
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
        initAdoIntegration();
      }
    }),
  );

  // Sign in to ADO (triggers Microsoft auth flow)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.adoSignIn', async () => {
      const token = await promptAdoSignIn();
      if (token) {
        vscode.window.showInformationMessage('Signed in to Azure DevOps. Refreshing...');
        initAdoIntegration();
      }
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
    vscode.commands.registerCommand('editless.launchFromWorkItem', (item?: WorkItemsTreeItem) =>
      launchFromWorkItem({ agentSettings, terminalManager, labelManager, getDiscoveredItems }, item),
    ),
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
    vscode.commands.registerCommand('editless.launchFromPR', (item?: PRsTreeItem) =>
      launchFromPR({ agentSettings, terminalManager, labelManager, getDiscoveredItems }, item),
    ),
  );

  // Go to PR in Browser (context menu on PRs)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.goToPRInBrowser', async (item?: PRsTreeItem) => {
      const url = item?.pr?.url ?? item?.adoPR?.url;
      if (url) await vscode.env.openExternal(vscode.Uri.parse(url));
    }),
  );
}
