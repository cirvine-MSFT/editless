# Architecture Review — Rick

**Reviewer:** Rick (Lead)  
**Scope:** Full codebase architecture and design review  
**Date:** 2025-01-25  
**Files Reviewed:** 49 source files in src/  

---

## Critical Issues (must fix)

### 1. Unsafe type assertions in session-context.ts
**File:** `src/session-context.ts:187, 272`  
**Issue:** Using `any` type for parsed JSON events without validation.  
**Why it matters:** Runtime crashes if events.jsonl contains malformed data. No guard against missing fields in `parsed.type`, `parsed.data`, etc.  
**Suggested fix:** Define a proper `RawSessionEvent` interface and validate parsed JSON before accessing properties. Use type guards or zod/yup for runtime validation.

```typescript
interface RawSessionEvent {
  type: string;
  timestamp: string;
  data?: { toolName?: string; toolCallId?: string };
}

function parseEvent(raw: unknown): RawSessionEvent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.type !== 'string' || typeof obj.timestamp !== 'string') return null;
  return obj as RawSessionEvent;
}
```

---

### 2. Unhandled promise rejection in extension-integrations.ts
**File:** `src/extension-integrations.ts:183`  
**Issue:** `await fetchAdoData()` at module init — if it throws, extension activation fails silently.  
**Why it matters:** ADO auth failures crash the entire extension activation with no user feedback.  
**Suggested fix:** Wrap in try/catch or `.catch()` with user-facing error message.

```typescript
await fetchAdoData().catch(err => {
  console.error('[EditLess] Initial ADO fetch failed:', err);
  vscode.window.showWarningMessage('Failed to load Azure DevOps data. Check your org/project settings.');
});
```

---

