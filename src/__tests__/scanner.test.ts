import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseDecisions, parseRoster, extractReferences, determineStatus, scanSquad } from '../scanner';
import type { AgentTeamConfig } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function makeTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-test-'));
}

function writeFixture(relPath: string, content: string): string {
  const full = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
  return full;
}

beforeEach(() => { tmpDir = makeTmp(); });
afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

// ---------------------------------------------------------------------------
// parseDecisions
// ---------------------------------------------------------------------------

describe('parseDecisions', () => {
  it('parses valid decisions.md with 3 entries', () => {
    const content = `# Decisions

### 2025-01-15: Adopt TypeScript strict mode
**By:** Alice
Switched the entire codebase to strict mode for better safety.

### 2025-01-10: Use Vitest for testing
**By:** Bob
Vitest is faster and supports TypeScript natively.

### 2025-01-05: Monorepo structure
**By:** Carol
We will use a monorepo with npm workspaces.
`;
    const file = writeFixture('decisions.md', content);
    const result = parseDecisions(file, 10);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      date: '2025-01-15',
      title: 'Adopt TypeScript strict mode',
      author: 'Alice',
      summary: 'Switched the entire codebase to strict mode for better safety.',
    });
    expect(result[1].date).toBe('2025-01-10');
    expect(result[1].author).toBe('Bob');
    expect(result[2].title).toBe('Monorepo structure');
    expect(result[2].author).toBe('Carol');
  });

  it('returns empty array for empty file', () => {
    const file = writeFixture('empty.md', '');
    expect(parseDecisions(file, 10)).toEqual([]);
  });

  it('handles malformed entries with missing author', () => {
    const content = `### 2025-02-01: No author decision
Some summary text here.

### 2025-02-02: Has author
**By:** Dave
Real summary.
`;
    const file = writeFixture('malformed.md', content);
    const result = parseDecisions(file, 10);

    expect(result).toHaveLength(2);
    expect(result[0].author).toBe('unknown');
    expect(result[1].author).toBe('Dave');
  });

  it('respects limit parameter', () => {
    const content = `### 2025-03-01: First
**By:** A
Summary one.

### 2025-03-02: Second
**By:** B
Summary two.

### 2025-03-03: Third
**By:** C
Summary three.
`;
    const file = writeFixture('limited.md', content);
    const result = parseDecisions(file, 2);

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('First');
    expect(result[1].title).toBe('Second');
  });

  it('returns empty array when file does not exist', () => {
    const bogus = path.join(tmpDir, 'nonexistent.md');
    expect(parseDecisions(bogus, 10)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseRoster
// ---------------------------------------------------------------------------

describe('parseRoster', () => {
  it('parses valid team.md with Members table', () => {
    const content = `# My Squad

> A cool squad.

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Alice | Lead | charters/alice.md | active |
| Bob | Developer | charters/bob.md | silent |
| Carol | Tester | charters/carol.md | monitor |
`;
    const file = writeFixture('team.md', content);
    const result = parseRoster(file);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      name: 'Alice',
      role: 'Lead',
      charter: 'charters/alice.md',
      status: 'active',
    });
    expect(result[1].name).toBe('Bob');
    expect(result[1].role).toBe('Developer');
    expect(result[1].status).toBe('silent');
    expect(result[2].name).toBe('Carol');
    expect(result[2].status).toBe('monitor');
  });

  it('returns empty array for missing file', () => {
    expect(parseRoster(path.join(tmpDir, 'nope.md'))).toEqual([]);
  });

  it('returns empty array for file without Members section', () => {
    const content = `# My Squad\n\nJust some notes.\n`;
    const file = writeFixture('no-members.md', content);
    expect(parseRoster(file)).toEqual([]);
  });

  it('handles rows with fewer columns gracefully', () => {
    const content = `## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Alice | Lead | charters/alice.md | active |
| Bob | Dev |
`;
    const file = writeFixture('short-rows.md', content);
    const result = parseRoster(file);
    // "| Bob | Dev |" splits to ['', 'Bob', 'Dev', ''] — 4 cols, so it passes the length check
    // Bob is included with empty charter and no status
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Alice');
    expect(result[1].name).toBe('Bob');
    expect(result[1].role).toBe('Dev');
    expect(result[1].charter).toBeUndefined(); // empty string → undefined via falsy check
    expect(result[1].status).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// extractReferences
// ---------------------------------------------------------------------------

describe('extractReferences', () => {
  it('extracts WI#12345 (hash only, no space)', () => {
    // Regex WI[#\s-]?(\d+) allows ONE separator char; "WI #N" has two (space+#), so use WI#N
    const result = extractReferences('Resolved WI#12345 in this sprint');
    expect(result).toEqual([{ type: 'wi', number: '12345', label: 'WI #12345' }]);
  });

  it('extracts PR#67890 (no space)', () => {
    const result = extractReferences('Merged PR#67890');
    expect(result).toEqual([{ type: 'pr', number: '67890', label: 'PR #67890' }]);
  });

  it('extracts multiple reference types', () => {
    // Use single-separator forms that the regex actually matches
    const result = extractReferences('Linked WI#100, PR#200, US#300');
    expect(result).toHaveLength(3);
    expect(result.map(r => r.type)).toEqual(['pr', 'wi', 'us']);
    expect(result.map(r => r.number)).toEqual(['200', '100', '300']);
  });

  it('deduplicates references', () => {
    const result = extractReferences('See WI#42 and also WI#42 again');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: 'wi', number: '42', label: 'WI #42' });
  });

  it('returns empty array for text with no references', () => {
    expect(extractReferences('Nothing special here')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// determineStatus
// ---------------------------------------------------------------------------

describe('determineStatus', () => {
  it('returns active for recent activity (< 1 hour)', () => {
    const recent = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
    expect(determineStatus(recent, 0)).toBe('active');
  });

  it('returns needs-attention for old activity (> 1 day)', () => {
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    expect(determineStatus(old, 0)).toBe('needs-attention');
  });

  it('returns needs-attention when no activity but inbox has files', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    expect(determineStatus(twoHoursAgo, 3)).toBe('needs-attention');
  });

  it('returns idle for activity between 1 hour and 1 day with no inbox', () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
    expect(determineStatus(fiveHoursAgo, 0)).toBe('idle');
  });

  it('returns needs-attention when lastActivity is null', () => {
    expect(determineStatus(null, 0)).toBe('needs-attention');
  });
});

// ---------------------------------------------------------------------------
// scanSquad (integration)
// ---------------------------------------------------------------------------

describe('scanSquad', () => {
  function makeConfig(overrides: Partial<AgentTeamConfig> = {}): AgentTeamConfig {
    return {
      id: 'test-squad',
      name: 'Test Squad',
      path: tmpDir,
      icon: '🧪',
      universe: 'test',
      ...overrides,
    };
  }

  it('returns error state when .ai-team/ does not exist', () => {
    const state = scanSquad(makeConfig());
    expect(state.status).toBe('idle');
    expect(state.error).toContain('.ai-team/ directory not found');
    expect(state.roster).toEqual([]);
  });

  it('scans a fully populated .ai-team directory', () => {
    // Create .ai-team structure
    const aiTeam = path.join(tmpDir, '.ai-team');
    fs.mkdirSync(aiTeam, { recursive: true });

    // team.md
    writeFixture('.ai-team/team.md', `# Test Squad

> A test squad for unit tests.

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Tester | QA | charters/tester.md | active |
`);

    // decisions.md
    writeFixture('.ai-team/decisions.md', `### 2025-06-01: Use vitest
**By:** Tester
We chose vitest.
`);

    // inbox with a file
    writeFixture('.ai-team/decisions/inbox/pending.md', 'Pending decision');

    // orchestration-log
    writeFixture('.ai-team/orchestration-log/2025-06-01T1200-task.md',
      `| **Agent** | Tester (QA) |
| **Routed because** | Tests needed |
| **Outcome** | Tests written |
`);

    // session log
    writeFixture('.ai-team/log/2025-06-01-testing-session.md',
      `# Testing session\n**Agent:** Tester\nRan all unit tests.`);

    const state = scanSquad(makeConfig());

    expect(state.error).toBeUndefined();
    expect(state.roster).toHaveLength(1);
    expect(state.roster[0].name).toBe('Tester');
    expect(state.recentDecisions).toHaveLength(1);
    expect(state.recentDecisions[0].title).toBe('Use vitest');
    expect(state.inboxCount).toBe(1);
    expect(state.charter).toBe('A test squad for unit tests.');
    expect(state.activeAgents).toContain('Tester');
  });
});
