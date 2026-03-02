import * as vscode from 'vscode';
import { EditlessTreeItem } from '../editless-tree';
import type { TerminalManager } from '../terminal-manager';
import type { SessionLabelManager } from '../session-labels';
import { promptClearLabel } from '../session-labels';
import { SessionContextResolver } from '../session-context';
import { buildCopilotCommand } from '../copilot-cli-builder';

export interface SessionCommandDeps {
  terminalManager: TerminalManager;
  labelManager: SessionLabelManager;
  sessionContextResolver: SessionContextResolver;
}

export function register(context: vscode.ExtensionContext, deps: SessionCommandDeps): void {
  const { terminalManager, labelManager, sessionContextResolver } = deps;

  // Helper: context menu passes EditlessTreeItem, not vscode.Terminal
  function resolveTerminal(arg: unknown): vscode.Terminal | undefined {
    if (arg instanceof EditlessTreeItem) return arg.terminal;
    return arg as vscode.Terminal | undefined;
  }

  // Focus session
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.focusSession', async () => {
      const all = terminalManager.getAllTerminals();
      if (all.length === 0) {
        vscode.window.showInformationMessage('No active sessions.');
        return;
      }

      const items = all.map(({ terminal, info }) => {
        const elapsed = Date.now() - info.createdAt.getTime();
        const mins = Math.floor(elapsed / 60_000);
        const relative = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
        const customLabel = labelManager.getLabel(info.labelKey);
        return {
          label: customLabel ? `🏷️ ${customLabel}` : info.displayName,
          description: customLabel ? `${info.displayName} · started ${relative}` : `started ${relative}`,
          terminal,
        };
      });

      const pick = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a session to focus',
      });

      if (pick) {
        terminalManager.focusTerminal(pick.terminal);
      }
    }),
  );

  // Focus terminal (tree item click)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.focusTerminal', (arg: vscode.Terminal | EditlessTreeItem) => {
      const terminal = resolveTerminal(arg);
      if (terminal) terminalManager.focusTerminal(terminal);
    }),
  );

  // Close terminal (context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.closeTerminal', (arg: vscode.Terminal | EditlessTreeItem) => {
      const terminal = resolveTerminal(arg);
      if (terminal) terminalManager.closeTerminal(terminal);
    }),
  );

  // Rename session (context menu or command palette)
  async function renameTerminalTab(terminal: vscode.Terminal, newName: string): Promise<void> {
    terminal.show(false);
    await vscode.commands.executeCommand('workbench.action.terminal.renameWithArg', { name: newName });
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('editless.renameSession', async (arg?: vscode.Terminal | EditlessTreeItem) => {
      const previousTerminal = vscode.window.activeTerminal;
      const terminal = resolveTerminal(arg) ?? vscode.window.activeTerminal;
      if (terminal) {
        terminal.show(true);
        const labelKey = terminalManager.getLabelKey(terminal);
        const current = labelManager.getLabel(labelKey) ?? terminalManager.getDisplayName(terminal);
        const value = await vscode.window.showInputBox({
          prompt: 'Enter a label for this session',
          value: current,
        });
        if (value !== undefined && value.length > 0) {
          const info = terminalManager.getTerminalInfo(terminal);
          const iconPrefix = info?.agentIcon ? `${info.agentIcon} ` : '';
          await renameTerminalTab(terminal, `${iconPrefix}${value}`);
          labelManager.setLabel(labelKey, value);
          terminalManager.renameSession(terminal, value);
        }
        if (previousTerminal && previousTerminal !== terminal) {
          previousTerminal.show(false);
        }
        return;
      }
      // No terminal arg — show QuickPick
      const all = terminalManager.getAllTerminals();
      if (all.length === 0) {
        vscode.window.showInformationMessage('No active sessions.');
        return;
      }
      const pick = await vscode.window.showQuickPick(
        all.map(({ terminal: t, info }) => ({
          label: labelManager.getLabel(info.labelKey) ?? info.displayName,
          description: info.displayName,
          terminal: t,
          labelKey: info.labelKey,
        })),
        { placeHolder: 'Select a session to rename' },
      );
      if (pick) {
        pick.terminal.show(true);
        const current = labelManager.getLabel(pick.labelKey) ?? terminalManager.getDisplayName(pick.terminal);
        const value = await vscode.window.showInputBox({
          prompt: 'Enter a label for this session',
          value: current,
        });
        if (value !== undefined && value.length > 0) {
          const info = terminalManager.getTerminalInfo(pick.terminal);
          const iconPrefix = info?.agentIcon ? `${info.agentIcon} ` : '';
          await renameTerminalTab(pick.terminal, `${iconPrefix}${value}`);
          labelManager.setLabel(pick.labelKey, value);
          terminalManager.renameSession(pick.terminal, value);
        }
        if (previousTerminal && previousTerminal !== pick.terminal) {
          previousTerminal.show(false);
        }
      }
    }),
  );

  // Clear session label (context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.clearSessionLabel', async (arg?: vscode.Terminal | EditlessTreeItem) => {
      const terminal = resolveTerminal(arg);
      if (terminal) {
        await promptClearLabel(terminal, labelManager, terminalManager.getLabelKey(terminal));
      }
    }),
  );

  // Open file in markdown preview
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.openFilePreview', (uri: vscode.Uri) => {
      vscode.commands.executeCommand('markdown.showPreviewToSide', uri);
    }),
  );

  // Resume Session — pick from ~/.copilot/session-state/ (#415)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.resumeSession', async () => {
      const allSessions = sessionContextResolver.getAllSessions();
      if (allSessions.length === 0) {
        vscode.window.showInformationMessage('No Copilot CLI sessions found in ~/.copilot/session-state/.');
        return;
      }

      // Sort CWD-matched sessions to top
      const workspaceCwds = (vscode.workspace.workspaceFolders ?? []).map(f =>
        f.uri.fsPath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase(),
      );
      const cwdMatch = (cwd: string): boolean => {
        const norm = cwd.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
        return workspaceCwds.some(w => norm === w || norm.startsWith(w + '/'));
      };

      const sorted = [...allSessions].sort((a, b) => {
        const aMatch = cwdMatch(a.cwd) ? 0 : 1;
        const bMatch = cwdMatch(b.cwd) ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;
        return b.updatedAt.localeCompare(a.updatedAt);
      });

      type SessionPickItem = vscode.QuickPickItem & { sessionId?: string };
      const items: SessionPickItem[] = sorted.map(s => {
        const parts: string[] = [];
        if (s.branch) parts.push(s.branch);
        if (s.cwd) parts.push(s.cwd);
        const match = cwdMatch(s.cwd);
        return {
          label: `${match ? '$(folder) ' : ''}${s.summary || s.sessionId.slice(0, 8)}`,
          description: parts.join(' · '),
          detail: `${s.sessionId}  ·  ${s.updatedAt || s.createdAt}`,
          sessionId: s.sessionId,
        };
      });

      // Add "Paste GUID directly" fallback
      items.push({
        label: '$(edit) Paste session ID directly…',
        description: 'Enter a UUID to resume',
        sessionId: undefined,
      });

      const pick = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a session to resume (search by summary, branch, or ID)',
        matchOnDescription: true,
        matchOnDetail: true,
      });
      if (!pick) return;

      let sessionId = pick.sessionId;
      if (!sessionId) {
        const input = await vscode.window.showInputBox({
          prompt: 'Enter session ID (UUID)',
          placeHolder: 'e.g. a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          validateInput: v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
            ? null : 'Enter a valid UUID',
        });
        if (!input) return;
        sessionId = input;
      }

      // Validate resumability
      const check = sessionContextResolver.isSessionResumable(sessionId);
      if (!check.resumable) {
        vscode.window.showErrorMessage(`Cannot resume session: ${check.reason}`);
        return;
      }
      if (check.stale) {
        const proceed = await vscode.window.showWarningMessage(
          `This session hasn't been updated in over ${SessionContextResolver.STALE_SESSION_DAYS} days. Resume anyway?`,
          'Resume', 'Cancel',
        );
        if (proceed !== 'Resume') return;
      }

      // Find the session's CWD to use as terminal working directory
      const session = allSessions.find(s => s.sessionId === sessionId);
      const cwd = session?.cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

      const launchCmd = buildCopilotCommand({ resume: sessionId });
      const displayName = session?.summary
        ? `↩ ${session.summary}`.slice(0, 50)
        : `↩ ${sessionId.slice(0, 8)}`;

      const terminal = vscode.window.createTerminal({
        name: displayName,
        cwd,
        isTransient: true,
        iconPath: new vscode.ThemeIcon('history'),
      });
      terminal.sendText(launchCmd);
      terminal.show(false);
    }),
  );
}
