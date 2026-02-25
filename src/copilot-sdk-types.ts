/**
 * Minimal type definitions sourced from `github/copilot-sdk` v0.1.8
 * (`nodejs/src/generated/session-events.ts`), auto-generated from
 * `session-events.schema.json`.
 *
 * We only extract the event type strings and the `tool.execution_start`
 * data shape — just enough for our event detection logic.
 */

/**
 * All official Copilot CLI session event types.
 * Source: github/copilot-sdk session-events.schema.json
 */
export type CopilotEventType =
  | 'session.start'
  | 'session.resume'
  | 'session.error'
  | 'session.idle'
  | 'session.title_changed'
  | 'session.info'
  | 'session.warning'
  | 'session.model_change'
  | 'session.mode_changed'
  | 'session.plan_changed'
  | 'session.workspace_file_changed'
  | 'session.handoff'
  | 'session.truncation'
  | 'session.snapshot_rewind'
  | 'session.shutdown'
  | 'user.message'
  | 'assistant.turn_start'
  | 'assistant.turn_end'
  | 'assistant.message'
  | 'assistant.thinking'
  | 'tool.execution_start'
  | 'tool.execution_partial_result'
  | 'tool.execution_progress'
  | 'tool.execution_complete'
  | 'skill.invoked'
  | 'subagent.started'
  | 'subagent.completed'
  | 'subagent.failed'
  | 'subagent.selected'
  | 'hook.start'
  | 'hook.end'
  | 'system.message';

/** Data payload for `tool.execution_start` events. */
export interface ToolExecutionStartData {
  toolCallId: string;
  toolName: string;
  arguments?: unknown;
  mcpServerName?: string;
  mcpToolName?: string;
  parentToolCallId?: string;
}

/**
 * Const object of event type strings we reference in our state detection.
 * Using a const avoids magic strings scattered across the codebase.
 */
export const CopilotEvents = {
  // Session lifecycle
  SessionResume: 'session.resume' as const,
  SessionIdle: 'session.idle' as const,
  SessionShutdown: 'session.shutdown' as const,

  // User
  UserMessage: 'user.message' as const,

  // Assistant
  AssistantTurnStart: 'assistant.turn_start' as const,
  AssistantTurnEnd: 'assistant.turn_end' as const,
  AssistantMessage: 'assistant.message' as const,
  AssistantThinking: 'assistant.thinking' as const,

  // Tool
  ToolExecutionStart: 'tool.execution_start' as const,
  ToolExecutionComplete: 'tool.execution_complete' as const,
} as const;
