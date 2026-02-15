import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AgentTeamConfig } from './types';
import { EditlessRegistry } from './registry';

const TEAM_ROSTER_PREFIX = /^team\s+roster\s*[—\-:]\s*(.+)$/i;

function normalizeSquadName(name: string, fallback: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return fallback;
  }

  const prefixed = trimmed.match(TEAM_ROSTER_PREFIX);
  if (prefixed?.[1]?.trim()) {
    return prefixed[1].trim();
  }

  if (/^team\s+roster$/i.test(trimmed)) {
    return fallback;
  }

  return trimmed;
}

function parseTeamMd(content: string, folderName: string): Pick<AgentTeamConfig, 'name' | 'description' | 'universe'> {
  let name = folderName;
  let description: string | undefined;
  let universe = 'unknown';

  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) {
    name = normalizeSquadName(headingMatch[1], folderName);
  }

  const blockquoteMatch = content.match(/^>\s+(.+)$/m);
  if (blockquoteMatch) {
    description = blockquoteMatch[1].trim();
  }

  const universeMatch = content.match(/\*\*Universe:\*\*\s*(.+)$/m);
  if (universeMatch) {
    universe = universeMatch[1].trim();
  }

  return { name, description, universe };
}

function toKebabCase(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

export function discoverAgentTeams(dirPath: string, existingSquads: AgentTeamConfig[]): AgentTeamConfig[] {
  const discovered: AgentTeamConfig[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return discovered;
  }

  const existingPaths = new Set(
    existingSquads.map(s => s.path.toLowerCase()),
  );

  for (const entry of entries) {
    if (!entry.isDirectory()) { continue; }

    const folderPath = path.resolve(dirPath, entry.name);
    const teamMdPath = path.join(folderPath, '.ai-team', 'team.md');

    if (!fs.existsSync(teamMdPath)) { continue; }

    if (existingPaths.has(folderPath.toLowerCase())) { continue; }

    const content = fs.readFileSync(teamMdPath, 'utf-8');
    const parsed = parseTeamMd(content, entry.name);

    discovered.push({
      id: toKebabCase(entry.name),
      name: parsed.name,
      description: parsed.description,
      path: folderPath,
      icon: '🔷',
      universe: parsed.universe,
      launchCommand: 'agency copilot --agent squad --yolo -s',
    });
  }

  return discovered;
}

export async function promptAndAddSquads(
  discovered: AgentTeamConfig[],
  registry: EditlessRegistry,
): Promise<void> {
  if (discovered.length === 0) {
    vscode.window.showInformationMessage('No new squads found.');
    return;
  }

  const items: (vscode.QuickPickItem & { squad: AgentTeamConfig })[] = discovered.map(s => ({
    label: `${s.icon} ${s.name}`,
    description: s.path,
    detail: `Universe: ${s.universe}`,
    picked: true,
    squad: s,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    placeHolder: 'Select squads to add to registry',
  });

  if (!selected || selected.length === 0) { return; }

  registry.addSquads(selected.map(i => i.squad));
  vscode.window.showInformationMessage(`Added ${selected.length} squad(s) to registry.`);
}

export function registerDiscoveryCommand(
  context: vscode.ExtensionContext,
  registry: EditlessRegistry,
): vscode.Disposable {
  const disposable = vscode.commands.registerCommand('editless.discoverSquads', async () => {
    const config = vscode.workspace.getConfiguration('editless');
    const discoveryDir = config.get<string>('discoveryDir', '');

    let dirPath: string | undefined;

    if (discoveryDir) {
      dirPath = discoveryDir;
    } else {
      const uris = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: 'Select directory to scan for squads',
      });
      dirPath = uris?.[0]?.fsPath;
    }

    if (!dirPath) { return; }

    registry.loadSquads();
    const discovered = discoverAgentTeams(dirPath, registry.loadSquads());
    await promptAndAddSquads(discovered, registry);
  });

  context.subscriptions.push(disposable);
  return disposable;
}

export function checkDiscoveryOnStartup(
  context: vscode.ExtensionContext,
  registry: EditlessRegistry,
): void {
  const config = vscode.workspace.getConfiguration('editless');
  const discoveryDir = config.get<string>('discoveryDir', '');

  if (!discoveryDir) { return; }

  const existing = registry.loadSquads();
  const discovered = discoverAgentTeams(discoveryDir, existing);

  if (discovered.length === 0) { return; }

  vscode.window
    .showInformationMessage(
      `Found ${discovered.length} new squad(s) in discovery directory. Add them?`,
      'Add',
      'Dismiss',
    )
    .then(action => {
      if (action === 'Add') {
        promptAndAddSquads(discovered, registry);
      }
    });
}
