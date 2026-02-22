# Work Items Filter UX Redesign

**Author:** Summer (Product Designer)  
**Date:** 2026-02-23  
**Status:** Proposal

---

## Problem Statement

The work items filter breaks for users with multiple backends (GitHub + Azure DevOps) or multiple GitHub repos. The flat QuickPick mixes ALL filter options from ALL sources, and ALL dimensions apply to ALL items via AND logic. This causes:

1. **Type filter cross-contamination**: ADO has native types (Bug, Task, User Story). GitHub uses `type:*` labels. If a GitHub repo doesn't use these labels, type filtering silently excludes all its items.

2. **Label/tag scope mismatch**: A label like `release:v0.1.1` exists in one repo but not others. Selecting it filters out everything else.

3. **Confusing mixed options**: Users see a flat list mixing ADO types, GitHub labels, and repo names—then wonder why their selection returns "No items match current filter."

---

## Recommended Approach: **Backend-Aware Smart Matching**

After considering the options, I recommend **Option C: Backend-aware AND logic** with enhanced filter descriptions.

### Why Not the Alternatives?

| Option | Why Not |
|--------|---------|
| **A. Two-step filter** (pick repo first, then filters) | Adds friction for the common case (one backend). Forces users through extra steps even when filters would apply globally. |
| **B. Scoped filter** (only show applicable options) | Complex state management. If user has no repos selected, what labels do we show? Changes what's visible mid-flow—confusing. |
| **D. Per-repo filter profiles** | Overkill. Adds permanent state to manage. Most users want a quick filter, not profile management. |

### Why Backend-Aware Smart Matching Works

**Core insight**: The filter dimensions naturally split by backend.

