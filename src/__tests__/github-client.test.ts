import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockExecFileAsync } = vi.hoisted(() => ({
  mockExecFileAsync: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: () => mockExecFileAsync,
}));

import { isGhAvailable, fetchAssignedIssues, fetchMyPRs, fetchLinkedPRs } from '../github-client';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// isGhAvailable
// ---------------------------------------------------------------------------

describe('isGhAvailable', () => {
  it('should return true when gh auth status succeeds', async () => {
    mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });
    expect(await isGhAvailable()).toBe(true);
  });

  it('should return false when gh auth status fails', async () => {
    mockExecFileAsync.mockRejectedValue(new Error('not logged in'));
    expect(await isGhAvailable()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fetchAssignedIssues
// ---------------------------------------------------------------------------

describe('fetchAssignedIssues', () => {
  it('should parse valid JSON output', async () => {
    const ghOutput = JSON.stringify([
      {
        number: 42,
        title: 'Fix bug',
        state: 'OPEN',
        url: 'https://github.com/owner/repo/issues/42',
        labels: [{ name: 'bug' }],
        assignees: [{ login: 'user1' }],
        milestone: { title: 'v1.0' },
      },
    ]);
    mockExecFileAsync.mockResolvedValue({ stdout: ghOutput, stderr: '' });

    const issues = await fetchAssignedIssues('owner/repo');

    expect(issues).toHaveLength(1);
    expect(issues[0].number).toBe(42);
    expect(issues[0].title).toBe('Fix bug');
    expect(issues[0].labels).toEqual(['bug']);
    expect(issues[0].assignees).toEqual(['user1']);
    expect(issues[0].milestone).toBe('v1.0');
    expect(issues[0].repository).toBe('owner/repo');
  });

  it('should return empty array on failure', async () => {
    mockExecFileAsync.mockRejectedValue(new Error('gh not found'));
    expect(await fetchAssignedIssues('owner/repo')).toEqual([]);
  });

  it('should return empty array on empty JSON array', async () => {
    mockExecFileAsync.mockResolvedValue({ stdout: '[]', stderr: '' });
    expect(await fetchAssignedIssues('owner/repo')).toEqual([]);
  });

  it('should handle null milestone', async () => {
    const ghOutput = JSON.stringify([
      {
        number: 1,
        title: 'No milestone',
        state: 'OPEN',
        url: 'u',
        labels: [],
        assignees: [],
        milestone: null,
      },
    ]);
    mockExecFileAsync.mockResolvedValue({ stdout: ghOutput, stderr: '' });

    const issues = await fetchAssignedIssues('owner/repo');
    expect(issues[0].milestone).toBe('');
  });

  it('should return empty array on malformed JSON', async () => {
    mockExecFileAsync.mockResolvedValue({ stdout: 'not json{{{', stderr: '' });
    expect(await fetchAssignedIssues('owner/repo')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// fetchMyPRs
// ---------------------------------------------------------------------------

describe('fetchMyPRs', () => {
  it('should parse valid PR output', async () => {
    const ghOutput = JSON.stringify([
      {
        number: 10,
        title: 'Add feature',
        state: 'OPEN',
        isDraft: false,
        url: 'https://github.com/owner/repo/pull/10',
        headRefName: 'feat-branch',
        baseRefName: 'main',
        reviewDecision: 'APPROVED',
      },
    ]);
    mockExecFileAsync.mockResolvedValue({ stdout: ghOutput, stderr: '' });

    const prs = await fetchMyPRs('owner/repo');

    expect(prs).toHaveLength(1);
    expect(prs[0].number).toBe(10);
    expect(prs[0].headRef).toBe('feat-branch');
    expect(prs[0].baseRef).toBe('main');
    expect(prs[0].reviewDecision).toBe('APPROVED');
    expect(prs[0].repository).toBe('owner/repo');
  });

  it('should return empty array on failure', async () => {
    mockExecFileAsync.mockRejectedValue(new Error('fail'));
    expect(await fetchMyPRs('owner/repo')).toEqual([]);
  });

  it('should return empty array on empty JSON', async () => {
    mockExecFileAsync.mockResolvedValue({ stdout: '[]', stderr: '' });
    expect(await fetchMyPRs('owner/repo')).toEqual([]);
  });

  it('should handle null reviewDecision', async () => {
    const ghOutput = JSON.stringify([
      {
        number: 5,
        title: 'Draft PR',
        state: 'OPEN',
        isDraft: true,
        url: 'u',
        headRefName: 'draft',
        baseRefName: 'main',
        reviewDecision: null,
      },
    ]);
    mockExecFileAsync.mockResolvedValue({ stdout: ghOutput, stderr: '' });

    const prs = await fetchMyPRs('owner/repo');
    expect(prs[0].reviewDecision).toBe('');
  });

  it('should return empty array on malformed JSON', async () => {
    mockExecFileAsync.mockResolvedValue({ stdout: '}{bad', stderr: '' });
    expect(await fetchMyPRs('owner/repo')).toEqual([]);
  });

  it('should retry without autoMergeRequest on Unknown JSON field error', async () => {
    const ghOutput = JSON.stringify([
      {
        number: 10,
        title: 'Add feature',
        state: 'OPEN',
        isDraft: false,
        url: 'https://github.com/owner/repo/pull/10',
        headRefName: 'feat-branch',
        baseRefName: 'main',
        reviewDecision: 'APPROVED',
      },
    ]);
    mockExecFileAsync
      .mockRejectedValueOnce(new Error('Unknown JSON field: "autoMergeRequest"'))
      .mockResolvedValueOnce({ stdout: ghOutput, stderr: '' });

    const prs = await fetchMyPRs('owner/repo');

    expect(prs).toHaveLength(1);
    expect(prs[0].number).toBe(10);
    expect(mockExecFileAsync).toHaveBeenCalledTimes(2);
    // Second call should not include autoMergeRequest
    const secondCallArgs = mockExecFileAsync.mock.calls[1][1] as string[];
    const jsonArg = secondCallArgs[secondCallArgs.indexOf('--json') + 1];
    expect(jsonArg).not.toContain('autoMergeRequest');
  });
});

// ---------------------------------------------------------------------------
// fetchLinkedPRs
// ---------------------------------------------------------------------------

describe('fetchLinkedPRs', () => {
  it('should search by issue number', async () => {
    const ghOutput = JSON.stringify([
      {
        number: 20,
        title: 'Linked PR',
        state: 'OPEN',
        isDraft: false,
        url: 'u',
        headRefName: 'fix',
        baseRefName: 'main',
        reviewDecision: 'APPROVED',
      },
    ]);
    mockExecFileAsync.mockResolvedValue({ stdout: ghOutput, stderr: '' });

    const prs = await fetchLinkedPRs('owner/repo', 99);

    expect(prs).toHaveLength(1);
    expect(prs[0].number).toBe(20);
    expect(mockExecFileAsync).toHaveBeenCalledWith('gh', expect.arrayContaining(['99']));
  });

  it('should return empty array on failure', async () => {
    mockExecFileAsync.mockRejectedValue(new Error('fail'));
    expect(await fetchLinkedPRs('owner/repo', 1)).toEqual([]);
  });

  it('should return empty array on empty JSON', async () => {
    mockExecFileAsync.mockResolvedValue({ stdout: '[]', stderr: '' });
    expect(await fetchLinkedPRs('owner/repo', 1)).toEqual([]);
  });

  it('should handle null reviewDecision in linked PRs', async () => {
    const ghOutput = JSON.stringify([
      {
        number: 30,
        title: 'PR',
        state: 'MERGED',
        isDraft: false,
        url: 'u',
        headRefName: 'h',
        baseRefName: 'b',
        reviewDecision: null,
      },
    ]);
    mockExecFileAsync.mockResolvedValue({ stdout: ghOutput, stderr: '' });

    const prs = await fetchLinkedPRs('owner/repo', 5);
    expect(prs[0].reviewDecision).toBe('');
  });
});
