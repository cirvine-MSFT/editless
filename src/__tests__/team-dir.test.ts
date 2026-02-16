import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resolveTeamDir, resolveTeamMd, TEAM_DIR_NAMES } from '../team-dir';

let tmpDir: string;

function makeTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'team-dir-test-'));
}

beforeEach(() => { tmpDir = makeTmp(); });
afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

// ---------------------------------------------------------------------------
// TEAM_DIR_NAMES
// ---------------------------------------------------------------------------

describe('TEAM_DIR_NAMES', () => {
  it('should list .squad first and .ai-team second', () => {
    expect(TEAM_DIR_NAMES).toEqual(['.squad', '.ai-team']);
  });
});

// ---------------------------------------------------------------------------
// resolveTeamDir
// ---------------------------------------------------------------------------

describe('resolveTeamDir', () => {
  it('returns .squad/ path when only .squad/ exists', () => {
    fs.mkdirSync(path.join(tmpDir, '.squad'), { recursive: true });
    expect(resolveTeamDir(tmpDir)).toBe(path.join(tmpDir, '.squad'));
  });

  it('returns .ai-team/ path when only .ai-team/ exists', () => {
    fs.mkdirSync(path.join(tmpDir, '.ai-team'), { recursive: true });
    expect(resolveTeamDir(tmpDir)).toBe(path.join(tmpDir, '.ai-team'));
  });

  it('prefers .squad/ when both exist', () => {
    fs.mkdirSync(path.join(tmpDir, '.squad'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.ai-team'), { recursive: true });
    expect(resolveTeamDir(tmpDir)).toBe(path.join(tmpDir, '.squad'));
  });

  it('returns null when neither exists', () => {
    expect(resolveTeamDir(tmpDir)).toBeNull();
  });

  it('returns null for non-existent base path', () => {
    expect(resolveTeamDir(path.join(tmpDir, 'nonexistent'))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveTeamMd
// ---------------------------------------------------------------------------

describe('resolveTeamMd', () => {
  it('returns .squad/team.md when only .squad/ has team.md', () => {
    fs.mkdirSync(path.join(tmpDir, '.squad'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.squad', 'team.md'), '# Team');
    expect(resolveTeamMd(tmpDir)).toBe(path.join(tmpDir, '.squad', 'team.md'));
  });

  it('returns .ai-team/team.md when only .ai-team/ has team.md', () => {
    fs.mkdirSync(path.join(tmpDir, '.ai-team'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.ai-team', 'team.md'), '# Team');
    expect(resolveTeamMd(tmpDir)).toBe(path.join(tmpDir, '.ai-team', 'team.md'));
  });

  it('prefers .squad/team.md when both exist', () => {
    fs.mkdirSync(path.join(tmpDir, '.squad'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.ai-team'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.squad', 'team.md'), '# New');
    fs.writeFileSync(path.join(tmpDir, '.ai-team', 'team.md'), '# Old');
    expect(resolveTeamMd(tmpDir)).toBe(path.join(tmpDir, '.squad', 'team.md'));
  });

  it('returns null when neither has team.md', () => {
    expect(resolveTeamMd(tmpDir)).toBeNull();
  });

  it('returns null when dir exists but team.md does not', () => {
    fs.mkdirSync(path.join(tmpDir, '.squad'), { recursive: true });
    expect(resolveTeamMd(tmpDir)).toBeNull();
  });
});
