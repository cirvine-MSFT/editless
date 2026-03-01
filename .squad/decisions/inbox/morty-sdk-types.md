# Decision: Official Copilot SDK Event Types

**Date:** 2026-02-23
**Author:** Morty
**Status:** Implemented
**Issue:** #402 / PR #414

## Context

We were using hand-rolled magic strings for Copilot CLI event types (`assistant.ask_user`, `user.ask`, `assistant.code_edit`, `tool.result`) that don't exist in the official `github/copilot-sdk` schema. This caused dead code paths and potential confusion about what events the CLI actually emits.

## Decision

1. Created `src/copilot-sdk-types.ts` as the single source of truth for event type strings, sourced from `github/copilot-sdk` v0.1.8 `session-events.schema.json`.
2. `CopilotEvents` const object provides named constants for the subset we use in state detection — avoids magic strings while keeping imports minimal.
3. `SessionEvent.type` remains `string` (not `CopilotEventType`) so unknown future events don't break parsing.
4. Removed non-official event types: `assistant.ask_user`, `user.ask`, `assistant.code_edit`, `tool.result`.

## Impact

- `isAttentionEvent()` only triggers on `tool.execution_start` with `toolName === 'ask_user'` (the official mechanism).
- `isWorkingEvent()` only references official schema types.
- Future event type additions should update `copilot-sdk-types.ts` first, then reference via `CopilotEvents`.
