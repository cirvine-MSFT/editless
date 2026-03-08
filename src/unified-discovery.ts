import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { discoverAgentsInWorkspace, discoverAgentsInCopilotDir, discoverAgentsInWorkspaceAsync, discoverAgentsInCopilotDirAsync, type AgentSource } from './agent-discovery';
import { discoverAgentTeams, discoverAgentTeamsAsync, parseTeamMd, toKebabCase, readUniverseFromRegistry, readUniverseFromRegistryAsync } from './discovery';
import { resolveTeamMd, resolveTeamDir } from './team-dir';
import { isGitRepo, discoverWorktrees, discoverWorktreesAsync, type WorktreeInfo } from './worktree-discovery';
import type { AgentTeamConfig, WorkspaceFolderLike } from './types';
import type { AgentSettings } from './agent-settings';

/** A single discovered item — either a standalone agent or a squad. */
export interface DiscoveredItem {
  id: string;
  name: string;
  type: 'agent' | 'squad';
  source: AgentSource;
  path: string;
  description?: string;
  /** Squad-specific: universe parsed from team.md */
  universe?: string;
  /** Git branch (from worktree discovery) */
  branch?: string;
  /** ID of parent discovered item (for worktree children) */
  parentId?: string;
  /** True for primary checkout */
  isMainWorktree?: boolean;
}

/**
 * Unified discovery — scans workspace folders for both agents AND squads,
 * plus ~/.config/copilot/agents/ (and ~/.copilot/agents/) for personal agent library.
 * Returns ALL discovered items (deduped by ID within results).
 */
export function discoverAll(
  workspaceFolders: readonly WorkspaceFolderLike[],
): DiscoveredItem[] {
  const items: DiscoveredItem[] = [];
  const seenIds = new Set<string>();

  // --- Agent discovery (workspace + copilot-dir) ---
  const wsAgents = discoverAgentsInWorkspace(workspaceFolders);
  const copilotAgents = discoverAgentsInCopilotDir();

  // Workspace agents first (win on dedup)
  for (const agent of wsAgents) {
    if (seenIds.has(agent.id)) { continue; }
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
    if (seenIds.has(agent.id)) { continue; }
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
      if (!seenIds.has(id)) {
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
    } else if (resolveTeamDir(folderPath)) {
      // .squad/ or .ai-team/ exists but team.md is missing — still a squad
      const folderName = path.basename(folderPath);
      const id = toKebabCase(folderName);
      if (!seenIds.has(id)) {
        seenIds.add(id);
        items.push({
          id,
          name: folderName,
          type: 'squad',
          source: 'workspace',
          path: folderPath,
          universe: readUniverseFromRegistry(folderPath) ?? 'unknown',
        });
      }
    }
  }

  // --- Squad discovery (scan workspace folders recursively) ---
  for (const folder of workspaceFolders) {
    const folderPath = folder.uri.fsPath;
    const discovered = discoverAgentTeams(folderPath, []);
    for (const squad of discovered) {
      if (seenIds.has(squad.id)) { continue; }
      seenIds.add(squad.id);
      items.push(agentConfigToItem(squad));
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
    // Filter if root is a discovered squad OR has a squad directory on disk
    return !squadRoots.has(root.toLowerCase()) && !resolveTeamDir(root);
  });
}

