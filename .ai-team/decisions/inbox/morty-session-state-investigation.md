# Session State: `waiting-on-input` Misclassification

**By:** Morty (Extension Dev)
**Type:** Design Issue
**Severity:** P2 — cosmetic but misleading UX
**Filed:** Investigation for Casey Irvine

## Problem

Terminal sessions display `waiting-on-input` (bell-dot icon, "waiting on input" description) when they are actually idle. This happens for **every session** within 5 minutes of any command finishing.

## Root Cause

`getSessionState()` in `src/terminal-manager.ts:336-365` uses a heuristic that conflates "recent activity" with "waiting for user input." The logic:

1. `_shellExecutionActive = true` → `working` ✅
2. No `_lastActivityAt` → `idle` ✅
3. `_lastActivityAt` within 5 min → **`waiting-on-input`** ← wrong default
4. `_lastActivityAt` 5–60 min → `idle`
5. `_lastActivityAt` > 60 min → `stale`

The `_lastActivityAt` timestamp is set by both `onDidStartTerminalShellExecution` (line 83) and `onDidEndTerminalShellExecution` (line 88). When a command completes normally, `_shellExecutionActive` becomes `false` and `_lastActivityAt` becomes `Date.now()` — which satisfies the "within 5 min" condition, returning `waiting-on-input` for up to 5 minutes after every command.

## Why It's a Design Issue (Not a Bug)

The VS Code shell integration API (`onDidEndTerminalShellExecution`) signals that a command finished — it does **not** signal whether the process is now waiting for user input or sitting at an idle prompt. Both scenarios produce identical signals:

- `_shellExecutionActive = false`
- `_lastActivityAt = recent`

There is no positive signal for "the agent is asking a question." The heuristic assumes recent activity without execution means input is needed, but it actually just means a command recently finished.

## Additional Trigger: Persistence Restore

On reconcile (line 449), `_lastActivityAt` is restored from `persisted.lastActivityAt ?? persisted.lastSeenAt`. Since `lastSeenAt` is always `Date.now()` at persist time (line 500), a session that was persisted within the periodic 30s interval and then restored will show `waiting-on-input` until the 5-minute window expires.

## Recommended Fix

**Default to `idle` after execution ends; only show `waiting-on-input` when a positive signal exists.**

Options (pick one):
1. **Invert the default:** Change line 358 from `'waiting-on-input'` to `'idle'`. Then introduce a separate `_waitingOnInput` signal set by scanner/session-context when the agent is genuinely asking a question.
2. **Terminal output parsing:** Extend the scanner to detect prompt patterns (e.g., `? `, `(y/n)`, `Press Enter`) in recent terminal output and only then return `waiting-on-input`.
3. **Reduce the window:** Shrink `IDLE_THRESHOLD_MS` to 10–30 seconds. This is a band-aid — it shrinks the false-positive window but doesn't eliminate it.

Option 1 is the cleanest. The tests at lines 939-956 would need updating — they currently assert `waiting-on-input` immediately after execution ends.

## Files Involved

- `src/terminal-manager.ts:336-365` — `getSessionState()` logic
- `src/terminal-manager.ts:81-90` — shell execution event handlers
- `src/terminal-manager.ts:447-449` — reconcile `_lastActivityAt` restore
- `src/__tests__/terminal-manager.test.ts:939-956` — test that codifies the current (wrong) behavior
- `src/editless-tree.ts:278-294` — tree items that display the state
