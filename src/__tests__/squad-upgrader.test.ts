import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockExecAsync, mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
  mockExecAsync: vi.fn(),
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: () => mockExecAsync,
}));

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}));

vi.mock('https', () => ({
  get: vi.fn(),
}));

vi.mock('vscode', () => ({
  window: {
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showQuickPick: vi.fn(),
    withProgress: vi.fn(),
    createStatusBarItem: vi.fn(),
  },
  env: { openExternal: vi.fn() },
  Uri: { parse: (s: string) => s },
  ProgressLocation: { Notification: 15 },
  commands: { 
    registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    executeCommand: vi.fn(),
  },
}));

import { checkNpxAvailable, isSquadInitialized, getLocalSquadVersion, isNewerVersion, clearLatestVersionCache, checkSquadUpgradesOnStartup, getLatestSquadVersion, registerSquadUpgradeCommand, registerSquadUpgradeAllCommand } from '../squad-upgrader';
import * as path from 'path';
import * as vscode from 'vscode';
import * as https from 'https';
import type { AgentTeamConfig } from '../types';
import type { EditlessRegistry } from '../registry';

beforeEach(() => {
  vi.clearAllMocks();
  clearLatestVersionCache();
});

// ---------------------------------------------------------------------------
// checkNpxAvailable
// ---------------------------------------------------------------------------

describe('checkNpxAvailable', () => {
  it('should return true when npx --version succeeds', async () => {
    mockExecAsync.mockResolvedValue({ stdout: '10.0.0', stderr: '' });
    expect(await checkNpxAvailable()).toBe(true);
  });

  it('should return false when npx --version throws', async () => {
    mockExecAsync.mockRejectedValue(new Error('not found'));
    expect(await checkNpxAvailable()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isSquadInitialized
// ---------------------------------------------------------------------------

describe('isSquadInitialized', () => {
  it('should return true when .ai-team directory exists', () => {
    mockExistsSync.mockImplementation((p: string) => p === path.join('/some/path', '.squad') ? false : p === path.join('/some/path', '.ai-team') ? true : false);
    expect(isSquadInitialized('/some/path')).toBe(true);
  });

  it('should return true when .squad directory exists', () => {
    mockExistsSync.mockImplementation((p: string) => p === path.join('/some/path', '.squad') ? true : false);
    expect(isSquadInitialized('/some/path')).toBe(true);
  });

  it('should return false when neither directory exists', () => {
    mockExistsSync.mockReturnValue(false);
    expect(isSquadInitialized('/some/path')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getLocalSquadVersion
// ---------------------------------------------------------------------------

describe('getLocalSquadVersion', () => {
  const squadPath = '/my/squad';
  const agentFile = path.join(squadPath, '.github', 'agents', 'squad.agent.md');

  it('should parse version from frontmatter', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      '---\nversion: 1.2.3\ntitle: Squad\n---\n# Content',
    );
    expect(getLocalSquadVersion(squadPath)).toBe('1.2.3');
    expect(mockReadFileSync).toHaveBeenCalledWith(agentFile, 'utf-8');
  });

  it('should return null when agent file does not exist', () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p === agentFile) return false;
      return true;
    });
    expect(getLocalSquadVersion(squadPath)).toBeNull();
  });

  it('should return null when file has no frontmatter', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('# No frontmatter here');
    expect(getLocalSquadVersion(squadPath)).toBeNull();
  });

  it('should return null when frontmatter has no version field', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('---\ntitle: Squad\nauthor: Test\n---\n# Content');
    expect(getLocalSquadVersion(squadPath)).toBeNull();
  });

  it('should return null when readFileSync throws', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => { throw new Error('EACCES'); });
    expect(getLocalSquadVersion(squadPath)).toBeNull();
  });

  it('should trim whitespace from version string', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('---\nversion:   2.0.0-beta  \n---\n');
    expect(getLocalSquadVersion(squadPath)).toBe('2.0.0-beta');
  });
});

// ---------------------------------------------------------------------------
// isNewerVersion
// ---------------------------------------------------------------------------

