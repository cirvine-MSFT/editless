import * as vscode from 'vscode';
import { execSync } from 'child_process';

export interface CliProvider {
  name: string;
  command: string;
  versionCommand: string;
  detected: boolean;
  version?: string;
}

const KNOWN_PROFILES: Omit<CliProvider, 'detected' | 'version'>[] = [
  { name: 'agency', command: 'agency', versionCommand: 'agency --version' },
  { name: 'copilot', command: 'copilot', versionCommand: 'copilot --version' },
  { name: 'claude', command: 'claude', versionCommand: 'claude --version' },
];

let _providers: CliProvider[] = [];
let _activeProvider: CliProvider | undefined;

function probeCliVersion(versionCommand: string): string | null {
  try {
    const output = execSync(versionCommand, { encoding: 'utf-8', timeout: 5000 });
    const match = output.match(/([\d]+\.[\d]+[\d.]*)/);
    return match ? match[1] : output.trim().slice(0, 50) || null;
  } catch {
    return null;
  }
}

export function probeAllProviders(): CliProvider[] {
  _providers = KNOWN_PROFILES.map(profile => {
    const version = probeCliVersion(profile.versionCommand);
    return {
      ...profile,
      detected: version !== null,
      version: version ?? undefined,
    };
  });
  return _providers;
}

export function resolveActiveProvider(): CliProvider | undefined {
  const configured = vscode.workspace
    .getConfiguration('editless')
    .get<string>('cli.provider', 'copilot');

  // Manual override takes priority if the provider was detected
  const byConfig = _providers.find(p => p.name === configured && p.detected);
  if (byConfig) {
    _activeProvider = byConfig;
    return _activeProvider;
  }

  // Fall back to first detected provider
  _activeProvider = _providers.find(p => p.detected);
  return _activeProvider;
}

export function getActiveCliProvider(): CliProvider | undefined {
  return _activeProvider;
}

export function getAllProviders(): CliProvider[] {
  return _providers;
}

// --- Agency update (conditional on agency being detected) -----------------

function runAgencyUpdate(): void {
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: '🔄 Updating Agency…',
      cancellable: false,
    },
    () =>
      new Promise<void>((resolve) => {
        const { exec } = require('child_process');
        exec('agency update', (err: Error | null, _stdout: string, stderr: string) => {
          if (err) {
            const msg = stderr?.trim() || err.message;
            vscode.window.showErrorMessage(`Agency update failed: ${msg}`);
          } else {
            vscode.window.showInformationMessage('🔄 Agency updated.');
          }
          resolve();
        });
      }),
  );
}

export function registerAgencyUpdateCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('editless.updateAgency', () => {
    const agencyProvider = _providers.find(p => p.name === 'agency');
    if (!agencyProvider?.detected) {
      vscode.window.showWarningMessage('Agency CLI not detected. Update skipped.');
      return;
    }
    runAgencyUpdate();
  });
}

export function checkAgencyOnStartup(_context: vscode.ExtensionContext): void {
  const agencyProvider = _providers.find(p => p.name === 'agency');
  if (!agencyProvider?.detected) return;

  try {
    const output = execSync('agency update', { encoding: 'utf-8', timeout: 10000 });
    const updateAvailable = !output.includes('up to date');
    if (updateAvailable && agencyProvider.version) {
      vscode.window
        .showInformationMessage(
          `🔄 Agency update available (current: ${agencyProvider.version}). Update now?`,
          'Update',
        )
        .then(selection => {
          if (selection === 'Update') {
            runAgencyUpdate();
          }
        });
    }
  } catch {
    // agency update check failed silently
  }
}
