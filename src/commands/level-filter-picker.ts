import * as vscode from 'vscode';
import type { WorkItemsTreeItem, UnifiedState, LevelFilter } from '../work-items-tree';
import type { WorkItemsTreeProvider } from '../work-items-tree';
import type { PRsTreeItem, PRLevelFilter } from '../prs-tree';
import type { PRsTreeProvider } from '../prs-tree';

/**
 * Build and show a multi-select QuickPick for per-level work-item filtering (#390).
 * Populates options dynamically based on the node's available owners, orgs,
 * repos, labels, tags, types, and states.
 */
export async function buildLevelFilterPicker(
  workItemsProvider: WorkItemsTreeProvider,
  item: WorkItemsTreeItem,
): Promise<void> {
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
    const isLocal = contextValue.replace(/-filtered$/, '').startsWith('local-');
    const stateLabels = isLocal
      ? { open: 'Todo', active: 'Active (has session)', closed: 'Done' }
      : { open: 'Open (New)', active: 'Active / In Progress', closed: 'Closed' };
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
  const isLocalReverse = contextValue.replace(/-filtered$/, '').startsWith('local-');
  const stateLabels = isLocalReverse
    ? { 'Todo': 'open', 'Active (has session)': 'active', 'Done': 'closed' }
    : { 'Open (New)': 'open', 'Active / In Progress': 'active', 'Closed': 'closed' };
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
}

/**
 * Build and show a multi-select QuickPick for per-level PR filtering (#390).
 * Populates options dynamically based on the node's available owners, orgs,
 * repos, statuses, and labels.
 */
export async function buildPRLevelFilterPicker(
  prsProvider: PRsTreeProvider,
  item: PRsTreeItem,
): Promise<void> {
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
}
