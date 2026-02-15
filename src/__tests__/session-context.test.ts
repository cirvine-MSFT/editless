import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// We'll test the internal functions directly since mocking os.homedir is problematic in ESM
// Instead, create a test version of SessionContextResolver

let tmpSessionDir: string;

function makeTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'session-test-'));
}

function createSessionFile(sessionId: string, content: string): string {
  const sessionDir = path.join(tmpSessionDir, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });
  const filePath = path.join(sessionDir, 'workspace.yaml');
  fs.writeFileSync(filePath, content, 'utf-8');
  return sessionDir;
}

beforeEach(() => {
  tmpSessionDir = makeTmp();
});

afterEach(() => {
  fs.rmSync(tmpSessionDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Internal functions for testing (mirrored from session-context.ts)
// ---------------------------------------------------------------------------

function parseSimpleYaml(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    result[trimmed.substring(0, colonIdx).trim()] = trimmed.substring(colonIdx + 1).trim();
  }
  return result;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

describe('Session Context Utilities', () => {
  describe('parseSimpleYaml', () => {
    it('parses simple key: value YAML correctly', () => {
      const yaml = `cwd: /test/path
summary: Test session
branch: main
created_at: 2025-01-01
updated_at: 2025-01-02`;
      
      const result = parseSimpleYaml(yaml);
      
      expect(result.cwd).toBe('/test/path');
      expect(result.summary).toBe('Test session');
      expect(result.branch).toBe('main');
      expect(result.created_at).toBe('2025-01-01');
      expect(result.updated_at).toBe('2025-01-02');
    });

    it('skips comment lines starting with #', () => {
      const yaml = `# This is a comment
cwd: /test/path
# Another comment
summary: Test session`;
      
      const result = parseSimpleYaml(yaml);
      
      expect(result.cwd).toBe('/test/path');
      expect(result.summary).toBe('Test session');
      expect(result['# This is a comment']).toBeUndefined();
    });

    it('handles missing values (empty string after colon)', () => {
      const yaml = `cwd: /test/path
summary:
branch: main`;
      
      const result = parseSimpleYaml(yaml);
      
      expect(result.summary).toBe('');
      expect(result.branch).toBe('main');
    });

    it('skips lines without colons', () => {
      const yaml = `cwd: /test/path
no colon here
summary: Valid`;
      
      const result = parseSimpleYaml(yaml);
      
      expect(result.cwd).toBe('/test/path');
      expect(result.summary).toBe('Valid');
      expect(Object.keys(result).length).toBe(2);
    });

    it('handles whitespace around keys and values', () => {
      const yaml = `  cwd  :  /test/path  
  summary  :  Test session  `;
      
      const result = parseSimpleYaml(yaml);
      
      expect(result.cwd).toBe('/test/path');
      expect(result.summary).toBe('Test session');
    });

    it('handles multiple colons in values', () => {
      const yaml = `url: http://example.com:8080
path: c:\\Users\\test`;
      
      const result = parseSimpleYaml(yaml);
      
      expect(result.url).toBe('http://example.com:8080');
      expect(result.path).toBe('c:\\Users\\test');
    });
  });

  describe('normalizePath', () => {
    it('converts backslashes to forward slashes', () => {
      const normalized = normalizePath('C:\\Users\\test\\squad');
      expect(normalized).toBe('c:/users/test/squad');
    });

    it('removes trailing slashes', () => {
      const normalized = normalizePath('/test/path/');
      expect(normalized).toBe('/test/path');
    });

    it('converts to lowercase', () => {
      const normalized = normalizePath('/Test/Path');
      expect(normalized).toBe('/test/path');
    });

    it('handles multiple trailing slashes', () => {
      const normalized = normalizePath('/test/path///');
      expect(normalized).toBe('/test/path');
    });

    it('matches paths with different casing', () => {
      const path1 = normalizePath('C:\\Users\\Test\\Squad');
      const path2 = normalizePath('c:\\users\\test\\squad');
      expect(path1).toBe(path2);
    });

    it('matches paths with different slash types', () => {
      const path1 = normalizePath('C:\\Users\\Test\\Squad');
      const path2 = normalizePath('C:/Users/Test/Squad');
      expect(path1).toBe(path2);
    });
  });

  describe('SessionContextResolver integration', () => {
    // Import the actual resolver for integration tests
    let resolver: any;

    beforeEach(async () => {
      // Dynamically import to test the actual implementation
      const module = await import('../session-context');
      resolver = new module.SessionContextResolver();
      
      // Override the session state dir by patching the internal path
      // We do this by monkey-patching os.homedir behavior indirectly
      // through file system operations
      const homeDir = path.dirname(tmpSessionDir);
      const aiTeamPath = path.join(homeDir, '.copilot', 'session-state');
      fs.mkdirSync(aiTeamPath, { recursive: true });
      
      // We'll copy test session files to the expected location
      resolver._sessionStateDir = aiTeamPath;
    });

    it('resolves session context from workspace.yaml', () => {
      const sessionDir = path.join(resolver._sessionStateDir, 'session-1');
      fs.mkdirSync(sessionDir, { recursive: true });
      const squadPath = path.join(tmpSessionDir, 'test-squad');
      
      fs.writeFileSync(
        path.join(sessionDir, 'workspace.yaml'),
        `cwd: ${squadPath}
summary: Working on features
branch: feature/abc`,
        'utf-8'
      );

      const result = resolver.resolveForSquad(squadPath);
      
      expect(result).not.toBeNull();
      expect(result?.sessionId).toBe('session-1');
      expect(result?.summary).toBe('Working on features');
      expect(result?.branch).toBe('feature/abc');
    });

    it('skips sessions without cwd field', () => {
      const sessionDir = path.join(resolver._sessionStateDir, 'session-1');
      fs.mkdirSync(sessionDir, { recursive: true });
      const squadPath = path.join(tmpSessionDir, 'test-squad');
      
      fs.writeFileSync(
        path.join(sessionDir, 'workspace.yaml'),
        `summary: No CWD
branch: main`,
        'utf-8'
      );

      const result = resolver.resolveForSquad(squadPath);
      
      expect(result).toBeNull();
    });

    it('returns null for non-matching paths', () => {
      const sessionDir = path.join(resolver._sessionStateDir, 'session-1');
      fs.mkdirSync(sessionDir, { recursive: true });
      const matchPath = path.join(tmpSessionDir, 'match-squad');
      const noMatchPath = path.join(tmpSessionDir, 'other-squad');
      
      fs.writeFileSync(
        path.join(sessionDir, 'workspace.yaml'),
        `cwd: ${matchPath}
summary: Test`,
        'utf-8'
      );

      const result = resolver.resolveForSquad(noMatchPath);
      
      expect(result).toBeNull();
    });

    it('prefers most recently updated session', () => {
      const squad1Dir = path.join(resolver._sessionStateDir, 'session-1');
      const squad2Dir = path.join(resolver._sessionStateDir, 'session-2');
      fs.mkdirSync(squad1Dir, { recursive: true });
      fs.mkdirSync(squad2Dir, { recursive: true });
      const squadPath = path.join(tmpSessionDir, 'test-squad');
      
      fs.writeFileSync(
        path.join(squad1Dir, 'workspace.yaml'),
        `cwd: ${squadPath}
summary: Old session
updated_at: 2025-01-01T10:00:00Z`,
        'utf-8'
      );

      fs.writeFileSync(
        path.join(squad2Dir, 'workspace.yaml'),
        `cwd: ${squadPath}
summary: New session
updated_at: 2025-01-02T11:00:00Z`,
        'utf-8'
      );

      const result = resolver.resolveForSquad(squadPath);
      
      expect(result?.sessionId).toBe('session-2');
      expect(result?.summary).toBe('New session');
    });

    it('resolves multiple squads in one call', () => {
      const session1Dir = path.join(resolver._sessionStateDir, 'session-1');
      const session2Dir = path.join(resolver._sessionStateDir, 'session-2');
      fs.mkdirSync(session1Dir, { recursive: true });
      fs.mkdirSync(session2Dir, { recursive: true });
      
      const squad1 = path.join(tmpSessionDir, 'squad-1');
      const squad2 = path.join(tmpSessionDir, 'squad-2');
      
      fs.writeFileSync(
        path.join(session1Dir, 'workspace.yaml'),
        `cwd: ${squad1}
summary: Squad 1`,
        'utf-8'
      );

      fs.writeFileSync(
        path.join(session2Dir, 'workspace.yaml'),
        `cwd: ${squad2}
summary: Squad 2`,
        'utf-8'
      );

      const result = resolver.resolveAll([squad1, squad2]);
      
      expect(result.size).toBe(2);
      expect(result.get(squad1)?.summary).toBe('Squad 1');
      expect(result.get(squad2)?.summary).toBe('Squad 2');
    });

    it('clears cache when clearCache is called', () => {
      const sessionDir = path.join(resolver._sessionStateDir, 'session-1');
      fs.mkdirSync(sessionDir, { recursive: true });
      const squadPath = path.join(tmpSessionDir, 'test-squad');
      
      fs.writeFileSync(
        path.join(sessionDir, 'workspace.yaml'),
        `cwd: ${squadPath}
summary: Initial`,
        'utf-8'
      );

      const result1 = resolver.resolveForSquad(squadPath);
      expect(result1?.summary).toBe('Initial');
      
      // Clear cache and modify file
      resolver.clearCache();
      fs.writeFileSync(
        path.join(sessionDir, 'workspace.yaml'),
        `cwd: ${squadPath}
summary: Modified`,
        'utf-8'
      );

      const result2 = resolver.resolveForSquad(squadPath);
      expect(result2?.summary).toBe('Modified');
    });

    it('handles missing session state directory', () => {
      // Override to point to non-existent directory
      resolver._sessionStateDir = path.join(tmpSessionDir, 'nonexistent');
      
      const squadPath = path.join(tmpSessionDir, 'test-squad');
      const result = resolver.resolveForSquad(squadPath);
      
      expect(result).toBeNull();
    });
  });
});
