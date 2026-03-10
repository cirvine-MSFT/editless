import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { EXCLUDED_DIRS } from './discovery';
import type { WorkspaceFolderLike } from './types';

/** Source of agent discovery. */
export type AgentSource = 'workspace' | 'copilot-dir' | 'installed-plugin';

/** A discovered standalone agent (not part of a squad). */
export interface DiscoveredAgent {
  /** Unique ID derived from file path */
  id: string;
  /** Agent name (from filename or parsed from file heading) */
  name: string;
  /** File path to the agent definition */
  filePath: string;
  /** Source of discovery */
  source: AgentSource;
  /** Brief description parsed from the agent file */
  description?: string;
  /** Marketplace namespace (e.g. "agency-playground"), set when discovered via resolver */
  marketplace?: string;
  /** Resolver ID that found this agent (e.g. "agency"), set when discovered via resolver */
  resolverSource?: string;
}

/** Generic plugin manifest — all resolvers produce this. */
export interface PluginManifest {
  /** Plugin name from manifest or directory name */
  name: string;
  /** Path to the plugin root directory */
  pluginDir: string;
  /** Path to the entry-point agent file */
  entryAgentPath: string;
  /** Paths to all agent files in the plugin (including entry-point) */
  allAgentPaths: string[];
  /** Resolver ID that produced this manifest (e.g. "agency", "github") */
  source: string;
  /** Marketplace namespace within installed-plugins/ (e.g. "agency-playground") */
  marketplace?: string;
  /** Resolver-specific extras */
  metadata?: Record<string, unknown>;
}

/** A manifest resolver teaches editless how to read one manifest format. */
export interface ManifestResolver {
  /** Unique ID (e.g. "agency", "github") */
  id: string;
  /** Can this resolver handle the given plugin directory? */
  canResolve(pluginDir: string): boolean;
  /** Load the manifest. Returns null if invalid. */
  resolve(pluginDir: string, marketplace: string | null): PluginManifest | null;
}

const resolvers: ManifestResolver[] = [];

/** Register a manifest resolver for plugin discovery. */
export function registerResolver(resolver: ManifestResolver): void {
  resolvers.push(resolver);
}

function toKebabId(filename: string): string {
  return filename
    .replace(/\.agent\.md$/i, '')
    .replace(/\.md$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

function parseAgentFile(content: string, fallbackName: string): { name: string; description?: string } {
  // Try to extract YAML frontmatter first (delimited by ---)
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    const descMatch = frontmatter.match(/^description:\s*[>|]?\s*\n?([\s\S]*?)(?=\n\w+:|$)/m);
    
    const name = nameMatch?.[1]?.trim() || fallbackName;
    let description: string | undefined;
    
    if (descMatch?.[1]) {
      // Handle multi-line YAML descriptions (folded or literal)
      description = descMatch[1]
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join(' ')
        .trim();
    }
    
    if (description) {
      return { name, description };
    }
    return { name };
  }

  // Fall back to existing parsing logic
  const headingMatch = content.match(/^#\s+(.+)$/m);
  const name = headingMatch?.[1]?.trim() || fallbackName;

  const yamlDescMatch = content.match(/^description:\s*(.+)$/m);
  if (yamlDescMatch?.[1]?.trim()) {
    return { name, description: yamlDescMatch[1].trim() };
  }

  const blockquoteMatch = content.match(/^>\s+(.+)$/m);
  if (blockquoteMatch?.[1]?.trim()) {
    return { name, description: blockquoteMatch[1].trim() };
  }

  return { name };
}

function collectAgentMdFiles(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath)
      .filter(f => f.endsWith('.agent.md'))
      .map(f => path.join(dirPath, f));
  } catch {
    return [];
  }
}

/**
 * Recursively collect *.agent.md files from a directory and all subdirectories.
 * Used for installed-plugins/ where each plugin lives in its own subdirectory.
 * Includes symlink cycle protection, depth limits, and skip-set for resolver-claimed dirs.
 */