describe('isNewerVersion', () => {
  it('should return true when latest major is higher', () => {
    expect(isNewerVersion('2.0.0', '1.0.0')).toBe(true);
  });

  it('should return true when latest minor is higher', () => {
    expect(isNewerVersion('1.3.0', '1.2.0')).toBe(true);
  });

  it('should return true when latest patch is higher', () => {
    expect(isNewerVersion('1.2.4', '1.2.3')).toBe(true);
  });

  it('should return false when versions are equal', () => {
    expect(isNewerVersion('1.2.3', '1.2.3')).toBe(false);
  });

  it('should return false when local is newer', () => {
    expect(isNewerVersion('1.2.3', '1.2.4')).toBe(false);
  });

  it('should handle v-prefix', () => {
    expect(isNewerVersion('v2.0.0', 'v1.0.0')).toBe(true);
    expect(isNewerVersion('v1.0.0', '1.0.0')).toBe(false);
  });

  it('should handle different length versions', () => {
    expect(isNewerVersion('1.2.3.4', '1.2.3')).toBe(true);
    expect(isNewerVersion('1.2.3', '1.2.3.1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkSquadUpgradesOnStartup
// ---------------------------------------------------------------------------

describe('checkSquadUpgradesOnStartup', () => {
  const mockSquads: AgentTeamConfig[] = [
    { id: 'squad-1', name: 'Squad One', path: '/path/squad1', icon: '🚀', universe: 'test' },
    { id: 'squad-2', name: 'Squad Two', path: '/path/squad2', icon: '🎯', universe: 'test' },
  ];

  beforeEach(() => {
    vi.mocked(https.get).mockClear();
    vi.mocked(vscode.commands.executeCommand).mockClear();
  });

  it('should call onResult with true when latest > local version', async () => {
    const httpsGet = vi.mocked(https.get);
    httpsGet.mockImplementation(((url: string, opts: any, cb: Function) => {
      const res = {
        statusCode: 200,
        on: vi.fn((event: string, handler: Function) => {
          if (event === 'data') handler(Buffer.from('{"version":"2.0.0"}'));
          if (event === 'end') handler();
        }),
      };
      cb(res);
      return { on: vi.fn(), destroy: vi.fn() } as any;
    }) as any);

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.includes('squad1')) return '---\nversion: 1.0.0\n---\n';
      if (p.includes('squad2')) return '---\nversion: 1.5.0\n---\n';
      return '';
    });

    const onResult = vi.fn();
    await checkSquadUpgradesOnStartup(mockSquads, onResult);

    expect(onResult).toHaveBeenCalledWith('squad-1', true);
    expect(onResult).toHaveBeenCalledWith('squad-2', true);
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('setContext', 'editless.squadUpgradeAvailable', true);
  });

  it('should call onResult with false when versions are equal', async () => {
    const httpsGet = vi.mocked(https.get);
    httpsGet.mockImplementation(((url: string, opts: any, cb: Function) => {
      const res = {
        statusCode: 200,
        on: vi.fn((event: string, handler: Function) => {
          if (event === 'data') handler(Buffer.from('{"version":"1.0.0"}'));
          if (event === 'end') handler();
        }),
      };
      cb(res);
      return { on: vi.fn(), destroy: vi.fn() } as any;
    }) as any);

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('---\nversion: 1.0.0\n---\n');

    const onResult = vi.fn();
    await checkSquadUpgradesOnStartup(mockSquads, onResult);

    expect(onResult).toHaveBeenCalledWith('squad-1', false);
    expect(onResult).toHaveBeenCalledWith('squad-2', false);
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('setContext', 'editless.squadUpgradeAvailable', false);
  });

  it('should not call onResult when latest version fetch fails (returns null)', async () => {
    const httpsGet = vi.mocked(https.get);
    httpsGet.mockImplementation(((url: string, opts: any, cb: Function) => {
      const req = { 
        on: vi.fn((event: string, handler: Function) => {
          if (event === 'error') handler(new Error('Network error'));
        }),
        destroy: vi.fn()
      };
      // Don't call the response callback — simulate network failure
      setTimeout(() => req.on('error', () => {}), 0);
      return req as any;
    }) as any);

    const onResult = vi.fn();
    await checkSquadUpgradesOnStartup(mockSquads, onResult);

    expect(onResult).not.toHaveBeenCalled();
    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });

  it('should skip squads where local version is null', async () => {
    const httpsGet = vi.mocked(https.get);
    httpsGet.mockImplementation(((url: string, opts: any, cb: Function) => {
      const res = {
        statusCode: 200,
        on: vi.fn((event: string, handler: Function) => {
          if (event === 'data') handler(Buffer.from('{"version":"2.0.0"}'));
          if (event === 'end') handler();
        }),
      };
      cb(res);
      return { on: vi.fn(), destroy: vi.fn() } as any;
    }) as any);

    mockExistsSync.mockImplementation((p: string) => {
      if (p.includes('squad1')) return false;
      return true;
    });
    mockReadFileSync.mockReturnValue('---\nversion: 1.0.0\n---\n');

    const onResult = vi.fn();
    await checkSquadUpgradesOnStartup(mockSquads, onResult);

    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith('squad-2', true);
  });

  it('should set editless.squadUpgradeAvailable context to true when any squad has upgrade', async () => {
    const httpsGet = vi.mocked(https.get);
    httpsGet.mockImplementation(((url: string, opts: any, cb: Function) => {
      const res = {
        statusCode: 200,
        on: vi.fn((event: string, handler: Function) => {
          if (event === 'data') handler(Buffer.from('{"version":"2.0.0"}'));
          if (event === 'end') handler();
        }),
      };
      cb(res);
      return { on: vi.fn(), destroy: vi.fn() } as any;
    }) as any);

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.includes('squad1')) return '---\nversion: 1.0.0\n---\n';
      if (p.includes('squad2')) return '---\nversion: 2.0.0\n---\n';
      return '';
    });

    const onResult = vi.fn();
    await checkSquadUpgradesOnStartup(mockSquads, onResult);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('setContext', 'editless.squadUpgradeAvailable', true);
  });

  it('should set editless.squadUpgradeAvailable context to false when no squads have upgrade', async () => {
    const httpsGet = vi.mocked(https.get);
    httpsGet.mockImplementation(((url: string, opts: any, cb: Function) => {
      const res = {
        statusCode: 200,
        on: vi.fn((event: string, handler: Function) => {
          if (event === 'data') handler(Buffer.from('{"version":"1.0.0"}'));
          if (event === 'end') handler();
        }),
      };
      cb(res);
      return { on: vi.fn(), destroy: vi.fn() } as any;
    }) as any);

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('---\nversion: 1.0.0\n---\n');

    const onResult = vi.fn();
    await checkSquadUpgradesOnStartup(mockSquads, onResult);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('setContext', 'editless.squadUpgradeAvailable', false);
  });

  it('should handle mixed states (some squads upgradeable, some not)', async () => {
    const httpsGet = vi.mocked(https.get);
    httpsGet.mockImplementation(((url: string, opts: any, cb: Function) => {
      const res = {
        statusCode: 200,
        on: vi.fn((event: string, handler: Function) => {
          if (event === 'data') handler(Buffer.from('{"version":"2.0.0"}'));
          if (event === 'end') handler();
        }),
      };
      cb(res);
      return { on: vi.fn(), destroy: vi.fn() } as any;
    }) as any);

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.includes('squad1')) return '---\nversion: 1.0.0\n---\n';
      if (p.includes('squad2')) return '---\nversion: 2.0.0\n---\n';
      return '';
    });

    const onResult = vi.fn();
    await checkSquadUpgradesOnStartup(mockSquads, onResult);

    expect(onResult).toHaveBeenCalledWith('squad-1', true);
    expect(onResult).toHaveBeenCalledWith('squad-2', false);
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('setContext', 'editless.squadUpgradeAvailable', true);
  });
});

