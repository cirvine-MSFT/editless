# PR #417 Integration Review — Unity

**Date:** 2026-02-25  
**PR:** squad/417-ado-config-refresh  
**Reviewer:** Unity (Integration Dev)  
**Commits:** 372d350, 52f0102

## Verdict: **REQUEST CHANGES**

## Critical Issues

### 1. **Race Condition: Concurrent Re-initialization** (High Severity)
**Location:** `extension.ts:1001-1015`

The config change handlers have **no debouncing**. If a user types "microsoft" into the ADO org field character by character, `initAdoIntegration` fires **9 times in rapid succession**. Each call:
- Creates a new `fetchAdoData` closure
- Calls `setAdoRefresh()`, overwriting the previous callback
- Triggers 3 parallel API calls (work items, PRs, adoMe)

**Problem:** Multiple overlapping `fetchAdoData` closures race to completion. The last one to call `setAdoRefresh()` wins, but **all** execute their API calls. The tree providers receive updates in **non-deterministic order** — whichever API batch completes last populates the UI, potentially with stale org/project data if the user kept typing.

**Evidence:**
```typescript
// extension.ts:1001-1005
vscode.workspace.onDidChangeConfiguration(e => {
  if (e.affectsConfiguration('editless.ado.organization') || e.affectsConfiguration('editless.ado.project')) {
    initAdoIntegration(context, workItemsProvider, prsProvider);  // No debounce
  }
}),
```

**Impact:** 
- Wasted API quota (9x fetch for "microsoft")
- UI flicker as competing updates race
- Potential auth exhaustion (9 concurrent token requests)

**Required Fix:**
```typescript
let adoReinitTimer: NodeJS.Timeout | undefined;
vscode.workspace.onDidChangeConfiguration(e => {
  if (e.affectsConfiguration('editless.ado.organization') || e.affectsConfiguration('editless.ado.project')) {
    if (adoReinitTimer) clearTimeout(adoReinitTimer);
    adoReinitTimer = setTimeout(() => {
      initAdoIntegration(context, workItemsProvider, prsProvider);
    }, 500);  // 500ms debounce
  }
}),
```

---

### 2. **Stale Closure Leak** (Medium Severity)
**Location:** `extension.ts:1425-1461, 1464-1465`

Each call to `initAdoIntegration` creates a **new `fetchAdoData` closure** that captures the org/project from line 1413-1414. When rapid config changes occur:

1. First call creates `fetchAdoData_v1` (org="micro", project="proj")
2. Second call creates `fetchAdoData_v2` (org="microsoft", project="proj")
3. Both closures are **stored in the providers** via `setAdoRefresh()`
4. Auto-refresh timer calls the **last** `setAdoRefresh()` callback

**Problem:** If `fetchAdoData_v1` is slow and completes **after** `fetchAdoData_v2`, it overwrites the correct data with stale org="micro" data.

**Evidence:**
```typescript
// extension.ts:1464-1465
workItemsProvider.setAdoRefresh(fetchAdoData);  // Overwrites previous closure
prsProvider.setAdoRefresh(fetchAdoData);
```

**Impact:**
- UI shows data for the **wrong** org/project after user corrects a typo
- Hard to reproduce (timing-dependent)

**Required Fix:**
The closure isn't inherently wrong, but combined with Issue #1 (no debounce), it creates the race. **Debouncing solves both issues** — only one `fetchAdoData` closure gets created per typing pause.

---

### 3. **GitHub Handler Asymmetry** (Low Severity)
**Location:** `extension.ts:1383-1405, 1008-1015`

`initGitHubIntegration` has **no async data fetch** — it just calls `setRepos()` and returns immediately. `initAdoIntegration` is async and fetches data before returning. This asymmetry means:

- ADO config change → blocks on API calls
- GitHub config change → returns instantly (no API calls)

**Why this matters:**
- Users expect symmetry: both should feel equally responsive (or equally blocking)
- GitHub **does** fetch data, but lazily via `WorkItemsTreeProvider.fetchAll()` when the tree view renders
- ADO fetches **eagerly** in `initAdoIntegration`

**Not a blocker**, but document this intentional asymmetry. If GitHub ever needs eager fetch (e.g., for validation), the pattern should match ADO.

---

## Non-Blocking Observations

### ✅ **PAT Handling is Correct**
`getAdoToken()` reads PAT from `context.secrets` on every call — no caching. Re-initialization correctly re-reads updated PATs.

### ✅ **No Timer Cleanup Needed**
`initAutoRefresh` manages its own timer. Config change handlers don't interfere with the auto-refresh timer lifecycle.

### ✅ **API Clients are Stateless**
`fetchAdoWorkItems`, `fetchAdoPRs`, `fetchAdoMe` are pure functions — no singleton state to clean up.

### ✅ **Test Coverage**
`config-refresh.test.ts` validates the handlers fire correctly. **But tests don't catch the race condition** because they mock synchronous execution.

---

## Recommendation

**Approve after fix:** Add 500ms debounce to both `onDidChangeConfiguration` handlers. This is a **5-line change** that eliminates all three issues.

**Alternative (if debounce rejected):** Add a cancellation token pattern so in-flight fetches abort when a new config change arrives. This is 30+ lines and more complex.

---

## Integration Checklist

- [x] Does `initAdoIntegration` / `initGitHubIntegration` clean up previous state?  
  → **No state to clean** — providers are designed for re-init via `setRepos()` / `setAdoConfig()`.

- [ ] Are there race conditions if config changes rapidly?  
  → **YES — BLOCKING ISSUE.** No debounce = N concurrent API calls for N keystrokes.

- [x] Does the GitHub handler match the ADO handler pattern?  
  → **Minor asymmetry** (lazy vs eager fetch) — document, not blocking.

- [x] Could re-initialization cause duplicate API calls, double-subscribed events, or stale data?  
  → **YES** — Issue #1 and #2 cover this.

- [x] Are PAT/secrets handled correctly on re-init?  
  → **YES** — re-read from SecretStorage on every call.

---

**Sign-off:** Unity  
**Next step:** Birdperson or Casey to implement debounce, then re-review.
