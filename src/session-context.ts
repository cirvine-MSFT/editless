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
interface CwdIndexEntry {
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
  private readonly _sessionStateDir: string;
  private readonly _fileWatchers = new Map<string, fs.FSWatcher>();
  private readonly _watcherPending = new Map<string, ReturnType<typeof setTimeout>>();

  /** CWD → session entries index for O(1) lookups. Rebuilt when dir count changes. */
  private _cwdIndex: Map<string, CwdIndexEntry[]> | null = null;
  private _indexedDirCount: number = 0;

  constructor() {
    this._sessionStateDir = path.join(os.homedir(), '.copilot', 'session-state');
  }

  /** Check whether a session can be resumed by verifying workspace.yaml + events.jsonl exist and are valid. */
  isSessionResumable(sessionId: string): SessionResumability {
    const sessionDir = path.join(this._sessionStateDir, sessionId);
    const workspacePath = path.join(sessionDir, 'workspace.yaml');
    const eventsPath = path.join(sessionDir, 'events.jsonl');

    try {
      fs.accessSync(workspacePath, fs.constants.R_OK);
    } catch {
      return { resumable: false, reason: `Session ${sessionId} has no workspace.yaml — session state is missing or corrupted.`, stale: false };
    }

    try {
      fs.accessSync(eventsPath, fs.constants.R_OK);
    } catch {
      return { resumable: false, reason: `Session ${sessionId} has no events.jsonl — no activity was recorded.`, stale: false };
    }

    // Stale check: events.jsonl not modified in STALE_SESSION_DAYS
    let stale = false;
    try {
      const stats = fs.statSync(eventsPath);
      const ageMs = Date.now() - stats.mtimeMs;
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      stale = ageDays > SessionContextResolver.STALE_SESSION_DAYS;
    } catch {
      // stat failed — treat as non-stale, we already verified access above
    }

    return { resumable: true, stale };
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

    const eventsPath = path.join(this._sessionStateDir, sessionId, 'events.jsonl');
    let event: SessionEvent | null = null;

    try {
      const fd = fs.openSync(eventsPath, 'r');
      try {
        const stats = fs.fstatSync(fd);
        if (stats.size === 0) { fs.closeSync(fd); return null; }
        const readSize = Math.min(2048, stats.size);
        const buffer = Buffer.alloc(readSize);
        fs.readSync(fd, buffer, 0, readSize, stats.size - readSize);
        const chunk = buffer.toString('utf-8');
        const lines = chunk.split('\n').filter(l => l.trim());
        if (lines.length === 0) { fs.closeSync(fd); return null; }

        // Track open ask_user tool calls across all tail lines
        const openAskUserIds = new Set<string>();
        let lastParsed: any = null;

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            lastParsed = parsed;
            if (parsed.type === 'tool.execution_start' && parsed.data?.toolName === 'ask_user' && parsed.data?.toolCallId) {
              openAskUserIds.add(parsed.data.toolCallId);
            } else if (parsed.type === 'tool.execution_complete' && parsed.data?.toolCallId) {
              openAskUserIds.delete(parsed.data.toolCallId);
            }
          } catch { /* skip malformed lines */ }
        }

        if (lastParsed) {
          event = {
            type: lastParsed.type,
            timestamp: lastParsed.timestamp,
            toolName: lastParsed.data?.toolName,
            toolCallId: lastParsed.data?.toolCallId,
            hasOpenAskUser: openAskUserIds.size > 0,
          };
        }
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      // File doesn't exist or read error
    }

    this._eventCache.set(sessionId, { timestamp: now, event });
    return event;
  }

  /**
   * Watch a session's events.jsonl file for changes and invoke callback on each new event.
   * Returns a Disposable to stop watching.
   */
  watchSession(sessionId: string, callback: (event: SessionEvent) => void): Disposable {
    const eventsPath = path.join(this._sessionStateDir, sessionId, 'events.jsonl');
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
              } else if (parsed.type === 'tool.execution_complete' && parsed.data?.toolCallId) {
                openAskUserIds.delete(parsed.data.toolCallId);
              }
            } catch { /* skip malformed lines */ }
          }

          if (lastParsed) {
            callback({
              type: lastParsed.type,
              timestamp: lastParsed.timestamp,
              toolName: lastParsed.data?.toolName,
              toolCallId: lastParsed.data?.toolCallId,
              hasOpenAskUser: openAskUserIds.size > 0,
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
      const sessionDir = path.join(this._sessionStateDir, sessionId);
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
    const sessionDir = path.join(this._sessionStateDir, sessionId);
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

  /**
   * Build or revalidate the CWD → session index. Rebuilds only when the
   * number of session directories changes (new session created / deleted).
   */
  private _ensureIndex(): Map<string, CwdIndexEntry[]> {
    let dirEntries: fs.Dirent[];
    try {
      dirEntries = fs.readdirSync(this._sessionStateDir, { withFileTypes: true })
        .filter(e => e.isDirectory());
    } catch {
      return this._cwdIndex ?? new Map();
    }

    // Fast path: directory count unchanged → index is still valid
    if (this._cwdIndex && dirEntries.length === this._indexedDirCount) {
      return this._cwdIndex;
    }

    // Rebuild index from all session directories
    const index = new Map<string, CwdIndexEntry[]>();

    for (const dirEntry of dirEntries) {
      const sessionId = dirEntry.name;
      const workspacePath = path.join(this._sessionStateDir, sessionId, 'workspace.yaml');

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
    this._indexedDirCount = dirEntries.length;
    return index;
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

      // Read plan.md only for the best match
      let references = extractReferences('');
      const planPath = path.join(this._sessionStateDir, best.sessionId, 'plan.md');
      try {
        const planContent = fs.readFileSync(planPath, 'utf-8').slice(0, 500);
        references = extractReferences(planContent);
      } catch { /* no plan.md */ }

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
