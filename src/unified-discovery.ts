import * as fs from 'fs';
import * as path from 'path';
import { discoverAgentsInWorkspace, discoverAgentsInCopilotDir } from './agent-discovery';
import { discoverAgentTeams, parseTeamMd, toKebabCase, readUniverseFromRegistry } from './discovery';
import { resolveTeamMd, resolveTeamDir } from './team-dir';
import { isGitRepo, discoverWorktrees } from './worktree-discovery';
import type { AgentTeamConfig, WorkspaceFolderLike } from './types';
import type { AgentSettings } from './agent-settings';

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
    // Filter if root is a discovered squad OR has a squad directory on disk
    return !squadRoots.has(root.toLowerCase()) && !resolveTeamDir(root);
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
 * Post-discovery enrichment: for each discovered item that is a git repo,
 * discover its worktrees and append children to the items array.
 */
export function enrichWithWorktrees(
  items: DiscoveredItem[],
  workspaceFolders: readonly WorkspaceFolderLike[],
  includeOutsideWorkspace?: boolean,
): DiscoveredItem[] {
  const result = [...items];
  const existingPaths = new Map<string, number>();
  for (let i = 0; i < result.length; i++) {
    existingPaths.set(normPath(result[i].path), i);
  }

  const folderPaths = workspaceFolders.map(f => normPath(f.uri.fsPath));

  for (const item of items) {
    // Only enrich items that are at root level (no parentId) and are git repos
    if (item.parentId) continue;
    if (!isGitRepo(item.path)) continue;

    const worktrees = discoverWorktrees(item.path);
    if (worktrees.length <= 1) continue;

    for (const wt of worktrees) {
      const wtNorm = normPath(wt.path);

      if (wt.isMain) {
        // Enrich the parent item with branch info
        item.branch = wt.branch;
        item.isMainWorktree = true;
        continue;
      }

      // Check if worktree is inside any workspace folder
      if (!includeOutsideWorkspace && !isInsideAny(wtNorm, folderPaths)) {
        continue;
      }

      const branchSlug = wt.branch || wt.commitHash.slice(0, 8);
      const childId = `${item.id}:wt:${toKebabCase(branchSlug)}`;

      // DEDUP: if worktree path matches an already-discovered item, convert it to a child
      const existingIdx = existingPaths.get(wtNorm);
      if (existingIdx !== undefined) {
        const existing = result[existingIdx];
        existing.parentId = item.id;
        existing.branch = wt.branch;
        existing.isMainWorktree = false;
        continue;
      }

      const child: DiscoveredItem = {
        id: childId,
        name: shortenBranch(branchSlug),
        type: item.type,
        source: item.source,
        path: wt.path,
        parentId: item.id,
        branch: wt.branch,
        isMainWorktree: false,
        universe: item.universe,
      };
      result.push(child);
      existingPaths.set(wtNorm, result.length - 1);
    }
  }

  return result;
}

function normPath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase();
}

function isInsideAny(testPath: string, folderPaths: string[]): boolean {
  return folderPaths.some(fp => testPath === fp || testPath.startsWith(fp + '/'));
}
