import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { AgentSettingsManager } from '../agent-settings';

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
});
