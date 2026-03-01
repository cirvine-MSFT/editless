# Debounce Pattern for TerminalManager Change Events

**Author:** Morty  
**Date:** 2026-02-28  
**Issue:** #438  
**PR:** #439

## Decision

All `TerminalManager._onDidChange.fire()` calls are now routed through a 50ms debounced `_scheduleChange()` method. The `treeView.reveal()` call in `onDidChangeActiveTerminal` is separately debounced at 100ms.

## Rationale

During active terminal sessions, rapid-fire events (shell execution start/end, session watcher callbacks, reconciliation) caused the tree to rebuild multiple times per frame. The `reveal()` call would race with these rebuilds, resulting in stale or missed selections. Batching events into a single 50ms window eliminates redundant rebuilds, and the 100ms reveal delay ensures the tree has settled before selection.

## Impact

- Any new code that needs to signal a tree change in TerminalManager should call `this._scheduleChange()` instead of `this._onDidChange.fire()`.
- Tests asserting synchronous fire behavior must use `vi.useFakeTimers()` + `vi.advanceTimersByTime(50)`.
