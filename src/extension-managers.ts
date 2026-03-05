import * as vscode from 'vscode';
import type { AgentSettingsManager } from './agent-settings';
import { AgentStateManager } from './agent-state-manager';
import { EditlessTreeProvider } from './editless-tree';
import { TerminalManager } from './terminal-manager';
import { SessionLabelManager } from './session-labels';
import { SessionContextResolver } from './session-context';
import { CopilotSessionsProvider } from './copilot-sessions-provider';
import { WorkItemsTreeProvider } from './work-items-tree';
import { PRsTreeProvider } from './prs-tree';

// ---------------------------------------------------------------------------
// Manager bundle returned by initCoreManagers
// ---------------------------------------------------------------------------

export interface CoreManagers {
  terminalManager: TerminalManager;
  labelManager: SessionLabelManager;
  sessionContextResolver: SessionContextResolver;
  agentStateManager: AgentStateManager;
  treeProvider: EditlessTreeProvider;
  treeView: vscode.TreeView<import('./editless-tree').EditlessTreeItem>;
  workItemsProvider: WorkItemsTreeProvider;
  prsProvider: PRsTreeProvider;
  sessionsProvider: CopilotSessionsProvider;
}

// ---------------------------------------------------------------------------
// initCoreManagers — construct managers, tree views, session commands
// ---------------------------------------------------------------------------

export function initCoreManagers(
  context: vscode.ExtensionContext,
  agentSettings: AgentSettingsManager,
): CoreManagers {
  // --- Terminal manager --------------------------------------------------
  const terminalManager = new TerminalManager(context);
  context.subscriptions.push(terminalManager);

  // --- Session label manager ---------------------------------------------
  const labelManager = new SessionLabelManager(context);

  // --- Session context resolver -------------------------------------------
  const sessionContextResolver = new SessionContextResolver();
  terminalManager.setSessionResolver(sessionContextResolver);

  // --- Tree view ---------------------------------------------------------
  const agentStateManager = new AgentStateManager(agentSettings);
  const treeProvider = new EditlessTreeProvider(agentStateManager, agentSettings, terminalManager, labelManager, sessionContextResolver);
  const treeView = vscode.window.createTreeView('editlessTree', { treeDataProvider: treeProvider });
  context.subscriptions.push(treeView);
  context.subscriptions.push(treeProvider);

  // --- Work Items tree view ------------------------------------------------
  const workItemsProvider = new WorkItemsTreeProvider();
  const workItemsView = vscode.window.createTreeView('editlessWorkItems', { treeDataProvider: workItemsProvider });
  workItemsProvider.setTreeView(workItemsView);
  context.subscriptions.push(workItemsView);

  // --- PRs tree view -------------------------------------------------------
  const prsProvider = new PRsTreeProvider();
  const prsView = vscode.window.createTreeView('editlessPRs', { treeDataProvider: prsProvider });
  prsProvider.setTreeView(prsView);
  context.subscriptions.push(prsView);

  // --- Sessions tree view ---------------------------------------------------
  const sessionsProvider = new CopilotSessionsProvider(sessionContextResolver);
  const sessionsView = vscode.window.createTreeView('editlessSessions', { treeDataProvider: sessionsProvider });
  sessionsProvider.setTreeView(sessionsView);
  context.subscriptions.push(sessionsView);

  // --- Sessions tree commands -----------------------------------------------
  registerSessionTreeCommands(context, sessionsProvider, sessionContextResolver);

  // --- Reconcile persisted terminal sessions with live terminals -------------
  terminalManager.reconcile();

  // --- Sync tree selection when switching terminals via tab bar ---------------
  registerTreeSelectionSync(context, terminalManager, treeProvider, treeView);

  return {
    terminalManager,
    labelManager,
    sessionContextResolver,
    agentStateManager,
    treeProvider,
    treeView,
    workItemsProvider,
    prsProvider,
    sessionsProvider,
  };
}

// ---------------------------------------------------------------------------
// Session tree commands (resumeCopilotSession, dismissSession, etc.)
// ---------------------------------------------------------------------------