function collectAgentMdFilesRecursive(
  dirPath: string,
  depth = 0,
  maxDepth = 10,
  visited = new Set<string>(),
  skipDirs = new Set<string>(),
): string[] {
  if (depth > maxDepth) return [];
  const normalized = path.resolve(dirPath);
  if (visited.has(normalized)) return [];
  if (skipDirs.has(normalized)) return [];
  visited.add(normalized);
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const results: string[] = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectAgentMdFilesRecursive(fullPath, depth + 1, maxDepth, visited, skipDirs));
      } else if (entry.name.endsWith('.agent.md')) {
        results.push(fullPath);
      }
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Agency manifest resolver — reads agency.json to discover copilot-compatible plugins.
 * First (and currently only) ManifestResolver implementation.
 */
export const agencyResolver: ManifestResolver = {
  id: 'agency',
  canResolve(pluginDir: string): boolean {
    return fs.existsSync(path.join(pluginDir, 'agency.json'));
  },
  resolve(pluginDir: string, marketplace: string | null): PluginManifest | null {
    try {
      const agencyJsonPath = path.join(pluginDir, 'agency.json');
      const agencyJson = JSON.parse(fs.readFileSync(agencyJsonPath, 'utf-8'));

      // Verify this is a copilot-compatible plugin
      if (!agencyJson.engines?.includes('copilot')) return null;

      const agentsDir = path.join(pluginDir, 'agents');
      if (!fs.existsSync(agentsDir)) return null;

      const agentFiles = fs.readdirSync(agentsDir)
        .filter((f: string) => f.endsWith('.md') && f !== 'README.md')
        .map((f: string) => path.join(agentsDir, f));

      if (agentFiles.length === 0) return null;

      // Find entry-point agent: name matches plugin directory, or first .md file
      const pluginDirName = path.basename(pluginDir);
      const entryAgentPath = agentFiles.find((f: string) =>
        path.basename(f, '.md') === pluginDirName
      ) || agentFiles[0];

      return {
        name: agencyJson.name || pluginDirName,
        pluginDir,
        entryAgentPath,
        allAgentPaths: agentFiles,
        source: 'agency',
        marketplace: marketplace || 'direct',
        metadata: agencyJson.category ? { category: agencyJson.category as string } : undefined,
      };
    } catch (err) {
      console.warn('[editless] Failed to load marketplace plugin from', pluginDir, err);
      return null;
    }
  },
};

// Register the built-in agency resolver
registerResolver(agencyResolver);

/** Ask the resolver chain to handle a candidate plugin directory. First match wins. */
function tryResolve(pluginDir: string, marketplace: string | null): PluginManifest | null {
  for (const resolver of resolvers) {
    if (resolver.canResolve(pluginDir)) {
      return resolver.resolve(pluginDir, marketplace);
    }
  }
  return null;
}

/**
 * Discover marketplace plugins in the installed-plugins/ directory.
 * Uses the ManifestResolver chain to detect and load any supported manifest format.
 * Supports both flat (installed-plugins/plugin-name/) and nested (installed-plugins/marketplace/plugin-name/) structures.
 */
function discoverPlugins(pluginsDir: string): PluginManifest[] {
  const plugins: PluginManifest[] = [];

  try {
    if (!fs.existsSync(pluginsDir)) return plugins;

    const entries = fs.readdirSync(pluginsDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.isSymbolicLink());

    for (const entry of entries) {
      const entryPath = path.join(pluginsDir, entry.name);

      // Check if this is a direct plugin (any resolver can handle it)
      const directPlugin = tryResolve(entryPath, null);
      if (directPlugin) {
        plugins.push(directPlugin);
      } else {
        // This might be a marketplace directory containing plugins
        try {
          const subDirs = fs.readdirSync(entryPath, { withFileTypes: true })
            .filter(e => e.isDirectory() && !e.isSymbolicLink());

          for (const subDir of subDirs) {
            const subPath = path.join(entryPath, subDir.name);
            const plugin = tryResolve(subPath, entry.name);
            if (plugin) plugins.push(plugin);
          }
        } catch {
          // Not a valid marketplace directory, skip
        }
      }
    }
  } catch (err) {
    console.warn('[editless] Error scanning marketplace plugins:', err);
  }

  return plugins;
}

