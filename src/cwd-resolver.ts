import * as vscode from 'vscode';
import * as fs from 'fs';

/** Normalise path separators to forward-slash for comparison. */
function normSep(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Determines the correct CWD for a terminal based on the agent type:
 *
 * 1. **Personal agents** (`~/.copilot/agents/`) → first workspace folder
 * 2. **Repo agents** (path inside a workspace folder under `.github/agents/`
 *    or `.copilot/agents/`) → that workspace folder root (≈ repo root)
 * 3. **Workspace-dir agents** (path inside any workspace folder) → that
 *    workspace folder root
 * 4. Otherwise → return the original path unchanged.
 */
export function resolveTerminalCwd(agentPath: string | undefined): string | undefined {
  if (!agentPath) return agentPath;

  const norm = normSep(agentPath);

  // 1. Personal agent — path under user home .copilot/agents
  //    These live outside any workspace folder (e.g. ~/.copilot/agents/foo).
  //    Match only when the .copilot segment is NOT inside a workspace folder,
  //    which we detect by checking workspace folders first.
  const folders = vscode.workspace.workspaceFolders;

  // 2 & 3: Check if agentPath is inside a workspace folder
  if (folders) {
    for (const folder of folders) {
      const folderPath = normSep(folder.uri.fsPath);
      if (norm.startsWith(folderPath + '/') || norm === folderPath) {
        // Squad directories should use their own path as CWD so the
        // Copilot CLI can discover .squad/ or squad.agent.md at the root.
        // Agent files use the workspace folder root.
        try {
          if (fs.statSync(agentPath).isDirectory()) {
            return agentPath;
          }
        } catch { /* path doesn't exist — fall through to workspace root */ }
        return folder.uri.fsPath;
      }
    }
  }

  // 1. Personal agent fallback — .copilot/agents outside any workspace folder
  if (/\.copilot[\\/]agents/.test(agentPath)) {
    return folders?.[0]?.uri.fsPath ?? agentPath;
  }

  return agentPath;
}
