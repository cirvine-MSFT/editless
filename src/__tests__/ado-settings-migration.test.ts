import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

interface MockConfigData {
  'ado.connections'?: string[];
  'ado.organization'?: string;
  'ado.project'?: string;
  'ado.projects'?: Array<{ name: string; enabled?: boolean } | null | undefined>;
}

interface InspectResult {
  globalValue?: unknown;
  workspaceValue?: unknown;
  workspaceFolderValue?: unknown;
  defaultValue?: unknown;
}

type InspectOverrides = Partial<Record<string, InspectResult>>;

function createMockConfig(data: MockConfigData, inspectOverrides: InspectOverrides = {}) {
  const updateFn = vi.fn().mockResolvedValue(undefined);
  const config = {
    get: vi.fn((key: string, defaultValue?: unknown) => {
      const val = data[key as keyof MockConfigData];
      return val !== undefined ? val : defaultValue;
    }),
    update: updateFn,
    inspect: vi.fn((key: string) => {
      if (inspectOverrides[key]) return inspectOverrides[key];
      const val = data[key as keyof MockConfigData];
      if (val !== undefined) {
        return { workspaceValue: val, defaultValue: undefined };
      }
      return { defaultValue: undefined };
    }),
  };
  return { config, updateFn };
}

function createMockContext(alreadyMigrated = false) {
  const state = new Map<string, unknown>();
  if (alreadyMigrated) state.set('adoSettingsMigrated', true);

  return {
    workspaceState: {
      get: vi.fn((key: string) => state.get(key)),
      update: vi.fn(async (key: string, value: unknown) => { state.set(key, value); }),
    },
  } as unknown as vscode.ExtensionContext;
}

function createMockOutput() {
  return {
    appendLine: vi.fn(),
  } as unknown as vscode.OutputChannel;
}

// ---------------------------------------------------------------------------
// Mock vscode module
// ---------------------------------------------------------------------------