function registerSessionTreeCommands(
  context: vscode.ExtensionContext,
  sessionsProvider: CopilotSessionsProvider,
  sessionContextResolver: SessionContextResolver,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.resumeCopilotSession', async (item: import('./copilot-sessions-provider').SessionTreeItem) => {
      const entry = item?.sessionEntry;
      if (!entry) return;
      const check = sessionContextResolver.isSessionResumable(entry.sessionId);
      if (!check.resumable) {
        vscode.window.showWarningMessage(`Cannot resume session: ${check.reason}`);
        return;
      }
      if (check.stale) {
        const proceed = await vscode.window.showWarningMessage(
          `This session hasn't been updated in over ${SessionContextResolver.STALE_SESSION_DAYS} days. Resume anyway?`,
          'Resume', 'Cancel',
        );
        if (proceed !== 'Resume') return;
      }
      const { buildCopilotCommand } = await import('./copilot-cli-builder');
      const launchCmd = buildCopilotCommand({ resume: entry.sessionId });
      const displayName = entry.summary ? `↩ ${entry.summary}`.slice(0, 50) : `↩ ${entry.sessionId.slice(0, 8)}`;
      const terminal = vscode.window.createTerminal({
        name: displayName,
        cwd: entry.cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
        isTransient: true,
        iconPath: new vscode.ThemeIcon('history'),
      });
      terminal.sendText(launchCmd);
      terminal.show(false);
    }),
    vscode.commands.registerCommand('editless.dismissSession', (item: import('./copilot-sessions-provider').SessionTreeItem) => {
      const entry = item?.sessionEntry;
      if (entry) sessionsProvider.dismiss(entry.sessionId);
    }),
    vscode.commands.registerCommand('editless.refreshSessions', () => {
      sessionsProvider.refresh();
    }),
    vscode.commands.registerCommand('editless.filterSessions', async () => {
      const pick = await vscode.window.showQuickPick(
        [
          { label: 'Filter by workspace CWD', value: 'workspace' },
          { label: 'Filter by squad name', value: 'squad' },
        ],
        { placeHolder: 'Select filter type' },
      );
      if (!pick) return;
      if (pick.value === 'workspace') {
        const cwd = await vscode.window.showInputBox({ prompt: 'Enter workspace CWD path to filter by' });
        if (cwd !== undefined) {
          sessionsProvider.filter = { ...sessionsProvider.filter, workspace: cwd || undefined };
          vscode.commands.executeCommand('setContext', 'editless.sessionsFiltered', true);
        }
      } else {
        const squad = await vscode.window.showInputBox({ prompt: 'Enter squad name to filter by' });
        if (squad !== undefined) {
          sessionsProvider.filter = { ...sessionsProvider.filter, squad: squad || undefined };
          vscode.commands.executeCommand('setContext', 'editless.sessionsFiltered', true);
        }
      }
    }),
    vscode.commands.registerCommand('editless.clearSessionsFilter', () => {
      sessionsProvider.filter = {};
      vscode.commands.executeCommand('setContext', 'editless.sessionsFiltered', false);
    }),
  );
}

// ---------------------------------------------------------------------------
// Tree selection sync — reveal matching tree item on terminal switch
// ---------------------------------------------------------------------------

function registerTreeSelectionSync(
  context: vscode.ExtensionContext,
  terminalManager: TerminalManager,
  treeProvider: EditlessTreeProvider,
  treeView: vscode.TreeView<import('./editless-tree').EditlessTreeItem>,
): void {
  let revealTimer: ReturnType<typeof setTimeout> | undefined;
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTerminal(terminal => {
      if (revealTimer !== undefined) {
        clearTimeout(revealTimer);
      }
      if (!terminal) return;
      revealTimer = setTimeout(() => {
        revealTimer = undefined;
        const info = terminalManager.getTerminalInfo(terminal);
        if (!info) return;
        const matchingItem = treeProvider.findTerminalItem(terminal);
        if (matchingItem) {
          try {
            treeView.reveal(matchingItem, { select: true, focus: false });
          } catch {
            // reveal() may fail if tree is not visible or item is stale
          }
        }
      }, 100);
    }),
    { dispose() { if (revealTimer !== undefined) clearTimeout(revealTimer); } },
  );
}
