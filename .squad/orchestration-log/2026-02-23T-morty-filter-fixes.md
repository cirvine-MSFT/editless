# Orchestration Log — Morty (Filter Bug Fixes)

**Timestamp:** 2026-02-23  
**Task:** Fix 3 Filter Bugs (Level Filter Key Mismatch, Contextual Display, Default Closed Exclusion)  
**Status:** Completed  
**Model:** Claude Sonnet 4.5  
**Duration:** ~1061s  
**Commit:** aa16e90  
**Test Results:** 746 tests passing  

## Summary

Morty completed 3 interrelated filter bugs affecting the hierarchical filter implementation. All bugs traced to the `_cleanNodeId()` utility for stripping the `:f{seq}` suffix introduced in the hierarchical filter design. Filter UI now correctly displays active filters inline and excludes closed/merged items by default.

## Bugs Fixed

### 🐛 Bug 1: Level Filter Key Mismatch (`_cleanNodeId()` Suffix Stripping)

**Symptom:** Level filters (ADO types, GitHub labels) appeared to have no effect—selected filters were ignored.

**Root Cause:** Tree node IDs include `:f{seq}` suffix for hierarchical scoping, but `FilterState.set()`, `FilterState.get()`, `FilterState.clear()`, and `FilterState.lookup()` methods were not stripping this suffix. Keys in the filter map used clean IDs (no suffix), causing set/get mismatches.

**Fix:** Added `_cleanNodeId()` utility to strip `:f{seq}` suffix before all FilterState operations:
- `FilterState.set()` — normalize key before storing
- `FilterState.get()` — normalize key before lookup
- `FilterState.clear()` — normalize key before deletion
- `FilterState.lookup()` — check both clean and suffixed keys for backwards compatibility

**Impact:** ✅ Level filters now correctly apply and persist.

### 🐛 Bug 2: `-filtered` ContextValue Not Applied When Filters Active

**Symptom:** Group nodes should display `-filtered` contextValue suffix and show inline clear button when filters are active, but suffix was never set.

**Root Cause:** Tree builder was not setting contextValue to `{baseValue}-filtered` when `isFiltered()` returned true for a group node.

**Fix:** Modified tree building logic to append `-filtered` suffix to group node contextValue when any filter is active for that level.

**Impact:** ✅ UI now displays filter status visually. Users see inline clear button for active filters.

### 🐛 Bug 3: Closed/Merged Items Not Excluded by Default

**Symptom:** Default filter state included closed work items and merged/closed PRs, cluttering the view.

**Root Cause:** Runtime filter functions (`applyRuntimeFilter`, `applyAdoRuntimeFilter`, `_applyGitHubLevelFilter`, `_applyAdoLevelFilter`) did not enforce default exclusion of closed/merged items when no explicit state/status filter was set.

**Fix:** Added default exclusion logic to all runtime filter functions:
- When no state/status filter explicitly set AND no closed/merged items requested → exclude by default
- Users must explicitly select "Closed", "Merged", etc. in filter to see those items
- Backwards compatible: existing tests updated to explicitly request closed/merged items

**Impact:** ✅ Cleaner default view. Tests now explicitly specify state filters when closed/merged items needed. Decision documented in decisions.md.

## Test Coverage

- **Before:** 733 tests passing
- **After:** 746 tests passing (+13 new tests for filter behavior)
- **Coverage Areas:** Key mismatch resolution, contextValue suffix application, default closed exclusion, backwards compatibility

## Commits

- **aa16e90:** Filter fix: (1) _cleanNodeId() for suffix stripping in FilterState, (2) -filtered contextValue on active group nodes, (3) default exclusion of closed/merged items

## Dependencies & Notes

- Builds on hierarchical filter design (2026-02-23 decision)
- All 3 bugs were blockers for Phase 1 filter completion
- Default closed exclusion decision documented in decisions/inbox/ (merged into decisions.md by Scribe)

## Recommendation

✅ Ready for merge. All bugs fixed, test coverage expanded, and backwards compatibility maintained.
