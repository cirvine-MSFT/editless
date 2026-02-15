import * as vscode from 'vscode';
import { execSync, exec } from 'child_process';

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
        exec('agency update', (err, _stdout, stderr) => {
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

interface AgencyPromptCache {
  promptedVersion: string;
  timestamp: number;
}

const AGENCY_PROMPT_KEY = 'editless.agencyUpdatePrompt';
const PROMPT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function shouldSkipPrompt(context: vscode.ExtensionContext, currentVersion: string): boolean {
  const cached = context.globalState.get<AgencyPromptCache>(AGENCY_PROMPT_KEY);
  if (!cached) return false;
  return cached.promptedVersion === currentVersion
    && (Date.now() - cached.timestamp) < PROMPT_COOLDOWN_MS;
}

function recordPrompt(context: vscode.ExtensionContext, version: string): void {
  context.globalState.update(AGENCY_PROMPT_KEY, {
    promptedVersion: version,
    timestamp: Date.now(),
  } satisfies AgencyPromptCache);
}

export function checkAgencyOnStartup(context: vscode.ExtensionContext): void {
  const agencyProvider = _providers.find(p => p.name === 'agency');
  if (!agencyProvider?.detected || !agencyProvider.version) return;

  if (shouldSkipPrompt(context, agencyProvider.version)) return;

  exec('agency update', { encoding: 'utf-8', timeout: 10000 }, (err, stdout) => {
    if (err) return;

    const updateAvailable = !stdout.includes('up to date');
    if (!updateAvailable) return;

    recordPrompt(context, agencyProvider.version!);

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
  });
}
