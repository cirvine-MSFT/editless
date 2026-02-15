import { describe, it, expect, beforeEach, vi } from 'vitest';
import type * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Hoisted mocks — available before vi.mock factories execute
// ---------------------------------------------------------------------------

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;

const { mockExecSync, mockExec, mockShowInformationMessage, mockWithProgress, mockShowErrorMessage, mockExecuteCommand } = vi.hoisted(() => ({
  mockExecSync: vi.fn(),
  mockExec: vi.fn(),
  mockShowInformationMessage: vi.fn().mockResolvedValue(undefined as string | undefined),
  mockWithProgress: vi.fn(),
  mockShowErrorMessage: vi.fn(),
  mockExecuteCommand: vi.fn(),
}));

vi.mock('child_process', () => ({
  execSync: mockExecSync,
  exec: mockExec,
}));

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: (_key: string, defaultValue?: string) => defaultValue,
    }),
  },
  window: {
    showInformationMessage: mockShowInformationMessage,
    showErrorMessage: mockShowErrorMessage,
    withProgress: mockWithProgress,
  },
  commands: {
    executeCommand: mockExecuteCommand,
  },
  ProgressLocation: { Notification: 15 },
}));

import { probeAllProviders, checkAgencyOnStartup, checkProviderUpdatesOnStartup, getAllProviders } from '../cli-provider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AgencyPromptCache {
  promptedVersion: string;
  timestamp: number;
}

function makeContext(data: Record<string, unknown> = {}): vscode.ExtensionContext {
  const store = new Map<string, unknown>(Object.entries(data));
  return {
    globalState: {
      get<T>(key: string): T | undefined {
        return store.get(key) as T | undefined;
      },
      update(key: string, value: unknown): Thenable<void> {
        store.set(key, value);
        return Promise.resolve();
      },
      keys: () => [...store.keys()],
      setKeysForSync: () => {},
    },
  } as unknown as vscode.ExtensionContext;
}

function setupAgencyDetected(version: string): void {
  mockExecSync.mockImplementation((cmd: string) => {
    if (cmd === 'agency --version') return version;
    throw new Error('not found');
  });
  probeAllProviders();
}

function setupNoProvidersDetected(): void {
  mockExecSync.mockImplementation(() => { throw new Error('not found'); });
  probeAllProviders();
}

function mockExecSuccess(stdout: string): void {
  mockExec.mockImplementation(
    (_cmd: string, _opts: Record<string, unknown>, cb: ExecCallback) => {
      cb(null, stdout, '');
    },
  );
}

function mockExecFailure(): void {
  mockExec.mockImplementation(
    (_cmd: string, _opts: Record<string, unknown>, cb: ExecCallback) => {
      cb(new Error('command failed'), '', 'error output');
    },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkAgencyOnStartup', () => {
  beforeEach(() => {
    mockExecSync.mockReset();
    mockExec.mockReset();
    mockShowInformationMessage.mockReset();
    mockShowInformationMessage.mockResolvedValue(undefined as string | undefined);
    mockExecuteCommand.mockReset();
  });

  it('should not show toast when agency is not detected', () => {
    setupNoProvidersDetected();

    checkAgencyOnStartup(makeContext());

    expect(mockExec).not.toHaveBeenCalled();
    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });

  it('should not show toast when agency version is empty', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd === 'agency --version') return '';
      throw new Error('not found');
    });
    probeAllProviders();

    checkAgencyOnStartup(makeContext());

    expect(mockExec).not.toHaveBeenCalled();
    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });

  it('should not show toast when cached within 24h for same version', () => {
    setupAgencyDetected('1.2.3');
    const context = makeContext({
      'editless.agencyUpdatePrompt': {
        promptedVersion: '1.2.3',
        timestamp: Date.now() - 1_000,
      } satisfies AgencyPromptCache,
    });

    checkAgencyOnStartup(context);

    expect(mockExec).not.toHaveBeenCalled();
    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });

  it('should show toast when no cache exists and update is available', () => {
    setupAgencyDetected('1.2.3');
    mockExecSuccess('Agency 1.3.0 is available');

    checkAgencyOnStartup(makeContext());

    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Agency CLI update available'),
      'Update',
    );
  });

  it('should show toast when cache expired (>24h)', () => {
    setupAgencyDetected('1.2.3');
    mockExecSuccess('Agency 1.3.0 is available');
    const context = makeContext({
      'editless.agencyUpdatePrompt': {
        promptedVersion: '1.2.3',
        timestamp: Date.now() - 25 * 60 * 60 * 1_000,
      } satisfies AgencyPromptCache,
    });

    checkAgencyOnStartup(context);

    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Agency CLI update available'),
      'Update',
    );
  });

  it('should show toast when version changed since last prompt', () => {
    setupAgencyDetected('2.0.0');
    mockExecSuccess('Agency 2.1.0 is available');
    const context = makeContext({
      'editless.agencyUpdatePrompt': {
        promptedVersion: '1.2.3',
        timestamp: Date.now() - 1_000,
      } satisfies AgencyPromptCache,
    });

    checkAgencyOnStartup(context);

    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Agency CLI update available'),
      'Update',
    );
  });

  it('should not show toast when agency update reports up to date', () => {
    setupAgencyDetected('1.2.3');
    mockExecSuccess('Everything is up to date');

    checkAgencyOnStartup(makeContext());

    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });

  it('should not show toast when exec errors (best-effort, silent)', () => {
    setupAgencyDetected('1.2.3');
    mockExecFailure();

    checkAgencyOnStartup(makeContext());

    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });

  it('should record prompt in globalState when showing toast', () => {
    setupAgencyDetected('1.2.3');
    mockExecSuccess('Agency 1.3.0 is available');
    const context = makeContext();

    checkAgencyOnStartup(context);

    const cached = context.globalState.get<AgencyPromptCache>('editless.agencyUpdatePrompt');
    expect(cached).toBeDefined();
    expect(cached!.promptedVersion).toBe('1.2.3');
    expect(cached!.timestamp).toBeLessThanOrEqual(Date.now());
    expect(cached!.timestamp).toBeGreaterThan(Date.now() - 5_000);
  });

  it('should not block — returns before exec callback fires', () => {
    setupAgencyDetected('1.2.3');
    let capturedCallback: ExecCallback | undefined;
    mockExec.mockImplementation(
      (_cmd: string, _opts: Record<string, unknown>, cb: ExecCallback) => {
        capturedCallback = cb;
      },
    );

    checkAgencyOnStartup(makeContext());

    expect(mockExec).toHaveBeenCalled();
    expect(mockShowInformationMessage).not.toHaveBeenCalled();

    capturedCallback!(null, 'Agency 1.3.0 is available', '');
    expect(mockShowInformationMessage).toHaveBeenCalled();
  });

  it('should include current version in toast message', () => {
    setupAgencyDetected('3.5.7');
    mockExecSuccess('Agency 4.0.0 is available');

    checkAgencyOnStartup(makeContext());

    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('3.5.7'),
      'Update',
    );
  });
});

