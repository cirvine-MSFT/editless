# Pseudoterminal Spike — Issue #321

**Author:** Jaguar (Copilot SDK Expert)  
**Date:** 2026-02-20  
**Status:** Complete  
**Type:** Investigation Spike (time-boxed)

## Executive Summary

✅ **Recommendation: ADOPT pseudoterminal as default for Copilot CLI sessions.**

Pseudoterminals (ExtensionTerminal with `vscode.Pseudoterminal`) provide full I/O control that eliminates all four foundational issues with standard terminals:

1. ✅ **Real-time I/O access** — Read stdout/stderr, write status overlays
2. ✅ **No sendText race** — Direct control over process lifecycle
3. ✅ **State detection** — Parse output patterns (idle/working/waiting)
4. ✅ **Session ID detection** — Extract session ID from CLI startup output

The loss of shell features (tab completion, oh-my-posh, shell history) is **acceptable** for Copilot CLI sessions because:
- Copilot CLI is an interactive tool, not a shell (has its own `/` command REPL)
- Users retain their full shell experience in other VS Code terminals
- The reliability and control gains far outweigh the shell convenience losses

## Prototype Results

### What Works ✅

1. **Full I/O Control**
   - Captured stdout/stderr in real-time via event streams
   - Wrote status messages directly to terminal display without affecting child process
   - No shell integration APIs needed

2. **Session ID Detection**
   - Reliably extracted session IDs from CLI output using regex patterns
   - Pattern: `/Session ID:\s*([a-f0-9-]+)/i`
   - Detected on first occurrence, ignored duplicates

3. **State Detection**
   - Implemented pattern-based state machine with 5 states: starting, idle, working, waiting, closed
   - Idle detection: Prompt patterns (`>`, `copilot>`, `[project]>` at end of buffer)
   - Working detection: Tool execution markers (`🔧 Running tool:`, `Executing:`)
   - Buffer management: Rolling 4KB window to prevent memory growth

4. **Process Lifecycle**
   - Ctrl+C forwarding: Intercepts `\x03` (ASCII 0x03) and sends SIGINT to child
   - Graceful shutdown: SIGINT → 1s timeout → SIGKILL fallback
   - Exit code capture: `onDidClose` event fires with process exit code
   - Error handling: Spawn failures reported to terminal with error overlay

5. **Terminal Rendering**
   - Line ending normalization: LF → CRLF for proper terminal display
   - ANSI escape codes: Dim text (`\x1b[2m`) for status messages
   - Resize forwarding: `setDimensions` hook (no-op on Windows, automatic on Unix with pty)

6. **Environment Variables**
   - Custom env vars merged with `process.env` and passed to child
   - Terminal env vars set: `TERM=xterm-256color`, `NO_COLOR=1`
   - Ready for squad context injection (e.g., `SQUAD_ID`, `SQUAD_PATH`)

### What Doesn't Work ⚠️

