# Decision: Multi-signal terminal reconciliation

**By:** Morty (Extension Dev), issue #84
**Date:** 2025-07-20

## What

Terminal reconciliation now uses a 4-stage matching strategy instead of exact `terminal.name` comparison:

1. Exact match on `terminalName` (the last-known name)
2. Exact match on `originalName` (the name from `createTerminal()`, never mutates)
3. Exact match on `displayName` (the user-facing label)
4. Contains match — `terminal.name.includes(originalName)` or `terminalName.includes(terminal.name)`

Stages run globally across all persisted entries — higher-confidence matches claim terminals before fuzzy matches get a chance. A `Set<vscode.Terminal>` tracks claimed terminals to prevent double-assignment.

## Why

`terminal.name` is mutable — CLI processes can rename it via escape sequences, and VS Code may restore with a different name after reload. The old exact-match strategy created false orphans and silently dropped entries when names collided. The staged approach maximizes reconnection success while preserving correctness (exact matches always win over fuzzy ones).

## Impact

- `PersistedTerminalInfo` gains optional `originalName` field (backward-compatible — defaults to `displayName` when missing)
- `TerminalInfo` gains required `originalName: string`
- `reconnectSession()` is a new public method on `TerminalManager` — searches live terminals before creating duplicates
- `relaunchSession()` now tries reconnect first, only creates a new terminal if no match found
