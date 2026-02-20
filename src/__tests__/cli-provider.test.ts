import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;

const { mockExec, mockShowInformationMessage, mockWithProgress, mockShowErrorMessage, mockExecuteCommand, mockConfigGet, mockConfigUpdate, mockShowQuickPick, mockShowWarningMessage } = vi.hoisted(() => ({
  mockExec: vi.fn(),
  mockShowInformationMessage: vi.fn().mockResolvedValue(undefined as string | undefined),
  mockWithProgress: vi.fn(),
  mockShowErrorMessage: vi.fn(),
  mockExecuteCommand: vi.fn(),
  mockConfigGet: vi.fn(),
  mockConfigUpdate: vi.fn().mockResolvedValue(undefined),
  mockShowQuickPick: vi.fn(),
  mockShowWarningMessage: vi.fn(),
}));

vi.mock('child_process', () => ({
  exec: mockExec,
}));

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: mockConfigGet,
      update: mockConfigUpdate,
    }),
  },
  window: {
    showInformationMessage: mockShowInformationMessage,
    showErrorMessage: mockShowErrorMessage,
    showWarningMessage: mockShowWarningMessage,
    showQuickPick: mockShowQuickPick,
    withProgress: mockWithProgress,
  },
  commands: {
    registerCommand: vi.fn(),
    executeCommand: mockExecuteCommand,
  },
  ProgressLocation: { Notification: 15 },
  ConfigurationTarget: { Global: 1 },
}));

import {
  probeAllProviders,
  resolveActiveProvider,
  getActiveCliProvider,
  getActiveProviderLaunchCommand,
  getAllProviders,
} from '../cli-provider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockConfigWithProviders(providers: unknown[], activeProvider = 'auto'): void {
  mockConfigGet.mockImplementation((key: string) => {
    if (key === 'cli.providers') return providers;
    if (key === 'cli.activeProvider') return activeProvider;
    return undefined;
  });
}

function setupCopilotDetected(version = '2.0.0'): void {
  mockExec.mockImplementation((cmd: string, opts: unknown, cb?: ExecCallback) => {
    if (typeof opts === 'function') { cb = opts as ExecCallback; }
    if (!cb) return;
    if (cmd === 'copilot --version') { cb(null, version, ''); return; }
    cb(new Error('not found'), '', '');
  });
}

function setupNoProvidersDetected(): void {
  mockExec.mockImplementation((_cmd: string, opts: unknown, cb?: ExecCallback) => {
    if (typeof opts === 'function') { cb = opts as ExecCallback; }
    if (cb) cb(new Error('not found'), '', '');
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('cli-provider (generic)', () => {
  beforeEach(() => {
    mockExec.mockReset();
    mockShowInformationMessage.mockReset();
    mockShowInformationMessage.mockResolvedValue(undefined as string | undefined);
    mockExecuteCommand.mockReset();
    mockConfigGet.mockReset();
    mockConfigUpdate.mockReset();
    mockConfigUpdate.mockResolvedValue(undefined);
  });

  describe('probeAllProviders', () => {
    it('should self-heal by adding Copilot default when providers array is empty', async () => {
      mockConfigWithProviders([]);
      setupCopilotDetected();

      await probeAllProviders();
      // Self-healing should trigger config.update
      expect(mockConfigUpdate).toHaveBeenCalled();
      const providers = getAllProviders();
      expect(providers.some(p => p.name === 'Copilot CLI')).toBe(true);
    });

    it('should not self-heal when Copilot provider already exists', async () => {
      mockConfigWithProviders([
        { name: 'Copilot CLI', command: 'copilot', versionCommand: 'copilot --version' },
      ]);
      setupCopilotDetected();

      await probeAllProviders();
      expect(mockConfigUpdate).not.toHaveBeenCalled();
    });

    it('should detect provider when version command succeeds', async () => {
      mockConfigWithProviders([
        { name: 'Copilot CLI', command: 'copilot', versionCommand: 'copilot --version' },
      ]);
      setupCopilotDetected('3.5.1');

      const providers = await probeAllProviders();
      expect(providers[0].detected).toBe(true);
      expect(providers[0].version).toBe('3.5.1');
    });

    it('should not detect provider when version command fails', async () => {
      mockConfigWithProviders([
        { name: 'Copilot CLI', command: 'copilot', versionCommand: 'copilot --version' },
      ]);
      setupNoProvidersDetected();

      const providers = await probeAllProviders();
      expect(providers[0].detected).toBe(false);
    });

    it('should use custom versionRegex for version parsing', async () => {
      mockConfigWithProviders([
        { name: 'Copilot CLI', command: 'copilot', versionCommand: 'copilot --version' },
        { name: 'Custom', command: 'custom', versionCommand: 'custom version', versionRegex: 'v(\\d+\\.\\d+)' },
      ]);
      mockExec.mockImplementation((cmd: string, opts: unknown, cb?: ExecCallback) => {
        if (typeof opts === 'function') { cb = opts as ExecCallback; }
        if (!cb) return;
        if (cmd === 'custom version') { cb(null, 'Custom CLI v4.2 stable', ''); return; }
        cb(new Error('not found'), '', '');
      });

      const providers = await probeAllProviders();
      const custom = providers.find(p => p.name === 'Custom');
      expect(custom?.version).toBe('4.2');
    });
  });

  describe('resolveActiveProvider', () => {
    it('should resolve to first detected provider when set to auto', async () => {
      mockConfigWithProviders([
        { name: 'Copilot CLI', command: 'copilot', versionCommand: 'copilot --version' },
      ], 'auto');
      setupCopilotDetected();
      await probeAllProviders();

      const active = resolveActiveProvider();
      expect(active?.name).toBe('Copilot CLI');
    });

    it('should resolve to named provider when explicitly configured', async () => {
      mockConfigWithProviders([
        { name: 'Copilot CLI', command: 'copilot', versionCommand: 'copilot --version' },
        { name: 'Custom', command: 'custom', versionCommand: 'custom --version' },
      ], 'Custom');
      mockExec.mockImplementation((cmd: string, opts: unknown, cb?: ExecCallback) => {
        if (typeof opts === 'function') { cb = opts as ExecCallback; }
        if (!cb) return;
        if (cmd === 'copilot --version') { cb(null, '2.0.0', ''); return; }
        if (cmd === 'custom --version') { cb(null, '1.0.0', ''); return; }
        cb(new Error('not found'), '', '');
      });
      await probeAllProviders();

      const active = resolveActiveProvider();
      expect(active?.name).toBe('Custom');
    });

    it('should fall back to first detected when named provider is not found', async () => {
      mockConfigWithProviders([
        { name: 'Copilot CLI', command: 'copilot', versionCommand: 'copilot --version' },
      ], 'NonExistent');
      setupCopilotDetected();
      await probeAllProviders();

      const active = resolveActiveProvider();
      expect(active?.name).toBe('Copilot CLI');
    });
  });

  describe('getActiveProviderLaunchCommand', () => {
    it('should return launch command from active provider', async () => {
      mockConfigWithProviders([
        { name: 'Copilot CLI', command: 'copilot', versionCommand: 'copilot --version', launchCommand: 'copilot --agent $(agent)' },
      ]);
      setupCopilotDetected();
      await probeAllProviders();
      resolveActiveProvider();

      expect(getActiveProviderLaunchCommand()).toBe('copilot --agent $(agent)');
    });

    it('should return empty string when no active provider', async () => {
      mockConfigWithProviders([]);
      setupNoProvidersDetected();
      await probeAllProviders();
      resolveActiveProvider();

      expect(getActiveProviderLaunchCommand()).toBe('');
    });
  });
});