/** Parse agent content and push to output — shared logic for sync/async I/O wrappers. */
function pushParsedAgent(
  id: string,
  content: string,
  filePath: string,
  source: DiscoveredAgent['source'],
  seen: Map<string, string>,
  out: DiscoveredAgent[],
  manifest?: PluginManifest,
): void {
  const fallback = path.basename(filePath).replace(/\.agent\.md$/i, '').replace(/\.md$/i, '');
  const parsed = parseAgentFile(content, fallback);
  const agent: DiscoveredAgent = { id, name: parsed.name, filePath, source, description: parsed.description };
  if (manifest) {
    agent.marketplace = manifest.marketplace;
    agent.resolverSource = manifest.source;
  }
  out.push(agent);
}

function readAndPushAgent(
  filePath: string,
  source: DiscoveredAgent['source'],
  seen: Map<string, string>,
  out: DiscoveredAgent[],
  manifest?: PluginManifest,
): void {
  const baseId = toKebabId(path.basename(filePath));
  const id = manifest ? `${path.basename(manifest.pluginDir)}/${baseId}` : baseId;
  if (seen.has(id)) {
    console.warn('[editless] Agent ID collision — skipping duplicate:', id, 'from', filePath, '(keeping', seen.get(id) + ')');
    return;
  }
  seen.set(id, filePath);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    pushParsedAgent(id, content, filePath, source, seen, out, manifest);
  } catch {
    console.warn('[editless] Skipping unreadable agent file:', filePath);
  }
}

function scanDirForAgents(
  dirPath: string,
  seen: Map<string, string>,
  out: DiscoveredAgent[],
): void {
  const ghAgentsDir = path.join(dirPath, '.github', 'agents');
  for (const fp of collectAgentMdFiles(ghAgentsDir)) { readAndPushAgent(fp, 'workspace', seen, out); }
  for (const fp of collectAgentMdFiles(dirPath)) { readAndPushAgent(fp, 'workspace', seen, out); }
}

function discoverAgentsRecursive(
  dirPath: string,
  seen: Map<string, string>,
  out: DiscoveredAgent[],
  depth: number = 0,
  maxDepth: number = 4,
): void {
  if (depth > maxDepth) { return; }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) { continue; }
    if (EXCLUDED_DIRS.has(entry.name.toLowerCase()) || entry.name.startsWith('.')) { continue; }

    const childPath = path.resolve(dirPath, entry.name);
    scanDirForAgents(childPath, seen, out);
    discoverAgentsRecursive(childPath, seen, out, depth + 1, maxDepth);
  }
}

/** Scan workspace folders for agent files. Returns discovered agents. */
export function discoverAgentsInWorkspace(workspaceFolders: readonly WorkspaceFolderLike[]): DiscoveredAgent[] {
  const agents: DiscoveredAgent[] = [];
  const seen = new Map<string, string>();

  for (const folder of workspaceFolders) {
    const root = folder.uri.fsPath;
    scanDirForAgents(root, seen, agents);
    discoverAgentsRecursive(root, seen, agents);
  }

  return agents;
}

/**
 * Copilot personal agent directories (platform-dependent).
 * Windows uses ~/.copilot/agents/, Linux/macOS uses ~/.config/copilot/agents/.
 * We scan both to be cross-platform safe.
 */
export function getCopilotAgentDirs(): string[] {
  const home = os.homedir();
  return [
    path.join(home, '.copilot'),
    path.join(home, '.config', 'copilot'),
  ];
}

/**
 * Scan all Copilot local directories for agent configs.
 * When configDirOverride is provided, scans that directory instead of the
 * default copilot dirs — this supports the CLI's --config-dir flag.
 */
