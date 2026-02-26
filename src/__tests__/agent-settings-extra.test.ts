import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('vscode', () => ({
  EventEmitter: class { event = vi.fn(); fire = vi.fn(); dispose = vi.fn(); },
  Uri: { file: (s: string) => ({ fsPath: s }) },
  RelativePattern: class { constructor(public base: unknown, public pattern: string) {} },
  workspace: {
    createFileSystemWatcher: () => ({
      onDidChange: vi.fn(),
      onDidCreate: vi.fn(),
      onDidDelete: vi.fn(),
      dispose: vi.fn(),
    }),
  },
}));

import { AgentSettingsManager, migrateFromRegistry } from '../agent-settings';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
  };
});

describe('AgentSettingsManager — Error Handling', () => {
  const settingsPath = '/mock/settings.json';

  beforeEach(() => {
    vi.resetAllMocks();
    // Default behavior for read: empty JSON
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ agents: {} }));
  });

  it('handles write errors gracefully (swallowed by _writeToDisk try-catch)', () => {
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    const writeMock = vi.mocked(fs.writeFileSync).mockImplementation(() => {
      throw new Error('Disk full');
    });

    const mgr = new AgentSettingsManager(settingsPath);
    // Should NOT throw — _writeToDisk catches write errors
    mgr.update('squad-1', { name: 'Alpha' });
    expect(writeMock).toHaveBeenCalled();
    // Cache is still updated despite disk failure
    expect(mgr.get('squad-1')?.name).toBe('Alpha');
  });

  it('handles read errors by initializing empty', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const mgr = new AgentSettingsManager(settingsPath);
    expect(mgr.getAll()).toEqual({});
  });

  it('recovers from corrupted JSON on reload', () => {
    // First load works
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify({ agents: { a: { name: 'A' } } }));
    const mgr = new AgentSettingsManager(settingsPath);
    expect(mgr.get('a')).toBeDefined();

    // Second load (reload) fails
    vi.mocked(fs.readFileSync).mockReturnValueOnce('{ invalid json');
    mgr.reload();
    expect(mgr.getAll()).toEqual({});
  });

  it('treats missing agents field as empty on reload', () => {
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify({ version: 1 }));
    const mgr = new AgentSettingsManager(settingsPath);
    expect(mgr.getAll()).toEqual({});
  });

  it('creates settings directory with recursive option on first write', () => {
    const mgr = new AgentSettingsManager(settingsPath);
    mgr.update('squad-1', { name: 'Alpha' });

    expect(vi.mocked(fs.mkdirSync)).toHaveBeenCalledWith(
      path.dirname(settingsPath),
      { recursive: true },
    );
  });
});

describe('migrateFromRegistry — edge cases', () => {
  const settingsPath = '/mock/settings.json';

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ agents: {} }));
  });

  it('returns false for corrupted old registry JSON', () => {
    vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
      if (String(filePath).includes('old-registry')) return '{ corrupted!!!';
      return JSON.stringify({ agents: {} });
    });

    const mgr = new AgentSettingsManager(settingsPath);
    expect(migrateFromRegistry('/mock/old-registry.json', mgr)).toBe(false);
  });

  it('last duplicate ID wins when old registry has repeated entries', () => {
    const oldData = JSON.stringify({
      squads: [
        { id: 'squad-1', name: 'First', icon: '🔴' },
        { id: 'squad-1', name: 'Second', icon: '🟢' },
      ],
    });
    vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
      if (String(filePath).includes('old-registry')) return oldData;
      return JSON.stringify({ agents: {} });
    });

    const mgr = new AgentSettingsManager(settingsPath);
    migrateFromRegistry('/mock/old-registry.json', mgr);

    expect(mgr.get('squad-1')?.name).toBe('Second');
    expect(mgr.get('squad-1')?.icon).toBe('🟢');
  });

  it('handles non-array squads field gracefully', () => {
    vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
      if (String(filePath).includes('old-registry')) return JSON.stringify({ squads: 'not-an-array' });
      return JSON.stringify({ agents: {} });
    });

    const mgr = new AgentSettingsManager(settingsPath);
    expect(migrateFromRegistry('/mock/old-registry.json', mgr)).toBe(false);
  });
});