### 3. File watcher leaks in session-context.ts
**File:** `src/session-context.ts:239-392`  
**Issue:** `watchSession()` and `watchSessionDir()` create file watchers but never close them if the terminal is closed while the watcher setup is pending (the retry timers in `_watcherPending` aren't cleared on dispose if they fire after disposal).  
**Why it matters:** Memory leaks when sessions are rapidly created/destroyed. Watchers accumulate in `_fileWatchers` and `_watcherPending` without cleanup.  
**Suggested fix:** Add a `_disposed` flag and check it in retry callbacks before re-attempting watch setup.

```typescript
private _disposed = false;

dispose(): void {
  this._disposed = true;
  // ... existing cleanup
}

// In retry callback:
const retry = setTimeout(() => {
  if (this._disposed) return; // Don't retry if disposed
  this._watcherPending.delete(watchKey);
  watchDir();
}, 1000);
```

---

### 4. Race condition in terminal-persistence.ts reconciliation
**File:** `src/terminal-persistence.ts:247`  
**Issue:** `waitForReconciliation()` resolves after 2s timeout, but if `_tryMatchTerminals()` is called again via `_scheduleMatch()` after the promise resolves, the `_reconcileResolve` callback is already cleared — new matches won't notify waiting code.  
**Why it matters:** Tests (and potentially user code) calling `waitForReconciliation()` may proceed before all terminals are actually matched, leading to flaky terminal restoration.  
**Suggested fix:** Track promise resolution state separately and only resolve once, even if multiple match attempts occur.

---

### 5. Missing null checks in base-tree-provider.ts
**File:** `src/base-tree-provider.ts:176-187`  
**Issue:** `element.contextValue` and `element.id` accessed without null guards. Both are optional properties of `vscode.TreeItem`.  
**Why it matters:** Runtime crash if a tree item is created without setting these properties.  
**Suggested fix:** Add explicit checks:

```typescript
const ctx = element.contextValue?.replace(/-filtered$/, '') ?? '';
const owner = element.id?.replace(...) ?? '';
```

---

### 6. Unsafe error handling in ado-client.ts and github-client.ts
**File:** `src/ado-client.ts:92-100`, `src/github-client.ts:56-58`  
**Issue:** ADO POST request builder and GitHub CLI calls catch all errors and return empty arrays, swallowing auth failures, network errors, and invalid config.  
**Why it matters:** Users get silent failures with no indication why their work items aren't loading. Debugging is impossible.  
**Suggested fix:** Log errors to output channel and show user-facing warnings for auth/config failures vs. network timeouts.

```typescript
} catch (err) {
  console.error('[EditLess] GitHub fetch failed:', err);
  vscode.window.showWarningMessage('Failed to fetch GitHub issues. Check gh CLI auth.');
  return [];
}
```

---

### 7. Dangerous shell command construction in copilot-cli-builder.ts
**File:** `src/copilot-cli-builder.ts:14-16`  
**Issue:** `shellQuote()` only escapes arguments containing spaces. Doesn't handle quotes, backticks, or other shell metacharacters.  
**Why it matters:** Command injection risk if user-controlled data (e.g., squad names with backticks) flows into terminal launch commands.  
**Suggested fix:** Use a proper shell-escape library or validate inputs more strictly.

```typescript
function shellQuote(arg: string): string {
  // Escape all shell metacharacters
  return `"${arg.replace(/["\\$`]/g, '\\$&')}"`;
}
```

---

### 8. Potential infinite loop in extension-discovery.ts
**File:** `src/extension-discovery.ts:68-72`  
**Issue:** `debouncedRefreshDiscovery()` resets the timer on every call. If file watcher events fire faster than 300ms, the timer never expires and discovery never runs.  
**Why it matters:** Rapid file changes (e.g., `git checkout`) could block discovery indefinitely.  
**Suggested fix:** Add a max debounce time (e.g., 3s) to force execution after a threshold.

---

## High Priority (should fix)

### 9. Module boundary violation: TerminalManager mutating SessionRecovery's state
**File:** `src/terminal-manager.ts:482-505`, `src/session-recovery.ts:9-18`  
**Issue:** TerminalManager passes its internal Maps (`_terminals`, `_lastActivityAt`, etc.) by reference to SessionRecovery via `SessionRecoveryContext`. SessionRecovery directly mutates these Maps.  
**Why it matters:** Tight coupling — changes to TerminalManager's data structures break SessionRecovery. Hard to reason about ownership and lifecycle.  
**Suggested fix:** SessionRecovery should return a structured result that TerminalManager applies, rather than mutating TerminalManager's state directly. Or, make SessionRecovery a first-class collaborator with explicit ownership transfer.

---

### 10. Abstraction leak: TerminalPersistence exposes internal matching logic
**File:** `src/terminal-persistence.ts:172-264`  
**Issue:** `_tryMatchTerminals()` contains complex multi-pass matching logic (index-based, name-based, emoji-stripped) that should be encapsulated. Callers shouldn't need to know about `TerminalMatchContext` structure.  
**Why it matters:** Hard to test matching logic in isolation. Changing persistence strategy requires touching TerminalManager.  
**Suggested fix:** Extract matching logic into a pure function that takes arrays and returns a match plan, then apply it.

---

### 11. God object: TerminalManager
**File:** `src/terminal-manager.ts`  
**Issue:** 532 lines, 20+ responsibilities: launching, tracking, persisting, recovering, session watching, state detection, change debouncing, orphan management.  
**Why it matters:** Hard to test, hard to change, hard to understand. Single Responsibility Principle violation.  
**Suggested fix:** Extract:
- TerminalLauncher (launch + env setup)
- TerminalTracker (terminal → info mapping, change events)
- SessionWatcher (events.jsonl watching)
- OrphanManager (orphan detection + recovery)

---

### 12. Type safety gap: `any` in session-context.ts event parsing
**File:** `src/session-context.ts:187, 272`  
**Issue:** Already flagged as critical, but worth reiterating: `any` used for JSON parsing with no validation.  
**Why it matters:** Type system offers no protection against malformed events.jsonl files.  
**Suggested fix:** See Critical Issue #1.

---

### 13. Magic number: MAX_REBOOT_COUNT without context
**File:** `src/terminal-persistence.ts:7`  
**Issue:** `export const MAX_REBOOT_COUNT = 5;` — no explanation of why 5, what happens after 5 reboots, or how to configure it.  
**Why it matters:** Users hitting the limit have no recourse. Evicted terminals are lost silently.  
**Suggested fix:** Add a comment explaining the rationale and consider making it configurable via settings.

---

### 14. Missing disposal: AgentStateManager never disposes scanSquad() results
**File:** `src/agent-state-manager.ts:33-42`  
**Issue:** `scanSquad()` returns `SquadState` which may contain file watchers or other disposables (not visible in this file, but likely given the pattern). The cache never calls `dispose()` on evicted entries.  
**Why it matters:** Memory leaks if SquadState holds resources.  
**Suggested fix:** Check if SquadState is disposable and call `dispose()` on cache eviction.

---

### 15. Unsafe array access in unified-discovery.ts
**File:** `src/unified-discovery.ts:133-140`  
**Issue:** `path.basename(itemDir)` and `path.basename(parentOfItemDir)` assume directory structure, but don't validate. If `itemDir` is root or malformed, `basename()` returns unexpected values.  
**Why it matters:** Edge case crash when scanning non-standard directory layouts.  
**Suggested fix:** Validate path depth before accessing parent directories.

---

### 16. Circular dependency risk: extension.ts imports from multiple modules that all import types
**File:** `src/extension.ts`  
**Issue:** Extension.ts imports 8 modules, each of which cross-imports types from others (e.g., `AgentSettingsManager` ↔ `DiscoveredItem` ↔ `AgentTeamConfig`).  
**Why it matters:** Circular dependency refactoring is fragile. TypeScript resolves it now, but runtime initialization order bugs are possible.  
**Suggested fix:** Extract shared types into a pure `types/` directory that has no imports.

---

### 17. Error swallowing in extension-settings.ts
**File:** `src/extension-settings.ts:41-43`  
**Issue:** `ensureEditlessInstructions()` catches all errors and logs to console but doesn't notify the user that instructions file creation failed.  
**Why it matters:** Copilot CLI won't pick up instructions, and user has no idea why.  
**Suggested fix:** Show a warning notification on failure (once per session, not on every write).

---

### 18. Unsafe string interpolation in copilot-cli-builder.ts
**File:** `src/copilot-cli-builder.ts:108-146`  
**Issue:** `buildLaunchCommandForConfig()` directly interpolates `config.command` into the shell command without validation.  
**Why it matters:** If `config.command` contains shell metacharacters, the terminal launch will fail or behave unexpectedly.  
**Suggested fix:** Validate `config.command` against a whitelist or strip shell metacharacters.

---

### 19. No timeout on file watchers in session-context.ts
**File:** `src/session-context.ts:355-365`  
**Issue:** Retry loop in `watchDir()` reschedules indefinitely if the session directory never appears.  
**Why it matters:** Memory leak for stale session IDs that never resolve.  
**Suggested fix:** Add a max retry count or TTL for pending watchers.

---

### 20. Missing validation in agent-settings.ts
**File:** `src/agent-settings.ts:60-70`  
**Issue:** `get()` method for worktree children merges parent and child settings without validating that both exist. If parent is deleted but child remains, returns `{ ...undefined, ...wtSettings }`.  
**Why it matters:** Silent bugs when parent squad is removed from settings file.  
**Suggested fix:** Return `undefined` if parent doesn't exist, or log a warning.

---

## Medium Priority (nice to fix)

### 21. Dead code: status-bar.ts may have unused imports
**File:** `src/status-bar.ts` (not fully reviewed)  
**Issue:** Likely contains unused helper functions from refactors.  
**Suggested fix:** Run `eslint --report-unused-disable-directives` and remove dead code.

---

### 22. Barrel file abuse: editless-tree-items.ts
**File:** `src/editless-tree-items.ts` (not fully reviewed)  
**Issue:** If it's a barrel file re-exporting multiple modules, it creates import order dependencies.  
**Suggested fix:** Inline exports or make it a pure aggregator with no logic.

---

### 23. Inconsistent error handling: some modules log, some don't
**File:** Multiple  
**Issue:** `ado-client.ts` silently swallows errors, `github-client.ts` logs to console, `extension-settings.ts` logs to console.error, `extension-integrations.ts` shows warnings.  
**Why it matters:** Debugging is inconsistent. No unified logging strategy.  
**Suggested fix:** Create a centralized logger module and use it everywhere.

---

### 24. Type narrowing gap: isAttentionEvent() doesn't narrow SessionEvent type
**File:** `src/terminal-state.ts:8-10`  
**Issue:** `isAttentionEvent()` returns boolean but doesn't act as a type guard. Callers still need to check `event.hasOpenAskUser`.  
**Why it matters:** Missed opportunity for type safety.  
**Suggested fix:** Change signature to `function isAttentionEvent(event: SessionEvent): event is AttentionEvent`.

---

### 25. Naming inconsistency: "squad" vs "agent" vs "team"
**File:** Multiple  
**Issue:** Codebase uses "squad", "agent", "team", and "config" interchangeably (e.g., `AgentTeamConfig`, `SquadState`, `team.md`).  
**Why it matters:** Confusing for new contributors.  
**Suggested fix:** Pick one term (recommend "squad") and rename types consistently.

---

### 26. Overly broad catch blocks
**File:** `src/scanner.ts:11-16, 19-32, 85-95`  
**Issue:** Empty catch blocks swallow all exceptions, including unexpected errors like stack overflows or programmer mistakes.  
**Why it matters:** Silently masks bugs.  
**Suggested fix:** At least log caught errors to console.

---

### 27. Duplicate logic: normalizePath in multiple modules
**File:** `src/session-context.ts:26-28`, `src/unified-discovery.ts:254-256`  
**Issue:** Same `normalizePath` function duplicated.  
**Suggested fix:** Extract to a shared `path-utils.ts`.

---

### 28. Missing JSDoc on public APIs
**File:** Most modules  
**Issue:** Public classes like `TerminalManager`, `SessionContextResolver` lack JSDoc on methods.  
**Why it matters:** Hard for new contributors to understand API contracts.  
**Suggested fix:** Add JSDoc to all exported functions and classes.

---

### 29. Weak validation in worktree-discovery.ts
**File:** `src/worktree-discovery.ts:20-34`  
**Issue:** `discoverWorktrees()` catches all `execFileSync` errors and returns `[]`. Doesn't distinguish between "not a git repo" and "git command failed".  
**Suggested fix:** Check error code and log/warn on unexpected failures.

---

### 30. Potential race: editless-tree.ts `findTerminalItem()` queries stale state
**File:** `src/editless-tree.ts:82-109`  
**Issue:** `findTerminalItem()` calls `getHiddenGroupChildren()` which re-queries `agentSettings`, but if settings changed since last tree render, the item may not exist in the tree.  
**Why it matters:** Reveal command could fail silently if settings change mid-operation.  
**Suggested fix:** Cache tree structure or validate item existence before revealing.

---

### 31. Magic string: "builtin:copilot-cli"
**File:** `src/editless-tree.ts:17`, `src/commands/agent-commands.ts:138`  
**Issue:** Hardcoded ID appears in multiple places without a const.  
**Suggested fix:** Already exported as `DEFAULT_COPILOT_CLI_ID`, but not used consistently.

---

### 32. No defensive check: work-item-launcher.ts assumes discoveredItems exists
**File:** `src/commands/work-item-launcher.ts:27-28`  
**Issue:** `getDiscoveredItems()` could return `[]` if discovery hasn't run yet. Code proceeds to show picker with empty list.  
**Suggested fix:** Show a message if no items are discovered yet.

---

### 33. Unused export: buildCopilotCLIConfig may be internal-only
**File:** `src/editless-tree.ts:27`  
**Issue:** Re-exported for backward compatibility, but may no longer be needed externally.  
**Suggested fix:** Audit external usage and remove if unused.

---

### 34. State mutation in getter: BaseTreeProvider._getFilteredGitHubMap()
**File:** `src/base-tree-provider.ts:269-276`  
**Issue:** Method name suggests read-only but creates new Map every call. Should be cached.  
**Suggested fix:** Memoize or rename to `computeFilteredGitHubMap()`.

---

### 35. Missing timeout: terminal-manager.ts launchTerminal() never times out
**File:** `src/terminal-manager.ts:126-202`  
**Issue:** If Copilot CLI hangs during launch, the terminal stays in "launching" state indefinitely (already has 10s timeout via `_setLaunching()`, but no error handling).  
**Suggested fix:** Show a notification on timeout suggesting the user check their Copilot CLI installation.

---

## Low Priority (consider)

### 36. Style: inconsistent use of optional chaining
**File:** Multiple  
**Issue:** Some code uses `?.` extensively, others use `if (x) x.property`.  
**Suggested fix:** Pick one style and enforce via linter.

---

### 37. Comment verbosity: some comments state the obvious
**File:** Multiple  
**Issue:** Comments like "// Set the flag" before `flag = true;` add noise.  
**Suggested fix:** Remove obvious comments, keep only complex logic explanations.

---

### 38. Test coverage gaps (inferred, not verified)
**File:** N/A  
**Issue:** Critical paths like session recovery and terminal matching likely undertested given complexity.  
**Suggested fix:** Add integration tests for multi-terminal scenarios.

---

### 39. Performance: SessionContextResolver._ensureIndex() rescans on dir count change
**File:** `src/session-context.ts:471-527`  
**Issue:** Rebuilds entire index if a single session is added/removed. Could be incremental.  
**Suggested fix:** Track which directories changed and update only those.

---

### 40. Accessibility: status bar doesn't announce changes
**File:** `src/status-bar.ts` (not reviewed)  
**Issue:** Likely just updates text without screen reader announcements.  
**Suggested fix:** Use `vscode.window.setStatusBarMessage()` for important updates.

---

## Summary

**Critical issues:** 8 (crashes, leaks, injection risks)  
**High priority:** 12 (design smells, coupling, type safety)  
**Medium priority:** 15 (cleanup, consistency, minor bugs)  
**Low priority:** 5 (style, performance, nice-to-haves)  

**Overall assessment:**  
The codebase is **functionally solid** but has **technical debt** in module boundaries and error handling. No catastrophic design flaws, but refactoring TerminalManager and tightening type safety in session-context.ts would significantly improve maintainability.

**Top 3 recommendations:**  
1. **Fix Critical #1 & #2 immediately** — unsafe JSON parsing and unhandled ADO init can crash in production.  
2. **Refactor TerminalManager** (High #11) — split into smaller, testable modules.  
3. **Add centralized error logging** (Medium #23) — unify error handling across all modules.

**Architecture strengths:**  
- Clean separation of tree providers from data fetching (GitHub/ADO/Local)  
- Session-state abstraction is well-designed (SessionContextResolver)  
- Unified discovery pattern works well for agents + squads  

**Architecture weaknesses:**  
- TerminalManager is a god object (532 lines, too many responsibilities)  
- SessionRecovery mutates TerminalManager's state directly (tight coupling)  
- Inconsistent error handling (some modules log, some swallow, some show UI)  

---

**Rick**  
Lead, EditLess  
2025-01-25
