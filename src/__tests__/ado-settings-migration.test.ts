import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

interface ScopeValues<T = unknown> {
  globalValue?: T;
  workspaceValue?: T;
  workspaceFolderValue?: T;
  defaultValue?: T;
}

type InspectMap = Record<string, ScopeValues>;

function createMockConfig(inspectData: InspectMap) {
  const updateFn = vi.fn().mockResolvedValue(undefined);
  const config = {
    get: vi.fn((key: string, defaultValue?: unknown) => {
      const data = inspectData[key];
      if (!data) return defaultValue;
      // Return most specific value (matching VS Code's precedence)
      return data.workspaceFolderValue ?? data.workspaceValue ?? data.globalValue ?? data.defaultValue ?? defaultValue;
    }),
    update: updateFn,
    inspect: vi.fn((key: string) => inspectData[key] ?? { defaultValue: undefined }),
  };
  return { config, updateFn };
}

function createMockOutput() {
  return { appendLine: vi.fn() } as unknown as vscode.OutputChannel;
}

// ---------------------------------------------------------------------------
// Mock vscode module
// ---------------------------------------------------------------------------

const { mockGetConfiguration } = vi.hoisted(() => ({
  mockGetConfiguration: vi.fn(),
}));

vi.mock('vscode', () => ({
  workspace: { getConfiguration: mockGetConfiguration },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { migrateAdoSettings } from '../ado-settings-migration';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('migrateAdoSettings', () => {
  let mockOutput: vscode.OutputChannel;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOutput = createMockOutput();
  });

  // =========================================================================
  // Conversion correctness
  // =========================================================================

  describe('conversion correctness', () => {
    it('migrates org + projects → connections at workspace scope', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': { workspaceValue: 'https://dev.azure.com/myorg' },
        'ado.projects': { workspaceValue: [{ name: 'A', enabled: true }, { name: 'B', enabled: true }] },
        'ado.project': {},
        'ado.connections': {},
      });
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockOutput);

      expect(updateFn).toHaveBeenCalledWith(
        'ado.connections',
        ['https://dev.azure.com/myorg/A', 'https://dev.azure.com/myorg/B'],
        2,
      );
    });

    it('migrates org + single project fallback', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': { workspaceValue: 'https://dev.azure.com/myorg' },
        'ado.projects': {},
        'ado.project': { workspaceValue: 'Solo' },
        'ado.connections': {},
      });
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockOutput);

      expect(updateFn).toHaveBeenCalledWith(
        'ado.connections',
        ['https://dev.azure.com/myorg/Solo'],
        2,
      );
    });

    it('filters disabled projects', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': { workspaceValue: 'https://dev.azure.com/myorg' },
        'ado.projects': {
          workspaceValue: [
            { name: 'A', enabled: true },
            { name: 'B', enabled: false },
            { name: 'C' }, // undefined enabled → included
          ],
        },
        'ado.project': {},
        'ado.connections': {},
      });
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockOutput);

      expect(updateFn).toHaveBeenCalledWith(
        'ado.connections',
        ['https://dev.azure.com/myorg/A', 'https://dev.azure.com/myorg/C'],
        2,
      );
    });

    it('projects takes priority over single project', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': { workspaceValue: 'https://dev.azure.com/myorg' },
        'ado.projects': { workspaceValue: [{ name: 'A' }] },
        'ado.project': { workspaceValue: 'Legacy' },
        'ado.connections': {},
      });
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockOutput);

      expect(updateFn).toHaveBeenCalledWith(
        'ado.connections',
        ['https://dev.azure.com/myorg/A'],
        2,
      );
    });

    it('handles trailing slash on org URL', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': { workspaceValue: 'https://dev.azure.com/myorg/' },
        'ado.project': { workspaceValue: 'P' },
        'ado.projects': {},
        'ado.connections': {},
      });
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockOutput);

      expect(updateFn).toHaveBeenCalledWith(
        'ado.connections',
        ['https://dev.azure.com/myorg/P'],
        2,
      );
    });

    it('handles visualstudio.com org URL', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': { globalValue: 'https://myorg.visualstudio.com' },
        'ado.project': { globalValue: 'P' },
        'ado.projects': {},
        'ado.connections': {},
      });
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockOutput);

      expect(updateFn).toHaveBeenCalledWith(
        'ado.connections',
        ['https://myorg.visualstudio.com/P'],
        1, // Global scope
      );
    });
  });

  // =========================================================================
  // Skip conditions (natural idempotency via inspect)
  // =========================================================================

  describe('skip conditions', () => {
    it('skips when connections already exist at same scope', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': { workspaceValue: 'https://dev.azure.com/myorg' },
        'ado.project': { workspaceValue: 'A' },
        'ado.projects': {},
        'ado.connections': { workspaceValue: ['https://dev.azure.com/myorg/A'] },
      });
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockOutput);

      // Should NOT write connections (already exist), but SHOULD remove old settings
      expect(updateFn).not.toHaveBeenCalledWith('ado.connections', expect.anything(), expect.anything());
      expect(updateFn).toHaveBeenCalledWith('ado.organization', undefined, 2);
    });

    it('no-op when no old settings exist at any scope', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': {},
        'ado.project': {},
        'ado.projects': {},
        'ado.connections': {},
      });
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockOutput);

      expect(updateFn).not.toHaveBeenCalled();
    });

    it('is naturally idempotent — second run is no-op', async () => {
      // First run: old settings exist, no connections
      const { config: config1, updateFn: update1 } = createMockConfig({
        'ado.organization': { workspaceValue: 'https://dev.azure.com/myorg' },
        'ado.project': { workspaceValue: 'P' },
        'ado.projects': {},
        'ado.connections': {},
      });
      mockGetConfiguration.mockReturnValue(config1);
      await migrateAdoSettings(mockOutput);
      expect(update1).toHaveBeenCalledWith('ado.connections', expect.any(Array), 2);

      // Second run: old settings removed, connections now exist
      const { config: config2, updateFn: update2 } = createMockConfig({
        'ado.organization': {},
        'ado.project': {},
        'ado.projects': {},
        'ado.connections': { workspaceValue: ['https://dev.azure.com/myorg/P'] },
      });
      mockGetConfiguration.mockReturnValue(config2);
      await migrateAdoSettings(mockOutput);
      expect(update2).not.toHaveBeenCalled();
    });

    it('skips scope where org is empty string', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': { workspaceValue: '' },
        'ado.project': { workspaceValue: 'P' },
        'ado.projects': {},
        'ado.connections': {},
      });
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockOutput);

      // org is empty → no connections written, but orphaned project cleaned up
      expect(updateFn).not.toHaveBeenCalledWith('ado.connections', expect.anything(), expect.anything());
    });
  });

  // =========================================================================
  // Multi-scope migration
  // =========================================================================

  describe('multi-scope migration', () => {
    it('migrates user-level (global) settings', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': { globalValue: 'https://dev.azure.com/myorg' },
        'ado.project': { globalValue: 'P' },
        'ado.projects': {},
        'ado.connections': {},
      });
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockOutput);

      expect(updateFn).toHaveBeenCalledWith('ado.connections', ['https://dev.azure.com/myorg/P'], 1);
      expect(updateFn).toHaveBeenCalledWith('ado.organization', undefined, 1);
      expect(updateFn).toHaveBeenCalledWith('ado.project', undefined, 1);
    });

    it('migrates settings at both global and workspace scopes independently', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': {
          globalValue: 'https://dev.azure.com/orgA',
          workspaceValue: 'https://dev.azure.com/orgB',
        },
        'ado.project': {
          globalValue: 'ProjA',
          workspaceValue: 'ProjB',
        },
        'ado.projects': {},
        'ado.connections': {},
      });
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockOutput);

      // Global scope
      expect(updateFn).toHaveBeenCalledWith('ado.connections', ['https://dev.azure.com/orgA/ProjA'], 1);
      expect(updateFn).toHaveBeenCalledWith('ado.organization', undefined, 1);
      // Workspace scope
      expect(updateFn).toHaveBeenCalledWith('ado.connections', ['https://dev.azure.com/orgB/ProjB'], 2);
      expect(updateFn).toHaveBeenCalledWith('ado.organization', undefined, 2);
    });

    it('migrates workspace-folder-level settings', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': { workspaceFolderValue: 'https://dev.azure.com/myorg' },
        'ado.project': { workspaceFolderValue: 'P' },
        'ado.projects': {},
        'ado.connections': {},
      });
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockOutput);

      expect(updateFn).toHaveBeenCalledWith('ado.connections', ['https://dev.azure.com/myorg/P'], 3);
    });
  });

  // =========================================================================
  // Settings cleanup
  // =========================================================================

  describe('settings cleanup', () => {
    it('removes all deprecated settings after migration', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': { workspaceValue: 'https://dev.azure.com/myorg' },
        'ado.projects': { workspaceValue: [{ name: 'A' }] },
        'ado.project': { workspaceValue: 'Legacy' },
        'ado.connections': {},
      });
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockOutput);

      expect(updateFn).toHaveBeenCalledWith('ado.organization', undefined, 2);
      expect(updateFn).toHaveBeenCalledWith('ado.project', undefined, 2);
      expect(updateFn).toHaveBeenCalledWith('ado.projects', undefined, 2);
    });

    it('cleans up orphaned project settings when org is missing', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': {},
        'ado.projects': { globalValue: [{ name: 'A' }] },
        'ado.project': { globalValue: 'B' },
        'ado.connections': {},
      });
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockOutput);

      // No connections written (no org), but orphaned settings cleaned up
      expect(updateFn).not.toHaveBeenCalledWith('ado.connections', expect.anything(), expect.anything());
      expect(updateFn).toHaveBeenCalledWith('ado.projects', undefined, 1);
      expect(updateFn).toHaveBeenCalledWith('ado.project', undefined, 1);
    });
  });

  // =========================================================================
  // Error handling
  // =========================================================================

  describe('error handling', () => {
    it('handles config.update() failure gracefully', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': { workspaceValue: 'https://dev.azure.com/myorg' },
        'ado.project': { workspaceValue: 'P' },
        'ado.projects': {},
        'ado.connections': {},
      });
      updateFn.mockRejectedValue(new Error('Permission denied'));
      mockGetConfiguration.mockReturnValue(config);

      // Should not throw — errors are caught per-operation (Jupyter pattern)
      await expect(migrateAdoSettings(mockOutput)).resolves.not.toThrow();
    });

    it('handles malformed projects array', async () => {
      const { config, updateFn } = createMockConfig({
        'ado.organization': { workspaceValue: 'https://dev.azure.com/myorg' },
        'ado.projects': { workspaceValue: [null, undefined, { name: 'A' }] as any },
        'ado.project': {},
        'ado.connections': {},
      });
      mockGetConfiguration.mockReturnValue(config);

      await migrateAdoSettings(mockOutput);

      expect(updateFn).toHaveBeenCalledWith(
        'ado.connections',
        ['https://dev.azure.com/myorg/A'],
        2,
      );
    });
  });
});
