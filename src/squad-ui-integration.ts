import * as vscode from 'vscode';

const SQUAD_UI_EXTENSION_ID = 'csharpfritz.squadui';

export function isSquadUiInstalled(): boolean {
  return vscode.extensions.getExtension(SQUAD_UI_EXTENSION_ID) !== undefined;
}

export function initSquadUiContext(context: vscode.ExtensionContext): void {
  vscode.commands.executeCommand('setContext', 'editless.squadUiAvailable', isSquadUiInstalled());

  context.subscriptions.push(
    vscode.extensions.onDidChange(() => {
      vscode.commands.executeCommand('setContext', 'editless.squadUiAvailable', isSquadUiInstalled());
    }),
  );
}

export async function openSquadUiDashboard(teamRoot?: string): Promise<void> {
  try {
    await vscode.commands.executeCommand('squadui.openDashboard', teamRoot);
  } catch {
    // SquadUI command may not exist in older versions
  }
}

export async function openSquadUiCharter(memberName?: string, teamRoot?: string): Promise<void> {
  try {
    await vscode.commands.executeCommand('squadui.viewCharter', memberName, teamRoot);
  } catch {
    // SquadUI command may not exist in older versions
  }
}
