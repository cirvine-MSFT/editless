import * as vscode from 'vscode';
import { exec } from 'child_process';
import { isNotificationEnabled } from './notifications';

export interface CliProvider {
  name: string;
  command: string;
  versionCommand: string;
  detected: boolean;
  version?: string;
  updateCommand?: string;
  upToDatePattern?: string;
  updateRunCommand?: string;
}

const KNOWN_PROFILES: Omit<CliProvider, 'detected' | 'version'>[] = [
  {
    name: 'agency',
    command: 'agency',
    versionCommand: 'agency --version',
    updateCommand: 'agency update',
    upToDatePattern: 'up to date',
    updateRunCommand: 'agency update',
  },
  { name: 'copilot', command: 'copilot', versionCommand: 'copilot --version' },
  { name: 'claude', command: 'claude', versionCommand: 'claude --version' },
  { name: 'custom', command: '', versionCommand: '' },
];

let _providers: CliProvider[] = [];
let _activeProvider: CliProvider | undefined;

function probeCliVersion(versionCommand: string): Promise<string | null> {
  if (!versionCommand) return Promise.resolve(null);
  return new Promise(resolve => {
    exec(versionCommand, { encoding: 'utf-8', timeout: 5000 }, (err, stdout) => {
      if (err) { resolve(null); return; }
      const match = stdout.match(/([\d]+\.[\d]+[\d.]*)/);
      resolve(match ? match[1] : stdout.trim().slice(0, 50) || null);
    });
  });
}

export async function probeAllProviders(): Promise<CliProvider[]> {
  _providers = await Promise.all(
    KNOWN_PROFILES.map(async profile => {
      const version = await probeCliVersion(profile.versionCommand);
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
  const configured = vscode.workspace
    .getConfiguration('editless')
    .get<string>('cli.provider', 'copilot');

  // Honor explicit "custom" setting — presence-only, no probe needed
  if (configured === 'custom') {
    _activeProvider = _providers.find(p => p.name === 'custom');
    return _activeProvider;
  }

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

// --- Provider updates (conditional on provider having updateCommand) -------

function setAgencyUpdateAvailable(available: boolean): void {
  vscode.commands.executeCommand('setContext', 'editless.agencyUpdateAvailable', available);
}

function runProviderUpdate(provider: CliProvider): void {
  const displayName = provider.name.charAt(0).toUpperCase() + provider.name.slice(1);
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `🔄 Updating ${displayName} CLI…`,
      cancellable: false,
    },
    () =>
      new Promise<void>((resolve) => {
        exec(provider.updateRunCommand || provider.updateCommand!, (err, _stdout, stderr) => {
          if (err) {
            const msg = stderr?.trim() || err.message;
            vscode.window.showErrorMessage(`${displayName} CLI update failed: ${msg}`);
          } else {
            if (provider.name === 'agency') setAgencyUpdateAvailable(false);
            vscode.window.showInformationMessage(`🔄 ${displayName} CLI updated.`);
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
    runProviderUpdate(agencyProvider);
  });
}

interface ProviderPromptCache {
  promptedVersion: string;
  timestamp: number;
}

const PROMPT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function promptCacheKey(providerName: string): string {
  return `editless.${providerName}UpdatePrompt`;
}

function shouldSkipPrompt(context: vscode.ExtensionContext, providerName: string, currentVersion: string): boolean {
  const cached = context.globalState.get<ProviderPromptCache>(promptCacheKey(providerName));
  if (!cached) return false;
  return cached.promptedVersion === currentVersion
    && (Date.now() - cached.timestamp) < PROMPT_COOLDOWN_MS;
}

function recordPrompt(context: vscode.ExtensionContext, providerName: string, version: string): void {
  context.globalState.update(promptCacheKey(providerName), {
    promptedVersion: version,
    timestamp: Date.now(),
  } satisfies ProviderPromptCache);
}

function checkSingleProviderUpdate(context: vscode.ExtensionContext, provider: CliProvider): void {
  if (!isNotificationEnabled('updates')) return;
  if (shouldSkipPrompt(context, provider.name, provider.version!)) return;

  const displayName = provider.name.charAt(0).toUpperCase() + provider.name.slice(1);
  const pattern = provider.upToDatePattern ?? 'up to date';

  exec(provider.updateCommand!, { encoding: 'utf-8', timeout: 10000 }, (err, stdout) => {
    if (err) return;

    const upToDate = stdout.includes(pattern);
    if (provider.name === 'agency') setAgencyUpdateAvailable(!upToDate);
    if (upToDate) return;

    recordPrompt(context, provider.name, provider.version!);

    const availableMatch = stdout.match(/([\d]+\.[\d]+[\d.]*)/);
    const available = availableMatch?.[1];
    const msg = available
      ? `🔄 ${displayName} CLI update available: ${provider.version} → ${available}. Update now?`
      : `🔄 ${displayName} CLI update available (current: ${provider.version}). Update now?`;

    vscode.window
      .showInformationMessage(msg, 'Update')
      .then(selection => {
        if (selection === 'Update') {
          runProviderUpdate(provider);
        }
      });
  });
}

export function checkProviderUpdatesOnStartup(context: vscode.ExtensionContext): void {
  for (const provider of _providers) {
    if (!provider.detected || !provider.version || !provider.updateCommand) continue;
    checkSingleProviderUpdate(context, provider);
  }
}

/** @deprecated Use checkProviderUpdatesOnStartup — kept for backward compat */
export function checkAgencyOnStartup(context: vscode.ExtensionContext): void {
  checkProviderUpdatesOnStartup(context);
}
