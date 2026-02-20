import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as os from 'os';

// ---------------------------------------------------------------------------
// State detection patterns (from CLI output)
// ---------------------------------------------------------------------------

const PATTERNS = {
  // CLI prompt patterns indicating idle state
  IDLE_PROMPTS: [
    />[\s\r\n]*$/,                       // Simple prompt: ">"
    /copilot>[\s\r\n]*$/,                // Named prompt: "copilot>"
    /\[.*?\]>[\s\r\n]*$/,                // Contextual prompt: "[project]>"
  ],
  
  // Tool execution markers indicating working state
  WORKING_MARKERS: [
    /🔧\s*Running tool:/,
    /Executing:/,
    /Tool call:/,
    /⚙️/,
  ],
  
  // Session ID detection (from startup output)
  SESSION_ID: /Session ID:\s*([a-f0-9-]+)/i,
  
  // Agent mode detection
  AGENT_MODE: /Agent mode|Running as agent|--agent/i,
};

// ---------------------------------------------------------------------------
// Terminal state
// ---------------------------------------------------------------------------

export type TerminalState = 'starting' | 'idle' | 'working' | 'waiting' | 'closed';

export interface PseudoterminalOptions {
  name: string;
  cwd?: string;
  env?: Record<string, string>;
  args?: string[];
  onStateChange?: (state: TerminalState) => void;
  onSessionIdDetected?: (sessionId: string) => void;
}

// ---------------------------------------------------------------------------
// CopilotPseudoterminal
// ---------------------------------------------------------------------------

/**
 * Pseudoterminal implementation for Copilot CLI sessions.
 * 
 * Provides full I/O control:
 * - Read stdout/stderr in real-time for state detection
 * - Inject status messages into terminal output
 * - Detect session ID from CLI output
 * - Forward Ctrl+C (SIGINT) to child process
 * - Forward terminal resize events
 * 
 * Trade-off: No shell features (tab completion, shell history, aliases).
 * This is acceptable for Copilot CLI which is an interactive tool, not a shell.
 */
export class CopilotPseudoterminal implements vscode.Pseudoterminal {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  private readonly closeEmitter = new vscode.EventEmitter<number | void>();
  
  onDidWrite: vscode.Event<string> = this.writeEmitter.event;
  onDidClose?: vscode.Event<number | void> = this.closeEmitter.event;
  
  private childProcess?: cp.ChildProcess;
  private state: TerminalState = 'starting';
  private outputBuffer = '';
  private sessionId?: string;
  private dimensions?: vscode.TerminalDimensions;

  constructor(private readonly options: PseudoterminalOptions) {}

  // -- Pseudoterminal lifecycle ---------------------------------------------

  open(initialDimensions: vscode.TerminalDimensions | undefined): void {
    this.dimensions = initialDimensions;
    this.spawn();
  }

  close(): void {
    this.setState('closed');
    if (this.childProcess) {
      // Graceful shutdown: send Ctrl+C, then kill if still alive after 1s
      this.childProcess.kill('SIGINT');
      setTimeout(() => {
        if (this.childProcess && !this.childProcess.killed) {
          this.childProcess.kill('SIGKILL');
        }
      }, 1000);
    }
    this.writeEmitter.dispose();
    this.closeEmitter.dispose();
  }

  handleInput(data: string): void {
    if (!this.childProcess || !this.childProcess.stdin) {
      return;
    }

    // Handle Ctrl+C (ASCII 0x03)
    if (data === '\x03') {
      this.childProcess.kill('SIGINT');
      return;
    }

    // Forward all other input to child stdin
    this.childProcess.stdin.write(data);
  }

  setDimensions(dimensions: vscode.TerminalDimensions): void {
    this.dimensions = dimensions;
    // Forward resize to child process if it supports SIGWINCH
    if (this.childProcess && this.childProcess.stdout) {
      // On Windows, child processes don't receive SIGWINCH, so this is a no-op
      // On Unix, child_process will automatically forward resize if pty is enabled
    }
  }

  // -- Child process management ----------------------------------------------

