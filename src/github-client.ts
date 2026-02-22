import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  url: string;
  labels: string[];
  assignees: string[];
  repository: string;
  milestone: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  state: string;
  isDraft: boolean;
  url: string;
  headRef: string;
  baseRef: string;
  repository: string;
  reviewDecision: string;
  mergeable: string;
  labels: string[];
  autoMergeRequest: unknown | null;
}

export interface GitHubRepo {
  nameWithOwner: string;
}

export async function fetchAssignedIssues(repo: string): Promise<GitHubIssue[]> {
  try {
    const { stdout } = await execFileAsync('gh', [
      'issue', 'list', '--repo', repo, '--assignee', '@me', '--state', 'open',
      '--json', 'number,title,state,url,labels,assignees,milestone', '--limit', '50',
    ]);
    const raw: unknown[] = JSON.parse(stdout);
    return raw.map((i) => {
      const rec = i as Record<string, unknown>;
      return {
        number: rec.number as number,
        title: rec.title as string,
        state: rec.state as string,
        url: rec.url as string,
        labels: (rec.labels as Array<{ name: string }>).map((l) => l.name),
        assignees: (rec.assignees as Array<{ login: string }>).map((a) => a.login),
        milestone: (rec.milestone as { title: string } | null)?.title ?? '',
        repository: repo,
      };
    });
  } catch {
    return [];
  }
}

const BASE_PR_FIELDS = 'number,title,state,isDraft,url,headRefName,baseRefName,reviewDecision,mergeable,labels';

export async function fetchMyPRs(repo: string, author?: string): Promise<GitHubPR[]> {
  try {
    const args = ['pr', 'list', '--repo', repo, '--state', 'open',
      '--json', `${BASE_PR_FIELDS},autoMergeRequest`, '--limit', '50'];
    if (author) args.splice(4, 0, '--author', author);
    const { stdout } = await execFileAsync('gh', args);
    const raw: unknown[] = JSON.parse(stdout);
    return raw.map((p) => parsePR(p, repo));
  } catch (err) {
    // autoMergeRequest not available in older gh CLI versions — retry without it
    if (err instanceof Error && err.message.includes('Unknown JSON field')) {
      try {
        const args = ['pr', 'list', '--repo', repo, '--state', 'open',
          '--json', BASE_PR_FIELDS, '--limit', '50'];
        if (author) args.splice(4, 0, '--author', author);
        const { stdout } = await execFileAsync('gh', args);
        const raw: unknown[] = JSON.parse(stdout);
        return raw.map((p) => parsePR(p, repo));
      } catch {
        return [];
      }
    }
    return [];
  }
}

function parsePR(p: unknown, repo: string): GitHubPR {
  const rec = p as Record<string, unknown>;
  return {
    number: rec.number as number,
    title: rec.title as string,
    state: rec.state as string,
    isDraft: rec.isDraft as boolean,
    url: rec.url as string,
    headRef: rec.headRefName as string,
    baseRef: rec.baseRefName as string,
    repository: repo,
    reviewDecision: (rec.reviewDecision as string) ?? '',
    mergeable: (rec.mergeable as string) ?? '',
    labels: Array.isArray(rec.labels)
      ? (rec.labels as Array<{ name: string }>).map((l) => l.name)
      : [],
    autoMergeRequest: (rec.autoMergeRequest as unknown) ?? null,
  };
}

export async function fetchLinkedPRs(repo: string, issueNumber: number): Promise<GitHubPR[]> {
  try {
    const { stdout } = await execFileAsync('gh', [
      'pr', 'list', '--repo', repo, '--search', `${issueNumber}`, '--state', 'all',
      '--json', `${BASE_PR_FIELDS},autoMergeRequest`, '--limit', '10',
    ]);
    const raw: unknown[] = JSON.parse(stdout);
    return raw.map((p) => parsePR(p, repo));
  } catch (err) {
    if (err instanceof Error && err.message.includes('Unknown JSON field')) {
      try {
        const { stdout } = await execFileAsync('gh', [
          'pr', 'list', '--repo', repo, '--search', `${issueNumber}`, '--state', 'all',
          '--json', BASE_PR_FIELDS, '--limit', '10',
        ]);
        const raw: unknown[] = JSON.parse(stdout);
        return raw.map((p) => parsePR(p, repo));
      } catch {
        return [];
      }
    }
    return [];
  }
}

export async function isGhAvailable(): Promise<boolean> {
  try {
    await execFileAsync('gh', ['auth', 'status']);
    return true;
  } catch {
    return false;
  }
}
