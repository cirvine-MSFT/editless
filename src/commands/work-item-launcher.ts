import * as vscode from 'vscode';
import type { AgentSettingsManager } from '../agent-settings';
import type { TerminalManager } from '../terminal-manager';
import type { SessionLabelManager } from '../session-labels';
import type { DiscoveredItem } from '../unified-discovery';
import { toAgentTeamConfig } from '../unified-discovery';
import { buildCopilotCLIConfig } from '../editless-tree';
import { launchAndLabel } from '../launch-utils';
import type { WorkItemsTreeItem } from '../work-items-tree';
import type { PRsTreeItem } from '../prs-tree';

export interface LauncherDeps {
  agentSettings: AgentSettingsManager;
  terminalManager: TerminalManager;
  labelManager: SessionLabelManager;
  getDiscoveredItems: () => DiscoveredItem[];
}

function normalizePromptTitle(title: string | undefined): string {
  return title?.replace(/\s+/g, ' ').trim() ?? '';
}

function formatInitialPrompt(prefix: string, id: string | number | undefined, title: string | undefined): string | undefined {
  const normalizedId = id === undefined ? '' : String(id).trim();
  const normalizedTitle = normalizePromptTitle(title);

  if (normalizedId && normalizedTitle) {
    return `${prefix}#${normalizedId}: ${normalizedTitle}`;
  }
  if (normalizedTitle) {
    return normalizedTitle;
  }
  return normalizedId ? `${prefix}#${normalizedId}` : undefined;
}

function abbreviateAdoWorkItemType(type: string | undefined): string {
  const normalizedType = type?.trim();
  if (!normalizedType) return 'WI';

  switch (normalizedType.toLowerCase()) {
    case 'user story':
      return 'US';
    case 'product backlog item':
      return 'PBI';
    default: {
      const parts = normalizedType.split(/\s+/).filter(Boolean);
      return parts.length > 1
        ? parts.map(part => part[0]?.toUpperCase() ?? '').join('')
        : normalizedType;
    }
  }
}

function buildWorkItemInitialPrompt(item: WorkItemsTreeItem | undefined): string | undefined {
  const issue = item?.issue;
  const adoItem = item?.adoWorkItem;
  const localTask = item?.localTask;

  if (issue) {
    return formatInitialPrompt('Issue', issue.number, issue.title);
  }
  if (adoItem) {
    return formatInitialPrompt(abbreviateAdoWorkItemType(adoItem.type), adoItem.id, adoItem.title);
  }
  if (localTask) {
    return formatInitialPrompt('Task', localTask.id, localTask.title);
  }
  return undefined;
}

function buildPrInitialPrompt(item: PRsTreeItem | undefined): string | undefined {
  const pr = item?.pr;
  const adoPR = item?.adoPR;
  const number = pr?.number ?? adoPR?.id;
  const title = pr?.title ?? adoPR?.title;
  return formatInitialPrompt('PR', number, title);
}

/** Launch a Copilot session from a work item (issue, ADO item, or local task). */
export async function launchFromWorkItem(deps: LauncherDeps, item?: WorkItemsTreeItem): Promise<void> {
  const issue = item?.issue;
  const adoItem = item?.adoWorkItem;
  const localTask = item?.localTask;
  if (!issue && !adoItem && !localTask) return;

  const { agentSettings, terminalManager, labelManager, getDiscoveredItems } = deps;
  const discoveredItems = getDiscoveredItems();
  const visibleItems = discoveredItems.filter(d => !agentSettings.isHidden(d.id));

  const number = issue?.number ?? adoItem?.id;
  const title = issue?.title ?? adoItem?.title ?? localTask?.title ?? '';
  const localPath = localTask?.filePath;
  const url = issue?.url ?? adoItem?.url ?? (localPath ? vscode.Uri.file(localPath).toString() : '');
  const displayLabel = localTask ? localTask.title : `#${number} ${title}`;

  const cliItem = {
    label: '$(terminal) Copilot CLI',
    description: 'standalone',
    disc: undefined as DiscoveredItem | undefined,
  };
  const discoveredPicks = visibleItems.map(d => {
    const settings = agentSettings.get(d.id);
    return {
      label: `${d.type === 'squad' ? (settings?.icon ?? '🔷') : '🤖'} ${settings?.name ?? d.name}`,
      description: d.universe ?? d.source,
      disc: d as DiscoveredItem | undefined,
    };
  });
  const pick = await vscode.window.showQuickPick(
    [cliItem, ...discoveredPicks],
    { placeHolder: `Launch agent for ${displayLabel}` },
  );
  if (!pick) return;

  const rawName = localTask ? localTask.title : `#${number} ${title}`;
  const env = url ? { EDITLESS_WORK_ITEM_URI: url } : undefined;
  const initialPrompt = buildWorkItemInitialPrompt(item);
  if (!pick.disc) {
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    launchAndLabel(terminalManager, labelManager, buildCopilotCLIConfig(cwd), rawName, env, initialPrompt);
  } else {
    const settings = agentSettings.get(pick.disc.id);
    const cfg = toAgentTeamConfig(pick.disc, settings);
    launchAndLabel(terminalManager, labelManager, cfg, rawName, env, initialPrompt);
  }

  if (localTask?.filePath) {
    await vscode.env.clipboard.writeText(localTask.filePath);
    vscode.window.showInformationMessage(`Copied ${localTask.filePath} to clipboard`);
  } else if (url) {
    await vscode.env.clipboard.writeText(url);
    vscode.window.showInformationMessage(`Copied ${url} to clipboard`);
  }
}

/** Launch a Copilot session from a pull request. */
export async function launchFromPR(deps: LauncherDeps, item?: PRsTreeItem): Promise<void> {
  const pr = item?.pr;
  const adoPR = item?.adoPR;
  if (!pr && !adoPR) return;

  const { agentSettings, terminalManager, labelManager, getDiscoveredItems } = deps;
  const discoveredItems = getDiscoveredItems();
  const visibleItems = discoveredItems.filter(d => !agentSettings.isHidden(d.id));

  const number = pr?.number ?? adoPR?.id;
  const title = pr?.title ?? adoPR?.title ?? '';
  const url = pr?.url ?? adoPR?.url ?? '';

  const cliItem = {
    label: '$(terminal) Copilot CLI',
    description: 'standalone',
    disc: undefined as DiscoveredItem | undefined,
  };
  const discoveredPicks = visibleItems.map(d => {
    const settings = agentSettings.get(d.id);
    return {
      label: `${d.type === 'squad' ? (settings?.icon ?? '🔷') : '🤖'} ${settings?.name ?? d.name}`,
      description: d.universe ?? d.source,
      disc: d as DiscoveredItem | undefined,
    };
  });
  const pick = await vscode.window.showQuickPick(
    [cliItem, ...discoveredPicks],
    { placeHolder: `Launch agent for PR #${number} ${title}` },
  );
  if (!pick) return;

  const rawName = `PR #${number} ${title}`;
  const env = url ? { EDITLESS_WORK_ITEM_URI: url } : undefined;
  const initialPrompt = buildPrInitialPrompt(item);
  if (!pick.disc) {
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    launchAndLabel(terminalManager, labelManager, buildCopilotCLIConfig(cwd), rawName, env, initialPrompt);
  } else {
    const settings = agentSettings.get(pick.disc.id);
    const cfg = toAgentTeamConfig(pick.disc, settings);
    launchAndLabel(terminalManager, labelManager, cfg, rawName, env, initialPrompt);
  }

  if (url) {
    await vscode.env.clipboard.writeText(url);
    vscode.window.showInformationMessage(`Copied ${url} to clipboard`);
  }
}
