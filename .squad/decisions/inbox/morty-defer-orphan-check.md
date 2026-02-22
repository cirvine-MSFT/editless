# Decision: Defer orphan check until terminal matching settles

**Date:** 2026-02-23
**Author:** Morty
**Status:** Implemented

## Context

On window reload, `reconcile()` registers a debounced `onDidOpenTerminal` listener (200ms) because VS Code provides terminals lazily. But the orphan check in `extension.ts` ran synchronously right after `reconcile()`, before late-arriving terminals could be matched. This caused false-positive "Resume All" toasts that launched duplicate terminals.

## Decision

Added `TerminalManager.waitForReconciliation()` — a Promise that resolves when either (a) all pending saved entries are matched, or (b) a 2s max timeout expires. Extension.ts now defers the orphan toast behind this promise.

## Impact

- Any future code that reads `_pendingSaved` or `getOrphanedSessions()` after `reconcile()` should await `waitForReconciliation()` first
- The `dispose()` method cleans up the reconciliation timer
- Test mocks for TerminalManager must include `waitForReconciliation: vi.fn().mockResolvedValue(undefined)`