export function discoverAgentsInCopilotDir(configDirOverride?: string): DiscoveredAgent[] {
  const agents: DiscoveredAgent[] = [];
  const seen = new Map<string, string>();
  const dirs = configDirOverride ? [configDirOverride] : getCopilotAgentDirs();
  for (const copilotDir of dirs) {
    for (const fp of collectAgentMdFiles(path.join(copilotDir, 'agents'))) { readAndPushAgent(fp, 'copilot-dir', seen, agents); }
    for (const fp of collectAgentMdFiles(copilotDir)) { readAndPushAgent(fp, 'copilot-dir', seen, agents); }

    // Resolver chain runs FIRST — it's the primary discovery mechanism for manifest-based plugins.
    const installedPluginsDir = path.join(copilotDir, 'installed-plugins');
    const plugins = discoverPlugins(installedPluginsDir);
    const claimedDirs = new Set<string>();
    for (const plugin of plugins) {
      claimedDirs.add(path.resolve(plugin.pluginDir));
      for (const agentPath of plugin.allAgentPaths) {
        readAndPushAgent(agentPath, 'installed-plugin', seen, agents, plugin);
      }
    }

    // Fallback recursive scan for *.agent.md files NOT already claimed by a resolver.
    for (const fp of collectAgentMdFilesRecursive(installedPluginsDir, 0, 10, new Set(), claimedDirs)) {
      readAndPushAgent(fp, 'installed-plugin', seen, agents);
    }
  }
  return agents;
}

/** Combined discovery — runs all discovery sources. */
export function discoverAllAgents(workspaceFolders: readonly WorkspaceFolderLike[]): DiscoveredAgent[] {
  const workspace = discoverAgentsInWorkspace(workspaceFolders);
  const copilot = discoverAgentsInCopilotDir();

  // Deduplicate by id, workspace wins
  const seen = new Set(workspace.map(a => a.id));
  const merged = [...workspace];
  for (const agent of copilot) {
    if (!seen.has(agent.id)) {
      seen.add(agent.id);
      merged.push(agent);
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Async variants — non-blocking discovery for refresh path
// ---------------------------------------------------------------------------

async function collectAgentMdFilesAsync(dirPath: string): Promise<string[]> {
  try {
    const entries = await fsp.readdir(dirPath);
    return entries
      .filter(f => f.endsWith('.agent.md'))
      .map(f => path.join(dirPath, f));
  } catch {
    return [];
  }
}

async function collectAgentMdFilesRecursiveAsync(
  dirPath: string,
  depth = 0,
  maxDepth = 10,
  visited = new Set<string>(),
  skipDirs = new Set<string>(),
): Promise<string[]> {
  if (depth > maxDepth) return [];
  const normalized = path.resolve(dirPath);
  if (visited.has(normalized)) return [];
  if (skipDirs.has(normalized)) return [];
  visited.add(normalized);
  try {
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    const results: string[] = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        results.push(...await collectAgentMdFilesRecursiveAsync(fullPath, depth + 1, maxDepth, visited, skipDirs));
      } else if (entry.name.endsWith('.agent.md')) {
        results.push(fullPath);
      }
    }
    return results;
  } catch {
    return [];
  }
}

async function readAndPushAgentAsync(
  filePath: string,
  source: DiscoveredAgent['source'],
  seen: Map<string, string>,
  out: DiscoveredAgent[],
  manifest?: PluginManifest,
): Promise<void> {
  const baseId = toKebabId(path.basename(filePath));
  const id = manifest ? `${path.basename(manifest.pluginDir)}/${baseId}` : baseId;
  if (seen.has(id)) return;
  seen.set(id, filePath);
  try {
    const content = await fsp.readFile(filePath, 'utf-8');
    pushParsedAgent(id, content, filePath, source, seen, out, manifest);
  } catch {
    // skip unreadable
  }
}

async function discoverPluginsAsync(pluginsDir: string): Promise<PluginManifest[]> {
  const plugins: PluginManifest[] = [];
  try {
    await fsp.access(pluginsDir);
  } catch {
    return plugins;
  }

  try {
    const entries = (await fsp.readdir(pluginsDir, { withFileTypes: true }))
      .filter(e => e.isDirectory() && !e.isSymbolicLink());

    for (const entry of entries) {
      const entryPath = path.join(pluginsDir, entry.name);
      const directPlugin = tryResolve(entryPath, null);
      if (directPlugin) {
        plugins.push(directPlugin);
      } else {
        try {
          const subDirs = (await fsp.readdir(entryPath, { withFileTypes: true }))
            .filter(e => e.isDirectory() && !e.isSymbolicLink());
          for (const subDir of subDirs) {
            const subPath = path.join(entryPath, subDir.name);
            const plugin = tryResolve(subPath, entry.name);
            if (plugin) plugins.push(plugin);
          }
        } catch {
          // Not a valid marketplace directory
        }
      }
    }
  } catch (err) {
    console.warn('[editless] Error scanning marketplace plugins:', err);
  }

  return plugins;
}

async function scanDirForAgentsAsync(
  dirPath: string,
  seen: Map<string, string>,
  out: DiscoveredAgent[],
): Promise<void> {
  const ghAgentsDir = path.join(dirPath, '.github', 'agents');
  for (const fp of await collectAgentMdFilesAsync(ghAgentsDir)) { await readAndPushAgentAsync(fp, 'workspace', seen, out); }
  for (const fp of await collectAgentMdFilesAsync(dirPath)) { await readAndPushAgentAsync(fp, 'workspace', seen, out); }
}

async function discoverAgentsRecursiveAsync(
  dirPath: string,
  seen: Map<string, string>,
  out: DiscoveredAgent[],
  depth: number = 0,
  maxDepth: number = 4,
): Promise<void> {
  if (depth > maxDepth) { return; }

  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) { continue; }
    if (EXCLUDED_DIRS.has(entry.name.toLowerCase()) || entry.name.startsWith('.')) { continue; }

    const childPath = path.resolve(dirPath, entry.name);
    await scanDirForAgentsAsync(childPath, seen, out);
    await discoverAgentsRecursiveAsync(childPath, seen, out, depth + 1, maxDepth);
  }
}