function agentConfigToItem(cfg: AgentTeamConfig): DiscoveredItem {
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

/**
 * Convert a DiscoveredItem + optional AgentSettings overrides into a full AgentTeamConfig.
 * Centralises the 8-field mapping that was previously duplicated at 5 call sites.
 */
export function toAgentTeamConfig(disc: DiscoveredItem, settings?: AgentSettings): AgentTeamConfig {
  return {
    id: disc.id,
    name: settings?.name || disc.name,
    path: disc.path,
    icon: settings?.icon || (disc.type === 'squad' ? '🔷' : '🤖'),
    universe: disc.universe ?? 'standalone',
    description: disc.description,
    model: settings?.model || undefined,
    additionalArgs: settings?.additionalArgs || undefined,
    command: settings?.command || undefined,
  };
}

/** Shorten a branch ref for display (strip common prefixes). */
function shortenBranch(branch: string): string {
  return branch
    .replace(/^refs\/heads\//, '')
    .replace(/^refs\/remotes\/origin\//, '');
}

/**
 * Shared worktree-processing logic: given discovered items and a worktree map
 * (parent item → worktree list), enrich the items with worktree children.
 * The only difference between sync/async is HOW worktrees are fetched, not how results are processed.
 */
function processWorktreeResults(
  items: DiscoveredItem[],
  worktreeMap: Map<DiscoveredItem, WorktreeInfo[]>,
  folderPaths: string[],
  includeOutsideWorkspace?: boolean,
): DiscoveredItem[] {
  const result = [...items];
  const existingPaths = new Map<string, number>();
  for (let i = 0; i < result.length; i++) {
    existingPaths.set(normPath(result[i].path), i);
  }

  for (const [item, worktrees] of worktreeMap) {
    if (worktrees.length <= 1) continue;

    for (const wt of worktrees) {
      const wtNorm = normPath(wt.path);

      if (wt.isMain) {
        item.branch = wt.branch;
        item.isMainWorktree = true;
        continue;
      }

      if (!includeOutsideWorkspace && !isInsideAny(wtNorm, folderPaths)) continue;

      const branchSlug = wt.branch || wt.commitHash.slice(0, 8);
      const childId = `${item.id}:wt:${toKebabCase(branchSlug)}`;

      const existingIdx = existingPaths.get(wtNorm);
      if (existingIdx !== undefined) {
        const existing = result[existingIdx];
        existing.parentId = item.id;
        existing.branch = wt.branch;
        existing.isMainWorktree = false;
        continue;
      }

      const child: DiscoveredItem = {
        id: childId, name: shortenBranch(branchSlug), type: item.type,
        source: item.source, path: wt.path, parentId: item.id,
        branch: wt.branch, isMainWorktree: false, universe: item.universe,
      };
      result.push(child);
      existingPaths.set(wtNorm, result.length - 1);
    }
  }

  return result;
}

/**
 * Post-discovery enrichment: for each discovered item that is a git repo,
 * discover its worktrees and append children to the items array.
 */
export function enrichWithWorktrees(
  items: DiscoveredItem[],
  workspaceFolders: readonly WorkspaceFolderLike[],
  includeOutsideWorkspace?: boolean,
): DiscoveredItem[] {
  const folderPaths = workspaceFolders.map(f => normPath(f.uri.fsPath));
  const worktreeMap = new Map<DiscoveredItem, WorktreeInfo[]>();

  for (const item of items) {
    if (item.parentId) continue;
    if (!isGitRepo(item.path)) continue;
    worktreeMap.set(item, discoverWorktrees(item.path));
  }

  return processWorktreeResults(items, worktreeMap, folderPaths, includeOutsideWorkspace);
}

function normPath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase();
}

function isInsideAny(testPath: string, folderPaths: string[]): boolean {
  return folderPaths.some(fp => testPath === fp || testPath.startsWith(fp + '/'));
}

// ---------------------------------------------------------------------------
// Async variants — non-blocking discovery for the refresh path
// ---------------------------------------------------------------------------

/**
 * Async version of discoverAll — scans workspace folders for agents and squads
 * without blocking the extension host event loop.
 *
 * Remaining sync calls (acceptable — sub-millisecond existsSync/statSync on local filesystem):
 *   - resolveTeamMd() — uses existsSync to locate team.md
 *   - resolveTeamDir() — uses existsSync to locate .squad/ or .ai-team/
 *   - isGitRepo() — uses statSync to check for .git
 *   - tryResolve() — resolver chain uses existsSync/readFileSync on small manifest files
 */
export async function discoverAllAsync(
  workspaceFolders: readonly WorkspaceFolderLike[],
): Promise<DiscoveredItem[]> {
  const items: DiscoveredItem[] = [];
  const seenIds = new Set<string>();

  // Run agent discovery in parallel
  const [wsAgents, copilotAgents] = await Promise.all([
    discoverAgentsInWorkspaceAsync(workspaceFolders),
    discoverAgentsInCopilotDirAsync(),
  ]);

  for (const agent of wsAgents) {
    if (seenIds.has(agent.id)) continue;
    seenIds.add(agent.id);
    items.push({
      id: agent.id, name: agent.name, type: 'agent',
      source: agent.source, path: agent.filePath, description: agent.description,
    });
  }
  for (const agent of copilotAgents) {
    if (seenIds.has(agent.id)) continue;
    seenIds.add(agent.id);
    items.push({
      id: agent.id, name: agent.name, type: 'agent',
      source: agent.source, path: agent.filePath, description: agent.description,
    });
  }

  // Squad discovery: workspace folder roots
  for (const folder of workspaceFolders) {
    const folderPath = folder.uri.fsPath;
    const teamMdPath = resolveTeamMd(folderPath);
    if (teamMdPath) {
      const folderName = path.basename(folderPath);
      const id = toKebabCase(folderName);
      if (!seenIds.has(id)) {
        const content = await fsp.readFile(teamMdPath, 'utf-8');
        const parsed = parseTeamMd(content, folderName);
        const universe = parsed.universe === 'unknown'
          ? (await readUniverseFromRegistryAsync(folderPath) ?? 'unknown')
          : parsed.universe;
        seenIds.add(id);
        items.push({ id, name: parsed.name, type: 'squad', source: 'workspace', path: folderPath, description: parsed.description, universe });
      }
    } else if (resolveTeamDir(folderPath)) {
      const folderName = path.basename(folderPath);
      const id = toKebabCase(folderName);
      if (!seenIds.has(id)) {
        seenIds.add(id);
        const universe = await readUniverseFromRegistryAsync(folderPath) ?? 'unknown';
        items.push({ id, name: folderName, type: 'squad', source: 'workspace', path: folderPath, universe });
      }
    }
  }

  // Squad discovery: recursive scan
  for (const folder of workspaceFolders) {
    const discovered = await discoverAgentTeamsAsync(folder.uri.fsPath, []);
    for (const squad of discovered) {
      if (seenIds.has(squad.id)) continue;
      seenIds.add(squad.id);
      items.push(agentConfigToItem(squad));
    }
  }

  // Filter out squad governance agents
  const squadRoots = new Set(
    items.filter(i => i.type === 'squad' && i.source === 'workspace').map(i => i.path.toLowerCase()),
  );
  return items.filter(item => {
    if (item.type !== 'agent') return true;
    const basename = path.basename(item.path).toLowerCase();
    if (basename !== 'squad.agent.md') return true;
    const itemDir = path.dirname(item.path);
    const parentOfItemDir = path.dirname(itemDir);
    const isInGithubAgents = path.basename(itemDir) === 'agents' && path.basename(parentOfItemDir) === '.github';
    const root = isInGithubAgents ? path.dirname(parentOfItemDir) : itemDir;
    return !squadRoots.has(root.toLowerCase()) && !resolveTeamDir(root);
  });
}

/**
 * Async version of enrichWithWorktrees — discovers git worktrees
 * without blocking the extension host (no execFileSync).
 */
export async function enrichWithWorktreesAsync(
  items: DiscoveredItem[],
  workspaceFolders: readonly WorkspaceFolderLike[],
  includeOutsideWorkspace?: boolean,
): Promise<DiscoveredItem[]> {
  const folderPaths = workspaceFolders.map(f => normPath(f.uri.fsPath));
  const worktreeMap = new Map<DiscoveredItem, WorktreeInfo[]>();

  for (const item of items) {
    if (item.parentId) continue;
    if (!isGitRepo(item.path)) continue;
    worktreeMap.set(item, await discoverWorktreesAsync(item.path));
  }

  return processWorktreeResults(items, worktreeMap, folderPaths, includeOutsideWorkspace);
}
