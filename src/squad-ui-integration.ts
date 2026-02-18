import * as vscode from 'vscode';

const SQUAD_UI_EXTENSION_ID = 'csharpfritz.squadui';

export function isSquadUiInstalled(): boolean {
  return vscode.extensions.getExtension(SQUAD_UI_EXTENSION_ID) !== undefined;
}

/** Check if the installed SquadUI version supports deep-link (onUri activation event). */
export function squadUiSupportsDeepLink(): boolean {
  const ext = vscode.extensions.getExtension(SQUAD_UI_EXTENSION_ID);
  if (!ext) { return false; }
  const events: unknown[] | undefined = ext.packageJSON?.activationEvents;
  return Array.isArray(events) && events.includes('onUri');
}

export function initSquadUiContext(context: vscode.ExtensionContext): void {
  const updateContext = () => {
    vscode.commands.executeCommand('setContext', 'editless.squadUiAvailable', isSquadUiInstalled());
    vscode.commands.executeCommand('setContext', 'editless.squadUiSupportsDeepLink', squadUiSupportsDeepLink());
  };

  updateContext();

  context.subscriptions.push(
    vscode.extensions.onDidChange(() => {
      updateContext();
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
