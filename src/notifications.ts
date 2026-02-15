import * as vscode from 'vscode';
import type { AgentTeamConfig, SquadState } from './types';

export function isNotificationEnabled(category: 'inbox' | 'updates'): boolean {
  const config = vscode.workspace.getConfiguration('editless');
  const masterEnabled = config.get<boolean>('notifications.enabled', true);
  if (!masterEnabled) return false;
  return config.get<boolean>(`notifications.${category}`, true);
}

export class NotificationManager {
  private _previousCounts = new Map<string, number>();

  checkAndNotify(config: AgentTeamConfig, state: SquadState): void {
    const previousCount = this._previousCounts.get(config.id) ?? 0;
    const currentCount = state.inboxCount;

    if (previousCount === 0 && currentCount > 0 && isNotificationEnabled('inbox')) {
      vscode.window.showWarningMessage(
        `${config.icon} ${config.name}: ${currentCount} decision(s) pending`,
      );
    }

    this._previousCounts.set(config.id, currentCount);
  }

  reset(squadId: string): void {
    this._previousCounts.delete(squadId);
  }
}
