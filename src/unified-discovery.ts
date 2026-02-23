import * as fs from 'fs';
import * as path from 'path';
import { discoverAgentsInWorkspace, discoverAgentsInCopilotDir } from './agent-discovery';
import { discoverAgentTeams, parseTeamMd, toKebabCase, readUniverseFromRegistry } from './discovery';
import { resolveTeamMd } from './team-dir';
import type { EditlessRegistry } from './registry';
import type { AgentTeamConfig } from './types';

/** A single discovered item — either a standalone agent or a squad. */
export interface DiscoveredItem {
  id: string;
  name: string;
  type: 'agent' | 'squad';
  source: 'workspace' | 'copilot-dir';
  path: string;
  description?: string;
  /** Squad-specific: universe parsed from team.md */
  universe?: string;
}

interface WorkspaceFolder {
  uri: { fsPath: string };
}

/**
 * Unified discovery — scans workspace folders for both agents AND squads,
 * plus ~/.config/copilot/agents/ (and ~/.copilot/agents/) for personal agent library.
 * Returns DiscoveredItem[] minus already-registered items.
 */
export function discoverAll(
  workspaceFolders: readonly WorkspaceFolder[],
  registry: EditlessRegistry,
): DiscoveredItem[] {
  const registered = registry.loadSquads();
  const registeredIds = new Set(registered.map(s => s.id));
  const registeredPaths = new Set(registered.map(s => s.path.toLowerCase()));

  const items: DiscoveredItem[] = [];
  const seenIds = new Set<string>();

  // --- Agent discovery (workspace + copilot-dir) ---
  const wsAgents = discoverAgentsInWorkspace(workspaceFolders);
  const copilotAgents = discoverAgentsInCopilotDir();

  // Workspace agents first (win on dedup)
  for (const agent of wsAgents) {
    if (registeredIds.has(agent.id) || seenIds.has(agent.id)) { continue; }
    seenIds.add(agent.id);
    items.push({
      id: agent.id,
      name: agent.name,
      type: 'agent',
      source: agent.source,
      path: agent.filePath,
      description: agent.description,
    });
  }
  for (const agent of copilotAgents) {
    if (registeredIds.has(agent.id) || seenIds.has(agent.id)) { continue; }
    seenIds.add(agent.id);
    items.push({
      id: agent.id,
      name: agent.name,
      type: 'agent',
      source: agent.source,
      path: agent.filePath,
      description: agent.description,
    });
  }

  // --- Squad discovery: workspace folder itself ---
  for (const folder of workspaceFolders) {
    const folderPath = folder.uri.fsPath;
    const teamMdPath = resolveTeamMd(folderPath);
    if (teamMdPath) {
      const folderName = path.basename(folderPath);
      const id = toKebabCase(folderName);
      if (!registeredIds.has(id) && !seenIds.has(id) && !registeredPaths.has(folderPath.toLowerCase())) {
        const content = fs.readFileSync(teamMdPath, 'utf-8');
        const parsed = parseTeamMd(content, folderName);
        const universe = parsed.universe === 'unknown'
          ? (readUniverseFromRegistry(folderPath) ?? 'unknown')
          : parsed.universe;
        seenIds.add(id);
        items.push({
          id,
          name: parsed.name,
          type: 'squad',
          source: 'workspace',
          path: folderPath,
          description: parsed.description,
          universe,
        });
      }
    }
  }

  // --- Squad discovery (scan immediate children of workspace folders) ---
  for (const folder of workspaceFolders) {
    const folderPath = folder.uri.fsPath;
    const discovered = discoverAgentTeams(folderPath, registered);
    for (const squad of discovered) {
      if (registeredIds.has(squad.id) || seenIds.has(squad.id)) { continue; }
      if (registeredPaths.has(squad.path.toLowerCase())) { continue; }
      seenIds.add(squad.id);
      items.push(squadConfigToItem(squad));
    }
  }

  // Filter out squad governance agents (e.g. squad.agent.md) that duplicate a discovered squad
  const squadRoots = new Set(
    items.filter(i => i.type === 'squad' && i.source === 'workspace').map(i => i.path.toLowerCase()),
  );
  return items.filter(item => {
    if (item.type !== 'agent') return true;
    // Only filter the squad governance file, not other agents in the same folder
    const basename = path.basename(item.path).toLowerCase();
    if (basename !== 'squad.agent.md') return true;
    // Agent at {root}/.github/agents/squad.agent.md → root is 3 levels up
    // Agent at {root}/squad.agent.md → root is 1 level up
    // Check if path includes .github/agents to determine depth
    const itemDir = path.dirname(item.path);
    const parentOfItemDir = path.dirname(itemDir);
    const isInGithubAgents = path.basename(itemDir) === 'agents' && path.basename(parentOfItemDir) === '.github';
    const root = isInGithubAgents 
      ? path.dirname(parentOfItemDir)  // {root}/.github/agents/squad.agent.md
      : itemDir;                        // {root}/squad.agent.md
    return !squadRoots.has(root.toLowerCase());
  });
}

function squadConfigToItem(cfg: AgentTeamConfig): DiscoveredItem {
  return {
    id: cfg.id,
    name: cfg.name,
    type: 'squad',
    source: 'workspace',
    path: cfg.path,
    description: cfg.description,
    universe: cfg.universe,
  };
}