// ---------------------------------------------------------------------------
// Upgrade path regression tests
// ---------------------------------------------------------------------------

describe('Upgrade path regression tests', () => {
  it('should detect upgrade from 1.0.0 to 2.0.0 (major)', () => {
    expect(isNewerVersion('2.0.0', '1.0.0')).toBe(true);
  });

  it('should detect upgrade from 1.2.0 to 1.3.0 (minor)', () => {
    expect(isNewerVersion('1.3.0', '1.2.0')).toBe(true);
  });

  it('should detect no upgrade when versions match', () => {
    expect(isNewerVersion('1.2.3', '1.2.3')).toBe(false);
  });

  it('should detect no upgrade when local is newer than remote', () => {
    expect(isNewerVersion('1.2.3', '1.2.4')).toBe(false);
    expect(isNewerVersion('1.0.0', '2.0.0')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// registerSquadUpgradeCommand
// ---------------------------------------------------------------------------

describe('registerSquadUpgradeCommand', () => {
  const mockContext = { subscriptions: [] } as any;
  const mockRegistry: EditlessRegistry = {
    loadSquads: vi.fn().mockReturnValue([
      { id: 'squad-1', name: 'Squad One', path: '/path/squad1', icon: '🚀', universe: 'test' },
    ]),
    getSquad: vi.fn((id: string) => ({ id, name: 'Squad One', path: '/path/squad1', icon: '🚀', universe: 'test' })),
  } as any;

  it('should register the command', () => {
    const disposable = registerSquadUpgradeCommand(mockContext, mockRegistry);
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith('editless.upgradeSquad', expect.any(Function));
    expect(disposable).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// registerSquadUpgradeAllCommand
// ---------------------------------------------------------------------------

describe('registerSquadUpgradeAllCommand', () => {
  const mockContext = { subscriptions: [] } as any;
  const mockRegistry: EditlessRegistry = {
    loadSquads: vi.fn().mockReturnValue([
      { id: 'squad-1', name: 'Squad One', path: '/path/squad1', icon: '🚀', universe: 'test' },
      { id: 'squad-2', name: 'Squad Two', path: '/path/squad2', icon: '🎯', universe: 'test' },
    ]),
  } as any;

  it('should register the command', () => {
    const disposable = registerSquadUpgradeAllCommand(mockContext, mockRegistry);
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith('editless.upgradeAllSquads', expect.any(Function));
    expect(disposable).toBeDefined();
  });
});
