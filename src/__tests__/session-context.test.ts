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

    it('uses CWD index for O(1) lookups on repeat scans (200 sessions)', () => {
      const targetSquad = path.join(tmpSessionDir, 'target-squad');

      // Create 200 session directories, only one matching our target
      for (let i = 0; i < 200; i++) {
        const sessionDir = path.join(resolver._sessionStateDir, `session-${i}`);
        fs.mkdirSync(sessionDir, { recursive: true });
        const cwd = i === 42 ? targetSquad : path.join(tmpSessionDir, `other-squad-${i}`);
        fs.writeFileSync(
          path.join(sessionDir, 'workspace.yaml'),
          `cwd: ${cwd}\nsummary: Session ${i}\nupdated_at: 2025-01-01T${String(i).padStart(2, '0')}:00:00Z`,
          'utf-8',
        );
      }

      // First call: builds the index (cold)
      const result1 = resolver.resolveForSquad(targetSquad);
      expect(result1?.sessionId).toBe('session-42');

      // Clear only the per-call cache, keep the CWD index
      resolver._cache = null;

      // Second call: should reuse the CWD index (warm) — measure time
      const start = performance.now();
      const result2 = resolver.resolveForSquad(targetSquad);
      const elapsed = performance.now() - start;

      expect(result2?.sessionId).toBe('session-42');
      expect(elapsed).toBeLessThan(10); // <10ms with index vs ~100ms without
    });

    it('rebuilds CWD index when new session directories appear', () => {
      const squadPath = path.join(tmpSessionDir, 'test-squad');

      // Create initial session
      const session1Dir = path.join(resolver._sessionStateDir, 'session-old');
      fs.mkdirSync(session1Dir, { recursive: true });
      fs.writeFileSync(
        path.join(session1Dir, 'workspace.yaml'),
        `cwd: ${squadPath}\nsummary: Old\nupdated_at: 2025-01-01T00:00:00Z`,
        'utf-8',
      );

      const result1 = resolver.resolveForSquad(squadPath);
      expect(result1?.summary).toBe('Old');

      // Clear per-call cache but keep CWD index
      resolver._cache = null;

      // Add a new session directory — index should rebuild
      const session2Dir = path.join(resolver._sessionStateDir, 'session-new');
      fs.mkdirSync(session2Dir, { recursive: true });
      fs.writeFileSync(
        path.join(session2Dir, 'workspace.yaml'),
        `cwd: ${squadPath}\nsummary: New\nupdated_at: 2025-01-02T00:00:00Z`,
        'utf-8',
      );

      const result2 = resolver.resolveForSquad(squadPath);
      expect(result2?.summary).toBe('New');
      expect(result2?.sessionId).toBe('session-new');
    });
  });

  describe('getLastEvent', () => {
    let resolver: any;

    beforeEach(async () => {
      const module = await import('../session-context');
      resolver = new module.SessionContextResolver();
      resolver._sessionStateDir = tmpSessionDir;
    });

    function writeEvents(sessionId: string, events: Array<{ type: string; timestamp: string }>): void {
      const sessionDir = path.join(tmpSessionDir, sessionId);
      fs.mkdirSync(sessionDir, { recursive: true });
      const lines = events.map(e => JSON.stringify(e)).join('\n') + '\n';
      fs.writeFileSync(path.join(sessionDir, 'events.jsonl'), lines, 'utf-8');
    }

    it('returns last event from events.jsonl', () => {
      writeEvents('session-1', [
        { type: 'session.start', timestamp: '2026-01-01T00:00:00Z' },
        { type: 'user.message', timestamp: '2026-01-01T00:01:00Z' },
        { type: 'assistant.turn_end', timestamp: '2026-01-01T00:02:00Z' },
      ]);

      const event = resolver.getLastEvent('session-1');
      expect(event).toEqual({ type: 'assistant.turn_end', timestamp: '2026-01-01T00:02:00Z' });
    });

    it('returns null for non-existent session', () => {
      const event = resolver.getLastEvent('nonexistent');
      expect(event).toBeNull();
    });

    it('returns null for empty events.jsonl', () => {
      const sessionDir = path.join(tmpSessionDir, 'empty-session');
      fs.mkdirSync(sessionDir, { recursive: true });
      fs.writeFileSync(path.join(sessionDir, 'events.jsonl'), '', 'utf-8');

      const event = resolver.getLastEvent('empty-session');
      expect(event).toBeNull();
    });

    it('returns null for session without events.jsonl', () => {
      const sessionDir = path.join(tmpSessionDir, 'no-events');
      fs.mkdirSync(sessionDir, { recursive: true });
      fs.writeFileSync(path.join(sessionDir, 'workspace.yaml'), 'id: no-events', 'utf-8');

      const event = resolver.getLastEvent('no-events');
      expect(event).toBeNull();
    });

    it('caches results within TTL', () => {
      writeEvents('cached-session', [
        { type: 'assistant.turn_end', timestamp: '2026-01-01T00:00:00Z' },
      ]);

      const event1 = resolver.getLastEvent('cached-session');
      expect(event1?.type).toBe('assistant.turn_end');

      // Overwrite the file — should still return cached value
      writeEvents('cached-session', [
        { type: 'tool.execution_start', timestamp: '2026-01-01T00:01:00Z' },
      ]);

      const event2 = resolver.getLastEvent('cached-session');
      expect(event2?.type).toBe('assistant.turn_end');
    });

    it('handles mid-turn events', () => {
      writeEvents('working-session', [
        { type: 'session.start', timestamp: '2026-01-01T00:00:00Z' },
        { type: 'tool.execution_start', timestamp: '2026-01-01T00:01:00Z' },
      ]);

      const event = resolver.getLastEvent('working-session');
      expect(event?.type).toBe('tool.execution_start');
    });
  });

  describe('isSessionResumable', () => {
    let resolver: any;

    beforeEach(async () => {
      const module = await import('../session-context');
      resolver = new module.SessionContextResolver();
      resolver._sessionStateDir = tmpSessionDir;
    });

    function createSession(sessionId: string, opts: { workspace?: boolean; events?: boolean; staleEvents?: boolean } = {}): void {
      const sessionDir = path.join(tmpSessionDir, sessionId);
      fs.mkdirSync(sessionDir, { recursive: true });
      if (opts.workspace !== false) {
        fs.writeFileSync(path.join(sessionDir, 'workspace.yaml'), 'cwd: /test\nsummary: test', 'utf-8');
      }
      if (opts.events !== false) {
        const eventsPath = path.join(sessionDir, 'events.jsonl');
        fs.writeFileSync(eventsPath, '{"type":"session.start","timestamp":"2026-01-01T00:00:00Z"}\n', 'utf-8');
        if (opts.staleEvents) {
          // Set mtime to 15 days ago
          const staleTime = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
          fs.utimesSync(eventsPath, staleTime, staleTime);
        }
      }
    }

    it('returns resumable when workspace.yaml and events.jsonl both exist', () => {
      createSession('good-session');
      const result = resolver.isSessionResumable('good-session');
      expect(result.resumable).toBe(true);
      expect(result.stale).toBe(false);
    });

    it('returns not resumable when workspace.yaml is missing', () => {
      createSession('no-workspace', { workspace: false });
      const result = resolver.isSessionResumable('no-workspace');
      expect(result.resumable).toBe(false);
      expect(result.reason).toContain('workspace.yaml');
    });

    it('returns not resumable when events.jsonl is missing', () => {
      createSession('no-events', { events: false });
      const result = resolver.isSessionResumable('no-events');
      expect(result.resumable).toBe(false);
      expect(result.reason).toContain('events.jsonl');
    });

    it('returns not resumable when session directory does not exist', () => {
      const result = resolver.isSessionResumable('nonexistent-session');
      expect(result.resumable).toBe(false);
    });

    it('flags stale sessions (events.jsonl older than 14 days)', () => {
      createSession('stale-session', { staleEvents: true });
      const result = resolver.isSessionResumable('stale-session');
      expect(result.resumable).toBe(true);
      expect(result.stale).toBe(true);
    });

    it('does not flag recent sessions as stale', () => {
      createSession('fresh-session');
      const result = resolver.isSessionResumable('fresh-session');
      expect(result.resumable).toBe(true);
      expect(result.stale).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Phase 2: File system watchers
  // -------------------------------------------------------------------------

  describe('watchSession', () => {
    it('should call callback when events.jsonl is modified', async () => {
      const module = await import('../session-context');
      const resolver: any = new module.SessionContextResolver();
      resolver._sessionStateDir = tmpSessionDir;

      const sessionId = 'watch-session';
      const sessionDir = path.join(tmpSessionDir, sessionId);
      fs.mkdirSync(sessionDir, { recursive: true });
      
      // Create initial events.jsonl
      const eventsPath = path.join(sessionDir, 'events.jsonl');
      fs.writeFileSync(eventsPath, '{"type":"session.start","timestamp":"2026-01-01T00:00:00Z"}\n', 'utf-8');

      const callback = vi.fn();
      const disposable = resolver.watchSession(sessionId, callback);

      // Modify the file
      await new Promise(resolve => setTimeout(resolve, 50));
      fs.appendFileSync(eventsPath, '{"type":"user.message","timestamp":"2026-01-01T00:01:00Z"}\n', 'utf-8');

      // Wait for watcher to fire
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(callback).toHaveBeenCalled();
      
      disposable.dispose();
    });

    it('should parse the last event from events.jsonl', async () => {
      const module = await import('../session-context');
      const resolver: any = new module.SessionContextResolver();
      resolver._sessionStateDir = tmpSessionDir;

      const sessionId = 'parse-session';
      const sessionDir = path.join(tmpSessionDir, sessionId);
      fs.mkdirSync(sessionDir, { recursive: true });

      const eventsPath = path.join(sessionDir, 'events.jsonl');
      fs.writeFileSync(eventsPath, '{"type":"session.start","timestamp":"2026-01-01T00:00:00Z"}\n', 'utf-8');

      const callback = vi.fn();
      const disposable = resolver.watchSession(sessionId, callback);

      await new Promise(resolve => setTimeout(resolve, 50));
      fs.appendFileSync(eventsPath, '{"type":"assistant.turn_end","timestamp":"2026-01-01T00:02:00Z"}\n', 'utf-8');

      await new Promise(resolve => setTimeout(resolve, 300));

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        type: 'assistant.turn_end',
        timestamp: '2026-01-01T00:02:00Z',
      }));

      disposable.dispose();
    });

    it('should debounce rapid changes', async () => {
      const module = await import('../session-context');
      const resolver: any = new module.SessionContextResolver();
      resolver._sessionStateDir = tmpSessionDir;

      const sessionId = 'debounce-session';
      const sessionDir = path.join(tmpSessionDir, sessionId);
      fs.mkdirSync(sessionDir, { recursive: true });

      const eventsPath = path.join(sessionDir, 'events.jsonl');
      fs.writeFileSync(eventsPath, '{"type":"session.start","timestamp":"2026-01-01T00:00:00Z"}\n', 'utf-8');

      const callback = vi.fn();
      const disposable = resolver.watchSession(sessionId, callback);

      await new Promise(resolve => setTimeout(resolve, 50));

      // Rapid changes
      fs.appendFileSync(eventsPath, '{"type":"event1","timestamp":"2026-01-01T00:01:00Z"}\n', 'utf-8');
      await new Promise(resolve => setTimeout(resolve, 20));
      fs.appendFileSync(eventsPath, '{"type":"event2","timestamp":"2026-01-01T00:02:00Z"}\n', 'utf-8');
      await new Promise(resolve => setTimeout(resolve, 20));
      fs.appendFileSync(eventsPath, '{"type":"event3","timestamp":"2026-01-01T00:03:00Z"}\n', 'utf-8');

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 300));

      // Should have been called fewer times than changes due to debouncing
      expect(callback.mock.calls.length).toBeLessThan(3);
      expect(callback.mock.calls.length).toBeGreaterThan(0);

      disposable.dispose();
    });

    it('should return a disposable that stops watching', async () => {
      const module = await import('../session-context');
      const resolver: any = new module.SessionContextResolver();
      resolver._sessionStateDir = tmpSessionDir;

      const sessionId = 'dispose-session';
      const sessionDir = path.join(tmpSessionDir, sessionId);
      fs.mkdirSync(sessionDir, { recursive: true });

      const eventsPath = path.join(sessionDir, 'events.jsonl');
      fs.writeFileSync(eventsPath, '{"type":"session.start","timestamp":"2026-01-01T00:00:00Z"}\n', 'utf-8');

      const callback = vi.fn();
      const disposable = resolver.watchSession(sessionId, callback);

      await new Promise(resolve => setTimeout(resolve, 50));

      // Reset callback — watchSession reads initial state on setup, which may fire
      callback.mockClear();
      
      // Dispose watcher
      disposable.dispose();

      // Modify file after disposal
      fs.appendFileSync(eventsPath, '{"type":"user.message","timestamp":"2026-01-01T00:01:00Z"}\n', 'utf-8');
      await new Promise(resolve => setTimeout(resolve, 300));

      // Should not have been called after dispose
      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle events.jsonl not existing yet', async () => {
      const module = await import('../session-context');
      const resolver: any = new module.SessionContextResolver();
      resolver._sessionStateDir = tmpSessionDir;

      const sessionId = 'future-session';
      const sessionDir = path.join(tmpSessionDir, sessionId);
      fs.mkdirSync(sessionDir, { recursive: true });

      const callback = vi.fn();
      
      // Should not throw when events.jsonl doesn't exist
      expect(() => resolver.watchSession(sessionId, callback)).not.toThrow();

      const disposable = resolver.watchSession(sessionId, callback);
      
      // Create file after watcher is set up
      const eventsPath = path.join(sessionDir, 'events.jsonl');
      await new Promise(resolve => setTimeout(resolve, 50));
      fs.writeFileSync(eventsPath, '{"type":"session.start","timestamp":"2026-01-01T00:00:00Z"}\n', 'utf-8');

      await new Promise(resolve => setTimeout(resolve, 300));

      // May or may not fire depending on watcher behavior — just verify no crash
      disposable.dispose();
    });
  });

  describe('watchSession malformed JSON', () => {
    it('should not call callback when events.jsonl has corrupt last line', async () => {
      const module = await import('../session-context');
      const resolver: any = new module.SessionContextResolver();
      resolver._sessionStateDir = tmpSessionDir;

      const sessionId = 'malformed-json-session';
      const sessionDir = path.join(tmpSessionDir, sessionId);
      fs.mkdirSync(sessionDir, { recursive: true });

      // Create initial valid events.jsonl
      const eventsPath = path.join(sessionDir, 'events.jsonl');
      fs.writeFileSync(eventsPath, '{"type":"session.start","timestamp":"2026-01-01T00:00:00Z"}\n', 'utf-8');

      const callback = vi.fn();
      const disposable = resolver.watchSession(sessionId, callback);

      // Wait for initial read to settle
      await new Promise(resolve => setTimeout(resolve, 200));
      callback.mockClear();

      // Append malformed JSON line
      fs.appendFileSync(eventsPath, 'this is not valid json!!!\n', 'utf-8');

      // Wait for watcher to fire
      await new Promise(resolve => setTimeout(resolve, 300));

      // Callback should NOT have been called with the corrupt line
      expect(callback).not.toHaveBeenCalled();

      disposable.dispose();
    });
  });

  describe('watchSessionDir', () => {
    it('should call callback when files change in session directory', async () => {
      const module = await import('../session-context');
      const resolver: any = new module.SessionContextResolver();
      resolver._sessionStateDir = tmpSessionDir;

      const sessionId = 'dir-watch-session';
      const sessionDir = path.join(tmpSessionDir, sessionId);
      fs.mkdirSync(sessionDir, { recursive: true });

      const callback = vi.fn();
      const disposable = resolver.watchSessionDir(sessionId, callback);

      await new Promise(resolve => setTimeout(resolve, 50));

      // Create a new file in the directory
      fs.writeFileSync(path.join(sessionDir, 'new-file.txt'), 'content', 'utf-8');

      await new Promise(resolve => setTimeout(resolve, 300));

      expect(callback).toHaveBeenCalled();

      disposable.dispose();
    });

    it('should return a disposable that stops watching', async () => {
      const module = await import('../session-context');
      const resolver: any = new module.SessionContextResolver();
      resolver._sessionStateDir = tmpSessionDir;

      const sessionId = 'dir-dispose-session';
      const sessionDir = path.join(tmpSessionDir, sessionId);
      fs.mkdirSync(sessionDir, { recursive: true });

      const callback = vi.fn();
      const disposable = resolver.watchSessionDir(sessionId, callback);

      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Dispose
      disposable.dispose();

      // Modify directory after disposal
      fs.writeFileSync(path.join(sessionDir, 'post-dispose.txt'), 'content', 'utf-8');
      await new Promise(resolve => setTimeout(resolve, 300));

      // Should not have been called
      expect(callback).not.toHaveBeenCalled();
    });
  });
});
