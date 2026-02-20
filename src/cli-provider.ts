import * as vscode from 'vscode';
import { exec } from 'child_process';

export interface CliProvider {
  name: string;
  command: string;
  versionCommand: string;
  versionRegex: string;
  launchCommand: string;
  createCommand: string;
  detected: boolean;
  version?: string;
}

const COPILOT_DEFAULT: Omit<CliProvider, 'detected' | 'version'> = {
  name: 'Copilot CLI',
  command: 'copilot',
  versionCommand: 'copilot version',
  versionRegex: '(\\d+\\.\\d+[\\d.]*)',
  launchCommand: 'copilot --agent $(agent)',
  createCommand: '',
};

let _providers: CliProvider[] = [];
let _activeProvider: CliProvider | undefined;

function probeCliVersion(versionCommand: string, versionRegex: string): Promise<string | null> {
  if (!versionCommand) return Promise.resolve(null);
  return new Promise(resolve => {
    exec(versionCommand, { encoding: 'utf-8', timeout: 5000 }, (err, stdout) => {
      if (err) { resolve(null); return; }
      try {
        const re = new RegExp(versionRegex);
        const match = stdout.match(re);
        resolve(match ? (match[1] ?? match[0]) : stdout.trim().slice(0, 50) || null);
      } catch {
        const match = stdout.match(/([\d]+\.[\d]+[\d.]*)/);
        resolve(match ? match[1] : stdout.trim().slice(0, 50) || null);
      }
    });
  });
}

function loadProviderSettings(): Omit<CliProvider, 'detected' | 'version'>[] {
  const config = vscode.workspace.getConfiguration('editless');
  const raw = config.get<Array<Record<string, string>>>('cli.providers') ?? [];

  const providers = raw.map(entry => ({
    name: entry.name ?? '',
    command: entry.command ?? '',
    versionCommand: entry.versionCommand ?? '',
    versionRegex: entry.versionRegex ?? '(\\d+\\.\\d+[\\d.]*)',
    launchCommand: entry.launchCommand ?? '',
    createCommand: entry.createCommand ?? '',
  })).filter(p => p.name.length > 0);

  // Self-healing: inject Copilot default if missing
  const hasCopilot = providers.some(p => p.name.toLowerCase() === COPILOT_DEFAULT.name.toLowerCase());
  if (!hasCopilot) {
    providers.unshift({ ...COPILOT_DEFAULT });
    config.update('cli.providers', providers.map(p => ({ ...p })), vscode.ConfigurationTarget.Global).then(
      () => {},
      () => {},
    );
  }

  return providers;
}

export async function probeAllProviders(): Promise<CliProvider[]> {
  const profiles = loadProviderSettings();
  _providers = await Promise.all(
    profiles.map(async profile => {
      const version = await probeCliVersion(profile.versionCommand, profile.versionRegex);
      return {
        ...profile,
        detected: version !== null,
        version: version ?? undefined,
      };
    }),
  );
  return _providers;
}

export function resolveActiveProvider(): CliProvider | undefined {
  const config = vscode.workspace.getConfiguration('editless');
  const configured = (config.get<string>('cli.activeProvider') ?? 'auto').trim();

  if (configured !== 'auto') {
    const byName = _providers.find(p =>
      p.name.toLowerCase() === configured.toLowerCase() && p.detected,
    );
    if (byName) {
      _activeProvider = byName;
      return _activeProvider;
    }
  }

  _activeProvider = _providers.find(p => p.detected);
  return _activeProvider;
}

export function getActiveCliProvider(): CliProvider | undefined {
  return _activeProvider;
}

export function getActiveProviderLaunchCommand(): string {
  return _activeProvider?.launchCommand ?? '';
}

export function getAllProviders(): CliProvider[] {
  return _providers;
}
