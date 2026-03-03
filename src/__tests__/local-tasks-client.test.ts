import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReaddir = vi.fn();
const mockReadFile = vi.fn();

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readdir: (...args: unknown[]) => mockReaddir(...args),
      readFile: (...args: unknown[]) => mockReadFile(...args),
    },
  };
});

import { fetchLocalTasks, mapLocalState } from '../local-tasks-client';
import type { LocalTask } from '../local-tasks-client';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeTask(overrides: Partial<LocalTask> = {}): LocalTask {
  return {
    id: 'task-1',
    title: 'Test Task',
    state: 'Todo',
    created: '2026-01-01',
    sessionId: null,
    filePath: '/tasks/task-1.md',
    folderPath: '/tasks',
    folderName: 'tasks',
    parentName: '',
    body: '# Test Task',
    ...overrides,
  };
}

const validFileContent = `---
state: Todo
created: 2026-01-15
session_id: null
---
# My First Task

Some description here.`;

describe('fetchLocalTasks', () => {
  it('should return tasks from a valid directory', async () => {
    mockReaddir.mockResolvedValue(['task-1.md', 'task-2.md', 'readme.txt']);
    mockReadFile.mockImplementation(async (filePath: string) => {
      if (filePath.includes('task-1')) {
        return `---\nstate: Todo\ncreated: 2026-01-10\nsession_id: null\n---\n# First Task\n\nBody text.`;
      }
      return `---\nstate: Done\ncreated: 2026-01-11\nsession_id: abc-123\n---\n# Second Task`;
    });

    const tasks = await fetchLocalTasks('/projects/my-project/.tasks');
    expect(tasks).toHaveLength(2);
    expect(tasks[0].id).toBe('task-1');
    expect(tasks[0].title).toBe('First Task');
    expect(tasks[0].state).toBe('Todo');
    expect(tasks[0].created).toBe('2026-01-10');
    expect(tasks[0].sessionId).toBeNull();
    expect(tasks[0].filePath).toContain('task-1.md');
    expect(tasks[0].folderPath).toBe('/projects/my-project/.tasks');
    expect(tasks[0].folderName).toBe('.tasks');
    expect(tasks[0].parentName).toBe('my-project');
    expect(tasks[0].body).toBe('# First Task\n\nBody text.');
  });

  it('should return correct fields for a task with session_id', async () => {
    mockReaddir.mockResolvedValue(['active-task.md']);
    mockReadFile.mockResolvedValue(
      `---\nstate: Todo\ncreated: 2026-02-01\nsession_id: d4e5f6a7-b8c9-0123-4567-890abcdef012\n---\n# Active Work`,
    );

    const tasks = await fetchLocalTasks('/work/tasks');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].sessionId).toBe('d4e5f6a7-b8c9-0123-4567-890abcdef012');
    expect(tasks[0].state).toBe('Todo');
  });

  it('should return empty array for missing directory', async () => {
    mockReaddir.mockRejectedValue(new Error('ENOENT'));
    const tasks = await fetchLocalTasks('/nonexistent/path');
    expect(tasks).toEqual([]);
  });

  it('should skip files with invalid frontmatter (no --- markers)', async () => {
    mockReaddir.mockResolvedValue(['bad.md', 'good.md']);
    mockReadFile.mockImplementation(async (filePath: string) => {
      if (filePath.includes('bad')) return 'No frontmatter here, just markdown.';
      return `---\nstate: Todo\ncreated: 2026-01-01\nsession_id: null\n---\n# Good Task`;
    });

    const tasks = await fetchLocalTasks('/tasks');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('good');
  });

  it('should skip files with missing required fields (no state)', async () => {
    mockReaddir.mockResolvedValue(['no-state.md']);
    mockReadFile.mockResolvedValue(`---\ncreated: 2026-01-01\nsession_id: null\n---\n# Missing State`);

    const tasks = await fetchLocalTasks('/tasks');
    expect(tasks).toEqual([]);
  });

  it('should skip files missing created field', async () => {
    mockReaddir.mockResolvedValue(['no-created.md']);
    mockReadFile.mockResolvedValue(`---\nstate: Todo\nsession_id: null\n---\n# Missing Created`);

    const tasks = await fetchLocalTasks('/tasks');
    expect(tasks).toEqual([]);
  });

  it('should handle BOM characters in file content', async () => {
    mockReaddir.mockResolvedValue(['bom-file.md']);
    mockReadFile.mockResolvedValue(`\uFEFF---\nstate: Todo\ncreated: 2026-03-01\nsession_id: null\n---\n# BOM Task`);

    const tasks = await fetchLocalTasks('/tasks');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('BOM Task');
    expect(tasks[0].state).toBe('Todo');
  });

  it('should extract title from # Heading correctly', async () => {
    mockReaddir.mockResolvedValue(['heading.md']);
    mockReadFile.mockResolvedValue(`---\nstate: Todo\ncreated: 2026-01-01\nsession_id: null\n---\n# My Descriptive Title\n\nBody.`);

    const tasks = await fetchLocalTasks('/tasks');
    expect(tasks[0].title).toBe('My Descriptive Title');
  });

  it('should return empty title when no heading found', async () => {
    mockReaddir.mockResolvedValue(['no-heading.md']);
    mockReadFile.mockResolvedValue(`---\nstate: Todo\ncreated: 2026-01-01\nsession_id: null\n---\nJust body text, no heading.`);

    const tasks = await fetchLocalTasks('/tasks');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('');
  });

  it('should handle session_id: null as null', async () => {
    mockReaddir.mockResolvedValue(['null-session.md']);
    mockReadFile.mockResolvedValue(`---\nstate: Todo\ncreated: 2026-01-01\nsession_id: null\n---\n# Task`);

    const tasks = await fetchLocalTasks('/tasks');
    expect(tasks[0].sessionId).toBeNull();
  });

  it('should handle session_id as a GUID string', async () => {
    mockReaddir.mockResolvedValue(['guid-session.md']);
    mockReadFile.mockResolvedValue(
      `---\nstate: Todo\ncreated: 2026-01-01\nsession_id: a1b2c3d4-e5f6-7890-abcd-ef0123456789\n---\n# Task`,
    );

    const tasks = await fetchLocalTasks('/tasks');
    expect(tasks[0].sessionId).toBe('a1b2c3d4-e5f6-7890-abcd-ef0123456789');
  });

  it('should only process .md files', async () => {
    mockReaddir.mockResolvedValue(['task.md', 'notes.txt', 'config.json']);
    mockReadFile.mockResolvedValue(`---\nstate: Todo\ncreated: 2026-01-01\nsession_id: null\n---\n# Task`);

    const tasks = await fetchLocalTasks('/tasks');
    expect(tasks).toHaveLength(1);
    expect(mockReadFile).toHaveBeenCalledTimes(1);
  });

  it('should skip file with only opening --- marker', async () => {
    mockReaddir.mockResolvedValue(['broken.md']);
    mockReadFile.mockResolvedValue(`---\nstate: Todo\ncreated: 2026-01-01`);

    const tasks = await fetchLocalTasks('/tasks');
    expect(tasks).toEqual([]);
  });
});

describe('mapLocalState', () => {
  it('should return "open" for Todo with null session', () => {
    expect(mapLocalState(makeTask({ state: 'Todo', sessionId: null }))).toBe('open');
  });

  it('should return "active" for Todo with non-null session', () => {
    expect(mapLocalState(makeTask({ state: 'Todo', sessionId: 'abc-123' }))).toBe('active');
  });

  it('should return "closed" for Done state', () => {
    expect(mapLocalState(makeTask({ state: 'Done' }))).toBe('closed');
  });

  it('should return "closed" for Done even with session', () => {
    expect(mapLocalState(makeTask({ state: 'Done', sessionId: 'abc-123' }))).toBe('closed');
  });
});
