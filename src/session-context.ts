import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { extractReferences } from './scanner';
import type { SessionContext } from './types';

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

export interface SessionEvent {
  type: string;
  timestamp: string;
}

interface CacheEntry {
  timestamp: number;
  results: Map<string, SessionContext>;
}

interface EventCacheEntry {
  timestamp: number;
  event: SessionEvent | null;
}

export class SessionContextResolver {
  private _cache: CacheEntry | null = null;
  private readonly _eventCache = new Map<string, EventCacheEntry>();
  private static readonly EVENT_CACHE_TTL_MS = 3_000;
  private readonly _sessionStateDir: string;

  constructor() {
    this._sessionStateDir = path.join(os.homedir(), '.copilot', 'session-state');
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
        const lastLine = lines[lines.length - 1];
        if (lastLine) {
          const parsed = JSON.parse(lastLine);
          event = { type: parsed.type, timestamp: parsed.timestamp };
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

  private _scan(squadPaths: string[]): Map<string, SessionContext> {
    const result = new Map<string, SessionContext>();

    const normalizedLookup = new Map<string, string>();
    for (const sp of squadPaths) {
      normalizedLookup.set(normalizePath(sp), sp);
    }

    const candidates = new Map<string, SessionContext>();

    let sessionDirs: string[];
    try {
      sessionDirs = fs.readdirSync(this._sessionStateDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);
    } catch {
      return result;
    }

    for (const sessionId of sessionDirs) {
      const sessionDir = path.join(this._sessionStateDir, sessionId);
      const workspacePath = path.join(sessionDir, 'workspace.yaml');

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
      const matchedSquadPath = normalizedLookup.get(normalizedCwd);
      if (!matchedSquadPath) continue;

      let references = extractReferences('');
      const planPath = path.join(sessionDir, 'plan.md');
      try {
        const planContent = fs.readFileSync(planPath, 'utf-8').slice(0, 500);
        references = extractReferences(planContent);
      } catch { /* no plan.md */ }

      const ctx: SessionContext = {
        sessionId,
        summary: yaml['summary'] || '',
        cwd: sessionCwd,
        branch: yaml['branch'] || '',
        createdAt: yaml['created_at'] || '',
        updatedAt: yaml['updated_at'] || '',
        references,
      };

      const existing = candidates.get(matchedSquadPath);
      if (!existing || ctx.updatedAt > existing.updatedAt) {
        candidates.set(matchedSquadPath, ctx);
      }
    }

    for (const [squadPath, ctx] of candidates) {
      result.set(squadPath, ctx);
    }

    return result;
  }
}
