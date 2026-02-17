import * as vscode from 'vscode';
import type { WorkItemsTreeProvider } from './work-items-tree';
import type { PRsTreeProvider } from './prs-tree';

const DEBOUNCE_MS = 2_000;

export function initAutoRefresh(
  workItemsProvider: WorkItemsTreeProvider,
  prsProvider: PRsTreeProvider,
): vscode.Disposable {
  const disposables: vscode.Disposable[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  function refreshAll(): void {
    workItemsProvider.refresh();
    prsProvider.refresh();
  }

  // Debounced refresh for event-driven triggers to avoid hammering APIs
  // when multiple terminals close in rapid succession
  function debouncedRefresh(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(refreshAll, DEBOUNCE_MS);
  }

  function startTimer(): void {
    if (timer) clearInterval(timer);
    const minutes = vscode.workspace.getConfiguration('editless').get<number>('refreshInterval', 1);
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

  // Refresh when a terminal closes — agent work likely completed
  disposables.push(
    vscode.window.onDidCloseTerminal(() => {
      debouncedRefresh();
    }),
  );

  // Refresh when a shell execution ends — command finished in a terminal
  disposables.push(
    vscode.window.onDidEndTerminalShellExecution(() => {
      debouncedRefresh();
    }),
  );

  // Refresh after git push/pull via VS Code's built-in task system
  disposables.push(
    vscode.tasks.onDidEndTask(e => {
      const taskName = e.execution.task.name.toLowerCase();
      if (taskName.includes('git') || e.execution.task.source === 'git') {
        debouncedRefresh();
      }
    }),
  );

  return {
    dispose(): void {
      if (timer) clearInterval(timer);
      if (debounceTimer) clearTimeout(debounceTimer);
      disposables.forEach(d => d.dispose());
    },
  };
}
