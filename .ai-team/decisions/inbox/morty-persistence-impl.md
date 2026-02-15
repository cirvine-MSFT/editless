# Decision: Orphan TTL uses rebootCount, not wall-clock time

**By:** Morty (Extension Dev), issue #53  
**Date:** 2025-07-19

## What

Orphan eviction uses a `rebootCount` integer (incremented each reconciliation cycle) rather than a wall-clock TTL timestamp. Entries are auto-cleaned after `rebootCount >= 2` — meaning they survived two full reload cycles without matching a live terminal.

## Why

Wall-clock TTL is unreliable for VS Code extensions because the extension host sleeps between reloads. A 24-hour TTL could evict a legitimate session that was simply part of a weekend break, while a short TTL could fire during a single long reload cycle. Counting reload cycles is deterministic and maps directly to the intent: "this terminal didn't come back after two chances."

## Impact

- `PersistedTerminalInfo` gains `lastSeenAt` (timestamp, for future diagnostics) and `rebootCount` (integer, for eviction logic).
- Existing persisted data without these fields is safely handled via nullish coalescing defaults.
- The `MAX_REBOOT_COUNT` constant (2) is a static on `TerminalManager` — easy to make configurable later if needed.
