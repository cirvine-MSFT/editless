/**
 * Terminal tracking metadata and types.
 */

export interface TerminalInfo {
  id: string;
  labelKey: string;
  displayName: string;
  originalName: string;
  agentId: string;
  agentName: string;
  agentIcon: string;
  index: number;
  createdAt: Date;
  agentSessionId?: string;
  launchCommand?: string;
  agentPath?: string;
  configDir?: string;
}

export interface PersistedTerminalInfo {
  id: string;
  labelKey: string;
  displayName: string;
  originalName?: string;
  agentId: string;
  agentName: string;
  agentIcon: string;
  index: number;
  createdAt: string;
  terminalName: string;
  lastSeenAt: number;
  lastActivityAt?: number;
  rebootCount: number;
  agentSessionId?: string;
  launchCommand?: string;
  agentPath?: string;
  configDir?: string;
}
