# ACP Terminal Operations Use child_process.spawn, Not VS Code Terminals

**Decided by:** Morty (Extension Dev)
**Date:** 2026-02-22
**Issue:** #370 (ACP Spike)

## Decision

ACP terminal operations (`terminal/create`, `terminal/output`, `terminal/kill`, etc.) are implemented using `child_process.spawn()` wrapped in a `ProcessPool` class — NOT VS Code Terminal or ExtensionTerminal APIs.

## Rationale

The ACP protocol requires programmatic output capture (stdout/stderr buffering with incremental reads) and exit code tracking. VS Code's Terminal API doesn't expose stdout/stderr — it's a rendering surface, not a pipe. `spawn()` gives us:

- Full stdout/stderr capture as strings
- Synchronous exit code access
- Process tree kill on Windows via `taskkill /T /F /PID`
- No dependency on VS Code UI state (panel can close, processes continue until explicitly cleaned up)

## Impact

- `ProcessPool` is `Disposable` — must be disposed when the ACP session ends to avoid orphaned processes
- `DefaultAcpRequestHandler` owns a `ProcessPool` instance and its `dispose()` method kills all managed processes
- `extension.ts` calls `handler.dispose()` when the ACP panel closes
- File writes (`onWriteTextFile`) auto-approve for now — no permission UI. This is spike scope.