const { mockGetConfiguration } = vi.hoisted(() => ({
  mockGetConfiguration: vi.fn(),
}));

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: mockGetConfiguration,
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3,
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { migrateAdoSettings } from '../ado-settings-migration';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('migrateAdoSettings', () => {
  let mockContext: vscode.ExtensionContext;
  let mockOutput: vscode.OutputChannel;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockContext();
    mockOutput = createMockOutput();
  });

  // =========================================================================
  // Conversion correctness
  // =========================================================================

  describe('conversion correctness', () => {
    it('migrates org + projects → connections', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': 'https://dev.azure.com/myorg',
        'ado.projects': [{ name: 'A', enabled: true }, { name: 'B', enabled: true }],
        'ado.project': '',
      });
      mockGetConfiguration.mockReturnValue(config);

      const result = await migrateAdoSettings(mockContext, mockOutput);

      expect(result).toBe(true);
      expect(updateFn).toHaveBeenCalledWith(
        'ado.connections',
        ['https://dev.azure.com/myorg/A', 'https://dev.azure.com/myorg/B'],
        2, // ConfigurationTarget.Workspace
      );
    });

    it('migrates org + single project → connections', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': 'https://dev.azure.com/myorg',
        'ado.project': 'Solo',
        'ado.projects': [],
      });
      mockGetConfiguration.mockReturnValue(config);

      const result = await migrateAdoSettings(mockContext, mockOutput);

      expect(result).toBe(true);
      expect(updateFn).toHaveBeenCalledWith(
        'ado.connections',
        ['https://dev.azure.com/myorg/Solo'],
        2,
      );
    });

    it('filters disabled projects', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': 'https://dev.azure.com/myorg',
        'ado.projects': [
          { name: 'A', enabled: true },
          { name: 'B', enabled: false },
          { name: 'C' },  // undefined enabled → defaults to included
        ],
        'ado.project': '',
      });
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockContext, mockOutput);

      expect(updateFn).toHaveBeenCalledWith(
        'ado.connections',
        ['https://dev.azure.com/myorg/A', 'https://dev.azure.com/myorg/C'],
        2,
      );
    });

    it('org + projects takes priority over single project', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': 'https://dev.azure.com/myorg',
        'ado.projects': [{ name: 'A' }],
        'ado.project': 'Legacy',
      });
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockContext, mockOutput);

      expect(updateFn).toHaveBeenCalledWith(
        'ado.connections',
        ['https://dev.azure.com/myorg/A'],
        2,
      );
    });

    it('handles trailing slash on org URL', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': 'https://dev.azure.com/myorg/',
        'ado.project': 'P',
        'ado.projects': [],
      });
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockContext, mockOutput);

      expect(updateFn).toHaveBeenCalledWith(
        'ado.connections',
        ['https://dev.azure.com/myorg/P'],
        2,
      );
    });

    it('handles visualstudio.com org URL', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': 'https://myorg.visualstudio.com',
        'ado.project': 'P',
        'ado.projects': [],
      });
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockContext, mockOutput);

      expect(updateFn).toHaveBeenCalledWith(
        'ado.connections',
        ['https://myorg.visualstudio.com/P'],
        2,
      );
    });
  });

  // =========================================================================
  // Skip conditions
  // =========================================================================

  describe('skip conditions', () => {
    it('skips when connections already populated', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.connections': ['https://dev.azure.com/myorg/A'],
        'ado.organization': 'https://dev.azure.com/myorg',
        'ado.project': 'A',
      });
      mockGetConfiguration.mockReturnValue(config);

      const result = await migrateAdoSettings(mockContext, mockOutput);

      expect(result).toBe(false);
      expect(updateFn).not.toHaveBeenCalled();
      expect(mockContext.workspaceState.update).toHaveBeenCalledWith('adoSettingsMigrated', true);
    });

    it('skips when workspaceState says already migrated', async () => {
      mockContext = createMockContext(true);
      const { config, updateFn } = createMockConfig({
        'ado.organization': 'https://dev.azure.com/myorg',
        'ado.project': 'A',
      });
      mockGetConfiguration.mockReturnValue(config);

      const result = await migrateAdoSettings(mockContext, mockOutput);

      expect(result).toBe(false);
      expect(updateFn).not.toHaveBeenCalled();
    });

    it('no-op when no old settings exist', async () => {
      const { config, updateFn } = createMockConfig({});
      mockGetConfiguration.mockReturnValue(config);

      const result = await migrateAdoSettings(mockContext, mockOutput);

      expect(result).toBe(false);
      expect(updateFn).not.toHaveBeenCalled();
      expect(mockContext.workspaceState.update).toHaveBeenCalledWith('adoSettingsMigrated', true);
    });

    it('no-op when organization is empty string', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': '',
        'ado.project': 'P',
      });
      mockGetConfiguration.mockReturnValue(config);

      const result = await migrateAdoSettings(mockContext, mockOutput);

      expect(result).toBe(false);
      expect(updateFn).not.toHaveBeenCalled();
    });

    it('no-op when organization set but no projects', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': 'https://dev.azure.com/myorg',
        'ado.project': '',
        'ado.projects': [],
      });
      mockGetConfiguration.mockReturnValue(config);

      const result = await migrateAdoSettings(mockContext, mockOutput);

      expect(result).toBe(false);
      expect(updateFn).not.toHaveBeenCalled();
    });

    it('no-op when all projects disabled', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': 'https://dev.azure.com/myorg',
        'ado.projects': [{ name: 'A', enabled: false }],
        'ado.project': '',
      });
      mockGetConfiguration.mockReturnValue(config);

      const result = await migrateAdoSettings(mockContext, mockOutput);

      expect(result).toBe(false);
      expect(updateFn).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Settings cleanup
  // =========================================================================

  describe('settings cleanup', () => {
    it('removes organization after migration', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': 'https://dev.azure.com/myorg',
        'ado.project': 'P',
        'ado.projects': [],
      });
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockContext, mockOutput);

      expect(updateFn).toHaveBeenCalledWith('ado.organization', undefined, 2);
    });

    it('removes project after migration', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': 'https://dev.azure.com/myorg',
        'ado.project': 'P',
        'ado.projects': [],
      });
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockContext, mockOutput);

      expect(updateFn).toHaveBeenCalledWith('ado.project', undefined, 2);
    });

    it('removes projects after migration', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': 'https://dev.azure.com/myorg',
        'ado.projects': [{ name: 'A' }],
      });
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockContext, mockOutput);

      expect(updateFn).toHaveBeenCalledWith('ado.projects', undefined, 2);
    });

    it('removes settings at their original scope', async () => {
      const { config, updateFn } = createMockConfig(
        {
          'ado.organization': 'https://dev.azure.com/myorg',
          'ado.project': 'P',
          'ado.projects': [],
        },
        {
          'ado.organization': { globalValue: 'https://dev.azure.com/myorg' },
        },
      );
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockContext, mockOutput);

      // Should use Global (1) because inspect found globalValue
      expect(updateFn).toHaveBeenCalledWith('ado.connections', expect.any(Array), 1);
      expect(updateFn).toHaveBeenCalledWith('ado.organization', undefined, 1);
    });
  });

  // =========================================================================
  // Scope detection
  // =========================================================================

  describe('scope detection', () => {
    it('detects workspace-level settings', async () => {
      const { config, updateFn } = createMockConfig(
        { 'ado.organization': 'https://dev.azure.com/myorg', 'ado.project': 'P', 'ado.projects': [] },
        { 'ado.organization': { workspaceValue: 'https://dev.azure.com/myorg' } },
      );
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockContext, mockOutput);

      expect(updateFn).toHaveBeenCalledWith('ado.connections', expect.any(Array), 2);
    });

    it('detects user-level settings', async () => {
      const { config, updateFn } = createMockConfig(
        { 'ado.organization': 'https://dev.azure.com/myorg', 'ado.project': 'P', 'ado.projects': [] },
        { 'ado.organization': { globalValue: 'https://dev.azure.com/myorg' } },
      );
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockContext, mockOutput);

      expect(updateFn).toHaveBeenCalledWith('ado.connections', expect.any(Array), 1);
    });

    it('detects workspace-folder-level settings', async () => {
      const { config, updateFn } = createMockConfig(
        { 'ado.organization': 'https://dev.azure.com/myorg', 'ado.project': 'P', 'ado.projects': [] },
        { 'ado.organization': { workspaceFolderValue: 'https://dev.azure.com/myorg' } },
      );
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockContext, mockOutput);

      expect(updateFn).toHaveBeenCalledWith('ado.connections', expect.any(Array), 3);
    });

    it('prefers most specific scope (workspaceFolder > workspace > global)', async () => {
      const { config, updateFn } = createMockConfig(
        { 'ado.organization': 'https://dev.azure.com/myorg', 'ado.project': 'P', 'ado.projects': [] },
        {
          'ado.organization': {
            globalValue: 'https://dev.azure.com/myorg',
            workspaceValue: 'https://dev.azure.com/myorg',
            workspaceFolderValue: 'https://dev.azure.com/myorg',
          },
        },
      );
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockContext, mockOutput);

      // WorkspaceFolder (3) is most specific
      expect(updateFn).toHaveBeenCalledWith('ado.connections', expect.any(Array), 3);
    });
  });

  // =========================================================================
  // Idempotency & error handling
  // =========================================================================

  describe('idempotency & error handling', () => {
    it('migration is idempotent — second run is no-op', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': 'https://dev.azure.com/myorg',
        'ado.project': 'P',
        'ado.projects': [],
      });
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockContext, mockOutput);
      expect(updateFn).toHaveBeenCalled();

      updateFn.mockClear();

      // Second run: workspaceState now has adoSettingsMigrated=true
      const result = await migrateAdoSettings(mockContext, mockOutput);
      expect(result).toBe(false);
      expect(updateFn).not.toHaveBeenCalled();
    });

    it('handles config.update() failure gracefully', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': 'https://dev.azure.com/myorg',
        'ado.project': 'P',
        'ado.projects': [],
      });
      updateFn.mockRejectedValue(new Error('Permission denied'));
      mockGetConfiguration.mockReturnValue(config);

      const result = await migrateAdoSettings(mockContext, mockOutput);

      expect(result).toBe(false);
      expect(mockOutput.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('migration failed'),
      );
      // Does NOT mark as migrated — allows retry on next activation
      expect(mockContext.workspaceState.update).not.toHaveBeenCalledWith('adoSettingsMigrated', true);
    });

    it('handles malformed projects array', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': 'https://dev.azure.com/myorg',
        'ado.projects': [null, undefined, { name: 'A' }] as any,
        'ado.project': '',
      });
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockContext, mockOutput);

      expect(updateFn).toHaveBeenCalledWith(
        'ado.connections',
        ['https://dev.azure.com/myorg/A'],
        2,
      );
    });
  });
});
