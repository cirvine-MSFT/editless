import { describe, it, expect, beforeEach, vi } from 'vitest';
import type * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Hoisted mocks — available before vi.mock factories execute
// ---------------------------------------------------------------------------

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;

const { mockExec, mockShowInformationMessage, mockWithProgress, mockShowErrorMessage, mockExecuteCommand } = vi.hoisted(() => ({
  mockExec: vi.fn(),
  mockShowInformationMessage: vi.fn().mockResolvedValue(undefined as string | undefined),
  mockWithProgress: vi.fn(),
  mockShowErrorMessage: vi.fn(),
  mockExecuteCommand: vi.fn(),
}));

vi.mock('child_process', () => ({
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

async function setupAgencyDetected(version: string): Promise<void> {
  mockExec.mockImplementation((cmd: string, opts: unknown, cb?: ExecCallback) => {
    if (typeof opts === 'function') { cb = opts as ExecCallback; }
    if (!cb) return;
    if (cmd === 'agency --version') { cb(null, version, ''); return; }
    cb(new Error('not found'), '', '');
  });
  await probeAllProviders();
}

async function setupNoProvidersDetected(): Promise<void> {
  mockExec.mockImplementation((_cmd: string, opts: unknown, cb?: ExecCallback) => {
    if (typeof opts === 'function') { cb = opts as ExecCallback; }
    if (cb) cb(new Error('not found'), '', '');
  });
  await probeAllProviders();
}

function mockExecForUpdates(stdout: string, fail = false): void {
  mockExec.mockImplementation(
    (cmd: string, opts: unknown, cb?: ExecCallback) => {
      if (typeof opts === 'function') { cb = opts as ExecCallback; }
      if (!cb) return;
      // Probe calls (version commands) — keep returning detected versions
      if (cmd.includes('--version')) {
        if (cmd === 'agency --version') { cb(null, '1.0.0', ''); return; }
        if (cmd === 'copilot --version') { cb(null, '2.0.0', ''); return; }
        if (cmd === 'claude --version') { cb(null, '3.0.0', ''); return; }
        cb(new Error('not found'), '', ''); return;
      }
      // Update commands
      if (fail) { cb(new Error('command failed'), '', 'error output'); return; }
      cb(null, stdout, '');
    },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkAgencyOnStartup', () => {
  beforeEach(() => {
    mockExec.mockReset();
    mockShowInformationMessage.mockReset();
    mockShowInformationMessage.mockResolvedValue(undefined as string | undefined);
    mockExecuteCommand.mockReset();
  });

  it('should not show toast when agency is not detected', async () => {
    await setupNoProvidersDetected();

    checkAgencyOnStartup(makeContext());

    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });

  it('should not show toast when agency version is empty', async () => {
    mockExec.mockImplementation((cmd: string, opts: unknown, cb?: ExecCallback) => {
      if (typeof opts === 'function') { cb = opts as ExecCallback; }
      if (!cb) return;
      if (cmd === 'agency --version') { cb(null, '', ''); return; }
      cb(new Error('not found'), '', '');
    });
    await probeAllProviders();

    checkAgencyOnStartup(makeContext());

    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });

  it('should not show toast when cached within 24h for same version', async () => {
    await setupAgencyDetected('1.2.3');
    const context = makeContext({
      'editless.agencyUpdatePrompt': {
        promptedVersion: '1.2.3',
        timestamp: Date.now() - 1_000,
      } satisfies AgencyPromptCache,
    });

    checkAgencyOnStartup(context);

    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });

  it('should show toast when no cache exists and update is available', async () => {
    await setupAgencyDetected('1.2.3');
    mockExecForUpdates('Agency 1.3.0 is available');

    checkAgencyOnStartup(makeContext());

    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Agency CLI update available'),
      'Update',
    );
  });

  it('should show toast when cache expired (>24h)', async () => {
    await setupAgencyDetected('1.2.3');
    mockExecForUpdates('Agency 1.3.0 is available');
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

  it('should show toast when version changed since last prompt', async () => {
    await setupAgencyDetected('2.0.0');
    mockExecForUpdates('Agency 2.1.0 is available');
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

  it('should not show toast when agency update reports up to date', async () => {
    await setupAgencyDetected('1.2.3');
    mockExecForUpdates('Everything is up to date');

    checkAgencyOnStartup(makeContext());

    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });

  it('should not show toast when exec errors (best-effort, silent)', async () => {
    await setupAgencyDetected('1.2.3');
    mockExecForUpdates('', true);

    checkAgencyOnStartup(makeContext());

    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });

  it('should record prompt in globalState when showing toast', async () => {
    await setupAgencyDetected('1.2.3');
    mockExecForUpdates('Agency 1.3.0 is available');
    const context = makeContext();

    checkAgencyOnStartup(context);

    const cached = context.globalState.get<AgencyPromptCache>('editless.agencyUpdatePrompt');
    expect(cached).toBeDefined();
    expect(cached!.promptedVersion).toBe('1.2.3');
    expect(cached!.timestamp).toBeLessThanOrEqual(Date.now());
    expect(cached!.timestamp).toBeGreaterThan(Date.now() - 5_000);
  });

  it('should not block — returns before exec callback fires', async () => {
    await setupAgencyDetected('1.2.3');
    let capturedCallback: ExecCallback | undefined;
    mockExec.mockImplementation(
      (cmd: string, opts: unknown, cb?: ExecCallback) => {
        if (typeof opts === 'function') { cb = opts as ExecCallback; }
        if (!cb) return;
        if (cmd.includes('--version')) { cb(new Error('not found'), '', ''); return; }
        capturedCallback = cb;
      },
    );

    checkAgencyOnStartup(makeContext());

    expect(mockShowInformationMessage).not.toHaveBeenCalled();

    capturedCallback!(null, 'Agency 1.3.0 is available', '');
    expect(mockShowInformationMessage).toHaveBeenCalled();
  });

  it('should include current version in toast message', async () => {
    await setupAgencyDetected('3.5.7');
    mockExecForUpdates('Agency 4.0.0 is available');

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
    mockExec.mockReset();
    mockShowInformationMessage.mockReset();
    mockShowInformationMessage.mockResolvedValue(undefined as string | undefined);
    mockWithProgress.mockReset();
    mockShowErrorMessage.mockReset();
    mockExecuteCommand.mockReset();
  });

  async function setupAllProvidersDetected(): Promise<void> {
    mockExec.mockImplementation((cmd: string, opts: unknown, cb?: ExecCallback) => {
      if (typeof opts === 'function') { cb = opts as ExecCallback; }
      if (!cb) return;
      if (cmd === 'agency --version') { cb(null, '1.0.0', ''); return; }
      if (cmd === 'copilot --version') { cb(null, '2.0.0', ''); return; }
      if (cmd === 'claude --version') { cb(null, '3.0.0', ''); return; }
      cb(new Error('not found'), '', '');
    });
    await probeAllProviders();
  }

  it('should skip providers without updateCommand', async () => {
    await setupAllProvidersDetected();
    mockExecForUpdates('New version available');

    checkProviderUpdatesOnStartup(makeContext());

    // Only agency has updateCommand — filter out version probe calls
    const updateCalls = mockExec.mock.calls.filter(
      (c: unknown[]) => !(c[0] as string).includes('--version'),
    );
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0][0]).toBe('agency update');
  });

  it('should check all providers with updateCommand set', async () => {
    await setupAllProvidersDetected();
    const copilot = getAllProviders().find(p => p.name === 'copilot')!;
    copilot.updateCommand = 'copilot update';
    copilot.upToDatePattern = 'already current';

    mockExecForUpdates('New version available');

    checkProviderUpdatesOnStartup(makeContext());

    const updateCalls = mockExec.mock.calls.filter(
      (c: unknown[]) => !(c[0] as string).includes('--version'),
    );
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls.map((c: unknown[]) => c[0])).toContain('agency update');
    expect(updateCalls.map((c: unknown[]) => c[0])).toContain('copilot update');
  });

  it('should isolate cache per provider', async () => {
    await setupAllProvidersDetected();
    const copilot = getAllProviders().find(p => p.name === 'copilot')!;
    copilot.updateCommand = 'copilot update';

    const context = makeContext({
      'editless.agencyUpdatePrompt': {
        promptedVersion: '1.0.0',
        timestamp: Date.now() - 1_000,
      },
    });

    mockExecForUpdates('New version available');

    checkProviderUpdatesOnStartup(context);

    // Agency cached and skipped; copilot has no cache and gets checked
    const updateCalls = mockExec.mock.calls.filter(
      (c: unknown[]) => !(c[0] as string).includes('--version'),
    );
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0][0]).toBe('copilot update');
  });

  it('should include provider display name in toast message', async () => {
    await setupAgencyDetected('1.0.0');
    mockExecForUpdates('New version available');

    checkProviderUpdatesOnStartup(makeContext());

    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Agency CLI update available'),
      'Update',
    );
  });

  it('should use default pattern when upToDatePattern is undefined', async () => {
    await setupAgencyDetected('1.0.0');
    const agency = getAllProviders().find(p => p.name === 'agency')!;
    agency.upToDatePattern = undefined;

    mockExecForUpdates('version 2.0.0 available for download');

    checkProviderUpdatesOnStartup(makeContext());

    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Agency CLI update available'),
      'Update',
    );
  });

  it('should use updateRunCommand when user clicks Update', async () => {
    await setupAgencyDetected('1.0.0');
    const agency = getAllProviders().find(p => p.name === 'agency')!;
    agency.updateRunCommand = 'agency update --force';

    mockExec.mockImplementation((cmd: string, opts: unknown, cb?: ExecCallback) => {
      if (typeof opts === 'function') { cb = opts as ExecCallback; }
      if (!cb) return;
      if (cmd.includes('--version')) { cb(new Error('not found'), '', ''); return; }
      cb(null, 'version 2.0.0 available', '');
    });
    mockShowInformationMessage.mockResolvedValue('Update');
    mockWithProgress.mockImplementation(
      (_opts: unknown, task: () => Promise<void>) => task(),
    );

    checkProviderUpdatesOnStartup(makeContext());

    await new Promise(resolve => setTimeout(resolve, 0));

    const updateCalls = mockExec.mock.calls.filter(
      (c: unknown[]) => !(c[0] as string).includes('--version'),
    );
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[1][0]).toBe('agency update --force');
  });
});
