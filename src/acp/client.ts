// ---------------------------------------------------------------------------
// ACP Client
// ---------------------------------------------------------------------------
// Core JSON-RPC client for Agent Client Protocol (ACP).
// Spawns `copilot --acp --stdio` and manages bidirectional communication.
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { buildCopilotCommand } from '../copilot-cli-builder';
import * as types from './types';

export interface AcpRequestHandler {
  onPermissionRequest(params: types.RequestPermissionParams): Promise<types.RequestPermissionResult>;
  onReadTextFile(params: types.ReadTextFileParams): Promise<types.ReadTextFileResult>;
  onWriteTextFile(params: types.WriteTextFileParams): Promise<types.WriteTextFileResult>;
  onTerminalCreate(params: types.TerminalCreateParams): Promise<types.TerminalCreateResult>;
  onTerminalOutput(params: types.TerminalOutputParams): Promise<types.TerminalOutputResult>;
  onTerminalWaitForExit(params: types.TerminalWaitForExitParams): Promise<types.TerminalWaitForExitResult>;
  onTerminalKill(params: types.TerminalKillParams): Promise<types.TerminalKillResult>;
  onTerminalRelease(params: types.TerminalReleaseParams): Promise<types.TerminalReleaseResult>;
}

export interface AcpClientEvents {
  message_chunk: string;
  thought_chunk: string;
  tool_call: { id: string; name: string; arguments?: Record<string, unknown> };
  tool_call_update: { id: string; type: string; message?: string; result?: unknown; error?: string };
  plan: { steps: Array<{ id: string; description: string; status: string }> };
  stopped: { reason: string };
  error: Error;
}

export class AcpClient {
  private process: ChildProcess | null = null;
  private pendingRequests = new Map<number | string, {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private nextRequestId = 1;
  private buffer = '';
  private handler: AcpRequestHandler;
  private outputChannel: vscode.OutputChannel;

  private readonly _onMessageChunk = new vscode.EventEmitter<string>();
  private readonly _onThoughtChunk = new vscode.EventEmitter<string>();
  private readonly _onToolCall = new vscode.EventEmitter<{ id: string; name: string; arguments?: Record<string, unknown> }>();
  private readonly _onToolCallUpdate = new vscode.EventEmitter<{ id: string; type: string; message?: string; result?: unknown; error?: string }>();
  private readonly _onPlan = new vscode.EventEmitter<{ steps: Array<{ id: string; description: string; status: string }> }>();
  private readonly _onStopped = new vscode.EventEmitter<{ reason: string }>();
  private readonly _onError = new vscode.EventEmitter<Error>();

  public readonly onMessageChunk = this._onMessageChunk.event;
  public readonly onThoughtChunk = this._onThoughtChunk.event;
  public readonly onToolCall = this._onToolCall.event;
  public readonly onToolCallUpdate = this._onToolCallUpdate.event;
  public readonly onPlan = this._onPlan.event;
  public readonly onStopped = this._onStopped.event;
  public readonly onError = this._onError.event;

  constructor(handler: AcpRequestHandler, outputChannel: vscode.OutputChannel) {
    this.handler = handler;
    this.outputChannel = outputChannel;
  }

  async initialize(clientCapabilities: types.ClientCapabilities = {}): Promise<types.InitializeResult> {
    const command = buildCopilotCommand({ extraArgs: ['--acp', '--stdio'] });
    this.outputChannel.appendLine(`[ACP] Spawning: ${command}`);

    const parts = command.split(' ');
    const binary = parts[0];
    const args = parts.slice(1);

    this.process = spawn(binary, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      this.handleStdout(data.toString('utf-8'));
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      this.outputChannel.appendLine(`[ACP] stderr: ${data.toString('utf-8')}`);
    });

    this.process.on('error', (err: Error) => {
      this.outputChannel.appendLine(`[ACP] Process error: ${err.message}`);
      this._onError.fire(err);
    });

    this.process.on('exit', (code: number | null) => {
      this.outputChannel.appendLine(`[ACP] Process exited with code ${code}`);
      this.cleanup();
    });

    const result = await this.sendRequest<types.InitializeResult>('initialize', {
      protocolVersion: 1,
      clientCapabilities,
    });

    this.outputChannel.appendLine(`[ACP] Initialized: ${result.agentInfo.name} v${result.agentInfo.version}`);
    return result;
  }

  async createSession(cwd: string): Promise<types.SessionNewResult> {
    return await this.sendRequest<types.SessionNewResult>('session/new', {
      cwd,
      mcpServers: [],
    });
  }

  async loadSession(sessionId: string): Promise<types.SessionLoadResult> {
    return await this.sendRequest<types.SessionLoadResult>('session/load', {
      sessionId,
    });
  }

  async prompt(sessionId: string, text: string): Promise<types.SessionPromptResult> {
    return await this.sendRequest<types.SessionPromptResult>('session/prompt', {
      sessionId,
      prompt: [{ type: 'text', text }],
    });
  }

  async cancel(sessionId: string): Promise<void> {
    await this.sendRequest<void>('session/cancel', { sessionId });
  }

  dispose(): void {
    this.outputChannel.appendLine('[ACP] Disposing client');
    this.cleanup();
    this._onMessageChunk.dispose();
    this._onThoughtChunk.dispose();
    this._onToolCall.dispose();
    this._onToolCallUpdate.dispose();
    this._onPlan.dispose();
    this._onStopped.dispose();
    this._onError.dispose();
  }

