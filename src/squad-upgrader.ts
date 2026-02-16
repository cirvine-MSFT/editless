import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
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

// --- Latest version check (cached) -----------------------------------------

let _latestVersionCache: { version: string | null; fetchedAt: number } | undefined;
const VERSION_CACHE_TTL_MS = 60 * 60 * 1000;

function fetchLatestSquadVersion(): Promise<string | null> {
  return new Promise(resolve => {
    const req = https.get(
      'https://raw.githubusercontent.com/bradygaster/squad/main/package.json',
      { timeout: 10000 },
      res => {
        if (res.statusCode !== 200) { resolve(null); return; }
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data).version ?? null); }
          catch { resolve(null); }
        });
      },
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

export async function getLatestSquadVersion(): Promise<string | null> {
  if (_latestVersionCache && (Date.now() - _latestVersionCache.fetchedAt) < VERSION_CACHE_TTL_MS) {
    return _latestVersionCache.version;
  }
  const version = await fetchLatestSquadVersion();
  _latestVersionCache = { version, fetchedAt: Date.now() };
  return version;
}

export function clearLatestVersionCache(): void {
  _latestVersionCache = undefined;
}

export function isNewerVersion(latest: string, local: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const l = parse(latest);
  const c = parse(local);
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    if ((l[i] ?? 0) > (c[i] ?? 0)) return true;
    if ((l[i] ?? 0) < (c[i] ?? 0)) return false;
  }
  return false;
}

export async function checkSquadUpgradesOnStartup(
  squads: AgentTeamConfig[],
  onResult: (squadId: string, upgradeAvailable: boolean) => void,
): Promise<void> {
  const latest = await getLatestSquadVersion();
  if (!latest) return;
  for (const squad of squads) {
    const local = getLocalSquadVersion(squad.path);
    if (!local) continue;
    onResult(squad.id, isNewerVersion(latest, local));
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
      title: `${config.icon} Upgrading Squad package: ${config.name}…`,
      cancellable: false,
    },
    () =>
      new Promise<void>((resolve) => {
        exec('npx github:bradygaster/squad upgrade', { cwd: config.path }, (err, stdout, stderr) => {
          if (err) {
            const msg = stderr?.trim() || err.message;
            vscode.window.showErrorMessage(`${config.icon} Squad upgrade failed for ${config.name}: ${msg}`);
          } else {
            vscode.window.showInformationMessage(`${config.icon} Squad package upgraded: ${config.name}`);
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
  onUpgradeComplete?: (squadId: string) => void,
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
      const id = config.id;
      runSquadUpgrade(config).then(() => onUpgradeComplete?.(id));
    }
  });
}

export function registerSquadUpgradeAllCommand(
  context: vscode.ExtensionContext,
  registry: EditlessRegistry,
  onUpgradeComplete?: (squadId: string) => void,
): vscode.Disposable {
  return vscode.commands.registerCommand('editless.upgradeAllSquads', async () => {
    const squads = registry.loadSquads();
    if (squads.length === 0) {
      vscode.window.showWarningMessage('No upgradable squads registered.');
      return;
    }

    for (const squad of squads) {
      runSquadUpgrade(squad).then(() => onUpgradeComplete?.(squad.id));
    }

    vscode.window.showInformationMessage(
      `Upgrading ${squads.length} Squad package${squads.length === 1 ? '' : 's'}…`,
    );
  });
}
