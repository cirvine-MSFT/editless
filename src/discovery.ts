import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AgentTeamConfig } from './types';
import { EditlessRegistry } from './registry';
import { resolveTeamMd, resolveTeamDir, TEAM_DIR_NAMES } from './team-dir';

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

export function parseTeamMd(content: string, folderName: string): Pick<AgentTeamConfig, 'name' | 'description' | 'universe'> {
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

/**
 * Read the universe name from casting/registry.json inside the squad directory.
 * Checks .squad/ then .ai-team/ (same priority as team.md resolution).
 * Returns the universe of the first active agent, or undefined if unavailable.
 */
export function readUniverseFromRegistry(squadPath: string): string | undefined {
  for (const dirName of TEAM_DIR_NAMES) {
    const registryPath = path.join(squadPath, dirName, 'casting', 'registry.json');
    try {
      const raw = fs.readFileSync(registryPath, 'utf-8');
      const data = JSON.parse(raw) as { agents?: Record<string, { status?: string; universe?: string }> };
      if (data?.agents) {
        for (const agent of Object.values(data.agents)) {
          if (agent.status === 'active' && agent.universe) {
            return agent.universe;
          }
        }
      }
    } catch {
      // File doesn't exist or is malformed — try next directory
    }
  }
  return undefined;
}

export function toKebabCase(name: string): string {
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
    const teamMdPath = resolveTeamMd(folderPath);

    if (!teamMdPath) { continue; }

    if (existingPaths.has(folderPath.toLowerCase())) { continue; }

    const content = fs.readFileSync(teamMdPath, 'utf-8');
    const parsed = parseTeamMd(content, entry.name);
    const universe = parsed.universe === 'unknown'
      ? (readUniverseFromRegistry(folderPath) ?? 'unknown')
      : parsed.universe;

    discovered.push({
      id: toKebabCase(entry.name),
      name: parsed.name,
      description: parsed.description,
      path: folderPath,
      icon: '🔷',
      universe,
      agentFlag: 'squad',
    });
  }

  return discovered;
}


export async function promptAndAddSquads(
  discovered: AgentTeamConfig[],
  registry: EditlessRegistry,
): Promise<void> {
  if (discovered.length === 0) {
    vscode.window.showInformationMessage('No new agents found.');
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
    placeHolder: 'Select agents to add to registry',
  });

  if (!selected || selected.length === 0) { return; }

  registry.addSquads(selected.map(i => i.squad));
  vscode.window.showInformationMessage(`Added ${selected.length} agent(s) to registry.`);
}



/**
 * Auto-register squads found at workspace roots.
 * If a workspace folder contains .ai-team/ or .squad/ with a team.md,
 * silently add it to the registry so the tree view populates immediately.
 */
export function autoRegisterWorkspaceSquads(registry: EditlessRegistry): void {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) { return; }

  const existing = registry.loadSquads();
  const existingPaths = new Set(existing.map(s => s.path.toLowerCase()));

  const toAdd: AgentTeamConfig[] = [];

  for (const folder of folders) {
    const folderPath = folder.uri.fsPath;
    if (existingPaths.has(folderPath.toLowerCase())) {
      // When team.md appears for an already-registered "unknown" squad, update it
      const existingSquad = existing.find(s => s.path.toLowerCase() === folderPath.toLowerCase());
      if (existingSquad?.universe === 'unknown') {
        const teamMdPath = resolveTeamMd(folderPath);
        if (teamMdPath) {
          const content = fs.readFileSync(teamMdPath, 'utf-8');
          const parsed = parseTeamMd(content, folder.name);
          const universe = parsed.universe === 'unknown'
            ? (readUniverseFromRegistry(folderPath) ?? 'unknown')
            : parsed.universe;
          registry.updateSquad(existingSquad.id, { ...parsed, universe });
        }
      }
      continue;
    }

    const teamMdPath = resolveTeamMd(folderPath);
    if (teamMdPath) {
      const content = fs.readFileSync(teamMdPath, 'utf-8');
      const parsed = parseTeamMd(content, folder.name);
      const universe = parsed.universe === 'unknown'
        ? (readUniverseFromRegistry(folderPath) ?? 'unknown')
        : parsed.universe;

      toAdd.push({
        id: toKebabCase(folder.name),
        name: parsed.name,
        description: parsed.description,
        path: folderPath,
        icon: '🔷',
        universe,
        agentFlag: 'squad',
      });
    } else if (resolveTeamDir(folderPath)) {
      // squad init creates .ai-team/ before the coordinator writes team.md
      toAdd.push({
        id: toKebabCase(folder.name),
        name: folder.name,
        path: folderPath,
        icon: '🔷',
        universe: readUniverseFromRegistry(folderPath) ?? 'unknown',
        agentFlag: 'squad',
      });
    }
  }

  if (toAdd.length > 0) {
    registry.addSquads(toAdd);
  }
}