  private spawn(): void {
    const cliPath = 'copilot'; // Assumes CLI is in PATH
    const args = this.options.args || [];
    
    const env: Record<string, string> = {
      ...process.env,
      ...this.options.env,
      // Force interactive mode (no paging)
      TERM: 'xterm-256color',
      // Disable shell integration features (we're not a shell)
      NO_COLOR: '1',
    };

    // On Windows, we need shell: false to avoid cmd.exe wrapper
    // On Unix, we could use pty for proper terminal emulation, but for cross-platform
    // simplicity we use plain stdio and accept minor formatting differences
    this.childProcess = cp.spawn(cliPath, args, {
      cwd: this.options.cwd || process.cwd(),
      env: env as NodeJS.ProcessEnv,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (!this.childProcess.stdout || !this.childProcess.stderr || !this.childProcess.stdin) {
      this.writeToTerminal('\r\n❌ Failed to spawn Copilot CLI (no stdio)\r\n');
      this.closeEmitter.fire(1);
      return;
    }

    // Wire up stdout
    this.childProcess.stdout.on('data', (data: Buffer) => {
      const text = data.toString('utf-8');
      this.writeToTerminal(text);
      this.processOutput(text);
    });

    // Wire up stderr
    this.childProcess.stderr.on('data', (data: Buffer) => {
      const text = data.toString('utf-8');
      this.writeToTerminal(text);
      this.processOutput(text);
    });

    // Handle process exit
    this.childProcess.on('exit', (code, signal) => {
      this.setState('closed');
      if (code !== null && code !== 0) {
        this.writeToTerminal(`\r\n❌ Copilot CLI exited with code ${code}\r\n`);
      }
      this.closeEmitter.fire(code ?? undefined);
    });

    // Handle spawn errors
    this.childProcess.on('error', (err: Error) => {
      this.writeToTerminal(`\r\n❌ Failed to spawn Copilot CLI: ${err.message}\r\n`);
      this.setState('closed');
      this.closeEmitter.fire(1);
    });
  }

  // -- Output processing and state detection ---------------------------------

  private writeToTerminal(text: string): void {
    // Convert LF to CRLF for proper terminal rendering
    const normalized = text.replace(/\r?\n/g, '\r\n');
    this.writeEmitter.fire(normalized);
  }

  private processOutput(chunk: string): void {
    this.outputBuffer += chunk;

    // Keep only last 4KB to avoid memory growth
    if (this.outputBuffer.length > 4096) {
      this.outputBuffer = this.outputBuffer.slice(-4096);
    }

    this.detectSessionId();
    this.detectState();
  }

  private detectSessionId(): void {
    if (this.sessionId) return; // Already detected

    const match = this.outputBuffer.match(PATTERNS.SESSION_ID);
    if (match) {
      this.sessionId = match[1];
      this.options.onSessionIdDetected?.(this.sessionId);
    }
  }

  private detectState(): void {
    const recent = this.outputBuffer.slice(-512); // Look at last 512 chars

    // Check for idle prompts FIRST (strongest signal)
    for (const pattern of PATTERNS.IDLE_PROMPTS) {
      if (pattern.test(recent)) {
        this.setState('idle');
        return;
      }
    }

    // Then check for working markers
    for (const pattern of PATTERNS.WORKING_MARKERS) {
      if (pattern.test(recent)) {
        this.setState('working');
        return;
      }
    }

    // If we see new output but no state markers, assume waiting for input
    if (this.state === 'starting' && recent.length > 10) {
      this.setState('waiting');
    }
  }

  private setState(newState: TerminalState): void {
    if (this.state === newState) return;
    this.state = newState;
    this.options.onStateChange?.(newState);
  }

  // -- Public API: status injection ------------------------------------------

  /**
   * Inject a status line into the terminal output.
   * This overlays a message without sending it to the child process.
   */
  injectStatus(message: string): void {
    const formatted = `\r\n\x1b[2m${message}\x1b[0m\r\n`; // Dim text
    this.writeEmitter.fire(formatted);
  }

  getState(): TerminalState {
    return this.state;
  }

  getSessionId(): string | undefined {
    return this.sessionId;
  }

  isRunning(): boolean {
    return this.childProcess !== undefined && !this.childProcess.killed;
  }
}

// ---------------------------------------------------------------------------
// Factory function for integration with TerminalManager
// ---------------------------------------------------------------------------

export function createCopilotTerminal(options: PseudoterminalOptions): vscode.Terminal {
  const pty = new CopilotPseudoterminal(options);
  
  return vscode.window.createTerminal({
    name: options.name,
    pty,
  });
}
