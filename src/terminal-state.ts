import * as vscode from 'vscode';
import type { SessionEvent } from './session-context';
import { CopilotEvents } from './copilot-sdk-types';

export type SessionState = 'launching' | 'active' | 'inactive' | 'attention' | 'orphaned';

/** Returns true if the event indicates the agent is waiting for user input. */
export function isAttentionEvent(event: SessionEvent): boolean {
  return event.hasOpenAskUser === true;
}

/** Returns true if the event type indicates the agent is actively working. */
export function isWorkingEvent(eventType: string): boolean {
  switch (eventType) {
    case CopilotEvents.AssistantTurnStart:
    case CopilotEvents.AssistantMessage:
    case CopilotEvents.AssistantThinking:
    case CopilotEvents.ToolExecutionStart:
    case CopilotEvents.ToolExecutionComplete:
    case CopilotEvents.UserMessage:
    case CopilotEvents.SessionResume:
      return true;
    default:
      return false;
  }
}

export function getStateIcon(state: SessionState, resumable = false): vscode.ThemeIcon {
  switch (state) {
    case 'launching':
    case 'active':
      return new vscode.ThemeIcon('loading~spin');
    case 'attention':
      return new vscode.ThemeIcon('comment-discussion');
    case 'inactive':
      return new vscode.ThemeIcon('circle-outline');
    case 'orphaned':
      return resumable
        ? new vscode.ThemeIcon('history')
        : new vscode.ThemeIcon('circle-outline');
    default:
      return new vscode.ThemeIcon('terminal');
  }
}

export function getStateDescription(state: SessionState, lastActivityAt?: number, resumable = false): string {
  switch (state) {
    case 'launching':
      return 'launching…';
    case 'attention':
      return 'waiting for input';
    case 'orphaned':
      return resumable ? 'previous session — resume' : 'session ended';
    case 'active':
    case 'inactive': {
      if (!lastActivityAt) {
        return '';
      }
      const ageMs = Date.now() - lastActivityAt;
      const mins = Math.floor(ageMs / 60_000);
      if (mins < 1) {
        return 'just now';
      }
      if (mins < 60) {
        return `${mins}m`;
      }
      const hours = Math.floor(mins / 60);
      return `${hours}h`;
    }
    default:
      return '';
  }
}
