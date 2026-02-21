// ---------------------------------------------------------------------------
// ACP Request Handlers
// ---------------------------------------------------------------------------
// Default implementation of AcpRequestHandler for spike testing.
// Auto-approves permissions, reads files, stubs terminal operations.
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as types from './types';
import { AcpRequestHandler } from './client';

export class DefaultAcpRequestHandler implements AcpRequestHandler {
  constructor(private outputChannel: vscode.OutputChannel) {}

  async onPermissionRequest(params: types.RequestPermissionParams): Promise<types.RequestPermissionResult> {
    this.outputChannel.appendLine(`[ACP Handler] Permission request: ${params.action}`);
    this.outputChannel.appendLine(`[ACP Handler] Details: ${JSON.stringify(params.details)}`);
    
    // Auto-approve for spike
    return { approved: true };
  }

  async onReadTextFile(params: types.ReadTextFileParams): Promise<types.ReadTextFileResult> {
    this.outputChannel.appendLine(`[ACP Handler] Read file: ${params.path}`);
    
    try {
      const absolutePath = path.isAbsolute(params.path)
        ? params.path
        : path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', params.path);
      
      const content = await fs.readFile(absolutePath, 'utf-8');
      this.outputChannel.appendLine(`[ACP Handler] Read ${content.length} bytes from ${absolutePath}`);
      return { content };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.outputChannel.appendLine(`[ACP Handler] Read failed: ${message}`);
      throw new Error(`Failed to read file: ${message}`);
    }
  }

  async onWriteTextFile(params: types.WriteTextFileParams): Promise<types.WriteTextFileResult> {
    this.outputChannel.appendLine(`[ACP Handler] Write file request: ${params.path}`);
    this.outputChannel.appendLine(`[ACP Handler] Content length: ${params.content.length} bytes`);
    
    // Stub for spike - do not actually write
    this.outputChannel.appendLine('[ACP Handler] STUB: Write not implemented (spike scope)');
    throw new Error('Write operations not supported in spike');
  }

  async onTerminalCreate(params: types.TerminalCreateParams): Promise<types.TerminalCreateResult> {
    this.outputChannel.appendLine(`[ACP Handler] Terminal create: ${params.command} ${params.args?.join(' ') || ''}`);
    this.outputChannel.appendLine(`[ACP Handler] CWD: ${params.cwd || '(default)'}`);
    
    // Stub for spike
    this.outputChannel.appendLine('[ACP Handler] STUB: Terminal operations not implemented (spike scope)');
    throw new Error('Terminal operations not supported in spike');
  }

  async onTerminalOutput(params: types.TerminalOutputParams): Promise<types.TerminalOutputResult> {
    this.outputChannel.appendLine(`[ACP Handler] Terminal output request: ${params.terminalId}`);
    throw new Error('Terminal operations not supported in spike');
  }

  async onTerminalWaitForExit(params: types.TerminalWaitForExitParams): Promise<types.TerminalWaitForExitResult> {
    this.outputChannel.appendLine(`[ACP Handler] Terminal wait for exit: ${params.terminalId}`);
    throw new Error('Terminal operations not supported in spike');
  }

  async onTerminalKill(params: types.TerminalKillParams): Promise<types.TerminalKillResult> {
    this.outputChannel.appendLine(`[ACP Handler] Terminal kill: ${params.terminalId}`);
    throw new Error('Terminal operations not supported in spike');
  }

  async onTerminalRelease(params: types.TerminalReleaseParams): Promise<types.TerminalReleaseResult> {
    this.outputChannel.appendLine(`[ACP Handler] Terminal release: ${params.terminalId}`);
    throw new Error('Terminal operations not supported in spike');
  }
}
