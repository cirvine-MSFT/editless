# Session Log: Bug Investigation — 2026-02-16

**Requested by:** Casey Irvine

## Summary

Investigation into session state misclassification and team decision merging. Two significant discoveries: a design issue in terminal state heuristics, and critical decision coordination across the team.

## Work Completed

### Morty — Terminal Session State Investigation

**Issue:** Terminals display `waiting-on-input` (bell-dot icon) for every session within 5 minutes of command completion, even when genuinely idle.

**Root Cause:** `getSessionState()` in `src/terminal-manager.ts:336-365` conflates "recent activity" with "waiting for user input." The heuristic:
1. If `_shellExecutionActive` → `working` ✅
2. If no `_lastActivityAt` → `idle` ✅  
3. If `_lastActivityAt` within 5 min → **`waiting-on-input`** ← wrong default
4. If `_lastActivityAt` 5–60 min → `idle`
5. If `_lastActivityAt` > 60 min → `stale`

When a command finishes normally, `_shellExecutionActive` becomes `false` and `_lastActivityAt = Date.now()`, triggering the false-positive `waiting-on-input` for up to 5 minutes.

**Why It's a Design Issue:**
The VS Code shell integration API signals only that execution ended, not whether the process is waiting for user input. Both "command finished" and "agent asking a question" produce identical signals. No positive signal exists for input-waiting scenarios.

**Additional Trigger:** Session persistence restore on reconcile restores `_lastActivityAt` from persisted data, which always has `lastSeenAt = Date.now()` at persist time, causing false positives after reload.

**Recommended Fix:** Default to `idle` after execution ends; introduce a separate `_waitingOnInput` signal for genuine input scenarios. Option 1 (invert default + new signal) is cleanest.

**Files Involved:**
- `src/terminal-manager.ts:336-365` — `getSessionState()` logic
- `src/terminal-manager.ts:81-90` — shell execution event handlers
- `src/terminal-manager.ts:447-449` — reconcile `_lastActivityAt` restore
- `src/__tests__/terminal-manager.test.ts:939-956` — tests codifying wrong behavior
- `src/editless-tree.ts:278-294` — tree items displaying state

### Summer — Documentation & Architecture

**Completed:**
- Architecture documentation (`docs/architecture.md`)
- Settings reference (`docs/settings.md`)
- Agent file format guide (`docs/agent-file-format.md`)
- Story style review (`docs/story.md`)
- PR #225 ready for merge

### Decision Filing

**Issue #226 (Session State Default):** Filed by Casey Irvine  
**Issue #227 (Tree Item ID Collisions):** Filed by Casey Irvine

Both issues escalate findings from investigation and triage sessions.

## PRs Status

- **PR #224** (Squad state sync) — Set to auto-merge
- **PR #225** (Summer docs) — Set to auto-merge

## Cross-Team Coordination

Morty's investigation findings were documented as a formal decision (merged into `decisions.md` from inbox). This enables other team members (Rick, Birdperson, Meeseeks) to understand the terminal state design constraints before they work on related areas.

## Notes

- The terminal state issue is P2 (cosmetic but misleading UX) but has architectural implications for future input detection
- Session persistence audit is ongoing; see related issue #94
- The `_waitingOnInput` signal is a future enhancement — not blocking v0.1
