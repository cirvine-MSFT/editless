import * as fs from 'fs';
import * as path from 'path';
import { AgentTeamConfig } from './types';
import { resolveTeamMd, TEAM_DIR_NAMES } from './team-dir';

const TEAM_ROSTER_PREFIX = /^team\s+roster\s*[—\-:]\s*(.+)$/i;

export function normalizeSquadName(name: string, fallback: string): string {
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

  const universeMatch = content.match(/\*\*(?:Casting\s+)?Universe:\*\*\s*(.+)$/m);
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
      const data = JSON.parse(raw) as {
        universe?: string;
        persistent_names?: Array<{ persistent_name?: string; status?: string; universe?: string }>;
        agents?: Record<string, { status?: string; universe?: string }>;
      };

      // Top-level universe field (casting registry with members array)
      if (data?.universe) {
        return data.universe;
      }

      // persistent_names array (Squad casting system)
      if (Array.isArray(data?.persistent_names)) {
        const active = data.persistent_names.find(
          a => a.universe && (!a.status || a.status === 'active'),
        );
        if (active?.universe) {
          return active.universe;
        }
      }

      // Per-agent universe (editless internal format)
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

const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'out', '.next', '.nuxt',
  'build', 'coverage', '__pycache__', '.venv', 'vendor',
  'target', 'bin', 'obj', '.terraform',
]);

export function discoverAgentTeams(
  dirPath: string,
  existingSquads: AgentTeamConfig[],
  maxDepth: number = 4,
): AgentTeamConfig[] {
  const existingPaths = new Set(
    existingSquads.map(s => s.path.toLowerCase()),
  );
  const discovered: AgentTeamConfig[] = [];

  function scan(currentPath: string, depth: number): void {
    if (depth > maxDepth) { return; }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) { continue; }

      const folderPath = path.resolve(currentPath, entry.name);
      const teamMdPath = resolveTeamMd(folderPath);

      if (teamMdPath) {
        // Found a squad — add it, but do NOT recurse into it
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
        });
        continue; // don't recurse into squad dirs
      }

      // Skip excluded directories
      if (EXCLUDED_DIRS.has(entry.name.toLowerCase()) || entry.name.startsWith('.')) {
        continue;
      }

      // Recurse into non-squad, non-excluded directories
      scan(folderPath, depth + 1);
    }
  }

  scan(dirPath, 0);
  return discovered;
}