1. **Shell Features (Expected)**
   - ❌ No tab completion (shell's job)
   - ❌ No oh-my-posh/starship custom prompts (shell initialization)
   - ❌ No shell history (up/down arrows)
   - ❌ No shell aliases or PATH resolution beyond what `child_process.spawn` provides

   **Why this is acceptable:** Copilot CLI doesn't need these. It's not a shell — it's a stateful REPL with `/help`, `/rename`, etc. Users who want shell features should use regular terminals for shell work.

2. **Cross-Platform PTY** (Known Limitation)
   - Current implementation uses `stdio: ['pipe', 'pipe', 'pipe']` for cross-platform compatibility
   - True PTY (`pty: true` in spawn options or node-pty library) would provide better terminal emulation but adds complexity
   - Tested with stdio pipes — works reliably on Windows and Unix

3. **SIGWINCH on Windows** (Platform Limitation)
   - `setDimensions` doesn't forward resize events to child process on Windows (OS limitation)
   - Child processes on Windows don't receive SIGWINCH signals
   - Not critical: Copilot CLI output is mostly text-based, not TUI

### Risks & Mitigations 🛡️

| Risk | Severity | Mitigation |
|------|----------|-----------|
| State detection patterns drift from CLI changes | Medium | Monitor CLI release notes, add pattern tests, provide fallback heuristics |
| Session ID format changes | Low | Use flexible regex, validate with integration tests |
| User expects shell tab completion | Low | Document in UI ("Copilot session, not shell"), provide `/help` discovery |
| Spawn failures (CLI not in PATH) | Medium | Detect in `cli-provider.ts`, show clear error with install link |
| Line ending issues on Unix | Low | Tested normalization (LF → CRLF), add integration tests |

## Migration Path from terminal-manager.ts

### Phase 1: Parallel Implementation (1-2 days)

1. **Keep existing `TerminalManager.launchTerminal()`**
   - No changes to current API
   - Add feature flag: `editless.cli.usePseudoterminal` (default: false)

2. **Add `createCopilotTerminal()` factory**
   - New export from `copilot-pseudoterminal.ts`
   - Returns `vscode.Terminal` with pseudoterminal backing
   - Called conditionally from `TerminalManager.launchTerminal()` when flag is enabled

3. **Wire up callbacks**
   ```typescript
   const terminal = createCopilotTerminal({
     name: displayName,
     cwd: config.path,
     args: parseCliArgs(config.launchCommand),
     onStateChange: (state) => {
       // Update TerminalManager._shellExecutionActive
       this._shellExecutionActive.set(terminal, state === 'working');
       this._onDidChange.fire();
     },
     onSessionIdDetected: (sessionId) => {
       // Update TerminalManager.setAgentSessionId
       this.setAgentSessionId(terminal, sessionId);
     },
   });
   ```

### Phase 2: Deprecate Shell Integration (2-3 days)

1. **Remove dependencies on:**
   - `vscode.window.onDidStartTerminalShellExecution`
   - `vscode.window.onDidEndTerminalShellExecution`
   - `SessionContextResolver.getLastEvent()` polling

2. **Replace with:**
   - Direct state from `CopilotPseudoterminal.getState()`
   - Session ID from `onSessionIdDetected` callback

3. **Update `TerminalManager.getSessionState()`:**
   ```typescript
   getSessionState(terminal: vscode.Terminal): SessionState {
     const pty = this._pseudoterminals.get(terminal);
     if (pty) {
       const state = pty.getState();
       return state === 'working' ? 'active' : 'inactive';
     }
     // Fallback for non-pseudoterminal sessions
     return this._shellExecutionActive.get(terminal) ? 'active' : 'inactive';
   }
   ```

### Phase 3: Flip Default & Stabilize (1 week)

1. **Change default to `usePseudoterminal: true`**
2. **Validate with dogfooding:**
   - Session rename (#277) — resolved (no sendText race)
   - Session detection (#326) — resolved (direct session ID from output)
   - State tracking (#322, #323, #324) — resolved (pattern-based detection)
3. **Remove fallback code after 1-2 releases**

## Acceptance Criteria — Results

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Can read CLI stdout/stderr in real-time? | ✅ YES | `CopilotPseudoterminal.onDidWrite` captures all output |
| Can inject status lines? | ✅ YES | `injectStatus()` writes dim text without affecting child |
| Can detect state (idle/working/waiting)? | ✅ YES | Pattern matching on prompt/tool markers in output buffer |
| Can detect session ID? | ✅ YES | Regex extraction from startup output, callback fires once |
| Does Ctrl+C work? | ✅ YES | `handleInput('\x03')` sends SIGINT to child process |
| Does terminal resize work? | ⚠️ PARTIAL | `setDimensions` hook exists, no-op on Windows (not critical) |

## Key Files

- **Prototype:** `src/copilot-pseudoterminal.ts` (264 lines)
- **Tests:** `src/__tests__/copilot-pseudoterminal.test.ts` (30 tests, 100% pass)
- **Integration point:** `src/terminal-manager.ts` (line 100-106, `launchTerminal()`)
- **CLI args:** `src/cli-settings.ts` (parse launch command into args array)

## References

- **VS Code API:** `vscode.Pseudoterminal` interface (stable since 1.40)
- **Node.js:** `child_process.spawn()` with stdio pipes
- **Related issues:** #277 (sendText race), #322 (state detection), #323 (exit codes), #324 (resume detection), #326 (session ID)
- **Copilot CLI:** Session state in `~/.copilot/session-state/{sessionId}/workspace.yaml`

## Recommendation Rationale

**Why adopt:**
1. Eliminates 4 foundational issues with standard terminals (I/O access, sendText race, state detection, session ID)
2. Provides architectural foundation for future features (progress overlays, interactive debugging, session replay)
3. No user-facing downside — Copilot CLI users don't expect shell features
4. Clear migration path with feature flag and parallel implementation

**Why not stay with standard terminals:**
1. Shell integration APIs are insufficient — only provide exit codes, not output or state
2. sendText races are unfixable — shell readiness is unpredictable
3. Session ID detection via filesystem polling is fragile and has race conditions
4. No path forward for progress injection or interactive features

**Decision:** Pseudoterminals are the correct architecture. Proceed with migration.

---

**Next Steps:**
1. Create issue for Phase 1 implementation (#327: "Implement pseudoterminal with feature flag")
2. Update terminal integration plan in `.squad/decisions.md`
3. Add pseudoterminal pattern to `.squad/skills/` if reusable for other extensions
