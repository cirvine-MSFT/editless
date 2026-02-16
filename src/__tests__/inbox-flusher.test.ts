import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { flushDecisionsInbox } from '../inbox-flusher';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inbox-flusher-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(relPath: string, content: string): void {
  const fullPath = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
}

describe('flushDecisionsInbox', () => {
  it('should return zero flushed when inbox dir does not exist', () => {
    const result = flushDecisionsInbox(tmpDir);
    expect(result.flushed).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should return zero flushed when inbox is empty', () => {
    fs.mkdirSync(path.join(tmpDir, 'decisions', 'inbox'), { recursive: true });
    const result = flushDecisionsInbox(tmpDir);
    expect(result.flushed).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should append inbox file content to decisions.md and delete inbox files', () => {
    writeFile('decisions.md', '### 2026-02-01: Existing decision\nSome content\n');
    writeFile('decisions/inbox/new-decision.md', '### 2026-02-16: New decision\n**By:** Scribe\nA new decision.');

    const result = flushDecisionsInbox(tmpDir);

    expect(result.flushed).toBe(1);
    expect(result.errors).toHaveLength(0);

    const decisionsContent = fs.readFileSync(path.join(tmpDir, 'decisions.md'), 'utf-8');
    expect(decisionsContent).toContain('Existing decision');
    expect(decisionsContent).toContain('New decision');

    const inboxFiles = fs.readdirSync(path.join(tmpDir, 'decisions', 'inbox'));
    expect(inboxFiles).toHaveLength(0);
  });

  it('should flush multiple inbox files', () => {
    writeFile('decisions.md', '# Decisions\n');
    writeFile('decisions/inbox/a.md', '### 2026-02-16: Decision A\nContent A');
    writeFile('decisions/inbox/b.md', '### 2026-02-16: Decision B\nContent B');

    const result = flushDecisionsInbox(tmpDir);

    expect(result.flushed).toBe(2);
    const content = fs.readFileSync(path.join(tmpDir, 'decisions.md'), 'utf-8');
    expect(content).toContain('Decision A');
    expect(content).toContain('Decision B');
  });

  it('should skip non-md files in inbox', () => {
    writeFile('decisions.md', '');
    writeFile('decisions/inbox/decision.md', 'A decision');
    writeFile('decisions/inbox/notes.txt', 'Not a decision');

    const result = flushDecisionsInbox(tmpDir);
    expect(result.flushed).toBe(1);

    // .txt file should remain
    expect(fs.existsSync(path.join(tmpDir, 'decisions', 'inbox', 'notes.txt'))).toBe(true);
  });

  it('should create decisions.md if it does not exist', () => {
    writeFile('decisions/inbox/first.md', '### 2026-02-16: First\nContent');

    const result = flushDecisionsInbox(tmpDir);
    expect(result.flushed).toBe(1);

    const content = fs.readFileSync(path.join(tmpDir, 'decisions.md'), 'utf-8');
    expect(content).toContain('First');
  });

  it('should skip empty inbox files without errors', () => {
    writeFile('decisions.md', '');
    writeFile('decisions/inbox/empty.md', '');
    writeFile('decisions/inbox/content.md', 'Real content');

    const result = flushDecisionsInbox(tmpDir);
    expect(result.flushed).toBe(2);
    expect(result.errors).toHaveLength(0);
  });
});
