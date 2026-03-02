import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { extractReferences } from './scanner';
import type { SessionContext } from './types';

/** Minimal disposable interface — avoids importing vscode in this pure Node.js module. */
export interface Disposable {
  dispose(): void;
}

const CACHE_TTL_MS = 30_000;

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

/**
 * Simplified session event used internally.  The `type` field aligns with
 * the official `CopilotEventType` from `github/copilot-sdk` (see
 * `src/copilot-sdk-types.ts`), but we keep it as `string` so unknown
 * future events don't break parsing.
 */
export interface SessionEvent {
  type: string;
  timestamp: string;
  toolName?: string;
  toolCallId?: string;
  /** Computed from tail analysis — true when an ask_user tool started but hasn't completed. */
  hasOpenAskUser?: boolean;
}

export interface SessionResumability {
  resumable: boolean;
  reason?: string;
  stale: boolean;
}

interface CacheEntry {
  timestamp: number;
  results: Map<string, SessionContext>;
}

interface EventCacheEntry {
  timestamp: number;
  event: SessionEvent | null;
}

/** Lightweight record stored in the CWD index — no plan.md parsing. */
export interface CwdIndexEntry {
  sessionId: string;
  cwd: string;
  summary: string;
  branch: string;
  createdAt: string;
  updatedAt: string;
}

export class SessionContextResolver {
  private _cache: CacheEntry | null = null;
  private readonly _eventCache = new Map<string, EventCacheEntry>();
  private static readonly EVENT_CACHE_TTL_MS = 10_000;
  static readonly STALE_SESSION_DAYS = 14;
  private readonly _defaultSessionStateDir: string;
  private readonly _additionalSessionStateDirs = new Set<string>();
  private readonly _fileWatchers = new Map<string, fs.FSWatcher>();
  private readonly _watcherPending = new Map<string, ReturnType<typeof setTimeout>>();

  /** CWD → session entries index for O(1) lookups. Rebuilt when dir count changes. */
  private _cwdIndex: Map<string, CwdIndexEntry[]> | null = null;
  private _indexedDirCount: number = 0;

  constructor() {
    this._defaultSessionStateDir = path.join(os.homedir(), '.copilot', 'session-state');
  }

  /** Register an additional session-state directory (e.g. from --config). */
  addSessionStateDir(dir: string): void {
    if (dir === this._defaultSessionStateDir) return;
    if (this._additionalSessionStateDirs.has(dir)) return;
    this._additionalSessionStateDirs.add(dir);
    // Invalidate caches so new dir is picked up
    this._cwdIndex = null;
    this._indexedDirCount = 0;
    this._cache = null;
  }

  /** Return all known session-state directories. */
  getSessionStateDirs(): string[] {
    return [this._defaultSessionStateDir, ...this._additionalSessionStateDirs];
  }

  /** Check whether a session can be resumed by verifying workspace.yaml + events.jsonl exist and are valid. */
  isSessionResumable(sessionId: string): SessionResumability {
    for (const dir of this.getSessionStateDirs()) {
      const sessionDir = path.join(dir, sessionId);
      const workspacePath = path.join(sessionDir, 'workspace.yaml');
      try {
        fs.accessSync(workspacePath, fs.constants.R_OK);
      } catch {
        continue;
      }
      // Found workspace.yaml in this dir — check events.jsonl
      const eventsPath = path.join(sessionDir, 'events.jsonl');
      try {
        fs.accessSync(eventsPath, fs.constants.R_OK);
      } catch {
        return { resumable: false, reason: `Session ${sessionId} has no events.jsonl — no activity was recorded.`, stale: false };
      }

      let stale = false;
      try {
        const stats = fs.statSync(eventsPath);
        const ageMs = Date.now() - stats.mtimeMs;
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        stale = ageDays > SessionContextResolver.STALE_SESSION_DAYS;
      } catch { /* stat failed — treat as non-stale */ }

      return { resumable: true, stale };
    }
    return { resumable: false, reason: `Session ${sessionId} has no workspace.yaml — session state is missing or corrupted.`, stale: false };
  }

  resolveForSquad(squadPath: string): SessionContext | null {
    const map = this.resolveAll([squadPath]);
    return map.get(squadPath) ?? null;
  }

