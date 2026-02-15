# Session State Detection Implementation (#50)

**By:** Morty (Extension Dev)
**Date:** 2025-07-18
**Issue:** #50

## What

Implemented rich session state detection for terminal sessions using VS Code shell integration APIs. Sessions now show granular state: `active`, `idle`, `stale`, `needs-attention`, or `orphaned`.

## How

1. **Shell Integration**: Subscribed to `onDidStartTerminalShellExecution` and `onDidEndTerminalShellExecution` events to track when commands are running
2. **Activity Tracking**: Maintain `_shellExecutionActive` and `_lastActivityAt` maps per terminal
3. **State Computation**: `getSessionState()` method determines state based on:
   - Execution active → `active`
   - Recent activity (<5 min) → `active`
   - Activity 5-60 min → `idle`
   - Activity >60 min → `stale`
   - Inbox items + not active → `needs-attention`
   - No live terminal → `orphaned`
4. **Tree View**: Icons and descriptions update based on state via `getStateIcon()` and `getStateDescription()` helpers

## Technical Decisions

### Time Thresholds
- **Idle threshold**: 5 minutes (IDLE_THRESHOLD_MS)
- **Stale threshold**: 60 minutes (STALE_THRESHOLD_MS)
- These are constants for now, easy to make configurable later if needed

### Needs-Attention Logic
- Overrides `idle` and `stale` but NOT `active`
- Don't interrupt actively working agents with needs-attention notifications
- Checked per-squad via `inboxCount` passed from tree provider

### Icon Mapping
- `active` → `debug-start` (green circle)
- `needs-attention` → `warning` (orange/red triangle)
- `orphaned` → `debug-disconnect` (dimmed)
- `idle` / `stale` → `terminal` (default)

### Helper Functions Exported
- `getStateIcon(state: SessionState): ThemeIcon`
- `getStateDescription(state: SessionState, lastActivityAt?: number): string`
- Exported for tree view use and testability

## Why

Users need to know at a glance which sessions are actively working, which are idle, and which need attention. Shell integration events provide reliable, low-overhead detection without polling. The 5-minute and 60-minute thresholds match typical workflow patterns (quick tasks vs. long-running builds).

## Breaking Change

Requires VS Code 1.93+ (released 18 months ago, 85-95% adoption). Updated `engines.vscode` in package.json from `^1.100.0` to `^1.93.0`.

## Future Enhancements

- Make time thresholds configurable via settings
- Add tooltip showing last command executed (would require shell integration execution event data)
- Consider visual indicator for long-running commands (>5 min active)
