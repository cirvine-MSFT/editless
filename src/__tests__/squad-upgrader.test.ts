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
  commands: { registerCommand: vi.fn() },
}));

import { checkNpxAvailable, isSquadInitialized, getLocalSquadVersion, isNewerVersion, clearLatestVersionCache } from '../squad-upgrader';
import * as path from 'path';

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
    mockExistsSync.mockReturnValue(true);
    expect(isSquadInitialized('/some/path')).toBe(true);
    expect(mockExistsSync).toHaveBeenCalledWith(path.join('/some/path', '.ai-team'));
  });

  it('should return false when .ai-team directory does not exist', () => {
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
