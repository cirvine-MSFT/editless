// ---------------------------------------------------------------------------
// ACP Process Pool
// ---------------------------------------------------------------------------
// Manages concurrent child processes for ACP terminal operations.
// Uses child_process.spawn() for programmatic output capture.
// ---------------------------------------------------------------------------

import { spawn, execSync, ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import * as vscode from 'vscode';

interface ManagedProcess {
  process: ChildProcess;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  exited: boolean;
  exitPromise: Promise<number>;
}

export class ProcessPool implements vscode.Disposable {
  private readonly processes = new Map<string, ManagedProcess>();

  create(command: string, args?: string[], cwd?: string, env?: Record<string, string>): string {
    const terminalId = randomUUID();
    const spawnEnv = env ? { ...process.env, ...env } : undefined;

    const child = spawn(command, args ?? [], {
      cwd,
      env: spawnEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    const managed: ManagedProcess = {
      process: child,
      stdout: '',
      stderr: '',
      exitCode: null,
      exited: false,
      exitPromise: null!,
    };

    managed.exitPromise = new Promise<number>((resolve) => {
      child.on('exit', (code) => {
        managed.exitCode = code ?? 1;
        managed.exited = true;
        resolve(managed.exitCode);
      });
      child.on('error', () => {
        if (!managed.exited) {
          managed.exitCode = 1;
          managed.exited = true;
          resolve(1);
        }
      });
    });

    child.stdout?.on('data', (data: Buffer) => {
      managed.stdout += data.toString('utf-8');
    });

    child.stderr?.on('data', (data: Buffer) => {
      managed.stderr += data.toString('utf-8');
    });

    this.processes.set(terminalId, managed);
    return terminalId;
  }

  getOutput(terminalId: string): { output: string; exitCode: number | null } {
    const managed = this.processes.get(terminalId);
    if (!managed) {
      return { output: '', exitCode: null };
    }

    const output = managed.stdout + managed.stderr;
    managed.stdout = '';
    managed.stderr = '';

    return {
      output,
      exitCode: managed.exited ? managed.exitCode : null,
    };
  }

  async waitForExit(terminalId: string): Promise<number> {
    const managed = this.processes.get(terminalId);
    if (!managed) {
      return 1;
    }
    return managed.exitPromise;
  }

  kill(terminalId: string): void {
    const managed = this.processes.get(terminalId);
    if (!managed || managed.exited) {
      return;
    }

    const pid = managed.process.pid;
    if (pid === undefined) {
      return;
    }

    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /T /F /PID ${pid}`, { stdio: 'ignore' });
      } else {
        managed.process.kill('SIGKILL');
      }
    } catch {
      // Process may already be dead
    }
  }

  release(terminalId: string): void {
    const managed = this.processes.get(terminalId);
    if (!managed) {
      return;
    }

    if (!managed.exited) {
      this.kill(terminalId);
    }
    this.processes.delete(terminalId);
  }

  dispose(): void {
    for (const terminalId of this.processes.keys()) {
      this.release(terminalId);
    }
  }
}
