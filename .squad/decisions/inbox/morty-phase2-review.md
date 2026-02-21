# Phase 2 Terminal Integration — Code Review

**Author:** Morty (Extension Dev)  
**Date:** 2026-02-21  
**Verdict:** APPROVE (with 2 advisory notes)

## Scope Reviewed

- `src/terminal-manager.ts` — launchTerminal, focusTerminal, reconnectSession, relaunchSession, dispose
- `src/session-context.ts` — watchSession, watchSessionDir, isSessionResumable

## Findings

### ✅ Correct

1. **Pre-generated UUID** (`terminal-manager.ts:109`): `crypto.randomUUID()` generates session ID before terminal creation — eliminates orphan detection race.
2. **TerminalOptions** (`terminal-manager.ts:122-132`): `isTransient: true` correctly prevents zombie terminals surviving window reload. `iconPath: new ThemeIcon('terminal')` is a valid built-in icon. `env` record is properly typed.
3. **sendText before show()** maintained in all 3 paths: `launchTerminal` (line 160-161), `relaunchSession` (line 338-347), `reconnectSession` (no sendText needed — terminal already running).
4. **focusTerminal overload** (`terminal-manager.ts:212-238`): String ID lookup iterates `_terminals` map, validates terminal is alive via `vscode.window.terminals.includes()`. Clean fallthrough with console.warn.
5. **File watching** (`session-context.ts:161-246`): `fs.watch` with `{ persistent: false }` is correct — won't prevent Node.js exit. 100ms debounce prevents rapid-fire callbacks. Tail-read strategy (last 2048 bytes) is efficient.
6. **Resource cleanup**: `onDidCloseTerminal` (line 77-80) disposes watcher + removes from map. `dispose()` (line 612-627) clears all watchers, timers, disposables. Double-dispose is safe — `Map.delete` is idempotent, `clearTimeout` on undefined is a no-op.
7. **TypeScript quality**: No `any` in production code. All callback types are properly inferred. `Disposable` interface in session-context.ts avoids coupling to vscode module.
8. **Test coverage**: 99 terminal-manager tests + 38 session-context tests, all passing. Phase 2 features specifically covered: UUID pre-generation, env vars, isTransient, focusTerminal string overload, watchSession lifecycle, debounce behavior, dispose cleanup.

### ⚠️ Advisory (non-blocking)

1. **Soft validation in relaunchSession** (`terminal-manager.ts:304-308`): When `isSessionResumable()` returns `{ resumable: false }`, the code shows an error message but continues to create the terminal and send `--resume`. The CLI will fail gracefully, but this means the user sees two error signals (our toast + CLI error). Consider early-returning or asking for confirmation. **Not blocking** because the CLI handles its own error path.

2. **Unbounded retry in watchSession** (`session-context.ts:218-224`): If `events.jsonl` never appears, `setupWatch()` calls itself every 1s forever until `dispose()`. In practice, this is bounded by the terminal lifecycle (watcher is disposed on terminal close), so it's not a resource leak. But a retry cap (e.g., 30 attempts = 30s) or exponential backoff would be more defensive. **Not blocking** because terminal close always triggers cleanup.

### Platform note

`fs.watch` behavior differs across platforms: on macOS it uses kqueue (file-level events), on Linux inotify (may miss rapid writes), on Windows ReadDirectoryChangesW (reliable). The 100ms debounce mitigates platform differences. No action needed.

## Verdict

**APPROVE** — Implementation is correct, well-tested, and follows established patterns. The two advisory notes are minor hardening opportunities for a future pass.
