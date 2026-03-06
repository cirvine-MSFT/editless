import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { WorkItemsTreeProvider } from './work-items-tree';
import type { PRsTreeProvider } from './prs-tree';
import { getAdoToken, promptAdoSignIn } from './ado-auth';
import { fetchAdoWorkItems, fetchAdoPRs, fetchAdoMe } from './ado-client';
import { fetchLocalTasks } from './local-tasks-client';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface IntegrationDeps {
  workItemsProvider: WorkItemsTreeProvider;
  prsProvider: PRsTreeProvider;
}

// ---------------------------------------------------------------------------
// setupIntegrations — GitHub, ADO, local tasks, config debounce, auto-refresh
// ---------------------------------------------------------------------------

export function setupIntegrations(
  context: vscode.ExtensionContext,
  deps: IntegrationDeps,
): void {
  const { workItemsProvider, prsProvider } = deps;

  // --- GitHub repo detection & data loading ---
  initGitHubIntegration(workItemsProvider, prsProvider);

  // --- ADO integration ---
  initAdoIntegration(context, workItemsProvider, prsProvider);

  // --- Local tasks integration ---
  initLocalTasksIntegration(workItemsProvider);

  // --- Config change debounce: ADO ---
  let adoDebounceTimer: NodeJS.Timeout | undefined;
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('editless.ado.organization') || e.affectsConfiguration('editless.ado.project')) {
        if (adoDebounceTimer) clearTimeout(adoDebounceTimer);
        adoDebounceTimer = setTimeout(() => {
          initAdoIntegration(context, workItemsProvider, prsProvider).catch(err => {
            console.error('[EditLess] ADO integration failed on config change:', err);
          });
        }, 500);
      }
    }),
    { dispose() { if (adoDebounceTimer) clearTimeout(adoDebounceTimer); } },
  );

  // --- Config change debounce: GitHub ---
  let githubDebounceTimer: NodeJS.Timeout | undefined;
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('editless.github.repos')) {
        if (githubDebounceTimer) clearTimeout(githubDebounceTimer);
        githubDebounceTimer = setTimeout(() => {
          initGitHubIntegration(workItemsProvider, prsProvider).catch(err => {
            console.error('[EditLess] GitHub integration failed on config change:', err);
          });
        }, 500);
      }
    }),
    { dispose() { if (githubDebounceTimer) clearTimeout(githubDebounceTimer); } },
  );

  // --- Config change debounce: Local tasks ---
  let localDebounceTimer: NodeJS.Timeout | undefined;
  let localWatchers: vscode.Disposable[] = [];
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('editless.local.taskFolders')) {
        if (localDebounceTimer) clearTimeout(localDebounceTimer);
        localDebounceTimer = setTimeout(() => {
          initLocalTasksIntegration(workItemsProvider);
          const folders = vscode.workspace.getConfiguration('editless')
            .get<string[]>('local.taskFolders', []).filter(f => f.trim());
          localWatchers = setupLocalFileWatchers(folders, workItemsProvider, localWatchers, context);
        }, 500);
      }
    }),
    { dispose() { if (localDebounceTimer) clearTimeout(localDebounceTimer); } },
  );

  // Watch local task folders for file changes
  const localFolders = vscode.workspace.getConfiguration('editless').get<string[]>('local.taskFolders', []);
  localWatchers = setupLocalFileWatchers(localFolders, workItemsProvider, localWatchers, context);

  // --- Auto-refresh for Work Items & PRs ---
  const autoRefresh = initAutoRefresh(workItemsProvider, prsProvider);
  context.subscriptions.push(autoRefresh);
}

// ---------------------------------------------------------------------------
// initGitHubIntegration
// ---------------------------------------------------------------------------

async function initGitHubIntegration(
  workItemsProvider: WorkItemsTreeProvider,
  prsProvider: PRsTreeProvider,
): Promise<void> {
  const config = vscode.workspace.getConfiguration('editless');
  let repos = config.get<string[]>('github.repos', []);

  if (repos.length === 0) {
    try {
      const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (cwd) {
        const { stdout } = await execFileAsync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], { cwd });
        const detected = stdout.trim();
        if (detected) repos = [detected];
      }
    } catch {
      // gh not available or not in a repo
    }
  }

  workItemsProvider.setRepos(repos);
  prsProvider.setRepos(repos);
}

// ---------------------------------------------------------------------------
// initAdoIntegration
// ---------------------------------------------------------------------------