/** Async scan of workspace folders for agent files. */
export async function discoverAgentsInWorkspaceAsync(workspaceFolders: readonly WorkspaceFolderLike[]): Promise<DiscoveredAgent[]> {
  const agents: DiscoveredAgent[] = [];
  const seen = new Map<string, string>();

  for (const folder of workspaceFolders) {
    const root = folder.uri.fsPath;
    await scanDirForAgentsAsync(root, seen, agents);
    await discoverAgentsRecursiveAsync(root, seen, agents);
  }

  return agents;
}

/** Async scan of Copilot directories for agent configs. */
export async function discoverAgentsInCopilotDirAsync(configDirOverride?: string): Promise<DiscoveredAgent[]> {
  const agents: DiscoveredAgent[] = [];
  const seen = new Map<string, string>();
  const dirs = configDirOverride ? [configDirOverride] : getCopilotAgentDirs();
  for (const copilotDir of dirs) {
    for (const fp of await collectAgentMdFilesAsync(path.join(copilotDir, 'agents'))) { await readAndPushAgentAsync(fp, 'copilot-dir', seen, agents); }
    for (const fp of await collectAgentMdFilesAsync(copilotDir)) { await readAndPushAgentAsync(fp, 'copilot-dir', seen, agents); }

    const installedPluginsDir = path.join(copilotDir, 'installed-plugins');
    const plugins = await discoverPluginsAsync(installedPluginsDir);
    const claimedDirs = new Set<string>();
    for (const plugin of plugins) {
      claimedDirs.add(path.resolve(plugin.pluginDir));
      for (const agentPath of plugin.allAgentPaths) {
        await readAndPushAgentAsync(agentPath, 'installed-plugin', seen, agents, plugin);
      }
    }

    for (const fp of await collectAgentMdFilesRecursiveAsync(installedPluginsDir, 0, 10, new Set(), claimedDirs)) {
      await readAndPushAgentAsync(fp, 'installed-plugin', seen, agents);
    }
  }
  return agents;
}
