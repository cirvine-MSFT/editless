# Orchestration Log: Meeseeks — Test Landscape Analysis

**Timestamp:** 2026-02-26T05:15:40Z  
**Agent:** Meeseeks (Tester)  
**Task:** Test landscape analysis for auto-discover refactor  
**Status:** COMPLETE

## Analysis Summary

Comprehensive test inventory and impact assessment for squad auto-discover refactor (Epic #368). Delivered meeseeks-test-landscape.md decision file covering all 930 tests across 29 files with refactor impact analysis and rewrite estimates.

### Test Inventory

**Total tests:** 930 across 29 files (includes `out/integration/` excluded tests)

**Breakdown:**
- **Unaffected:** 707 tests (76%) — No changes needed, run green on refactored code
- **To delete:** 63 tests (7%) — Covered by new discovery flow or no longer relevant
- **To rewrite:** ~160 tests (17%) — Require updates for new architecture/API
- **New tests needed:** ~93 tests (10%) — Cover new watcher logic, debounce, Copilot dir detection

**Estimated post-refactor total:** ~960 tests

### Test File Categories

1. **Core discovery tests** (3 files, ~180 tests)
   - `discover-squads.test.ts` — To rewrite (new discovery model)
   - `discover-agents.test.ts` — To rewrite (new agent discovery)
   - `registry-watcher.test.ts` — To rewrite (new watcher patterns, debounce)

2. **Tree provider tests** (5 files, ~210 tests)
   - Most unaffected (~160 tests)
   - Subtree refresh optimization tests needed (~20 new)
   - Watcher callback tests to update (~30)

3. **Integration tests** (8 files, ~280 tests)
   - `editless-tree.test.ts` — Rewrite (hierarchy changes)
   - Command handler tests — Mostly unaffected (~240)
   - Workspace/extension lifecycle tests — Minor updates (~20)

4. **Watcher tests** (4 files, ~120 tests)
   - File system watcher tests to add (~40 new)
   - Debounce pattern tests (~30 new)
   - Copilot dir watcher lifecycle tests (~20 new)

5. **Session/Terminal tests** (9 files, ~140 tests)
   - Unaffected — no changes to session architecture

### Refactor Impact by Test File

| File | Tests | Status | Notes |
|------|-------|--------|-------|
| discover-squads.test.ts | 45 | Rewrite | Registry-first pattern tests |
| discover-agents.test.ts | 38 | Rewrite | Copilot dir discovery tests |
| registry-watcher.test.ts | 52 | Rewrite | Debounce, 300ms timer tests |
| tree-provider.test.ts | 87 | Mostly keep | +20 subtree refresh tests |
| squad-watcher.test.ts | 41 | Rewrite | Remove `scanSquad()` tests |
| extension-commands.test.ts | 156 | Mostly keep | ~10 refresh call removals |
| editless-tree.test.ts | 94 | Rewrite | Hierarchy changes |
| Watcher lifecycle tests | 0 | **NEW +110** | Debounce, Copilot dir, timer tests |

### Key Testing Patterns for Refactor

1. **Debounce Testing Pattern**
   ```typescript
   vi.useFakeTimers();
   refreshDiscovery(); // Rapid calls
   refreshDiscovery();
   refreshDiscovery();
   vi.advanceTimersByTime(300);
   expect(discoveryScan).toHaveBeenCalledTimes(1); // Single execution
   ```

2. **Copilot Dir Watcher Tests**
   - File create/delete events trigger `refreshDiscovery()`
   - Watcher covers `~/.copilot/agents/*.agent.md` pattern
   - Edge case: Directory doesn't exist (skip watcher)
   - Edge case: Read-only directory (fail gracefully)

3. **Registry-First Pattern Tests**
   - `addSquads()` runs BEFORE `ensureWorkspaceFolder()`
   - `onDidChangeWorkspaceFolders` sees registry entry in its callback
   - Workspace folder change fires `refreshDiscovery()` automatically
   - Final result: no duplicate in "Discovered" section

4. **Redundant Call Removal Tests**
   - Remove manual `refreshDiscovery()` after `ensureWorkspaceFolder()` (watcher handles it)
   - Remove manual `treeProvider.refresh()` after `registry.addSquads()` (registryWatcher handles it)
   - Verify tree still updates instantly (via watcher, not explicit call)

### Migration Path

**Phase 1 (Immediate — ~200 test changes):**
- Rewrite 180 tests in discovery/watcher files
- Add ~110 new debounce/watcher lifecycle tests
- Update 20-30 command handler tests (remove redundant calls)

**Phase 2 (Later — ~30-40 test changes):**
- Add subtree refresh tests (~20)
- Add edge case tests for Copilot dir watcher (~15)
- Verify dead code removal tests pass (~5-10)

### Risk Assessment

**Low risk:** Registry-first pattern preserves test structure, watchers already well-tested in current code.  
**Medium complexity:** Debounce and Copilot dir watcher logic is new, requires new test patterns.  
**High confidence:** Current 930 tests provide solid coverage foundation; refactor should achieve 960+ tests post-implementation.

---

**Next Steps:** Ready to support Morty/Rick implementation with regression and edge case test coverage.