export async function initAdoIntegration(
  context: vscode.ExtensionContext,
  workItemsProvider: WorkItemsTreeProvider,
  prsProvider: PRsTreeProvider,
): Promise<void> {
  const config = vscode.workspace.getConfiguration('editless');
  const org = String(config.get<string>('ado.organization') ?? '').trim();
  const project = String(config.get<string>('ado.project') ?? '').trim();

  if (!org || !project) {
    workItemsProvider.setAdoConfig(undefined, undefined);
    prsProvider.setAdoConfig(undefined, undefined);
    return;
  }

  workItemsProvider.setAdoConfig(org, project);
  prsProvider.setAdoConfig(org, project);

  async function fetchAdoData(): Promise<void> {
    let token = await getAdoToken(context.secrets);
    if (!token) {
      token = await promptAdoSignIn();
    }
    if (!token) {
      vscode.window.showWarningMessage(
        'Azure DevOps: authentication required',
        'Sign In',
        'Set PAT',
      ).then(choice => {
        if (choice === 'Sign In') vscode.commands.executeCommand('editless.adoSignIn');
        else if (choice === 'Set PAT') vscode.commands.executeCommand('editless.setAdoPat');
      });
      return;
    }

    try {
      const limit = vscode.workspace.getConfiguration('editless').get<number>('ado.workItemLimit', 200);
      const [workItems, prs, adoMe] = await Promise.all([
        fetchAdoWorkItems(org, project, token, limit),
        fetchAdoPRs(org, project, token),
        fetchAdoMe(org, token),
      ]);
      workItemsProvider.setAdoItems(workItems);
      if (adoMe) prsProvider.setAdoMe(adoMe);
      prsProvider.setAdoPRs(prs);
    } catch (err) {
      console.error('[EditLess] ADO fetch failed:', err);
      vscode.window.showWarningMessage(
        `Azure DevOps: failed to fetch data — check organization and project settings`,
        'Configure',
      ).then(choice => {
        if (choice === 'Configure') vscode.commands.executeCommand('editless.configureAdo');
      });
    }
  }

  workItemsProvider.setAdoRefresh(fetchAdoData);
  prsProvider.setAdoRefresh(fetchAdoData);

  await fetchAdoData();
}

// ---------------------------------------------------------------------------
// initLocalTasksIntegration
// ---------------------------------------------------------------------------

function initLocalTasksIntegration(workItemsProvider: WorkItemsTreeProvider): void {
  const config = vscode.workspace.getConfiguration('editless');
  const folders = config.get<string[]>('local.taskFolders', []).filter(f => f.trim());
  workItemsProvider.setLocalFolders(folders);
}

// ---------------------------------------------------------------------------
// setupLocalFileWatchers
// ---------------------------------------------------------------------------

function setupLocalFileWatchers(
  folders: string[],
  workItemsProvider: WorkItemsTreeProvider,
  existing: vscode.Disposable[],
  context: vscode.ExtensionContext,
): vscode.Disposable[] {
  for (const w of existing) w.dispose();
  const watchers: vscode.Disposable[] = [];

  for (const folder of folders) {
    const pattern = new vscode.RelativePattern(folder, '*.md');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const refreshLocal = () => {
      fetchLocalTasks(folder).then(tasks => workItemsProvider.setLocalTasks(folder, tasks));
    };
    watcher.onDidChange(refreshLocal);
    watcher.onDidCreate(refreshLocal);
    watcher.onDidDelete(refreshLocal);
    watchers.push(watcher);
    context.subscriptions.push(watcher);
  }

  return watchers;
}

// ---------------------------------------------------------------------------
// initAutoRefresh — periodic + focus-based refresh
// ---------------------------------------------------------------------------

export function initAutoRefresh(
  workItemsProvider: WorkItemsTreeProvider,
  prsProvider: PRsTreeProvider,
): vscode.Disposable {
  const disposables: vscode.Disposable[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;

  function refreshAll(): void {
    workItemsProvider.refresh();
    prsProvider.refresh();
  }

  function startTimer(): void {
    if (timer) clearInterval(timer);
    const minutes = vscode.workspace.getConfiguration('editless').get<number>('refreshInterval', 5);
    if (minutes > 0) {
      timer = setInterval(refreshAll, minutes * 60_000);
    }
  }

  startTimer();

  disposables.push(
    vscode.window.onDidChangeWindowState(state => {
      if (state.focused) refreshAll();
    }),
  );

  disposables.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('editless.refreshInterval')) startTimer();
    }),
  );

  return {
    dispose(): void {
      if (timer) clearInterval(timer);
      disposables.forEach(d => d.dispose());
    },
  };
}
