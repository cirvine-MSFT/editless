import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { AgentTeamConfig } from './types';
import { EditlessRegistry } from './registry';

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
  return fs.existsSync(path.join(squadPath, '.ai-team'));
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
    console.error(`[squad-upgrader] Error reading squad version: ${err}`);
    return null;
  }
}

export async function runSquadUpgrade(config: AgentTeamConfig): Promise<void> {
  const npxAvailable = await checkNpxAvailable();
  if (!npxAvailable) {
    await promptInstallNode();
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `${config.icon} Upgrading ${config.name}…`,
      cancellable: false,
    },
    () =>
      new Promise<void>((resolve) => {
        exec('npx github:bradygaster/squad upgrade', { cwd: config.path }, (err, stdout, stderr) => {
          if (err) {
            const msg = stderr?.trim() || err.message;
            vscode.window.showErrorMessage(`${config.icon} Upgrade failed for ${config.name}: ${msg}`);
          } else {
            vscode.window.showInformationMessage(`${config.icon} ${config.name} upgraded.`);
          }
          resolve();
        });
      }),
  );
}

function isAgentTeamConfig(value: unknown): value is AgentTeamConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const cfg = value as Partial<AgentTeamConfig>;
  return (
    typeof cfg.id === 'string' &&
    typeof cfg.name === 'string' &&
    typeof cfg.path === 'string' &&
    typeof cfg.icon === 'string' &&
    typeof cfg.universe === 'string'
  );
}

function getSquadIdFromArgs(args: unknown): string | undefined {
  if (!args || typeof args !== 'object') {
    return undefined;
  }

  const maybe = args as { squadId?: unknown; id?: unknown };
  if (typeof maybe.squadId === 'string') {
    return maybe.squadId;
  }
  if (typeof maybe.id === 'string') {
    return maybe.id;
  }

  return undefined;
}

export function registerSquadUpgradeCommand(
  context: vscode.ExtensionContext,
  registry: EditlessRegistry,
): vscode.Disposable {
  return vscode.commands.registerCommand('editless.upgradeSquad', async (args?: unknown) => {
    let config: AgentTeamConfig | undefined = isAgentTeamConfig(args) ? args : undefined;

    if (!config) {
      const squadId = getSquadIdFromArgs(args);
      if (squadId) {
        config = registry.getSquad(squadId);
      }
    }

    if (!config) {
      const squads = registry.loadSquads();
      if (squads.length === 0) {
        vscode.window.showWarningMessage('No squads registered yet.');
        return;
      }

      const pick = await vscode.window.showQuickPick(
        squads.map(s => ({
          label: `${s.icon} ${s.name}`,
          description: s.universe,
          squad: s,
        })),
        { placeHolder: 'Select a squad to upgrade' },
      );

      config = pick?.squad;
    }

    if (config) {
      runSquadUpgrade(config);
    }
  });
}

export function registerSquadUpgradeAllCommand(
  context: vscode.ExtensionContext,
  registry: EditlessRegistry,
): vscode.Disposable {
  return vscode.commands.registerCommand('editless.upgradeAllSquads', async () => {
    const squads = registry.loadSquads();
    if (squads.length === 0) {
      vscode.window.showWarningMessage('No upgradable squads registered.');
      return;
    }

    for (const squad of squads) {
      runSquadUpgrade(squad);
    }

    vscode.window.showInformationMessage(
      `Upgrading ${squads.length} squad${squads.length === 1 ? '' : 's'}…`,
    );
  });
}