  private cleanup(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.pendingRequests.forEach((pending) => {
      pending.reject(new Error('ACP client disposed'));
    });
    this.pendingRequests.clear();
  }

  private sendRequest<T>(method: string, params?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = this.nextRequestId++;
      const request: types.JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, {
        resolve: resolve as (result: unknown) => void,
        reject,
      });

      const json = JSON.stringify(request) + '\n';
      this.process?.stdin?.write(json);
      this.outputChannel.appendLine(`[ACP] → ${method} (id=${id})`);
    });
  }

  private sendResponse(id: number | string, result: unknown): void {
    const response: types.JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      result,
    };
    const json = JSON.stringify(response) + '\n';
    this.process?.stdin?.write(json);
    this.outputChannel.appendLine(`[ACP] → response (id=${id})`);
  }

  private sendErrorResponse(id: number | string, error: types.JsonRpcError): void {
    const response: types.JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      error,
    };
    const json = JSON.stringify(response) + '\n';
    this.process?.stdin?.write(json);
    this.outputChannel.appendLine(`[ACP] → error response (id=${id}): ${error.message}`);
  }

  private handleStdout(data: string): void {
    this.buffer += data;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const msg = JSON.parse(line);
          this.handleMessage(msg);
        } catch (err) {
          this.outputChannel.appendLine(`[ACP] Failed to parse: ${line}`);
        }
      }
    }
  }

  private handleMessage(msg: unknown): void {
    if (!this.isValidJsonRpc(msg)) {
      this.outputChannel.appendLine(`[ACP] Invalid JSON-RPC message: ${JSON.stringify(msg)}`);
      return;
    }

    if ('method' in msg) {
      if ('id' in msg) {
        this.handleAgentRequest(msg as unknown as types.JsonRpcRequest);
      } else {
        this.handleNotification(msg as unknown as types.JsonRpcNotification);
      }
    } else if ('result' in msg || 'error' in msg) {
      this.handleResponse(msg as unknown as types.JsonRpcResponse);
    }
  }

  private isValidJsonRpc(msg: unknown): msg is Record<string, unknown> {
    return (
      typeof msg === 'object' &&
      msg !== null &&
      'jsonrpc' in msg &&
      (msg as Record<string, unknown>).jsonrpc === '2.0'
    );
  }

  private handleResponse(response: types.JsonRpcResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      this.outputChannel.appendLine(`[ACP] Unexpected response id=${response.id}`);
      return;
    }

    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(`${response.error.message} (code ${response.error.code})`));
    } else {
      pending.resolve(response.result);
    }
  }

  private handleNotification(notification: types.JsonRpcNotification): void {
    if (notification.method === 'session/update') {
      this.handleSessionUpdate(notification.params as types.SessionUpdateNotification);
    } else {
      this.outputChannel.appendLine(`[ACP] Unknown notification: ${notification.method}`);
    }
  }

  private handleSessionUpdate(params: types.SessionUpdateNotification): void {
    const update = params.update;

    switch (update.sessionUpdate) {
      case 'agent_message_chunk':
        this._onMessageChunk.fire(update.content.text);
        break;
      case 'agent_thought_chunk':
        this._onThoughtChunk.fire(update.content.text);
        break;
      case 'tool_call':
        this._onToolCall.fire({
          id: update.toolCall.id,
          name: update.toolCall.name,
          arguments: update.toolCall.arguments,
        });
        break;
      case 'tool_call_update':
        this._onToolCallUpdate.fire({
          id: update.toolCallId,
          type: update.update.type,
          message: update.update.message,
          result: update.update.result,
          error: update.update.error,
        });
        break;
      case 'plan':
        this._onPlan.fire({ steps: update.plan.steps });
        break;
      default:
        this.outputChannel.appendLine(`[ACP] Unknown session update: ${JSON.stringify(update)}`);
    }
  }

  private async handleAgentRequest(request: types.JsonRpcRequest): Promise<void> {
    this.outputChannel.appendLine(`[ACP] ← ${request.method} (id=${request.id})`);

    try {
      let result: unknown;

      switch (request.method) {
        case 'session/request_permission':
          result = await this.handler.onPermissionRequest(request.params as types.RequestPermissionParams);
          break;
        case 'fs/read_text_file':
          result = await this.handler.onReadTextFile(request.params as types.ReadTextFileParams);
          break;
        case 'fs/write_text_file':
          result = await this.handler.onWriteTextFile(request.params as types.WriteTextFileParams);
          break;
        case 'terminal/create':
          result = await this.handler.onTerminalCreate(request.params as types.TerminalCreateParams);
          break;
        case 'terminal/output':
          result = await this.handler.onTerminalOutput(request.params as types.TerminalOutputParams);
          break;
        case 'terminal/wait_for_exit':
          result = await this.handler.onTerminalWaitForExit(request.params as types.TerminalWaitForExitParams);
          break;
        case 'terminal/kill':
          result = await this.handler.onTerminalKill(request.params as types.TerminalKillParams);
          break;
        case 'terminal/release':
          result = await this.handler.onTerminalRelease(request.params as types.TerminalReleaseParams);
          break;
        default:
          throw new Error(`Unknown method: ${request.method}`);
      }

      this.sendResponse(request.id, result);
    } catch (err) {
      this.sendErrorResponse(request.id, {
        code: -32603,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
