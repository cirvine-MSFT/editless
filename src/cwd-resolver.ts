import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Normalise path separators to forward-slash for comparison. */
function normSep(p: string): string {
  return p.replace(/\\/g, '/');
}

function deriveAgentProjectRoot(agentFilePath: string): string {
  const norm = normSep(agentFilePath);

  for (const marker of ['/.github/agents/', '/.copilot/agents/']) {
    const idx = norm.indexOf(marker);
    if (idx > 0) {
      return agentFilePath.substring(0, idx);
    }
  }

  return path.dirname(agentFilePath);
}

/**
 * Determines the correct CWD for a terminal based on the agent type:
 *
 * 1. **Personal / plugin agents** (`~/.copilot/agents/`,
 *    `~/.copilot/installed-plugins/`, or `~/.config/copilot/agents/`)
 *    → user home directory
 * 2. **Repo agents** (path inside a workspace folder under `.github/agents/`
 *    or `.copilot/agents/`) → the project root derived from the agent path
 * 3. **Workspace-dir agents** (path inside any workspace folder) → the
 *    agent file's parent directory
 * 4. Otherwise → return the original path unchanged.
 */
export function resolveTerminalCwd(agentPath: string | undefined): string | undefined {
  if (!agentPath) return agentPath;

  const norm = normSep(agentPath);

  // Personal / plugin agents live outside any workspace folder
  // (e.g. ~/.copilot/agents/foo or ~/.copilot/installed-plugins/bar).
  // Check workspace folders first so repo-local .copilot/agents/ paths
  // resolve to the workspace root, not the home directory.
  const folders = vscode.workspace.workspaceFolders;

  // 2 & 3: Check if agentPath is inside a workspace folder
  if (folders) {
    for (const folder of folders) {
      const folderPath = normSep(folder.uri.fsPath);
      if (norm.startsWith(folderPath + '/') || norm === folderPath) {
        // Squad directories should use their own path as CWD so the
        // Copilot CLI can discover .squad/ or squad.agent.md at the root.
        // Agent files derive their project root from the file path.
        try {
          if (fs.statSync(agentPath).isDirectory()) {
            return agentPath;
          }
        } catch { /* path doesn't exist — fall through */ }
        return deriveAgentProjectRoot(agentPath);
      }
    }
  }

  // 1. Personal agent or plugin agent — outside any workspace folder.
  // Matches ~/.copilot/agents/, ~/.copilot/installed-plugins/, and
  // ~/.config/copilot/agents/ (Linux/macOS XDG path).
  if (/\.(copilot[\\/](agents|installed-plugins)|config[\\/]copilot[\\/]agents)[\\/]/.test(agentPath)) {
    return os.homedir();
  }

  return agentPath;
}
