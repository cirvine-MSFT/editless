# Orchestration Log: Morty — UI Reactivity Analysis

**Timestamp:** 2026-02-26T05:15:20Z  
**Agent:** Morty (Extension Dev)  
**Task:** UI reactivity analysis for auto-discover refactor  
**Status:** COMPLETE

## Analysis Summary

Comprehensive UI reactivity analysis for squad auto-discovery refactor (Epic #368). Delivered morty-ui-reactivity-analysis.md decision file documenting current system reactivity and proposing hybrid model for instant user-initiated updates + background discovery sync.

### Key Findings

1. **Current System is 95% Reactive**
   - User-initiated actions (Add Agent, Add Squad, Change Model, Hide/Show) appear in tree < 10ms
   - Registry writes trigger instant `registryWatcher` → `treeProvider.refresh()` chain
   - Background discovery runs separately, doesn't block UI
   - Only bottleneck: `squad init` terminal flow (1-3 seconds, unavoidable external process)

2. **17 Refresh Triggers Inventory**
   - All major user actions already have instant paths via registry watcher
   - `onDidChangeWorkspaceFolders` fires synchronously when `ensureWorkspaceFolder()` called
   - File system watchers (registry, squad files, workspace team.md) are all ~0ms in-process
   - Terminal manager + label manager events also instant

3. **Proposed Hybrid Model**
   ```
   ┌─ USER-INITIATED (Instant)      ┌─ BACKGROUND (Auto-Discover)
   │ + Add Agent                    │ Workspace folder added
   │ + Add Squad (existing dir)     │ Extension activated
   │ Hide/Show                      │ Manual "Refresh" command
   │ Change model/args/icon         │ team.md created
   └─ registry.addSquads()          └─ refreshDiscovery()
      ↓ registryWatcher               ↓ Scan workspace + ~/.copilot/agents/
      ↓ treeProvider.refresh()        ↓ Update "Discovered" section
      ✅ < 10ms
   ```

4. **Optimizations Recommended**
   - **Phase 1:** Remove redundant refresh calls (registryWatcher handles it)
   - **Phase 1:** Add Copilot agent directory watcher (catch manual drops in ~/.copilot/agents/)
   - **Phase 1:** Debounce `refreshDiscovery()` with 300ms delay (prevents rapid rescans)
   - **Phase 2:** Optimize `invalidate()` to subtree refresh (less redraw for large trees)
   - **Phase 2:** Cache discovery results (skip rescan if < 5 seconds old)

5. **Event Watcher Patterns**
   - Keep: Workspace Folder Watcher (catches folder changes)
   - Keep: Registry File Watcher (triggers instant tree update — FAST path)
   - Keep: Squad File Watcher (detects squad config changes)
   - Keep: Workspace team.md Watcher (catches "+ Add Squad" terminal init)
   - **NEW:** Copilot Agent Directory Watcher (catch external drops, debounced 300ms)

6. **Implementation Checklist for Refactor**
   - Add debounced discovery helper with 300ms timer
   - Create Copilot agent directory watcher covering `~/.copilot/agents/*.agent.md`
   - Remove redundant refresh calls in command handlers (trust watchers)
   - Update workspace folder watcher to use debounced version
   - Document debounce pattern and watcher registration in code

### Decision Point for Team

✅ **Conclusion:** Current system is already reactive. Refactor should **preserve registry-first pattern** (the fast path), **add debouncing** (prevent redundant discovery scans), and **remove redundant calls** (trust the watchers). Result: All user-initiated actions < 10ms, discovery runs background without blocking UI.

---

**Next Steps:** Meeseeks ready for test landscape inventory and estimation.
