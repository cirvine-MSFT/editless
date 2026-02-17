# Decision: Event-driven refresh default interval and debounce strategy

**By:** Morty (Extension Dev)
**Date:** 2026-02-16
**Issue:** #240

## What

- Default `editless.refreshInterval` changed from 5 minutes to 1 minute.
- Event-driven refresh triggers added: terminal close, shell execution end, git task completion.
- All event-driven triggers share a 2-second debounce to coalesce rapid-fire events.
- Auto-refresh logic extracted from `extension.ts` into `src/auto-refresh.ts`.

## Why

The 5-minute polling interval made Work Items and PRs feel stale. Agent workflows create/close issues and PRs frequently — when an agent finishes work (terminal closes) or a git push happens, the tree should reflect reality within seconds, not minutes.

The 2-second debounce balances responsiveness with API rate limits. Multiple terminals closing during a batch operation (e.g., squad upgrade) coalesce into a single refresh instead of N concurrent `gh` calls.

## Impact

- `editless.refreshInterval` setting default changed — existing users with the default will now poll every 60s instead of 300s.
- `vscode.tasks.onDidEndTask` is a newer VS Code API — any mock of `vscode` in tests must include `tasks.onDidEndTask`.
