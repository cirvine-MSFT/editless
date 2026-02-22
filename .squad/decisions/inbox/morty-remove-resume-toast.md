# Decision: Remove "Resume All" toast from activation

**Author:** Morty (Extension Dev)
**Date:** 2025-07-25
**Requested by:** Casey Irvine

## Context

On activation, EditLess showed a toast notification when orphaned sessions were found, offering "Resume All" / "Dismiss" buttons. Casey flagged two problems:

1. **UX pressure** — a toast creates urgency for immediate action, which isn't appropriate during startup.
2. **Race conditions** — the toast could fire before terminal reconciliation fully settled, leading to stale orphan counts.

## Decision

- Removed the `waitForReconciliation()` → `showInformationMessage` block from `activate()` in `src/extension.ts`.
- Orphaned sessions now appear silently in the tree view. Terminals that reconnect during reconciliation auto-reattach. Users can resume individual orphans from the tree or use the `editless.relaunchAllOrphans` command from the palette.
- The `waitForReconciliation()` method is preserved in `terminal-manager.ts` for future use.
- The `editless.relaunchAllOrphans` command registration is preserved (tree context menu / command palette).

## Impact

- No user-facing notification on activation. Orphans are discoverable via the tree view.
- All 793 tests pass. Lint clean.