- **GitHub-specific**: labels (arbitrary strings on issues)
- **ADO-specific**: types (native work item type field), tags (ADO's tag field)
- **Shared**: state (open/active/closed maps to both), repos (which source to show)

**The fix**: When evaluating whether an item passes the filter, only apply relevant dimensions:

- For **GitHub issues**: Check repos, labels, states. Ignore type filter (unless the issue has a `type:*` label).
- For **ADO work items**: Check repos (is `(ADO)` selected?), tags, states, types.

**Effect**: User selects "Bug" type → only ADO items are filtered by type. GitHub items pass through unless they happen to have a `type:bug` label. This is intuitive—the filter does what makes sense for each backend.

---

## QuickPick Flow (Step-by-Step Wireframe)

### Current Flow (Problematic)
```
┌─ Filter Work Items ─────────────────────────────────┐
│ Select filters (leave empty to show all)            │
├─────────────────────────────────────────────────────┤
│ ── Repos ──                                         │
│ [ ] owner/repo-1                                    │
│ [ ] owner/repo-2                                    │
│ [ ] (ADO)                                           │
│ ── State ──                                         │
│ [ ] Open (New)                                      │
│ [ ] Active / In Progress                            │
│ ── Type ──                                          │
│ [✓] Bug         ← User selects Bug                  │
│ [ ] Task                                            │
│ [ ] Feature                                         │
│ [ ] User Story                                      │
│ ── Labels ──                                        │
│ [ ] release:v0.1.1                                  │
│ [ ] priority:high                                   │
│ [ ] type:enhancement  ← GitHub label, looks similar │
└─────────────────────────────────────────────────────┘
Result: GitHub issues without type:bug label are hidden.
        User confused: "Where did my GitHub issues go?"
```

### Proposed Flow (Backend-Aware)

**No change to QuickPick UI structure!** The fix is in how filters are *applied*, not how they're *presented*. But we add clarity through section headers and descriptions:

```
┌─ Filter Work Items ─────────────────────────────────┐
│ Select filters (leave empty to show all)            │
├─────────────────────────────────────────────────────┤
│ ── Sources ──                                       │
│ [ ] owner/repo-1               (GitHub)             │
│ [ ] owner/repo-2               (GitHub)             │
│ [ ] (ADO)                      (Azure DevOps)       │
│ ── State ──                                         │
│ [ ] Open (New)                                      │
│ [ ] Active / In Progress                            │
│ ── ADO Type ──                 ← Renamed section    │
│ [✓] Bug                        (ADO only)           │
│ [ ] Task                       (ADO only)           │
│ [ ] Feature                    (ADO only)           │
│ [ ] User Story                 (ADO only)           │
│ ── GitHub Labels ──            ← Renamed section    │
│ [ ] release:v0.1.1                                  │
│ [ ] priority:high                                   │
│ [ ] type:enhancement                                │
│ ── ADO Tags ──                 ← New section        │
│ [ ] sprint-42                                       │
│ [ ] customer-reported                               │
└─────────────────────────────────────────────────────┘
```

### Key UI Changes

1. **Rename "Repos" → "Sources"** — clearer that it's backends + repos mixed
2. **Rename "Type" → "ADO Type"** — explicit that this only filters ADO items
3. **Rename "Labels" → "GitHub Labels"** — explicit scope
4. **Add "ADO Tags" section** — ADO tags were hidden in the Labels bucket before
5. **Add "(ADO only)" hints in descriptions** — visible at a glance

---

## Filter State Display (Tree View Description)

### Current Display
```
Work Items   type:Bug · label:release:v0.1.1
```

**Problem**: Doesn't clarify which backend the filter applies to.

### Proposed Display

When backend-specific filters are active, indicate scope:

```
Work Items   ado:Bug · github:release:v0.1.1
```

Or, if only one backend is filtered:

```
Work Items   Bug (ADO) · state:active
```

**Format rules:**
- `type:X` → `X (ADO)` when type is selected
- `label:X` → `X` for GitHub labels (no prefix needed, they're always GitHub)
- `tag:X` → `tag:X (ADO)` for ADO tags
- `state:X` and `source:X` remain unchanged (they apply to both)

---

## Edge Cases

### Single Backend (Most Common)

If user only has GitHub repos configured (no ADO):
- "ADO Type" section is hidden entirely
- "ADO Tags" section is hidden
- QuickPick looks simpler—only show what's relevant

If user only has ADO configured (no GitHub repos):
- "GitHub Labels" section is hidden
- Type section header can drop "(ADO only)" hint

### No Items Match Filter

Current message: `No items match current filter`

**Proposed enhancement**: Add a hint about clearing.

```
No items match current filter
Tip: Click funnel icon to edit or clear filters
```

This uses the existing empty-state pattern but adds guidance.

### Clearing Filters

The `editless.clearWorkItemsFilter` command already works. No change needed. The ✕ icon in the tree view title bar clears all filters.

### Switching Repos Mid-Filter

If user adds a new GitHub repo via `editless.configureRepos` while a filter is active:
- New repo's items should appear (unless source filter explicitly excludes it)
- Current behavior: filter persists, new items are evaluated against it
- **No change needed** — this is correct

---

## Architecture Changes

### WorkItemsFilter Model

```typescript
// Current
export interface WorkItemsFilter {
  repos: string[];
  labels: string[];      // Mixed GitHub labels + ADO tags
  states: UnifiedState[];
  types: string[];       // ADO types applied to everything
}

// Proposed
export interface WorkItemsFilter {
  sources: string[];     // Renamed from repos (conceptually clearer)
  githubLabels: string[];  // GitHub issue labels only
  adoTags: string[];       // ADO tags only
  states: UnifiedState[];  // Shared — applies to both
  adoTypes: string[];      // ADO work item types only
}
```

### applyRuntimeFilter (GitHub)

```typescript
// Current — applies type filter to GitHub issues
if (this._filter.types.length > 0 && !this.matchesTypeFilter(issue.labels, this._filter.types)) return false;

// Proposed — skip type filter for GitHub issues (unless they have type:* labels)
// Only apply githubLabels, states, sources
```

### applyAdoRuntimeFilter (ADO)

```typescript
// Current — applies labels filter (which includes GitHub labels)
if (this._filter.labels.length > 0 && !this.matchesLabelFilter(wi.tags, this._filter.labels)) return false;

// Proposed — only apply adoTags, adoTypes, states, sources
```

### Filter Command (extension.ts)

1. Build separate sections for GitHub Labels vs ADO Tags
2. Use `getAllGitHubLabels()` and `getAllAdoTags()` (new methods on provider)
3. Conditionally hide sections if that backend isn't configured
4. Update separator labels: "ADO Type", "GitHub Labels", "ADO Tags"

### _updateDescription

Update to reflect new field names and add backend hints when appropriate.

---

## What Stays the Same

- **State filtering**: Unified states (open/active/closed) work identically for both backends
- **OR-within-group, AND-across-groups logic**: The prefix-grouped OR logic for labels/tags remains
- **Tree view structure**: No changes to how items are grouped or displayed
- **Clear filter command**: `editless.clearWorkItemsFilter` works unchanged
- **Filter persistence**: Not persisted across sessions (intentional—filters are ephemeral)

---

## Migration Path

This is a **non-breaking change**. Old filters (if any are stored in state) can be migrated:
- `repos` → `sources` (rename)
- `labels` → split by prefix or use heuristic (labels with `:` are likely GitHub, others are ADO tags)
- `types` → `adoTypes` (rename)

In practice, filters aren't persisted, so no migration is needed.

---

## Summary

The core fix is **backend-aware smart matching**: apply filter dimensions only where they make sense. The UI changes are cosmetic (better section names, hint text) but important for user clarity. This is the smallest change that fixes the problem without adding workflow complexity.

**Next steps**: Morty implements the architectural changes to `WorkItemsFilter` and the filter application logic. Summer to review the QuickPick UI after implementation.
