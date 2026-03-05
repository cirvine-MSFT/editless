import * as vscode from 'vscode';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { EditlessTreeItem } from '../editless-tree';
import type { DiscoveredItem } from '../unified-discovery';

const execFileAsync = promisify(execFile);

/** Validate a git branch name (no spaces, basic ref safety). */
export function isValidBranchName(name: string): boolean {
  if (!name || /\s/.test(name)) return false;
  if (/[~^:?*\[\\]/.test(name)) return false;
  if (name.includes('..') || name.startsWith('/') || name.endsWith('/') || name.endsWith('.lock') || name.endsWith('.')) return false;
  return true;
}

/** Compute the default worktree path from a repo path and branch name. */
export function defaultWorktreePath(repoPath: string, branch: string): string {
  const repoName = path.basename(repoPath);
  const slug = branch.replace(/\//g, '-');
  return path.join(path.dirname(repoPath), `${repoName}.wt`, slug);
}

export interface WorktreeDeps {
  getDiscoveredItems: () => DiscoveredItem[];
  refreshDiscovery: () => void;
}

/**
 * Interactive flow: prompt for branch and path, then create a git worktree
 * and add it to the VS Code workspace (#422).
 */
export async function createWorktree(deps: WorktreeDeps, item?: EditlessTreeItem): Promise<void> {
  if (!item?.squadId) return;
  const disc = deps.getDiscoveredItems().find(d => d.id === item.squadId);
  if (!disc) return;
  const repoPath = disc.path;

  // 1. Branch selection
  let branches: string[] = [];
  try {
    const { stdout } = await execFileAsync('git', ['branch', '--list', '--format=%(refname:short)'], { cwd: repoPath });
    branches = stdout.split('\n').map(b => b.trim()).filter(Boolean);
  } catch { /* ignore – empty list */ }

  const newBranchItem = { label: '$(add) Create new branch', description: '', alwaysShow: true, isNew: true as const };
  const branchItems = [
    newBranchItem,
    ...(branches.length ? [{ label: '', kind: vscode.QuickPickItemKind.Separator } as any] : []),
    ...branches.map(b => ({ label: b, isNew: false as const })),
  ];

  const picked = await vscode.window.showQuickPick(branchItems, { placeHolder: 'Select or create a branch for the worktree' });
  if (!picked) return;

  let branch: string;
  let isNewBranch: boolean;
  if ((picked as any).isNew) {
    const name = await vscode.window.showInputBox({
      prompt: 'New branch name',
      validateInput: v => isValidBranchName(v) ? undefined : 'Invalid branch name',
    });
    if (!name) return;
    branch = name;
    isNewBranch = true;
  } else {
    branch = picked.label;
    isNewBranch = false;
  }

  // 2. Path selection
  const defaultPath = defaultWorktreePath(repoPath, branch);
  const wtPath = await vscode.window.showInputBox({
    prompt: 'Worktree path',
    value: defaultPath,
    validateInput: v => v.trim() ? undefined : 'Path cannot be empty',
  });
  if (!wtPath) return;

  // 3. Execute git worktree add
  try {
    const args = ['worktree', 'add'];
    if (isNewBranch) args.push('-b', branch);
    args.push(wtPath);
    if (!isNewBranch) args.push(branch);
    await execFileAsync('git', args, { cwd: repoPath });
  } catch (err: any) {
    vscode.window.showErrorMessage(`Git worktree failed: ${err.stderr || err.message}`);
    return;
  }

  // 4. Post-create: add to workspace & refresh
  vscode.workspace.updateWorkspaceFolders(
    (vscode.workspace.workspaceFolders?.length ?? 0), 0,
    { uri: vscode.Uri.file(wtPath) },
  );
  deps.refreshDiscovery();
  vscode.window.showInformationMessage(`Worktree created at ${wtPath}`);
}
