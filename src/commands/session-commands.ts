import * as vscode from 'vscode';
import { EditlessTreeItem } from '../editless-tree';
import type { TerminalManager } from '../terminal-manager';
import type { SessionLabelManager } from '../session-labels';
import { promptClearLabel } from '../session-labels';

export interface SessionCommandDeps {
  terminalManager: TerminalManager;
  labelManager: SessionLabelManager;
}

export function register(context: vscode.ExtensionContext, deps: SessionCommandDeps): void {
  const { terminalManager, labelManager } = deps;

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
          const iconPrefix = info?.squadIcon ? `${info.squadIcon} ` : '';
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
          const iconPrefix = info?.squadIcon ? `${info.squadIcon} ` : '';
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
}
