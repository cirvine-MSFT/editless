import * as vscode from 'vscode';
import type { AgentSettingsManager } from '../agent-settings';
import type { TerminalManager } from '../terminal-manager';
import type { SessionLabelManager } from '../session-labels';
import { WorkItemsTreeItem, type UnifiedState, type LevelFilter } from '../work-items-tree';
import type { WorkItemsTreeProvider } from '../work-items-tree';
import { PRsTreeItem, type PRLevelFilter } from '../prs-tree';
import type { PRsTreeProvider } from '../prs-tree';
import { fetchLinkedPRs } from '../github-client';
import { toAgentTeamConfig } from '../unified-discovery';
import type { DiscoveredItem } from '../unified-discovery';
import { getAdoToken, promptAdoSignIn } from '../ado-auth';
import { fetchAdoWorkItems, fetchAdoPRs, fetchAdoMe } from '../ado-client';
import { launchAndLabel } from '../launch-utils';

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

      const quickPickItems: vscode.QuickPickItem[] = [];

      // Owners (GitHub backend)
      if (options.owners && options.owners.length > 0) {
        quickPickItems.push({ label: 'Owners', kind: vscode.QuickPickItemKind.Separator });
        for (const owner of options.owners) {
          quickPickItems.push({ label: owner, description: 'owner', picked: currentFilter.selectedChildren?.includes(owner) });
        }
      }

      // Orgs (ADO backend)
      if (options.orgs && options.orgs.length > 0) {
        quickPickItems.push({ label: 'Organizations', kind: vscode.QuickPickItemKind.Separator });
        for (const org of options.orgs) {
          quickPickItems.push({ label: org, description: 'org', picked: currentFilter.selectedChildren?.includes(org) });
        }
      }

      // Projects (ADO org)
      if (options.projects && options.projects.length > 0) {
        quickPickItems.push({ label: 'Projects', kind: vscode.QuickPickItemKind.Separator });
        for (const project of options.projects) {
          quickPickItems.push({ label: project, description: 'project', picked: currentFilter.selectedChildren?.includes(project) });
        }
      }

      // Repos (GitHub org)
      if (options.repos && options.repos.length > 0) {
        quickPickItems.push({ label: 'Repositories', kind: vscode.QuickPickItemKind.Separator });
        for (const repo of options.repos) {
          quickPickItems.push({ label: repo, description: 'repo', picked: currentFilter.selectedChildren?.includes(repo) });
        }
      }

      // Types (ADO project)
      if (options.types && options.types.length > 0) {
        quickPickItems.push({ label: 'Type', kind: vscode.QuickPickItemKind.Separator });
        for (const type of options.types) {
          quickPickItems.push({ label: type, description: 'type', picked: currentFilter.types?.includes(type) });
        }
      }

      // Labels (GitHub repo)
      if (options.labels && options.labels.length > 0) {
        quickPickItems.push({ label: 'Labels', kind: vscode.QuickPickItemKind.Separator });
        for (const label of options.labels) {
          quickPickItems.push({ label, description: 'label', picked: currentFilter.labels?.includes(label) });
        }
      }

      // Tags (ADO project)
      if (options.tags && options.tags.length > 0) {
        quickPickItems.push({ label: 'Tags', kind: vscode.QuickPickItemKind.Separator });
        for (const tag of options.tags) {
          quickPickItems.push({ label: tag, description: 'tag', picked: currentFilter.tags?.includes(tag) });
        }
      }

      // States
      if (options.states && options.states.length > 0) {
        quickPickItems.push({ label: 'State', kind: vscode.QuickPickItemKind.Separator });
        const stateLabels = { open: 'Open (New)', active: 'Active / In Progress', closed: 'Closed' };
        for (const state of options.states) {
          quickPickItems.push({ label: stateLabels[state], description: 'state', picked: currentFilter.states?.includes(state) });
        }
      }

      if (quickPickItems.length === 0) {
        vscode.window.showInformationMessage('No filter options available for this level');
        return;
      }

      const picks = await vscode.window.showQuickPick(quickPickItems, {
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
    vscode.commands.registerCommand('editless.launchFromWorkItem', async (item?: WorkItemsTreeItem) => {
      const issue = item?.issue;
      const adoItem = item?.adoWorkItem;
      if (!issue && !adoItem) return;

      const discoveredItems = getDiscoveredItems();
      const visibleItems = discoveredItems.filter(d => !agentSettings.isHidden(d.id));
      if (visibleItems.length === 0) {
        vscode.window.showWarningMessage('No agents discovered.');
        return;
      }

      const number = issue?.number ?? adoItem?.id;
      const title = issue?.title ?? adoItem?.title ?? '';
      const url = issue?.url ?? adoItem?.url ?? '';

      const pick = await vscode.window.showQuickPick(
        visibleItems.map(d => {
          const settings = agentSettings.get(d.id);
          return {
            label: `${d.type === 'squad' ? (settings?.icon ?? '🔷') : '🤖'} ${settings?.name ?? d.name}`,
            description: d.universe ?? d.source,
            disc: d,
          };
        }),
        { placeHolder: `Launch agent for #${number} ${title}` },
      );
      if (!pick) return;

      const d = pick.disc;
      const settings = agentSettings.get(d.id);
      const cfg = toAgentTeamConfig(d, settings);
      const rawName = `#${number} ${title}`;
      launchAndLabel(terminalManager, labelManager, cfg, rawName);

      if (url) {
        await vscode.env.clipboard.writeText(url);
        vscode.window.showInformationMessage(`Copied ${url} to clipboard`);
      }
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

      const discoveredItems = getDiscoveredItems();
      const visibleItems = discoveredItems.filter(d => !agentSettings.isHidden(d.id));
      if (visibleItems.length === 0) {
        vscode.window.showWarningMessage('No agents discovered.');
        return;
      }

      const number = pr?.number ?? adoPR?.id;
      const title = pr?.title ?? adoPR?.title ?? '';
      const url = pr?.url ?? adoPR?.url ?? '';

      const pick = await vscode.window.showQuickPick(
        visibleItems.map(d => {
          const settings = agentSettings.get(d.id);
          return {
            label: `${d.type === 'squad' ? (settings?.icon ?? '🔷') : '🤖'} ${settings?.name ?? d.name}`,
            description: d.universe ?? d.source,
            disc: d,
          };
        }),
        { placeHolder: `Launch agent for PR #${number} ${title}` },
      );
      if (!pick) return;

      const d = pick.disc;
      const settings = agentSettings.get(d.id);
      const cfg = toAgentTeamConfig(d, settings);
      const rawName = `PR #${number} ${title}`;
      launchAndLabel(terminalManager, labelManager, cfg, rawName);

      if (url) {
        await vscode.env.clipboard.writeText(url);
        vscode.window.showInformationMessage(`Copied ${url} to clipboard`);
      }
    }),
  );

  // Go to PR in Browser (context menu on PRs)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.goToPRInBrowser', async (item?: PRsTreeItem) => {
      const url = item?.pr?.url ?? item?.adoPR?.url;
      if (url) await vscode.env.openExternal(vscode.Uri.parse(url));
    }),
  );
}
