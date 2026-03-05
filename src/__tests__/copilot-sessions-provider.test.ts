import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createVscodeMock, ThemeIcon, ThemeColor } from './mocks/vscode-mocks';

vi.mock('vscode', () => createVscodeMock());

import { CopilotSessionsProvider, SessionTreeItem, formatRelativeTime } from '../copilot-sessions-provider';
import type { CwdIndexEntry, SessionContextResolver } from '../session-context';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResolver(sessions: CwdIndexEntry[] = [], resumable = true, stale = false): SessionContextResolver {
  return {
    getAllSessions: vi.fn(() => sessions),
    isSessionResumable: vi.fn(() => ({ resumable, reason: resumable ? undefined : 'missing workspace.yaml', stale })),
    clearCache: vi.fn(),
  } as unknown as SessionContextResolver;
}

function makeSession(overrides: Partial<CwdIndexEntry> = {}): CwdIndexEntry {
  return {
    sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    cwd: '/home/user/project',
    summary: 'Fix login bug',
    branch: 'fix-login',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-15T12:00:00Z',
    ...overrides,
  };
}

function recentDate(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

function staleDate(): string {
  return new Date(Date.now() - 15 * 24 * 60 * 60_000).toISOString();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CopilotSessionsProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('session listing', () => {
    it('returns sessions sorted by updatedAt DESC', () => {
      const s1 = makeSession({ sessionId: 'aaa', updatedAt: '2025-01-10T00:00:00Z', summary: 'Older' });
      const s2 = makeSession({ sessionId: 'bbb', updatedAt: '2025-01-20T00:00:00Z', summary: 'Newer' });
      const resolver = makeResolver([s1, s2]);
      const provider = new CopilotSessionsProvider(resolver);

      const children = provider.getChildren();
      expect(children.length).toBe(2);
      expect(children[0].label).toBe('Newer');
      expect(children[1].label).toBe('Older');
    });

    it('uses session ID prefix when no summary', () => {
      const s = makeSession({ summary: '', sessionId: 'abcdefgh-1234-5678-9012-abcdefabcdef' });
      const resolver = makeResolver([s]);
      const provider = new CopilotSessionsProvider(resolver);

      const children = provider.getChildren();
      expect(children[0].label).toBe('Session abcdefgh');
    });

    it('shows CWD as description', () => {
      const s = makeSession({ cwd: '/home/user/myproject' });
      const resolver = makeResolver([s]);
      const provider = new CopilotSessionsProvider(resolver);

      const children = provider.getChildren();
      expect(children[0].description).toBe('/home/user/myproject');
    });

    it('sets session entry on tree item', () => {
      const s = makeSession();
      const resolver = makeResolver([s]);
      const provider = new CopilotSessionsProvider(resolver);

      const children = provider.getChildren();
      expect(children[0].sessionEntry).toBe(s);
    });
  });

  describe('empty state', () => {
    it('shows "No sessions found" message when empty', () => {
      const resolver = makeResolver([]);
      const provider = new CopilotSessionsProvider(resolver);

      const children = provider.getChildren();
      expect(children.length).toBe(1);
      expect(children[0].label).toBe('No sessions found');
      expect(children[0].contextValue).toBe('empty');
    });
  });

  describe('stale sessions', () => {
    it('shows history icon and stale contextValue for old sessions', () => {
      const s = makeSession({ updatedAt: staleDate() });
      const resolver = makeResolver([s]);
      const provider = new CopilotSessionsProvider(resolver);

      const children = provider.getChildren();
      const icon = children[0].iconPath as ThemeIcon;
      expect(icon.id).toBe('history');
      expect(icon.color).toBeInstanceOf(ThemeColor);
      expect(children[0].contextValue).toBe('copilot-session-stale');
    });

    it('shows terminal icon for recent sessions', () => {
      const s = makeSession({ updatedAt: recentDate(5) });
      const resolver = makeResolver([s]);
      const provider = new CopilotSessionsProvider(resolver);

      const children = provider.getChildren();
      const icon = children[0].iconPath as ThemeIcon;
      expect(icon.id).toBe('terminal');
      expect(children[0].contextValue).toBe('copilot-session');
    });
  });

  describe('filter by workspace', () => {
    it('only shows matching sessions', () => {
      const s1 = makeSession({ sessionId: 'aaa', cwd: '/home/user/project-a', summary: 'A' });
      const s2 = makeSession({ sessionId: 'bbb', cwd: '/home/user/project-b', summary: 'B' });
      const resolver = makeResolver([s1, s2]);
      const provider = new CopilotSessionsProvider(resolver);

      provider.filter = { workspace: '/home/user/project-a' };
      const children = provider.getChildren();
      expect(children.length).toBe(1);
      expect(children[0].label).toBe('A');
    });

    it('filters case-insensitively', () => {
      const s = makeSession({ cwd: 'C:\\Users\\Me\\Project' });
      const resolver = makeResolver([s]);
      const provider = new CopilotSessionsProvider(resolver);

      provider.filter = { workspace: 'c:\\users\\me\\project' };
      const children = provider.getChildren();
      expect(children.length).toBe(1);
    });
  });

  describe('filter by squad', () => {
    it('filters sessions by squad name in summary or branch', () => {
      const s1 = makeSession({ sessionId: 'aaa', summary: 'squad alpha work', branch: 'main' });
      const s2 = makeSession({ sessionId: 'bbb', summary: 'other', branch: 'feat/beta' });
      const resolver = makeResolver([s1, s2]);
      const provider = new CopilotSessionsProvider(resolver);

      provider.filter = { squad: 'alpha' };
      const children = provider.getChildren();
      expect(children.length).toBe(1);
      expect(children[0].label).toBe('squad alpha work');
    });
  });

  describe('dismiss', () => {
    it('hides dismissed sessions', () => {
      const s1 = makeSession({ sessionId: 'aaa', summary: 'A' });
      const s2 = makeSession({ sessionId: 'bbb', summary: 'B' });
      const resolver = makeResolver([s1, s2]);
      const provider = new CopilotSessionsProvider(resolver);

      provider.dismiss('aaa');
      const children = provider.getChildren();
      expect(children.length).toBe(1);
      expect(children[0].label).toBe('B');
    });
  });

  describe('refresh', () => {
    it('clears resolver cache and fires change event', () => {
      const resolver = makeResolver([]);
      const provider = new CopilotSessionsProvider(resolver);
      const listener = vi.fn();
      provider.onDidChangeTreeData(listener);

      provider.refresh();
      expect(resolver.clearCache).toHaveBeenCalled();
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('getParent', () => {
    it('returns undefined (flat list)', () => {
      const resolver = makeResolver([]);
      const provider = new CopilotSessionsProvider(resolver);
      expect(provider.getParent()).toBeUndefined();
    });
  });

  describe('getChildren with element', () => {
    it('returns empty array for child elements', () => {
      const resolver = makeResolver([]);
      const provider = new CopilotSessionsProvider(resolver);
      const item = new SessionTreeItem('test');
      expect(provider.getChildren(item)).toEqual([]);
    });
  });
});

describe('formatRelativeTime', () => {
  it('returns empty for empty string', () => {
    expect(formatRelativeTime('')).toBe('');
  });

  it('returns "just now" for recent times', () => {
    expect(formatRelativeTime(new Date().toISOString())).toBe('just now');
  });

  it('returns minutes for times under an hour', () => {
    const d = new Date(Date.now() - 30 * 60_000).toISOString();
    expect(formatRelativeTime(d)).toBe('30m ago');
  });

  it('returns hours for times under a day', () => {
    const d = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(d)).toBe('3h ago');
  });

  it('returns days for older times', () => {
    const d = new Date(Date.now() - 5 * 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(d)).toBe('5d ago');
  });
});
