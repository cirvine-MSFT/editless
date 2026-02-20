import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type * as vscode from 'vscode';
import { CopilotPseudoterminal, TerminalState } from '../copilot-pseudoterminal';

// Mock child_process
vi.mock('child_process', () => {
  const EventEmitter = require('events').EventEmitter;
  
  class MockChildProcess extends EventEmitter {
    stdout = new EventEmitter();
    stderr = new EventEmitter();
    stdin = {
      write: vi.fn(),
    };
    killed = false;
    
    kill(signal?: string): boolean {
      this.killed = true;
      this.emit('exit', signal === 'SIGKILL' ? null : 0, signal);
      return true;
    }
  }
  
  return {
    spawn: vi.fn(() => new MockChildProcess()),
  };
});

// Mock vscode
vi.mock('vscode', () => ({
  EventEmitter: class<T> {
    private listeners: Array<(e: T) => void> = [];
    
    get event() {
      return (listener: (e: T) => void) => {
        this.listeners.push(listener);
        return { dispose: () => {} };
      };
    }
    
    fire(data: T): void {
      for (const listener of this.listeners) {
        listener(data);
      }
    }
    
    dispose(): void {
      this.listeners = [];
    }
  },
}));

describe('CopilotPseudoterminal', () => {
  let pty: CopilotPseudoterminal;
  let mockChildProcess: any;
  let stateChanges: TerminalState[] = [];
  let sessionIds: string[] = [];
  let terminalOutput: string[] = [];

  beforeEach(async () => {
    const cp = await import('child_process');
    mockChildProcess = null;
    (cp.spawn as any).mockImplementation((...args: any[]) => {
      const EventEmitter = require('events').EventEmitter;
      class MockChildProcess extends EventEmitter {
        stdout = new EventEmitter();
        stderr = new EventEmitter();
        stdin = { write: vi.fn() };
        killed = false;
        kill(signal?: string): boolean {
          this.killed = true;
          this.emit('exit', signal === 'SIGKILL' ? null : 0, signal);
          return true;
        }
      }
      mockChildProcess = new MockChildProcess();
      return mockChildProcess;
    });

    stateChanges = [];
    sessionIds = [];
    terminalOutput = [];

    pty = new CopilotPseudoterminal({
      name: 'Test Terminal',
      cwd: '/test',
      args: ['--agent', 'test'],
      onStateChange: (state) => stateChanges.push(state),
      onSessionIdDetected: (id) => sessionIds.push(id),
    });

    // Capture terminal output
    pty.onDidWrite((data) => terminalOutput.push(data));
  });

  afterEach(() => {
    if (pty) {
      pty.close();
    }
    vi.clearAllMocks();
  });

  describe('Process lifecycle', () => {
    it('spawns child process on open', async () => {
      const cp = await import('child_process');
      
      pty.open({ rows: 24, columns: 80 });

      expect(vi.mocked(cp.spawn)).toHaveBeenCalledWith(
        'copilot',
        ['--agent', 'test'],
        expect.objectContaining({
          cwd: '/test',
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      );
    });

    it('pipes stdout to terminal', () => {
      pty.open({ rows: 24, columns: 80 });

      mockChildProcess.stdout.emit('data', Buffer.from('Hello from CLI\n'));

      expect(terminalOutput.join('')).toContain('Hello from CLI');
    });

    it('pipes stderr to terminal', () => {
      pty.open({ rows: 24, columns: 80 });

      mockChildProcess.stderr.emit('data', Buffer.from('Error message\n'));

      expect(terminalOutput.join('')).toContain('Error message');
    });

    it('forwards input to stdin', () => {
      pty.open({ rows: 24, columns: 80 });

      pty.handleInput('/help\n');

      expect(mockChildProcess.stdin.write).toHaveBeenCalledWith('/help\n');
    });

    it('handles Ctrl+C by sending SIGINT', () => {
      pty.open({ rows: 24, columns: 80 });
      const killSpy = vi.spyOn(mockChildProcess, 'kill');

      pty.handleInput('\x03'); // Ctrl+C

      expect(killSpy).toHaveBeenCalledWith('SIGINT');
    });

    it('closes gracefully', () => {
      pty.open({ rows: 24, columns: 80 });
      const killSpy = vi.spyOn(mockChildProcess, 'kill');

      pty.close();

      expect(killSpy).toHaveBeenCalledWith('SIGINT');
    });

    it('handles process exit', () => {
      pty.open({ rows: 24, columns: 80 });
      let closeCode: number | void = undefined;
      pty.onDidClose?.((code) => { closeCode = code; });

      mockChildProcess.emit('exit', 0, null);

      expect(closeCode).toBe(0);
      expect(stateChanges).toContain('closed');
    });

    it('handles spawn errors', () => {
      pty.open({ rows: 24, columns: 80 });
      let closeCode: number | void = undefined;
      pty.onDidClose?.((code) => { closeCode = code; });

      mockChildProcess.emit('error', new Error('spawn ENOENT'));

      expect(terminalOutput.join('')).toContain('Failed to spawn');
      expect(closeCode).toBe(1);
    });
  });

  describe('Session ID detection', () => {
    it('detects session ID from output', () => {
      pty.open({ rows: 24, columns: 80 });

      mockChildProcess.stdout.emit('data', Buffer.from('Starting session...\n'));
      mockChildProcess.stdout.emit('data', Buffer.from('Session ID: abc-123-def\n'));
      mockChildProcess.stdout.emit('data', Buffer.from('Ready.\n'));

      expect(sessionIds).toEqual(['abc-123-def']);
      expect(pty.getSessionId()).toBe('abc-123-def');
    });

    it('detects session ID with various formats', () => {
      pty.open({ rows: 24, columns: 80 });

      mockChildProcess.stdout.emit('data', Buffer.from('session id: 550e8400-e29b-41d4-a716-446655440000\n'));

      expect(sessionIds[0]).toMatch(/^[a-f0-9-]+$/);
    });

    it('only detects session ID once', () => {
      pty.open({ rows: 24, columns: 80 });

      mockChildProcess.stdout.emit('data', Buffer.from('Session ID: abc-123-def\n'));
      mockChildProcess.stdout.emit('data', Buffer.from('Session ID: abc-456-ghi\n'));

      expect(sessionIds.length).toBe(1);
      expect(sessionIds[0]).toBe('abc-123-def');
    });
  });

  describe('State detection', () => {
    it('starts in "starting" state', () => {
      pty.open({ rows: 24, columns: 80 });

      expect(pty.getState()).toBe('starting');
    });

    it('transitions to "idle" on prompt', () => {
      pty.open({ rows: 24, columns: 80 });

      mockChildProcess.stdout.emit('data', Buffer.from('>\n'));

      expect(stateChanges).toContain('idle');
      expect(pty.getState()).toBe('idle');
    });

    it('detects "working" state from tool markers', () => {
      pty.open({ rows: 24, columns: 80 });

      mockChildProcess.stdout.emit('data', Buffer.from('🔧 Running tool: grep\n'));

      expect(stateChanges).toContain('working');
      expect(pty.getState()).toBe('working');
    });

    it('returns to "idle" after work completes', () => {
      pty.open({ rows: 24, columns: 80 });

      mockChildProcess.stdout.emit('data', Buffer.from('🔧 Running tool: view\n'));
      expect(pty.getState()).toBe('working');
      
      mockChildProcess.stdout.emit('data', Buffer.from('Done\n>\n'));
      expect(pty.getState()).toBe('idle');
    });

    it('detects multiple prompt styles', () => {
      pty.open({ rows: 24, columns: 80 });

      const prompts = [
        { text: '>\n', expected: 'idle' },
        { text: 'copilot>\n', expected: 'idle' },
        { text: '[project]>\n', expected: 'idle' },
      ];
      
      for (const { text, expected } of prompts) {
        mockChildProcess.stdout.emit('data', Buffer.from(text));
        expect(pty.getState()).toBe(expected);
      }
    });

    it('transitions to "waiting" if output appears without markers', () => {
      pty.open({ rows: 24, columns: 80 });

      mockChildProcess.stdout.emit('data', Buffer.from('Some random output without prompt\n'));

      expect(stateChanges).toContain('waiting');
    });

    it('maintains output buffer size limit', () => {
      pty.open({ rows: 24, columns: 80 });

      // Emit more than 4KB of data
      const largeOutput = 'x'.repeat(5000);
      mockChildProcess.stdout.emit('data', Buffer.from(largeOutput));

      // Should still detect patterns in recent output
      mockChildProcess.stdout.emit('data', Buffer.from('\n>\n'));
      expect(pty.getState()).toBe('idle');
    });
  });

  describe('Status injection', () => {
    it('injects status messages without sending to child', () => {
      pty.open({ rows: 24, columns: 80 });
      terminalOutput = [];

      pty.injectStatus('🔄 Agent working...');

      expect(terminalOutput.join('')).toContain('Agent working');
      expect(mockChildProcess.stdin.write).not.toHaveBeenCalled();
    });

    it('formats status with dim styling', () => {
      pty.open({ rows: 24, columns: 80 });
      terminalOutput = [];

      pty.injectStatus('Status message');

      const output = terminalOutput.join('');
      expect(output).toContain('\x1b[2m'); // Dim style
      expect(output).toContain('\x1b[0m'); // Reset style
    });
  });

  describe('Terminal control', () => {
    it('normalizes line endings (LF to CRLF)', () => {
      pty.open({ rows: 24, columns: 80 });
      terminalOutput = [];

      mockChildProcess.stdout.emit('data', Buffer.from('Line 1\nLine 2\nLine 3\n'));

      const output = terminalOutput.join('');
      expect(output).toContain('\r\n');
      expect(output).not.toMatch(/[^\r]\n/); // No bare LF
    });

    it('reports running state', () => {
      expect(pty.isRunning()).toBe(false);

      pty.open({ rows: 24, columns: 80 });
      expect(pty.isRunning()).toBe(true);

      pty.close();
      expect(pty.isRunning()).toBe(false);
    });

    it('handles setDimensions', () => {
      pty.open({ rows: 24, columns: 80 });

      // Should not throw
      expect(() => {
        pty.setDimensions({ rows: 30, columns: 120 });
      }).not.toThrow();
    });
  });

  describe('Environment variables', () => {
    it('passes custom env vars to child process', async () => {
      const cp = await import('child_process');
      
      const ptyWithEnv = new CopilotPseudoterminal({
        name: 'Test',
        env: {
          CUSTOM_VAR: 'custom_value',
          SQUAD_ID: 'test-squad',
        },
      });

      ptyWithEnv.open({ rows: 24, columns: 80 });

      expect(vi.mocked(cp.spawn)).toHaveBeenCalledWith(
        'copilot',
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            CUSTOM_VAR: 'custom_value',
            SQUAD_ID: 'test-squad',
          }),
        })
      );

      ptyWithEnv.close();
    });

    it('sets terminal environment variables', async () => {
      const cp = await import('child_process');
      
      pty.open({ rows: 24, columns: 80 });

      expect(vi.mocked(cp.spawn)).toHaveBeenCalledWith(
        'copilot',
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            TERM: 'xterm-256color',
            NO_COLOR: '1',
          }),
        })
      );
    });
  });

  describe('Edge cases', () => {
    it('handles rapid state changes', () => {
      pty.open({ rows: 24, columns: 80 });

      // Clear buffer first
      mockChildProcess.stdout.emit('data', Buffer.from('Starting...\n'));
      stateChanges = []; // Reset after startup
      
      mockChildProcess.stdout.emit('data', Buffer.from('>\n'));
      expect(pty.getState()).toBe('idle');
      
      // Buffer now ends with ">\n🔧 Running tool\n" - idle pattern still matches
      // This is expected behavior: idle state wins when prompt is at end
      mockChildProcess.stdout.emit('data', Buffer.from('🔧 Running tool: view'));
      expect(pty.getState()).toBe('working');
      
      mockChildProcess.stdout.emit('data', Buffer.from('\n>\n'));
      expect(pty.getState()).toBe('idle');
    });

    it('handles empty input', () => {
      pty.open({ rows: 24, columns: 80 });

      expect(() => {
        pty.handleInput('');
      }).not.toThrow();
    });

    it('handles closing before opening', () => {
      expect(() => {
        pty.close();
      }).not.toThrow();
    });

    it('handles input before process is ready', () => {
      // Don't call open()
      expect(() => {
        pty.handleInput('test\n');
      }).not.toThrow();
    });

    it('handles multiple close calls', () => {
      pty.open({ rows: 24, columns: 80 });

      expect(() => {
        pty.close();
        pty.close();
      }).not.toThrow();
    });
  });
});