// ---------------------------------------------------------------------------
// Generalized provider update infrastructure (#14)
// ---------------------------------------------------------------------------

describe('checkProviderUpdatesOnStartup — generalized provider updates', () => {
  beforeEach(() => {
    mockExecSync.mockReset();
    mockExec.mockReset();
    mockShowInformationMessage.mockReset();
    mockShowInformationMessage.mockResolvedValue(undefined as string | undefined);
    mockWithProgress.mockReset();
    mockShowErrorMessage.mockReset();
    mockExecuteCommand.mockReset();
  });

  function setupAllProvidersDetected(): void {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd === 'agency --version') return '1.0.0';
      if (cmd === 'copilot --version') return '2.0.0';
      if (cmd === 'claude --version') return '3.0.0';
      throw new Error('not found');
    });
    probeAllProviders();
  }

  it('should skip providers without updateCommand', () => {
    setupAllProvidersDetected();
    mockExecSuccess('New version available');

    checkProviderUpdatesOnStartup(makeContext());

    expect(mockExec).toHaveBeenCalledTimes(1);
    expect(mockExec).toHaveBeenCalledWith(
      'agency update',
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('should check all providers with updateCommand set', () => {
    setupAllProvidersDetected();
    const copilot = getAllProviders().find(p => p.name === 'copilot')!;
    copilot.updateCommand = 'copilot update';
    copilot.upToDatePattern = 'already current';

    mockExecSuccess('New version available');

    checkProviderUpdatesOnStartup(makeContext());

    expect(mockExec).toHaveBeenCalledTimes(2);
    expect(mockExec).toHaveBeenCalledWith('agency update', expect.any(Object), expect.any(Function));
    expect(mockExec).toHaveBeenCalledWith('copilot update', expect.any(Object), expect.any(Function));
  });

  it('should isolate cache per provider', () => {
    setupAllProvidersDetected();
    const copilot = getAllProviders().find(p => p.name === 'copilot')!;
    copilot.updateCommand = 'copilot update';

    const context = makeContext({
      'editless.agencyUpdatePrompt': {
        promptedVersion: '1.0.0',
        timestamp: Date.now() - 1_000,
      },
    });

    mockExecSuccess('New version available');

    checkProviderUpdatesOnStartup(context);

    // Agency cached and skipped; copilot has no cache and gets checked
    expect(mockExec).toHaveBeenCalledTimes(1);
    expect(mockExec).toHaveBeenCalledWith('copilot update', expect.any(Object), expect.any(Function));
  });

  it('should include provider display name in toast message', () => {
    setupAgencyDetected('1.0.0');
    mockExecSuccess('New version available');

    checkProviderUpdatesOnStartup(makeContext());

    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Agency CLI update available'),
      'Update',
    );
  });

  it('should use default pattern when upToDatePattern is undefined', () => {
    setupAgencyDetected('1.0.0');
    const agency = getAllProviders().find(p => p.name === 'agency')!;
    agency.upToDatePattern = undefined;

    mockExecSuccess('version 2.0.0 available for download');

    checkProviderUpdatesOnStartup(makeContext());

    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Agency CLI update available'),
      'Update',
    );
  });

  it('should use updateRunCommand when user clicks Update', async () => {
    setupAgencyDetected('1.0.0');
    const agency = getAllProviders().find(p => p.name === 'agency')!;
    agency.updateRunCommand = 'agency update --force';

    mockExec.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as ExecCallback;
      cb(null, 'version 2.0.0 available', '');
    });
    mockShowInformationMessage.mockResolvedValue('Update');
    mockWithProgress.mockImplementation(
      (_opts: unknown, task: () => Promise<void>) => task(),
    );

    checkProviderUpdatesOnStartup(makeContext());

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockExec).toHaveBeenCalledTimes(2);
    expect(mockExec.mock.calls[1][0]).toBe('agency update --force');
  });
});
