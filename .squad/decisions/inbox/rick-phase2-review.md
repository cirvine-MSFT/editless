# Phase 2 Terminal Integration — Architecture Review

**Date:** 2026-02-21
**Status:** REQUEST CHANGES
**Author:** Rick (Lead)
**Scope:** terminal-manager.ts, session-context.ts

## Required Change

### `relaunchSession` must abort on non-resumable sessions

**File:** `terminal-manager.ts:296-314`

`relaunchSession()` calls `isSessionResumable()` and shows an error message when `resumable: false`, but does **not** return early. The method proceeds to create a terminal and send `--resume <id>`, which will fail at the CLI level. Users see both an error toast and a terminal that immediately errors out.

**Fix:** Add `return` after `showErrorMessage`, or restructure to guard terminal creation behind `check.resumable`.

## Advisories (non-blocking)

1. **SessionContextResolver needs a `dispose()` method** — owns `_fileWatchers` and `_watcherPending` maps with no bulk cleanup. TerminalManager covers its own watchers, but retry timers from `setupWatch()` could fire post-deactivation.

2. **Unbounded retry in `setupWatch()`** — retries every 1s forever. Recommend max ~30 retries.

3. **`watchSessionDir` is dead code** — defined and tested but never called from production. Acceptable as forward-looking Phase 3 API.

## What's Approved

- Module boundary: session-context.ts is pure Node.js ✅
- Watcher lifecycle management in TerminalManager ✅
- Pre-generated UUID via crypto.randomUUID() ✅
- TerminalOptions (isTransient, env vars, icon) ✅
- focusTerminal string overload with liveness check ✅
- Debounced fs.watch with tail reading ✅
- buildCopilotCommand integration with --resume ✅
