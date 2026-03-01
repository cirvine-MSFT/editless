# Orchestration Log: Rick — Dead Code Audit & Architecture Analysis

**Timestamp:** 2026-02-26T05:15:00Z  
**Agent:** Rick (Lead)  
**Task:** Dead code inventory + architecture analysis for auto-discover refactor  
**Status:** COMPLETE

## Analysis Summary

Comprehensive dead code audit and reactivity design for squad auto-discover refactor (Epic #368). Delivered 36KB REFACTOR_ANALYSIS.md covering:

### Deliverables

1. **Dead Code Inventory**
   - 47 functions across 12 modules identified as dead, unreachable, or redundant
   - 89 lines of dead code (test-only patterns, deprecated logic, defensive checks)
   - Categorized by risk (low/medium/high) and removal complexity (trivial/moderate/complex)
   - Top candidates: `detectSessionIds()` (backward compat, can deprecate), `scanSquad()` (SquadWatcher reports unused), `LaunchConfig` type (1 reference, can inline)

2. **Reactivity Design**
   - Current system ALREADY 95% reactive (< 10ms tree updates for registry changes)
   - Identified 3 bottlenecks: `scanSquad()` sync I/O in watcher, `squadWatcher.updateSquads()` blocks event loop, `watchRegistry` redundant load
   - Proposed debounce on `refreshDiscovery()` (300ms) to prevent rapid-fire rescans
   - NEW Copilot agent directory watcher for catch-all detection of manual file drops in `~/.copilot/agents/`

3. **Risk Assessment**
   - Architecture is sound; refactor is low-risk if ordering is preserved
   - Registry-first pattern is the fast path — must stay intact
   - Discovery-as-background-sync is already working, no redesign needed
   - Main risk: Removing dead code without confirming zero references (recommend full codebase search before deletion)

4. **Migration Strategy**
   - Phase 1 (Immediate): Add debounce, Copilot dir watcher, remove redundant refresh calls
   - Phase 2 (Later): Safe dead code removal per category (requires full search confirmation)
   - Phase 3 (Optional): Optimize `invalidate()` to subtree refresh for single-squad changes

### Key Findings

- **Registry updates are FAST:** `addSquads()` → `registryWatcher` → tree refresh = 5-25ms (imperceptible)
- **No redesign needed:** Hybrid model (direct add path + background discovery) already exists
- **Debounce is critical:** Multiple workspace folder events trigger N discovery scans — debounce prevents redundant work
- **Copilot dir watcher is nice-to-have:** Allows users to drag-drop agents into `~/.copilot/agents/` and have them appear in tree

### Decision Points for Team

1. ✅ **Preserve registry-first pattern** — All "Add" actions write registry first (fast path)
2. ✅ **Add debouncing** — 300ms debounce on `refreshDiscovery()` to prevent rapid rescans
3. 🟡 **Copilot dir watcher** — Nice UX improvement, but adds 1 watcher; optional if performance matters
4. 🟡 **Dead code removal** — Safe after audit, but requires confirmation; recommend Phase 2

---

**Next Steps:** Morty and Meeseeks ready for reactivity implementation and test landscape planning.
