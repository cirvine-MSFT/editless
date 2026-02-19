# Session Log: 2026-02-19-remove-terminal-layout

**Requested by:** Casey Irvine  
**Session date:** 2026-02-19

## Summary

Morty removed the terminal layout restore feature (#309) — deleted `terminal-layout.ts` and its test, unwired from `extension.ts`, removed `editless.restoreTerminalLayout` setting from package.json, cleaned up test mocks. All tests pass. Draft PR #320 opened.

## Status

Complete. Ready for review.
