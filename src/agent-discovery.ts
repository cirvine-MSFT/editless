import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
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
}

/** A discovered agency marketplace plugin. */
export interface AgencyPlugin {
  /** Plugin name from agency.json or directory name */
  name: string;
  /** Path to the plugin root directory */
  pluginDir: string;
  /** Path to the entry-point agent file */
  entryAgentPath: string;
  /** Marketplace source (parent directory name, e.g. "agency-playground") */
  marketplace: string;
  /** Category from agency.json */
  category?: string;
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
 * Includes symlink cycle protection and depth limits.
 */
function collectAgentMdFilesRecursive(dirPath: string, depth = 0, maxDepth = 10, visited = new Set<string>()): string[] {
  if (depth > maxDepth) return [];
  const normalized = path.resolve(dirPath);
  if (visited.has(normalized)) return [];
  visited.add(normalized);
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const results: string[] = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectAgentMdFilesRecursive(fullPath, depth + 1, maxDepth, visited));
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
 * Discover marketplace plugins in the installed-plugins/ directory.
 * Scans for agency.json files and extracts the entry-point agent from each plugin.
 * Supports both flat (installed-plugins/plugin-name/) and nested (installed-plugins/marketplace/plugin-name/) structures.
 */
function discoverAgencyPlugins(pluginsDir: string): AgencyPlugin[] {
  const plugins: AgencyPlugin[] = [];
  
  try {
    if (!fs.existsSync(pluginsDir)) return plugins;
    
    const entries = fs.readdirSync(pluginsDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.isSymbolicLink());
    
    for (const entry of entries) {
      const entryPath = path.join(pluginsDir, entry.name);
      const agencyJsonPath = path.join(entryPath, 'agency.json');
      
      // Check if this is a direct plugin (has agency.json at this level)
      if (fs.existsSync(agencyJsonPath)) {
        const plugin = tryLoadAgencyPlugin(entryPath, entry.name, null);
        if (plugin) plugins.push(plugin);
      } else {
        // This might be a marketplace directory containing plugins
        try {
          const subDirs = fs.readdirSync(entryPath, { withFileTypes: true })
            .filter(e => e.isDirectory() && !e.isSymbolicLink());
          
          for (const subDir of subDirs) {
            const subPath = path.join(entryPath, subDir.name);
            const subAgencyJsonPath = path.join(subPath, 'agency.json');
            
            if (fs.existsSync(subAgencyJsonPath)) {
              const plugin = tryLoadAgencyPlugin(subPath, subDir.name, entry.name);
              if (plugin) plugins.push(plugin);
            }
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

/**
 * Helper function to load a marketplace plugin from a directory.
 */
function tryLoadAgencyPlugin(pluginPath: string, pluginDirName: string, marketplace: string | null): AgencyPlugin | null {
  try {
    const agencyJsonPath = path.join(pluginPath, 'agency.json');
    const agencyJson = JSON.parse(fs.readFileSync(agencyJsonPath, 'utf-8'));
    
    // Verify this is a copilot-compatible plugin
    if (!agencyJson.engines?.includes('copilot')) return null;
    
    const agentsDir = path.join(pluginPath, 'agents');
    if (!fs.existsSync(agentsDir)) return null;
    
    const agentFiles = fs.readdirSync(agentsDir)
      .filter(f => f.endsWith('.md') && f !== 'README.md')
      .map(f => path.join(agentsDir, f));
    
    if (agentFiles.length === 0) return null;
    
    // Find entry-point agent: name matches plugin directory, or first .md file
    const entryAgentPath = agentFiles.find(f => 
      path.basename(f, '.md') === pluginDirName
    ) || agentFiles[0];
    
    return {
      name: agencyJson.name || pluginDirName,
      pluginDir: pluginPath,
      entryAgentPath,
      marketplace: marketplace || 'direct',
      category: agencyJson.category,
    };
  } catch (err) {
    console.warn('[editless] Failed to load marketplace plugin from', pluginPath, err);
    return null;
  }
}

function readAndPushAgent(
  filePath: string,
  source: DiscoveredAgent['source'],
  seen: Map<string, string>,
  out: DiscoveredAgent[],
): void {
  const id = toKebabId(path.basename(filePath));
  if (seen.has(id)) {
    console.warn('[editless] Agent ID collision — skipping duplicate:', id, 'from', filePath, '(keeping', seen.get(id) + ')');
    return;
  }
  seen.set(id, filePath);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fallback = path.basename(filePath).replace(/\.agent\.md$/i, '').replace(/\.md$/i, '');
    const parsed = parseAgentFile(content, fallback);
    out.push({ id, name: parsed.name, filePath, source, description: parsed.description });
  } catch {
    console.warn('[editless] Skipping unreadable agent file:', filePath);
  }
}

/** Scan workspace folders for agent files. Returns discovered agents. */
export function discoverAgentsInWorkspace(workspaceFolders: readonly WorkspaceFolderLike[]): DiscoveredAgent[] {
  const agents: DiscoveredAgent[] = [];
  const seen = new Map<string, string>();

  for (const folder of workspaceFolders) {
    const root = folder.uri.fsPath;
    const ghAgentsDir = path.join(root, '.github', 'agents');
    for (const fp of collectAgentMdFiles(ghAgentsDir)) { readAndPushAgent(fp, 'workspace', seen, agents); }
    for (const fp of collectAgentMdFiles(root)) { readAndPushAgent(fp, 'workspace', seen, agents); }
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
    // Scan installed-plugins/ recursively for marketplace-installed agents (*.agent.md format)
    const installedPluginsDir = path.join(copilotDir, 'installed-plugins');
    for (const fp of collectAgentMdFilesRecursive(installedPluginsDir)) {
      readAndPushAgent(fp, 'installed-plugin', seen, agents);
    }
    // Scan for marketplace plugins (plain .md format with agency.json)
    const agencyPlugins = discoverAgencyPlugins(installedPluginsDir);
    for (const plugin of agencyPlugins) {
      readAndPushAgent(plugin.entryAgentPath, 'installed-plugin', seen, agents);
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
