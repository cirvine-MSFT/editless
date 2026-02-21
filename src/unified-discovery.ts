import * as fs from 'fs';
import * as path from 'path';
import { discoverAgentsInWorkspace, discoverAgentsInCopilotDir } from './agent-discovery';
import { discoverAgentTeams, parseTeamMd, toKebabCase } from './discovery';
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
        seenIds.add(id);
        items.push({
          id,
          name: parsed.name,
          type: 'squad',
          source: 'workspace',
          path: folderPath,
          description: parsed.description,
          universe: parsed.universe,
        });
      }
    }
  }

  // --- Squad discovery (scan parent dirs of workspace folders) ---
  for (const folder of workspaceFolders) {
    const parentDir = path.dirname(folder.uri.fsPath);
    const discovered = discoverAgentTeams(parentDir, registered);
    for (const squad of discovered) {
      if (registeredIds.has(squad.id) || seenIds.has(squad.id)) { continue; }
      if (registeredPaths.has(squad.path.toLowerCase())) { continue; }
      seenIds.add(squad.id);
      items.push(squadConfigToItem(squad));
    }
  }

  return items;
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
