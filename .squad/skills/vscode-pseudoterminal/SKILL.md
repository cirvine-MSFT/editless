# VS Code Pseudoterminal Pattern

**Category:** VS Code Extension Development  
**Complexity:** Intermediate  
**Prerequisites:** TypeScript, VS Code Extension API, Node.js child_process

## When to Use

Use pseudoterminals (`vscode.window.createTerminal({ pty })`) instead of standard terminals when you need:

1. **Real-time I/O access** — Read stdout/stderr, write custom output
2. **Process lifecycle control** — Spawn, signal, kill without shell interference
3. **State detection** — Parse output patterns to detect application state
4. **Output injection** — Overlay status messages or progress indicators
5. **No shell race conditions** — Direct control eliminates sendText timing issues

**Do NOT use** when:
- Users need shell features (tab completion, history, aliases)
- Output formatting requires full PTY emulation (TUI applications)
- Cross-platform PTY library (node-pty) overhead is acceptable

## Pattern: CopilotPseudoterminal

### 1. Implement vscode.Pseudoterminal

```typescript
import * as vscode from 'vscode';
import * as cp from 'child_process';

export class CopilotPseudoterminal implements vscode.Pseudoterminal {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  private readonly closeEmitter = new vscode.EventEmitter<number | void>();
  
  onDidWrite: vscode.Event<string> = this.writeEmitter.event;
  onDidClose?: vscode.Event<number | void> = this.closeEmitter.event;
  
  private childProcess?: cp.ChildProcess;
  
  open(initialDimensions: vscode.TerminalDimensions | undefined): void {
    this.spawn();
  }
  
  close(): void {
    if (this.childProcess) {
      this.childProcess.kill('SIGINT');
      setTimeout(() => {
        if (this.childProcess && !this.childProcess.killed) {
          this.childProcess.kill('SIGKILL');
        }
      }, 1000);
    }
  }
  
  handleInput(data: string): void {
    if (data === '\x03') { // Ctrl+C
      this.childProcess?.kill('SIGINT');
      return;
    }
    this.childProcess?.stdin?.write(data);
  }
}
```

### 2. Spawn Child Process

```typescript
private spawn(): void {
  this.childProcess = cp.spawn('your-cli', ['args'], {
    cwd: '/path',
    env: { ...process.env, CUSTOM_VAR: 'value' },
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  
  // Wire stdout
  this.childProcess.stdout?.on('data', (data: Buffer) => {
    const text = data.toString('utf-8');
    this.writeToTerminal(text);
    this.processOutput(text); // For state detection
  });
  
  // Wire stderr
  this.childProcess.stderr?.on('data', (data: Buffer) => {
    this.writeToTerminal(data.toString('utf-8'));
  });
  
  // Handle exit
  this.childProcess.on('exit', (code) => {
    this.closeEmitter.fire(code ?? undefined);
  });
}

private writeToTerminal(text: string): void {
  // Convert LF to CRLF for proper terminal rendering
  const normalized = text.replace(/\r?\n/g, '\r\n');
  this.writeEmitter.fire(normalized);
}
```

### 3. State Detection via Pattern Matching

```typescript
private outputBuffer = '';

private processOutput(chunk: string): void {
  this.outputBuffer += chunk;
  
  // Keep rolling window (prevent memory growth)
  if (this.outputBuffer.length > 4096) {
    this.outputBuffer = this.outputBuffer.slice(-4096);
  }
  
  this.detectState();
}

private detectState(): void {
  const recent = this.outputBuffer.slice(-512);
  
  // Check for idle prompt
  if (/>[\s\r\n]*$/.test(recent)) {
    this.setState('idle');
    return;
  }
  
  // Check for working markers
  if (/🔧\s*Running tool:/.test(recent)) {
    this.setState('working');
    return;
  }
}
```

### 4. Status Injection

```typescript
injectStatus(message: string): void {
  // Overlay without sending to child process
  const formatted = `\r\n\x1b[2m${message}\x1b[0m\r\n`; // Dim text
  this.writeEmitter.fire(formatted);
}
```

### 5. Create Terminal

```typescript
export function createCopilotTerminal(options: {
  name: string;
  cwd?: string;
  args?: string[];
  onStateChange?: (state: string) => void;
}): vscode.Terminal {
  const pty = new CopilotPseudoterminal(options);
  
  return vscode.window.createTerminal({
    name: options.name,
    pty,
  });
}
```

## Testing Strategy

### Unit Tests (Mock child_process)

```typescript
vi.mock('child_process', () => ({
  spawn: vi.fn(() => {
    const EventEmitter = require('events').EventEmitter;
    const mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.stdin = { write: vi.fn() };
    mockProcess.kill = vi.fn();
    return mockProcess;
  }),
}));

it('pipes stdout to terminal', () => {
  pty.open({ rows: 24, columns: 80 });
  const output: string[] = [];
  pty.onDidWrite((data) => output.push(data));
  
  mockChildProcess.stdout.emit('data', Buffer.from('Hello\n'));
  
  expect(output.join('')).toContain('Hello');
});
```

### Integration Tests

- Spawn real CLI process (if CLI is available in CI)
- Verify state transitions on known output patterns
- Test Ctrl+C interrupts running process
- Validate exit code capture

## Common Pitfalls

1. **Line Ending Issues**
   - Always normalize LF → CRLF: `text.replace(/\r?\n/g, '\r\n')`
   - Terminal rendering expects CRLF on all platforms

2. **Buffer Memory Growth**
   - Keep rolling window (4KB recommended)
   - State detection should only look at recent output (last 512 chars)

3. **Ctrl+C Not Working**
   - Check for ASCII 0x03: `data === '\x03'`
   - Send SIGINT, not SIGTERM: `kill('SIGINT')`

4. **Process Zombie on Close**
   - Always graceful shutdown: SIGINT → timeout → SIGKILL
   - Dispose event emitters in close()

5. **State Detection False Positives**
   - Order patterns by specificity (idle prompt before working marker)
   - Test with large output dumps to validate rolling window logic

## Trade-offs

| Aspect | Standard Terminal | Pseudoterminal |
|--------|-------------------|----------------|
| I/O Control | ❌ None (shell integration only gives exit codes) | ✅ Full (read/write streams) |
| State Detection | ⚠️ Heuristic (shell execution events) | ✅ Pattern-based (parse output) |
| Shell Features | ✅ Tab completion, history, aliases | ❌ None (direct process control) |
| sendText Race | ❌ Unpredictable (shell readiness varies) | ✅ No race (direct stdin write) |
| Progress Injection | ❌ Not possible | ✅ Overlay messages |
| Complexity | 🟢 Low (built-in) | 🟡 Medium (custom implementation) |

## When Standard Terminals Are Better

- **Shell workflows** — User needs tab completion, shell history, oh-my-posh
- **TUI applications** — Complex terminal control sequences (vim, htop)
- **Zero maintenance** — Don't want to handle process lifecycle, state detection
- **Platform-native behavior** — Want shell's native job control, suspending (Ctrl+Z)

Pseudoterminals are for **CLI tool integration**, not shell replacement.

## References

- **VS Code API:** `vscode.Pseudoterminal` (stable since 1.40)
- **Node.js:** `child_process.spawn()` documentation
- **EditLess:** `src/copilot-pseudoterminal.ts` (reference implementation)
- **Related:** Shell Integration API (complementary for shell-based terminals)

## Related Skills

- `vscode-extension-doc-audit` — Pattern for auditing VS Code APIs
- `editless-dev-workflow` — Local development and testing

---

**Skill Status:** ✅ Production-ready  
**Last Updated:** 2026-02-20 (Jaguar)
