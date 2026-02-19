import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { TEAM_DIR_NAMES } from './team-dir';

const execAsync = promisify(exec);

export async function checkNpxAvailable(): Promise<boolean> {
  try {
    await execAsync('npx --version');
    return true;
  } catch {
    return false;
  }
}

export async function promptInstallNode(): Promise<void> {
  const choice = await vscode.window.showInformationMessage(
    'Squad requires npx (comes with Node.js). Install Node.js to use squad features.',
    'Open Node.js Download Page',
  );
  
  if (choice === 'Open Node.js Download Page') {
    vscode.env.openExternal(vscode.Uri.parse('https://nodejs.org/'));
  }
}

export function isSquadInitialized(squadPath: string): boolean {
  return TEAM_DIR_NAMES.some(name => fs.existsSync(path.join(squadPath, name)));
}

export function getLocalSquadVersion(squadPath: string): string | null {
  try {
    const squadAgentPath = path.join(squadPath, '.github', 'agents', 'squad.agent.md');
    if (!fs.existsSync(squadAgentPath)) {
      return null;
    }

    const content = fs.readFileSync(squadAgentPath, 'utf-8');

    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) {
      return null;
    }

    const frontmatter = match[1];
    const versionMatch = frontmatter.match(/^version:\s*(.+?)$/m);
    if (!versionMatch) {
      return null;
    }

    return versionMatch[1].trim();
  } catch (err) {
    console.error(`[squad-utils] Error reading squad version: ${err}`);
    return null;
  }
}
