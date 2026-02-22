# Terminal Constants Bumped (#328)

**Date:** 2026-02-21
**Author:** Morty
**Status:** Implemented

## Changes

| Constant | File | Old | New | Rationale |
|---|---|---|---|---|
| `EVENT_CACHE_TTL_MS` | session-context.ts | 3s | 10s | Reduce disk I/O from events.jsonl reads |
| `STALE_SESSION_DAYS` | session-context.ts | 7 | 14 | Sessions stay resumable longer |
| `MAX_REBOOT_COUNT` | terminal-manager.ts | 2 | 5 | Orphans survive more restarts before eviction |
| `isWorkingEvent()` | terminal-manager.ts | 5 types | 9 types | Added assistant.thinking, assistant.code_edit, tool.result, session.resume |

## Notes

- `IDLE_THRESHOLD_MS` and `STALE_THRESHOLD_MS` no longer exist — removed in PR #354 (session state simplification to 3-state model).
- These constants may become moot if pseudoterminal (#321) changes the state detection architecture, as noted in the issue.
