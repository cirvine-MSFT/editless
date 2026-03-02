import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface WorktreeInfo {
  /** Absolute path to the worktree directory. */
  path: string;
  /** Branch name (e.g. "feat/auth"), empty string for detached HEAD. */
  branch: string;
  /** True for the primary checkout. */
  isMain: boolean;
  /** Full commit hash. */
  commitHash: string;
}

/**
 * Run `git worktree list --porcelain` for the given repo path.
 * Returns structured WorktreeInfo[] parsed from porcelain output.
 */
export function discoverWorktrees(repoPath: string): WorktreeInfo[] {
  let stdout: string;
  try {
    stdout = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    });
  } catch {
    return [];
  }

  return parsePorcelainOutput(stdout);
}

/**
 * Parse the porcelain output of `git worktree list --porcelain`.
 * Each entry is separated by a blank line. Format per entry:
 *   worktree /path/to/worktree
 *   HEAD abc123...
 *   branch refs/heads/main
 *   (or "detached" instead of "branch ...")
 * The first entry is always the main worktree.
 */
export function parsePorcelainOutput(stdout: string): WorktreeInfo[] {
  const results: WorktreeInfo[] = [];
  // Split on blank lines (handle both \n\n and \r\n\r\n)
  const blocks = stdout.split(/\n\s*\n/).filter(b => b.trim());

  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].split(/\r?\n/);
    let wtPath = '';
    let commitHash = '';
    let branch = '';
    let isDetached = false;

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        wtPath = line.slice('worktree '.length).trim();
      } else if (line.startsWith('HEAD ')) {
        commitHash = line.slice('HEAD '.length).trim();
      } else if (line.startsWith('branch ')) {
        const ref = line.slice('branch '.length).trim();
        // Strip refs/heads/ prefix
        branch = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
      } else if (line.trim() === 'detached') {
        isDetached = true;
      }
    }

    if (!wtPath) continue;

    if (isDetached) {
      branch = '';
    }

    results.push({
      path: wtPath,
      branch,
      isMain: i === 0,
      commitHash,
    });
  }

  return results;
}

/**
 * Resolve a directory's .git file/dir to the actual git directory path.
 * - If .git is a directory: return it directly
 * - If .git is a file (worktree): read it, parse "gitdir: ..." line, resolve to absolute
 * - If neither: return undefined (not a git repo)
 */
export function resolveGitDir(dirPath: string): string | undefined {
  const dotGit = path.join(dirPath, '.git');
  let stat: fs.Stats;
  try {
    stat = fs.statSync(dotGit);
  } catch {
    return undefined;
  }

  if (stat.isDirectory()) {
    return dotGit;
  }

  if (stat.isFile()) {
    try {
      const content = fs.readFileSync(dotGit, 'utf-8').trim();
      const match = content.match(/^gitdir:\s*(.+)$/m);
      if (match) {
        const gitdir = match[1].trim();
        return path.isAbsolute(gitdir) ? gitdir : path.resolve(dirPath, gitdir);
      }
    } catch {
      // Unreadable file
    }
  }

  return undefined;
}

/** Quick check if a directory is a git repo (has .git file or directory). */
export function isGitRepo(dirPath: string): boolean {
  return resolveGitDir(dirPath) !== undefined;
}
