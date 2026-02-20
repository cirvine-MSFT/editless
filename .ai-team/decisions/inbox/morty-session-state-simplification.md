# Decision: Simplified Session State Model

**Date:** 2026-02-19  
**Author:** Morty (Extension Dev)  
**PR:** #354  
**Issue:** #302  

## Context

The granular session state model (working, waiting-on-input, idle, stale, orphaned) was identified in the v0.1 retrospective as fundamentally flawed. Four PRs touched state detection logic and it still didn't work reliably. The model combined:
- Time-based thresholds (IDLE_THRESHOLD_MS = 5 minutes, STALE_THRESHOLD_MS = 1 hour)
- events.jsonl parsing via `stateFromEvent()` and `WORKING_EVENT_TYPES`
- Shell execution tracking as a fallback

This created complexity, race conditions, and unreliable state transitions.

## Decision

**Simplify to a 3-state model:** `active`, `inactive`, `orphaned`

### Implementation

**SessionState type:**
```typescript
export type SessionState = 'active' | 'inactive' | 'orphaned';
```

**getSessionState() logic:**
1. If terminal ID is in `_pendingSaved` → return `'orphaned'`
2. If shell execution is running (`_shellExecutionActive.get(terminal) === true`) → return `'active'`
3. Otherwise → return `'inactive'`

**State icons (team-agreed from decisions.md):**
- `active` → `loading~spin` (working state)
- `inactive` → `circle-outline` (idle state)
- `orphaned` → `eye-closed` (stale/disconnected state)

**State descriptions:**
- `active` / `inactive` → relative time since last activity ("just now", "23m", "2h")
- `orphaned` → "previous session"

### What was removed

- `stateFromEvent()` function (~15 lines)
- `WORKING_EVENT_TYPES` set definition (~8 lines)
- `IDLE_THRESHOLD_MS` and `STALE_THRESHOLD_MS` constants (~2 lines)
- events.jsonl-based state inference in `getSessionState()` (~7 lines)
- Granular state icon cases and descriptions (~25 lines)
- ~130 lines of granular state tests (2 entire `describe` blocks)

### What was kept

- `_shellExecutionActive` tracking via onDidStart/EndTerminalShellExecution — this is the core signal
- `_lastActivityAt` tracking — used for relative time display
- `agentSessionId` and `SessionContextResolver` infrastructure — useful for future features
- `session-context.ts` module — does more than just state (session metadata, plan reading)

## Rationale

**Simpler is better:** Shell execution is a reliable, built-in VS Code signal. Time-based thresholds and event parsing added complexity without clear benefit.

**User experience:** The distinction between "idle" and "stale" was not meaningful to users. Active (shell running) vs. inactive (shell idle) is clear and actionable.

**Maintainability:** The new model is ~300 lines shorter (prod + test) and has no magic numbers or event type lists to maintain.

## Impact

- Terminals now show only 3 states in the tree view
- State transitions are immediate and deterministic (no 5-minute or 1-hour thresholds)
- Code is simpler and easier to test
- Future enhancements (e.g., waiting-on-input detection via inbox items) can be layered on top if needed

## Related Decisions

- Terminal Integration audit (decisions.md) — identified state detection as P1 priority
- Terminal UX conventions (decisions.md) — agreed-upon icons for state representation
