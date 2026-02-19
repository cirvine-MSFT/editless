import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('vscode', () => ({
  window: {
    showInformationMessage: vi.fn(),
  },
  env: { openExternal: vi.fn() },
  Uri: { parse: (s: string) => s },
}));

import { checkNpxAvailable, isSquadInitialized, getLocalSquadVersion, promptInstallNode } from '../squad-utils';
import * as path from 'path';
import * as vscode from 'vscode';

beforeEach(() => {
  vi.clearAllMocks();
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
// promptInstallNode
// ---------------------------------------------------------------------------

describe('promptInstallNode', () => {
  it('should open Node.js download page when user selects the option', async () => {
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue('Open Node.js Download Page' as never);
    await promptInstallNode();
    expect(vscode.env.openExternal).toHaveBeenCalledWith('https://nodejs.org/');
  });

  it('should do nothing when user dismisses', async () => {
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined as never);
    await promptInstallNode();
    expect(vscode.env.openExternal).not.toHaveBeenCalled();
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
