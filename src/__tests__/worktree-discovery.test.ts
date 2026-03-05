import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ---------------------------------------------------------------------------
// parsePorcelainOutput (pure function — no mocks needed)
// ---------------------------------------------------------------------------

import { parsePorcelainOutput, resolveGitDir, isGitRepo } from '../worktree-discovery';

describe('parsePorcelainOutput', () => {
  it('parses a single main worktree', () => {
    const output = [
      'worktree /home/user/repo',
      'HEAD abc1234567890',
      'branch refs/heads/main',
      '',
    ].join('\n');

    const result = parsePorcelainOutput(output);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      path: '/home/user/repo',
      branch: 'main',
      isMain: true,
      commitHash: 'abc1234567890',
    });
  });

  it('parses multiple worktrees', () => {
    const output = [
      'worktree /home/user/repo',
      'HEAD abc123',
      'branch refs/heads/main',
      '',
      'worktree /home/user/repo-wt/feat-auth',
      'HEAD def456',
      'branch refs/heads/feat/auth',
      '',
      'worktree /home/user/repo-wt/bugfix',
      'HEAD ghi789',
      'branch refs/heads/bugfix/login',
      '',
    ].join('\n');

    const result = parsePorcelainOutput(output);

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ path: '/home/user/repo', branch: 'main', isMain: true });
    expect(result[1]).toMatchObject({ path: '/home/user/repo-wt/feat-auth', branch: 'feat/auth', isMain: false });
    expect(result[2]).toMatchObject({ path: '/home/user/repo-wt/bugfix', branch: 'bugfix/login', isMain: false });
  });

  it('parses detached HEAD worktree', () => {
    const output = [
      'worktree /home/user/repo',
      'HEAD abc123',
      'branch refs/heads/main',
      '',
      'worktree /home/user/repo-wt/detached',
      'HEAD def456',
      'detached',
      '',
    ].join('\n');

    const result = parsePorcelainOutput(output);

    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({
      path: '/home/user/repo-wt/detached',
      branch: '',
      isMain: false,
      commitHash: 'def456',
    });
  });

  it('returns empty array for empty output', () => {
    expect(parsePorcelainOutput('')).toEqual([]);
  });

  it('handles Windows-style CRLF line endings', () => {
    const output = 'worktree C:\\Users\\user\\repo\r\nHEAD abc123\r\nbranch refs/heads/main\r\n\r\n';

    const result = parsePorcelainOutput(output);

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('C:\\Users\\user\\repo');
    expect(result[0].branch).toBe('main');
  });

  it('skips blocks without worktree line', () => {
    const output = 'HEAD abc123\nbranch refs/heads/main\n\n';

    const result = parsePorcelainOutput(output);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// discoverWorktrees (mocked execFileSync)
// ---------------------------------------------------------------------------

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'child_process';
import { discoverWorktrees } from '../worktree-discovery';

const mockExecFileSync = vi.mocked(execFileSync);

describe('discoverWorktrees', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns worktrees from git output', () => {
    mockExecFileSync.mockReturnValue([
      'worktree /repo',
      'HEAD abc123',
      'branch refs/heads/main',
      '',
      'worktree /repo-wt/feat',
      'HEAD def456',
      'branch refs/heads/feat/x',
      '',
    ].join('\n'));

    const result = discoverWorktrees('/repo');

    expect(result).toHaveLength(2);
    expect(result[0].isMain).toBe(true);
    expect(result[1].branch).toBe('feat/x');
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git', ['worktree', 'list', '--porcelain'],
      expect.objectContaining({ cwd: '/repo' }),
    );
  });

  it('returns empty array when git command fails', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('not a git repo'); });

    const result = discoverWorktrees('/not-a-repo');
    expect(result).toEqual([]);
  });

  it('returns empty array for non-git directory', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('fatal'); });
    expect(discoverWorktrees('/tmp/empty')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// resolveGitDir and isGitRepo (filesystem tests)
// ---------------------------------------------------------------------------

let tmpDir: string;

function makeTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-discovery-test-'));
}

describe('resolveGitDir', () => {
  beforeEach(() => { tmpDir = makeTmp(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('returns .git directory path when .git is a directory', () => {
    const dotGit = path.join(tmpDir, '.git');
    fs.mkdirSync(dotGit);

    const result = resolveGitDir(tmpDir);
    expect(result).toBe(dotGit);
  });

  it('returns resolved gitdir when .git is a file (worktree)', () => {
    const gitdir = path.join(tmpDir, 'actual-gitdir');
    fs.mkdirSync(gitdir);
    fs.writeFileSync(path.join(tmpDir, '.git'), `gitdir: ${gitdir}\n`, 'utf-8');

    const result = resolveGitDir(tmpDir);
    expect(result).toBe(gitdir);
  });

  it('resolves relative gitdir path', () => {
    const innerDir = path.join(tmpDir, 'inner');
    fs.mkdirSync(innerDir);
    const relTarget = path.join('..', 'main-repo', '.git', 'worktrees', 'inner');
    const absTarget = path.resolve(innerDir, relTarget);
    fs.mkdirSync(absTarget, { recursive: true });
    fs.writeFileSync(path.join(innerDir, '.git'), `gitdir: ${relTarget}\n`, 'utf-8');

    const result = resolveGitDir(innerDir);
    expect(result).toBe(absTarget);
  });

  it('returns undefined when no .git exists', () => {
    expect(resolveGitDir(tmpDir)).toBeUndefined();
  });

  it('returns undefined for malformed .git file', () => {
    fs.writeFileSync(path.join(tmpDir, '.git'), 'not-a-gitdir-line\n', 'utf-8');
    expect(resolveGitDir(tmpDir)).toBeUndefined();
  });
});

describe('isGitRepo', () => {
  beforeEach(() => { tmpDir = makeTmp(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('returns true when .git directory exists', () => {
    fs.mkdirSync(path.join(tmpDir, '.git'));
    expect(isGitRepo(tmpDir)).toBe(true);
  });

  it('returns true when .git file exists (worktree)', () => {
    const gitdir = path.join(tmpDir, 'gitdir');
    fs.mkdirSync(gitdir);
    fs.writeFileSync(path.join(tmpDir, '.git'), `gitdir: ${gitdir}\n`);
    expect(isGitRepo(tmpDir)).toBe(true);
  });

  it('returns false when no .git exists', () => {
    expect(isGitRepo(tmpDir)).toBe(false);
  });
});
