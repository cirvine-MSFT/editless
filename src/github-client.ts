import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  url: string;
  labels: string[];
  assignees: string[];
  repository: string;
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
}

export interface GitHubRepo {
  nameWithOwner: string;
}

export async function fetchAssignedIssues(repo: string): Promise<GitHubIssue[]> {
  try {
    const { stdout } = await execAsync(
      `gh issue list --repo ${repo} --assignee @me --state open --json number,title,state,url,labels,assignees --limit 50`,
    );
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
        repository: repo,
      };
    });
  } catch {
    return [];
  }
}

export async function fetchMyPRs(repo: string): Promise<GitHubPR[]> {
  try {
    const { stdout } = await execAsync(
      `gh pr list --repo ${repo} --author @me --state open --json number,title,state,isDraft,url,headRefName,baseRefName,reviewDecision --limit 50`,
    );
    const raw: unknown[] = JSON.parse(stdout);
    return raw.map((p) => {
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
      };
    });
  } catch {
    return [];
  }
}

export async function isGhAvailable(): Promise<boolean> {
  try {
    await execAsync('gh auth status');
    return true;
  } catch {
    return false;
  }
}
