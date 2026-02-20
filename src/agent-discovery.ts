import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/** A discovered standalone agent (not part of a squad). */
export interface DiscoveredAgent {
  /** Unique ID derived from file path */
  id: string;
  /** Agent name (from filename or parsed from file heading) */
  name: string;
  /** File path to the agent definition */
  filePath: string;
  /** Source of discovery: 'workspace' | 'copilot-dir' */
  source: 'workspace' | 'copilot-dir';
  /** Brief description parsed from the agent file */
  description?: string;
}

interface WorkspaceFolder {
  uri: { fsPath: string };
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

function collectAllMdFiles(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(dirPath, f));
  } catch {
    return [];
  }
}

function readAndPushAgent(
  filePath: string,
  source: DiscoveredAgent['source'],
  seen: Set<string>,
  out: DiscoveredAgent[],
): void {
  const id = toKebabId(path.basename(filePath));
  if (seen.has(id)) { return; }
  seen.add(id);
  const content = fs.readFileSync(filePath, 'utf-8');
  const fallback = path.basename(filePath).replace(/\.agent\.md$/i, '').replace(/\.md$/i, '');
  const parsed = parseAgentFile(content, fallback);
  out.push({ id, name: parsed.name, filePath, source, description: parsed.description });
}

/** Scan workspace folders for agent files. Returns discovered agents. */
export function discoverAgentsInWorkspace(workspaceFolders: readonly WorkspaceFolder[]): DiscoveredAgent[] {
  const agents: DiscoveredAgent[] = [];
  const seen = new Set<string>();

  for (const folder of workspaceFolders) {
    const root = folder.uri.fsPath;
    const ghAgentsDir = path.join(root, '.github', 'agents');
    for (const fp of collectAllMdFiles(ghAgentsDir)) { readAndPushAgent(fp, 'workspace', seen, agents); }
    for (const fp of collectAgentMdFiles(root)) { readAndPushAgent(fp, 'workspace', seen, agents); }
  }

  return agents;
}

/** Scan the Copilot local directory (~/.copilot/ and ~/.copilot/agents/) for agent configs. */
export function discoverAgentsInCopilotDir(): DiscoveredAgent[] {
  const copilotDir = path.join(os.homedir(), '.copilot');
  const agents: DiscoveredAgent[] = [];
  const seen = new Set<string>();
  for (const fp of collectAllMdFiles(path.join(copilotDir, 'agents'))) { readAndPushAgent(fp, 'copilot-dir', seen, agents); }
  for (const fp of collectAgentMdFiles(copilotDir)) { readAndPushAgent(fp, 'copilot-dir', seen, agents); }
  return agents;
}

/** Combined discovery — runs all discovery sources. */
export function discoverAllAgents(workspaceFolders: readonly WorkspaceFolder[]): DiscoveredAgent[] {
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
