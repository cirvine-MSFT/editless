# Phase 2 Test Quality Review — REQUEST CHANGES

**Date:** 2026-02-20
**Author:** Meeseeks (Tester)
**Context:** Review of 18 new Phase 2 tests (terminal-manager + session-context) for #323, #324, #326

## Decision

Phase 2 tests need 6 additional tests before approval. The existing 18 tests are well-structured, but session watcher lifecycle is the biggest untested surface area.

## Missing Tests (Priority Order)

### P0 — Must add before merge

1. **`launchTerminal` calls `watchSession` when resolver is set** — The implementation (terminal-manager.ts:152-158) wires up a watcher, but no test verifies `mockResolver.watchSession` was called with the pre-generated UUID.

2. **Watcher cleanup on terminal close** — `onDidCloseTerminal` handler (terminal-manager.ts:77-81) disposes session watchers. No test fires `capturedCloseListener` on a terminal with a watcher and asserts `watcher.dispose()` was called.

3. **`dispose()` clears all session watchers** — `TerminalManager.dispose()` (terminal-manager.ts:619-622) iterates and disposes all watchers. No test verifies this.

4. **Watcher wiring in `reconnectSession` and `relaunchSession`** — Both methods set up watchers (lines 278-284, 365-371) when `agentSessionId` is present, but no test asserts `watchSession` is called during reconnect or relaunch.

### P1 — Should add

5. **`launchTerminal` with custom `config.launchCommand`** — The code has two branches: one appends `--resume UUID` to `config.launchCommand` (line 114), the other calls `buildCopilotCommand` (line 119). Only the default path is tested.

6. **Malformed JSON in `watchSession` `readLastLine`** — If events.jsonl has a corrupt last line, `JSON.parse` throws. The catch block handles it silently (session-context.ts:197), but there's no test verifying graceful degradation.

## What's Good

- `vi.mock('crypto')` uses `importOriginal` correctly for ESM
- All 4 mock resolver locations include both `watchSession` and `watchSessionDir`
- Session-context watcher tests use real `fs.watch` integration with generous 300ms waits
- `focusTerminal` string ID tests cover 4 edge cases well
- `detectSessionIds` correctly tests UUID preservation from `launchTerminal`

## Rationale

The watcher lifecycle is the core new behavior in Phase 2 — setup, cleanup, and disposal. Testing the happy-path data flow (UUID in sendText, env vars) without testing the watcher lifecycle leaves the most failure-prone code path uncovered. FS watchers are a known source of resource leaks if dispose isn't called.
