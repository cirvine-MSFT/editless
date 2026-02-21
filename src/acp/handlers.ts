// ---------------------------------------------------------------------------
// ACP Request Handlers
// ---------------------------------------------------------------------------
// Default implementation of AcpRequestHandler for spike testing.
// Auto-approves permissions, reads/writes files, manages terminal processes
// via ProcessPool.
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as types from './types';
import { AcpRequestHandler } from './client';
import { ProcessPool } from './process-pool';

export class DefaultAcpRequestHandler implements AcpRequestHandler, vscode.Disposable {
  private readonly pool: ProcessPool;

  constructor(
    private outputChannel: vscode.OutputChannel,
    pool?: ProcessPool,
  ) {
    this.pool = pool ?? new ProcessPool();
  }

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
    this.outputChannel.appendLine(`[ACP Handler] Write file: ${params.path}`);
    this.outputChannel.appendLine(`[ACP Handler] Content length: ${params.content.length} bytes`);
    
    try {
      const absolutePath = path.isAbsolute(params.path)
        ? params.path
        : path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', params.path);

      const dir = path.dirname(absolutePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(absolutePath, params.content, 'utf-8');
      this.outputChannel.appendLine(`[ACP Handler] Wrote ${params.content.length} bytes to ${absolutePath}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.outputChannel.appendLine(`[ACP Handler] Write failed: ${message}`);
      throw new Error(`Failed to write file: ${message}`);
    }
  }

  async onTerminalCreate(params: types.TerminalCreateParams): Promise<types.TerminalCreateResult> {
    this.outputChannel.appendLine(`[ACP Handler] Terminal create: ${params.command} ${params.args?.join(' ') || ''}`);
    this.outputChannel.appendLine(`[ACP Handler] CWD: ${params.cwd || '(default)'}`);

    const terminalId = this.pool.create(params.command, params.args, params.cwd, params.env);
    this.outputChannel.appendLine(`[ACP Handler] Terminal spawned: ${terminalId}`);
    return { terminalId };
  }

  async onTerminalOutput(params: types.TerminalOutputParams): Promise<types.TerminalOutputResult> {
    this.outputChannel.appendLine(`[ACP Handler] Terminal output: ${params.terminalId}`);
    const { output, exitCode } = this.pool.getOutput(params.terminalId);
    this.outputChannel.appendLine(`[ACP Handler] Output bytes: ${output.length}, exitCode: ${exitCode ?? 'running'}`);
    return { output, exitCode: exitCode ?? undefined };
  }

  async onTerminalWaitForExit(params: types.TerminalWaitForExitParams): Promise<types.TerminalWaitForExitResult> {
    this.outputChannel.appendLine(`[ACP Handler] Terminal wait for exit: ${params.terminalId}`);
    const exitCode = await this.pool.waitForExit(params.terminalId);
    this.outputChannel.appendLine(`[ACP Handler] Terminal exited: ${params.terminalId} code=${exitCode}`);
    return { exitCode };
  }

  async onTerminalKill(params: types.TerminalKillParams): Promise<types.TerminalKillResult> {
    this.outputChannel.appendLine(`[ACP Handler] Terminal kill: ${params.terminalId}`);
    this.pool.kill(params.terminalId);
    return { success: true };
  }

  async onTerminalRelease(params: types.TerminalReleaseParams): Promise<types.TerminalReleaseResult> {
    this.outputChannel.appendLine(`[ACP Handler] Terminal release: ${params.terminalId}`);
    this.pool.release(params.terminalId);
    return { success: true };
  }

  dispose(): void {
    this.pool.dispose();
  }
}
