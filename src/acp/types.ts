// ---------------------------------------------------------------------------
// ACP Protocol Types
// ---------------------------------------------------------------------------
// TypeScript interfaces for Agent Client Protocol (ACP) JSON-RPC messages.
// Based on ACP spec v1 and Copilot CLI v0.0.414 live testing.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// JSON-RPC Base Types
// ---------------------------------------------------------------------------

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// ---------------------------------------------------------------------------
// Client Capabilities
// ---------------------------------------------------------------------------

export interface ClientCapabilities {
  fs?: {
    readTextFile?: boolean;
    writeTextFile?: boolean;
  };
  terminal?: boolean;
}

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------

export interface InitializeParams {
  protocolVersion: number;
  clientCapabilities: ClientCapabilities;
}

export interface AgentCapabilities {
  loadSession?: boolean;
  promptCapabilities?: {
    image?: boolean;
    audio?: boolean;
    embeddedContext?: boolean;
  };
  sessionCapabilities?: {
    list?: Record<string, unknown>;
  };
}

export interface AgentInfo {
  name: string;
  title: string;
  version: string;
}

export interface AuthMethod {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface InitializeResult {
  protocolVersion: number;
  agentCapabilities: AgentCapabilities;
  agentInfo: AgentInfo;
  authMethods: AuthMethod[];
}

// ---------------------------------------------------------------------------
// Session Management
// ---------------------------------------------------------------------------

export interface SessionNewParams {
  cwd: string;
  mcpServers?: unknown[];
}

export interface ModelInfo {
  availableModels: Array<{ id: string; name: string; [key: string]: unknown }>;
  currentModelId: string;
}

export interface ModeInfo {
  availableModes: Array<{ id: string; name: string; [key: string]: unknown }>;
  currentModeId: string;
}

export interface SessionNewResult {
  sessionId: string;
  models: ModelInfo;
  modes: ModeInfo;
}

export interface SessionLoadParams {
  sessionId: string;
}

export interface SessionLoadResult {
  sessionId: string;
  models: ModelInfo;
  modes: ModeInfo;
}

export interface SessionCancelParams {
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export type PromptContent = 
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType?: string }
  | { type: 'resource'; uri: string; mimeType?: string; text?: string };

export interface SessionPromptParams {
  sessionId: string;
  prompt: PromptContent[];
}

export interface SessionPromptResult {
  stopReason: 'end_turn' | 'max_tokens' | 'cancelled' | 'error';
}

// ---------------------------------------------------------------------------
// Session Updates (Agent → Client Notifications)
// ---------------------------------------------------------------------------

export type SessionUpdate =
  | AgentMessageChunkUpdate
  | AgentThoughtChunkUpdate
  | ToolCallUpdate
  | ToolCallUpdateUpdate
  | PlanUpdate
  | UserMessageChunkUpdate
  | AvailableCommandsUpdate
  | CurrentModeUpdate;

export interface AgentMessageChunkUpdate {
  sessionUpdate: 'agent_message_chunk';
  content: { type: 'text'; text: string };
}

export interface AgentThoughtChunkUpdate {
  sessionUpdate: 'agent_thought_chunk';
  content: { type: 'text'; text: string };
}

export interface ToolCallUpdate {
  sessionUpdate: 'tool_call';
  toolCall: {
    id: string;
    name: string;
    arguments?: Record<string, unknown>;
  };
}

export interface ToolCallUpdateUpdate {
  sessionUpdate: 'tool_call_update';
  toolCallId: string;
  update: {
    type: 'progress' | 'complete' | 'error';
    message?: string;
    result?: unknown;
    error?: string;
    diff?: {
      oldText?: string;
      newText?: string;
    };
  };
}

export interface PlanUpdate {
  sessionUpdate: 'plan';
  plan: {
    steps: Array<{
      id: string;
      description: string;
      status: 'pending' | 'in_progress' | 'done' | 'failed';
    }>;
  };
}

export interface UserMessageChunkUpdate {
  sessionUpdate: 'user_message_chunk';
  content: { type: 'text'; text: string };
}

export interface AvailableCommandsUpdate {
  sessionUpdate: 'available_commands_update';
  commands: Array<{
    name: string;
    description: string;
  }>;
}

export interface CurrentModeUpdate {
  sessionUpdate: 'current_mode_update';
  modeId: string;
}

export interface SessionUpdateNotification {
  sessionId: string;
  update: SessionUpdate;
}

// ---------------------------------------------------------------------------
// Agent → Client Requests
// ---------------------------------------------------------------------------

export interface RequestPermissionParams {
  sessionId: string;
  action: string;
  details: Record<string, unknown>;
}

export interface RequestPermissionResult {
  approved: boolean;
  reason?: string;
}

export interface ReadTextFileParams {
  path: string;
}

export interface ReadTextFileResult {
  content: string;
}

export interface WriteTextFileParams {
  path: string;
  content: string;
}

export interface WriteTextFileResult {
  success: boolean;
}

export interface TerminalCreateParams {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export interface TerminalCreateResult {
  terminalId: string;
}

export interface TerminalOutputParams {
  terminalId: string;
}

export interface TerminalOutputResult {
  output: string;
  exitCode?: number;
}

export interface TerminalWaitForExitParams {
  terminalId: string;
}

export interface TerminalWaitForExitResult {
  exitCode: number;
}

export interface TerminalKillParams {
  terminalId: string;
}

export interface TerminalKillResult {
  success: boolean;
}

export interface TerminalReleaseParams {
  terminalId: string;
}

export interface TerminalReleaseResult {
  success: boolean;
}
