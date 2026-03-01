# Decision: Multi-line tail analysis for event detection

**Date:** 2026-02-23
**Author:** Morty
**Issue:** #402

## Context

The Copilot CLI emits tool calls in parallel. When `ask_user` is called alongside `report_intent`, the last event in `events.jsonl` could be `report_intent`'s `tool.execution_complete` — masking the open `ask_user` start. This broke the attention icon.

## Decision

Parse ALL lines from the 2KB tail chunk (not just the last line) in both `getLastEvent()` and `watchSession()`. Track open `ask_user` tool calls via a `Set<string>` of `toolCallId`s. Expose a computed `hasOpenAskUser` boolean on `SessionEvent`. `isAttentionEvent()` now checks this flag instead of the event type.

## Impact

- `SessionEvent` interface has two new optional fields: `toolCallId` and `hasOpenAskUser`
- The malformed JSON behavior changed: corrupt trailing lines are now skipped (resilient), and the last valid parsed line is used instead of silently dropping the event
- Any future code that needs to detect open tool calls can extend the same `Set` tracking pattern
