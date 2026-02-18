import * as vscode from 'vscode';

export function isNotificationEnabled(category: 'updates'): boolean {
  const config = vscode.workspace.getConfiguration('editless');
  const masterEnabled = config.get<boolean>('notifications.enabled', true);
  if (!masterEnabled) return false;
  return config.get<boolean>(`notifications.${category}`, true);
}
