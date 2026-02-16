import * as vscode from 'vscode';
import { exec } from 'child_process';
import { isNotificationEnabled } from './notifications';

export interface CliProvider {
  name: string;
  command: string;
  versionCommand: string;
  versionRegex: string;
  launchCommand: string;
  createCommand: string;
  updateCommand: string;
  updateRunCommand: string;
  upToDatePattern: string;
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
  updateCommand: 'copilot update',
  updateRunCommand: '',
  upToDatePattern: 'latest version',
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
    updateCommand: entry.updateCommand ?? '',
    updateRunCommand: entry.updateRunCommand ?? '',
    upToDatePattern: entry.upToDatePattern ?? 'up to date',
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

// --- Provider updates -------------------------------------------------------

function setCliUpdateAvailable(available: boolean): void {
  vscode.commands.executeCommand('setContext', 'editless.cliUpdateAvailable', available);
}

function runProviderUpdate(provider: CliProvider): void {
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Updating ${provider.name}...`,
      cancellable: false,
    },
    () =>
      new Promise<void>((resolve) => {
        exec(provider.updateRunCommand || provider.updateCommand, (err, _stdout, stderr) => {
          if (err) {
            const msg = stderr?.trim() || err.message;
            vscode.window.showErrorMessage(`${provider.name} update failed: ${msg}`);
          } else {
            setCliUpdateAvailable(false);
            vscode.window.showInformationMessage(`${provider.name} updated.`);
          }
          resolve();
        });
      }),
  );
}

export function registerCliUpdateCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('editless.updateCliProvider', async () => {
    const updatable = _providers.filter(p => p.detected && p.updateCommand);
    if (updatable.length === 0) {
      vscode.window.showInformationMessage('All CLIs are up to date.');
      return;
    }
    if (updatable.length === 1) {
      runProviderUpdate(updatable[0]);
      return;
    }
    const picked = await vscode.window.showQuickPick(
      updatable.map(p => ({ label: p.name, provider: p })),
      { placeHolder: 'Select CLI to update' },
    );
    if (picked) runProviderUpdate(picked.provider);
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

  exec(provider.updateCommand, { encoding: 'utf-8', timeout: 10000 }, (err, stdout) => {
    if (err) return;

    let upToDate: boolean;
    try {
      upToDate = new RegExp(provider.upToDatePattern).test(stdout);
    } catch {
      upToDate = stdout.includes(provider.upToDatePattern);
    }

    setCliUpdateAvailable(!upToDate);
    if (upToDate) return;

    recordPrompt(context, provider.name, provider.version!);

    const availableMatch = stdout.match(/([\d]+\.[\d]+[\d.]*)/);
    const available = availableMatch?.[1];
    const msg = available
      ? `${provider.name} update available: ${provider.version} -> ${available}. Update now?`
      : `${provider.name} update available (current: ${provider.version}). Update now?`;

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