  resolveAll(squadPaths: string[]): Map<string, SessionContext> {
    const now = Date.now();
    if (this._cache && (now - this._cache.timestamp) < CACHE_TTL_MS) {
      const result = new Map<string, SessionContext>();
      for (const sp of squadPaths) {
        const ctx = this._cache.results.get(sp);
        if (ctx) result.set(sp, ctx);
      }
      return result;
    }

    const result = this._scan(squadPaths);
    this._cache = { timestamp: now, results: result };
    return result;
  }

  clearCache(): void {
    this._cache = null;
    this._cwdIndex = null;
    this._indexedDirCount = 0;
  }

  getLastEvent(sessionId: string): SessionEvent | null {
    const now = Date.now();
    const cached = this._eventCache.get(sessionId);
    if (cached && (now - cached.timestamp) < SessionContextResolver.EVENT_CACHE_TTL_MS) {
      return cached.event;
    }

    let event: SessionEvent | null = null;

    for (const dir of this.getSessionStateDirs()) {
      const eventsPath = path.join(dir, sessionId, 'events.jsonl');
      try {
        const fd = fs.openSync(eventsPath, 'r');
        try {
          const stats = fs.fstatSync(fd);
          if (stats.size === 0) { fs.closeSync(fd); continue; }
          const readSize = Math.min(2048, stats.size);
          const buffer = Buffer.alloc(readSize);
          fs.readSync(fd, buffer, 0, readSize, stats.size - readSize);
          const chunk = buffer.toString('utf-8');
          const lines = chunk.split('\n').filter(l => l.trim());
          if (lines.length === 0) { fs.closeSync(fd); continue; }

          const openAskUserIds = new Set<string>();
          let lastParsed: any = null;

          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              lastParsed = parsed;
              if (parsed.type === 'tool.execution_start' && parsed.data?.toolName === 'ask_user' && parsed.data?.toolCallId) {
                openAskUserIds.add(parsed.data.toolCallId);
              } else if (parsed.type === 'tool.execution_complete') {
                if (parsed.data?.toolCallId) {
                  openAskUserIds.delete(parsed.data.toolCallId);
                } else {
                  openAskUserIds.clear();
                }
              }
            } catch { /* skip malformed lines */ }
          }

          if (lastParsed) {
            const turnBoundary = lastParsed.type === 'assistant.turn_end'
              || lastParsed.type === 'user.message'
              || lastParsed.type === 'session.idle'
              || lastParsed.type === 'session.start'
              || lastParsed.type === 'session.resume'
              || lastParsed.type === 'session.info'
              || lastParsed.type === 'session.shutdown';

            event = {
              type: lastParsed.type,
              timestamp: lastParsed.timestamp,
              toolName: lastParsed.data?.toolName,
              toolCallId: lastParsed.data?.toolCallId,
              hasOpenAskUser: !turnBoundary && openAskUserIds.size > 0,
            };
          }
        } finally {
          fs.closeSync(fd);
        }
        break; // Found the session in this dir
      } catch {
        // File doesn't exist in this dir — try next
      }
    }

    this._eventCache.set(sessionId, { timestamp: now, event });
    return event;
  }

  /**
   * Watch a session's events.jsonl file for changes and invoke callback on each new event.
   * Returns a Disposable to stop watching.
   */
  watchSession(sessionId: string, callback: (event: SessionEvent) => void): Disposable {
    // Find the session-state dir containing this session, or fall back to default
    const resolvedDir = this._findSessionDir(sessionId) ?? this._defaultSessionStateDir;
    const eventsPath = path.join(resolvedDir, sessionId, 'events.jsonl');
    const watchKey = `session:${sessionId}`;

    // Stop any existing watcher for this session
    const existingWatcher = this._fileWatchers.get(watchKey);
    if (existingWatcher) {
      existingWatcher.close();
      this._fileWatchers.delete(watchKey);
    }

    let lastSize = 0;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    const readLastLine = () => {
      try {
        const stats = fs.statSync(eventsPath);
        if (stats.size <= lastSize) return;
        lastSize = stats.size;

        const fd = fs.openSync(eventsPath, 'r');
        try {
          const readSize = Math.min(2048, stats.size);
          const buffer = Buffer.alloc(readSize);
          fs.readSync(fd, buffer, 0, readSize, stats.size - readSize);
          const chunk = buffer.toString('utf-8');
          const lines = chunk.split('\n').filter(l => l.trim());
          if (lines.length === 0) return;

          // Track open ask_user tool calls across all tail lines
          const openAskUserIds = new Set<string>();
          let lastParsed: any = null;

          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              lastParsed = parsed;
              if (parsed.type === 'tool.execution_start' && parsed.data?.toolName === 'ask_user' && parsed.data?.toolCallId) {
                openAskUserIds.add(parsed.data.toolCallId);
              } else if (parsed.type === 'tool.execution_complete') {
                if (parsed.data?.toolCallId) {
                  openAskUserIds.delete(parsed.data.toolCallId);
                } else {
                  openAskUserIds.clear();
                }
              }
            } catch { /* skip malformed lines */ }
          }

          if (lastParsed) {
            const turnBoundary = lastParsed.type === 'assistant.turn_end'
              || lastParsed.type === 'user.message'
              || lastParsed.type === 'session.idle'
              || lastParsed.type === 'session.start'
              || lastParsed.type === 'session.resume'
              || lastParsed.type === 'session.info'
              || lastParsed.type === 'session.shutdown';

            callback({
              type: lastParsed.type,
              timestamp: lastParsed.timestamp,
              toolName: lastParsed.data?.toolName,
              toolCallId: lastParsed.data?.toolCallId,
              hasOpenAskUser: !turnBoundary && openAskUserIds.size > 0,
            });
          }
        } finally {
          fs.closeSync(fd);
        }
      } catch {
        // File doesn't exist yet or read error
      }
    };

    const onChange = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined;
        readLastLine();
      }, 100);
    };

    const watchFile = () => {
      try {
        const watcher = fs.watch(eventsPath, { persistent: false }, onChange);
        this._fileWatchers.set(watchKey, watcher);
        readLastLine();
      } catch {
        // File disappeared after we saw it — fall back to dir watch
        watchDir();
      }
    };

    const watchDir = () => {
      const sessionDir = path.join(resolvedDir, sessionId);
      try {
        // Watch the session directory for events.jsonl to appear
        const dirWatcher = fs.watch(sessionDir, { persistent: false }, (_eventType, filename) => {
          if (filename === 'events.jsonl') {
            dirWatcher.close();
            this._fileWatchers.delete(watchKey);
            watchFile();
          }
        });
        this._fileWatchers.set(watchKey, dirWatcher);
        // Check if file appeared between our check and the watch setup
        if (fs.existsSync(eventsPath)) {
          dirWatcher.close();
          this._fileWatchers.delete(watchKey);
          watchFile();
        }
      } catch {
        // Directory doesn't exist yet — retry in 1s
        const retry = setTimeout(() => {
          this._watcherPending.delete(watchKey);
          if (fs.existsSync(eventsPath)) {
            watchFile();
          } else {
            watchDir();
          }
        }, 1000);
        this._watcherPending.set(watchKey, retry);
      }
    };

    // Start with file watch if it already exists, otherwise watch directory
    if (fs.existsSync(eventsPath)) {
      watchFile();
    } else {
      watchDir();
    }

    return {
      dispose: () => {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        const pending = this._watcherPending.get(watchKey);
        if (pending) {
          clearTimeout(pending);
          this._watcherPending.delete(watchKey);
        }
        const watcher = this._fileWatchers.get(watchKey);
        if (watcher) {
          watcher.close();
          this._fileWatchers.delete(watchKey);
        }
      },
    };
  }

  /**
   * Watch a session directory for any changes (useful for detecting workspace.yaml appearance).
   * Returns a Disposable to stop watching.
   */
  watchSessionDir(sessionId: string, callback: () => void): Disposable {
    const resolvedDir = this._findSessionDir(sessionId) ?? this._defaultSessionStateDir;
    const sessionDir = path.join(resolvedDir, sessionId);
    const watchKey = `dir:${sessionId}`;

    const existingWatcher = this._fileWatchers.get(watchKey);
    if (existingWatcher) {
      existingWatcher.close();
      this._fileWatchers.delete(watchKey);
    }

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    const onChange = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined;
        callback();
      }, 100);
    };

    const setupWatch = () => {
      try {
        const watcher = fs.watch(sessionDir, { persistent: false }, onChange);
        this._fileWatchers.set(watchKey, watcher);
      } catch {
        // Directory doesn't exist yet — retry in 1s
        const retry = setTimeout(() => {
          this._watcherPending.delete(watchKey);
          setupWatch();
        }, 1000);
        this._watcherPending.set(watchKey, retry);
      }
    };

    setupWatch();

    return {
      dispose: () => {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        const pending = this._watcherPending.get(watchKey);
        if (pending) {
          clearTimeout(pending);
          this._watcherPending.delete(watchKey);
        }
        const watcher = this._fileWatchers.get(watchKey);
        if (watcher) {
          watcher.close();
          this._fileWatchers.delete(watchKey);
        }
      },
    };
  }

  /** Find the session-state directory containing a given session ID, or undefined. */
  private _findSessionDir(sessionId: string): string | undefined {
    for (const dir of this.getSessionStateDirs()) {
      try {
        fs.accessSync(path.join(dir, sessionId), fs.constants.R_OK);
        return dir;
      } catch { /* not in this dir */ }
    }
    return undefined;
  }

  /**
   * Build or revalidate the CWD → session index. Rebuilds only when the
   * number of session directories changes (new session created / deleted).
   */
  private _ensureIndex(): Map<string, CwdIndexEntry[]> {
    // Collect dir entries from all session-state directories
    const allDirEntries: { dirEntry: fs.Dirent; parentDir: string }[] = [];
    for (const dir of this.getSessionStateDirs()) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory());
        for (const e of entries) {
          allDirEntries.push({ dirEntry: e, parentDir: dir });
        }
      } catch { /* dir doesn't exist */ }
    }

    // Fast path: directory count unchanged → index is still valid
    if (this._cwdIndex && allDirEntries.length === this._indexedDirCount) {
      return this._cwdIndex;
    }

    // Rebuild index from all session directories
    const index = new Map<string, CwdIndexEntry[]>();

    for (const { dirEntry, parentDir } of allDirEntries) {
      const sessionId = dirEntry.name;
      const workspacePath = path.join(parentDir, sessionId, 'workspace.yaml');

      let yamlContent: string;
      try {
        yamlContent = fs.readFileSync(workspacePath, 'utf-8');
      } catch {
        continue;
      }

      const yaml = parseSimpleYaml(yamlContent);
      const sessionCwd = yaml['cwd'];
      if (!sessionCwd) continue;

      const normalizedCwd = normalizePath(sessionCwd);
      const entry: CwdIndexEntry = {
        sessionId,
        cwd: sessionCwd,
        summary: yaml['summary'] || '',
        branch: yaml['branch'] || '',
        createdAt: yaml['created_at'] || '',
        updatedAt: yaml['updated_at'] || '',
      };

      const existing = index.get(normalizedCwd);
      if (existing) {
        existing.push(entry);
      } else {
        index.set(normalizedCwd, [entry]);
      }
    }

    this._cwdIndex = index;
    this._indexedDirCount = allDirEntries.length;
    return index;
  }

  /**
   * Return every session across all session-state directories as a flat array.
   * Lightweight — reads workspace.yaml only, skips plan.md.
   */
  getAllSessions(): CwdIndexEntry[] {
    const index = this._ensureIndex();
    const all: CwdIndexEntry[] = [];
    for (const entries of index.values()) {
      all.push(...entries);
    }
    return all;
  }

  private _scan(squadPaths: string[]): Map<string, SessionContext> {
    const result = new Map<string, SessionContext>();
    const index = this._ensureIndex();

    for (const sp of squadPaths) {
      const normalizedSp = normalizePath(sp);
      const entries = index.get(normalizedSp);
      if (!entries || entries.length === 0) continue;

      // Pick the most recently updated entry
      let best = entries[0];
      for (let i = 1; i < entries.length; i++) {
        if (entries[i].updatedAt > best.updatedAt) {
          best = entries[i];
        }
      }

      // Read plan.md only for the best match — search all dirs
      let references = extractReferences('');
      const planDir = this._findSessionDir(best.sessionId);
      if (planDir) {
        const planPath = path.join(planDir, best.sessionId, 'plan.md');
        try {
          const planContent = fs.readFileSync(planPath, 'utf-8').slice(0, 500);
          references = extractReferences(planContent);
        } catch { /* no plan.md */ }
      }

      result.set(sp, {
        sessionId: best.sessionId,
        summary: best.summary,
        cwd: best.cwd,
        branch: best.branch,
        createdAt: best.createdAt,
        updatedAt: best.updatedAt,
        references,
      });
    }

    return result;
  }
}
