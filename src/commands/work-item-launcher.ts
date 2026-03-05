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
  const url = issue?.url ?? adoItem?.url ?? '';
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
  if (!pick.disc) {
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    launchAndLabel(terminalManager, labelManager, buildCopilotCLIConfig(cwd), rawName, env);
  } else {
    const settings = agentSettings.get(pick.disc.id);
    const cfg = toAgentTeamConfig(pick.disc, settings);
    launchAndLabel(terminalManager, labelManager, cfg, rawName, env);
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
  if (!pick.disc) {
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    launchAndLabel(terminalManager, labelManager, buildCopilotCLIConfig(cwd), rawName, env);
  } else {
    const settings = agentSettings.get(pick.disc.id);
    const cfg = toAgentTeamConfig(pick.disc, settings);
    launchAndLabel(terminalManager, labelManager, cfg, rawName, env);
  }

  if (url) {
    await vscode.env.clipboard.writeText(url);
    vscode.window.showInformationMessage(`Copied ${url} to clipboard`);
  }
}
