# Session: 2026-02-17 Context Menus and Discovery

**Requested by:** Casey Irvine

## Summary

Casey reported two P0 bugs with Discovered Agents (wrong scan directory, stale hide/refresh). @copilot fixed both in PR #263 (auto-merge enabled). Casey then requested context menu improvements for work items and PRs. Morty implemented: removed misleading "Go to PR" from work items, added "Go to Work Item", added "Launch with Agent" and "Go to PR" for PRs. PR #266 created with auto-merge.

## Decisions Generated

- Context Menu Commands: Suppress in Command Palette (Morty, #265)
- VSCE_PAT is not an internal term (Birdperson, #42)
