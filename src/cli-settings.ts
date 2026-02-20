import * as vscode from 'vscode';

export function getLaunchCommand(): string {
  return vscode.workspace.getConfiguration('editless.cli').get<string>('launchCommand', 'copilot --agent $(agent)');
}
