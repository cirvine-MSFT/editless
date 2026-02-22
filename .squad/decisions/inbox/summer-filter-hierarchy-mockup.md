# Hierarchical Filter UX: Tree View Mockups

**Author:** Summer (Product Designer)  
**Date:** 2026-02-23  
**Status:** Proposal (revised based on Casey's feedback)  
**Supersedes:** `summer-filter-ux-redesign.md` (flat QuickPick approach)

---

## Context

Casey reviewed the original QuickPick-based filter redesign and requested a **different direction**:

> Instead of a flat QuickPick, I want:
> 1. **Hierarchical tree view grouping**: ADO / GitHub → Org → Project/Repo as tree nodes
> 2. **Filters on tree view elements**: Filters would live at each level of the hierarchy
> 3. **Per-level scoping**: You'd filter ADO items at the ADO level, GitHub items at the GitHub level

This makes sense. The tree view already has hierarchy (milestones, repos, ADO group). Extending that hierarchy to backends and adding filter affordances at each level is more native to VS Code's tree paradigm than a flat QuickPick.

---

## Variant A: Inline Filter Icons per Group

Filter affordances appear as inline hover actions on group nodes.

```
┌─ WORK ITEMS ────────────────────────────────────────┐
│ ↻ 🔍 ⚙️                                 title bar  │
├─────────────────────────────────────────────────────┤
│ ▼ Azure DevOps                        [≡] ← filter │
│   │  ▼ microsoft                                    │
│   │  │  ▼ vscode-copilot                           │
│   │  │  │  🔵 #4521 Fix auth timeout               │
│   │  │  │  🟢 #4519 Add retry logic                │
│   │  │  │  ⚪ #4515 Update docs                    │
│   │                                                 │
│ ▼ GitHub                              [≡] ← filter │
│   │  ▼ microsoft                                    │
│   │  │  ▼ copilot-cli                              │
│   │  │  │  ▼ v0.1.1  (milestone)      [≡] ← filter │
│   │  │  │  │  #42 Implement streaming              │
│   │  │  │  │  #41 Fix error handling               │
│   │  │  │  ▶ No Milestone                          │
│   │  │  ▼ editless                                 │
│   │  │  │  #339 Unified discovery flow             │
│   │  │  │  #317 Refresh discovery                  │
└─────────────────────────────────────────────────────┘

[≡] icon appears on hover → opens level-scoped QuickPick
```

### Filter QuickPick (scoped to ADO)
```
┌─ Filter Azure DevOps Items ─────────────────────────┐
│ ── Type ──                                          │
│ [✓] Bug                                             │
│ [ ] Task                                            │
│ [ ] User Story                                      │
│ ── State ──                                         │
│ [ ] New                                             │
│ [✓] Active                                          │
│ [ ] Closed                                          │
│ ── Tags ──                                          │
│ [ ] sprint-42                                       │
│ [ ] customer-reported                               │
└─────────────────────────────────────────────────────┘
```

### Filter QuickPick (scoped to GitHub repo)
```
┌─ Filter microsoft/copilot-cli ──────────────────────┐
│ ── Labels ──                                        │
│ [✓] release:v0.1.1                                  │
│ [ ] priority:high                                   │
│ [ ] type:bug                                        │
│ ── State ──                                         │
│ [ ] Open                                            │
│ [✓] Active (has assignee)                           │
│ [ ] Closed                                          │
└─────────────────────────────────────────────────────┘
```

### Filtered State Display
```
┌─ WORK ITEMS ────────────────────────────────────────┐
│ ↻ 🔍 ⚙️ ✕                        ✕ = clear all     │
├─────────────────────────────────────────────────────┤
│ ▼ Azure DevOps              Bug · Active   [≡] [✕] │
│   │  ▼ microsoft                                    │
│   │  │  ▼ vscode-copilot                           │
│   │  │  │  🔵 #4521 Fix auth timeout               │
│   │  │  │  (1 item matches filter)                 │
│   │                                                 │
│ ▼ GitHub                                   [≡]     │
│   │  (no filter applied)                           │
└─────────────────────────────────────────────────────┘
```

### Pros
- ✅ **Discoverable**: Filter icon on the group makes it obvious where to click
- ✅ **Scoped by design**: Each filter only shows relevant options
- ✅ **No confusion**: ADO filters only affect ADO, GitHub filters only affect GitHub
- ✅ **Existing VS Code pattern**: Inline actions on tree items are well-supported

### Cons
- ⚠️ **Multiple clicks to filter**: If user wants to filter both backends, they click twice
- ⚠️ **Description bar clutter**: Active filters shown in description can get long
- ⚠️ **Tree depth**: 4 levels deep (Backend → Org → Project → Milestone → Item) may feel heavy

---

## Variant B: Context Menu Filters

Filters are accessed via right-click context menu on group nodes. Cleaner tree, more hidden.

```
┌─ WORK ITEMS ────────────────────────────────────────┐
│ ↻ 🔍 ⚙️                                             │
├─────────────────────────────────────────────────────┤
│ ▼ Azure DevOps                                      │
│   │  ▼ microsoft                                    │
│   │  │  ▼ vscode-copilot     · 3 items             │
│   │  │  │  🔵 #4521 Fix auth timeout               │
│   │  │  │  🟢 #4519 Add retry logic                │
│   │  │  │  ⚪ #4515 Update docs                    │
│   │                                                 │
│ ▼ GitHub                                           │
│   │  ▼ microsoft                                    │
│   │  │  ▶ copilot-cli        · 5 issues            │
│   │  │  ▶ editless           · 2 issues            │
└─────────────────────────────────────────────────────┘

Right-click "Azure DevOps" →
┌─────────────────────────────┐
│ Filter ADO Items...      ≡  │
│ Clear ADO Filter         ✕  │
│ ─────────────────────────── │
│ Refresh                  ↻  │
│ Configure ADO...         ⚙  │
└─────────────────────────────┘

Right-click "copilot-cli" →
┌─────────────────────────────┐
│ Filter This Repo...      ≡  │
│ Clear Repo Filter        ✕  │
│ ─────────────────────────── │
│ View in Browser          ↗  │
│ Copy Repo Name           📋 │
└─────────────────────────────┘
```

### Filtered State Visual
```
┌─ WORK ITEMS ────────────────────────────────────────┐
│ ↻ 🔍 ⚙️ ✕                                           │
├─────────────────────────────────────────────────────┤
│ ▼ 🔷 Azure DevOps              · filtered          │
│   │  ▼ microsoft                                    │
│   │  │  ▼ vscode-copilot     · 1 item (filtered)   │
│   │  │  │  🔵 #4521 Fix auth timeout               │
│   │                                                 │
│ ▼ GitHub                                           │
│   │  ...                                           │
└─────────────────────────────────────────────────────┘

🔷 = tinted icon or badge indicating filter is active
```

### Pros
- ✅ **Clean tree**: No visual clutter when not filtering
- ✅ **Natural discovery**: Right-click is standard VS Code interaction
- ✅ **Groupable actions**: Filter lives with other group-level actions (configure, refresh)

### Cons
- ⚠️ **Hidden affordance**: Users might not know to right-click
- ⚠️ **Filter state less visible**: Need to look at description or icon change to see if filtered
- ⚠️ **Accessibility**: Context menus can be harder for keyboard-only users

---

## Variant C: Collapsible Filter Sections (Embedded)

Filters are embedded IN the tree as collapsible children of each backend node.

```
┌─ WORK ITEMS ────────────────────────────────────────┐
│ ↻ ⚙️                                                │
├─────────────────────────────────────────────────────┤
│ ▼ Azure DevOps                                      │
│   │  ▶ ⚙ Filters                    (click to set) │
│   │  ▼ microsoft                                    │
│   │  │  ▼ vscode-copilot                           │
│   │  │  │  🔵 #4521 Fix auth timeout               │
│   │  │  │  🟢 #4519 Add retry logic                │
│   │                                                 │
│ ▼ GitHub                                           │
│   │  ▶ ⚙ Filters                    (click to set) │
│   │  ▼ microsoft                                    │
│   │  │  ▶ copilot-cli                              │
│   │  │  ▶ editless                                 │
└─────────────────────────────────────────────────────┘
```

### Expanded Filter Section
```
│ ▼ Azure DevOps                                      │
│   │  ▼ ⚙ Filters                                   │
│   │  │  │  Type: Bug, Task         [Edit] [Clear]  │
│   │  │  │  State: Active           [Edit] [Clear]  │
│   │  │  │  Tags: (none)            [Edit]          │
│   │  ▼ microsoft                                    │
│   │  │  ...                                        │
```

Or as interactive tree items:
```
│ ▼ Azure DevOps                                      │
│   │  ▼ ⚙ Filters                        [Clear All]│
│   │  │  [✓] Type                                   │
│   │  │  │   • Bug                           [✕]    │
│   │  │  │   • Task                          [✕]    │
│   │  │  [✓] State                                  │
│   │  │  │   • Active                        [✕]    │
│   │  │  [ ] Tags                      (click to add)│
│   │  ▼ microsoft                                    │
```

### Pros
- ✅ **Always visible**: Filter state is part of the tree, not hidden
- ✅ **Self-documenting**: Users see what filters exist without clicking
- ✅ **Edit in place**: Can add/remove individual filter values without full QuickPick

### Cons
- ⚠️ **Tree bloat**: Adds 1-4 extra tree nodes per backend
- ⚠️ **Unusual pattern**: Not common in VS Code extensions—may confuse users
- ⚠️ **Implementation complexity**: Need custom tree item types for filter chips
- ⚠️ **Vertical space**: Filters expanded means less room for actual work items

---

## Variant D: Hybrid (Recommended)

Combine the best of Variants A and B: **inline icon** for quick access, **context menu** for power users, **description text** for filter state.

```
┌─ WORK ITEMS ──────────────────── ↻ ≡ ✕ ⚙️ ─────────┐
│                                  ↑ global filter    │
├─────────────────────────────────────────────────────┤
│ ▼ Azure DevOps                              [≡]    │
│   │  ▼ microsoft                                    │
│   │  │  ▼ vscode-copilot         · 3 items         │
│   │  │  │  🔵 #4521 Fix auth timeout               │
│   │  │  │  🟢 #4519 Add retry logic                │
│   │  │  │  ⚪ #4515 Update docs                    │
│   │                                                 │
│ ▼ GitHub                                    [≡]    │
│   │  ▼ microsoft                                    │
│   │  │  ▼ copilot-cli                      [≡]    │
│   │  │  │  ▼ v0.1.1  (milestone)                   │
│   │  │  │  │  #42 Implement streaming              │
│   │  │  │  │  #41 Fix error handling               │
│   │  │  │  ▶ No Milestone                          │
│   │  │  ▼ editless                         [≡]    │
│   │  │  │  #339 Unified discovery flow             │
└─────────────────────────────────────────────────────┘

Legend:
 ↻  = Refresh all
 ≡  = Global filter (combines all backends) — KEEP for quick filtering
 ✕  = Clear all filters
 ⚙️ = Configure sources
[≡] = Inline filter icon (appears on hover) — scoped to that level
```

### Interaction Model

1. **Global filter (toolbar ≡)**: Opens the existing multi-backend QuickPick, but with smarter backend-aware matching per the original proposal. Good for "show me all active bugs everywhere."

2. **Level filter (inline [≡])**: Opens a scoped QuickPick for that level only.
   - On "Azure DevOps": Filter by ADO type, state, tags
   - On "GitHub": Filter by state only (labels are per-repo)
   - On repo (e.g., "copilot-cli"): Filter by labels, state, milestone
   - On milestone: Filter by labels, state (subset of items)

3. **Right-click anywhere**: Shows context menu with "Filter...", "Clear Filter", plus existing actions.

4. **Filter badge/description**: When a filter is active, the group node shows a hint:
   ```
   ▼ Azure DevOps              · Bug, Active    [≡] [✕]
   ```

### Why This Works

- **Progressive disclosure**: Global filter for simple cases, level filters for power users
- **No breaking change**: Toolbar buttons work exactly as before
- **Natural scoping**: Filters at the ADO level can't accidentally affect GitHub items
- **VS Code native**: Inline actions + context menus are standard patterns

---

## VS Code TreeView API Feasibility

### What's Possible

| Feature | API Support |
|---------|-------------|
| Inline action icons on hover | ✅ `view/item/context` with `group: "inline"` |
| Context menu on right-click | ✅ `view/item/context` menus |
| Description text on tree items | ✅ `TreeItem.description` |
| Icon changes (e.g., filtered badge) | ✅ `TreeItem.iconPath` |
| Collapsible groups | ✅ `TreeItemCollapsibleState.Collapsed` |
| Different context values per level | ✅ `TreeItem.contextValue` (e.g., `ado-group`, `github-group`, `repo-group`) |

### What Needs Custom Code

- **Filter state per level**: Store in provider (e.g., `Map<string, LevelFilter>`)
- **Scoped QuickPick**: Command reads `contextValue` to determine which options to show
- **Combined filter evaluation**: When item passes global + level filters both

### New Context Values

```json
{
  "ado-backend": "ADO top-level group",
  "github-backend": "GitHub top-level group", 
  "ado-org": "ADO organization",
  "github-org": "GitHub organization",
  "ado-project": "ADO project",
  "github-repo": "GitHub repository",
  "milestone-group": "GitHub milestone (existing)",
  "ado-work-item": "ADO work item (existing)",
  "work-item": "GitHub issue (existing)"
}
```

### package.json Additions

```json
{
  "view/item/context": [
    {
      "command": "editless.filterLevel",
      "when": "view == editlessWorkItems && viewItem =~ /^(ado|github)-(backend|org|project|repo)$/",
      "group": "inline@1"
    },
    {
      "command": "editless.clearLevelFilter",
      "when": "view == editlessWorkItems && viewItem =~ /^(ado|github)-(backend|org|project|repo)$/ && editless.levelFiltered",
      "group": "inline@2"
    }
  ]
}
```

---

## Empty/Filtered States

### No Items (No Filter)
```
│ ▼ Azure DevOps                                      │
│   │  ✓ No assigned work items                       │
│                                                     │
│ ▼ GitHub                                           │
│   │  ✓ No assigned issues                          │
```

### No Items (Filter Active)
```
│ ▼ Azure DevOps              · Bug, Active    [≡] [✕]│
│   │  ≡ No items match filter — clear?              │
│                                                     │
│ ▼ GitHub                    · release:v0.1   [≡] [✕]│
│   │  ≡ No items match filter — clear?              │
```

The "No items match filter — clear?" item is clickable → clears that level's filter.

### Mixed State (Some Levels Filtered)
```
│ ▼ Azure DevOps              · Bug            [≡] [✕]│
│   │  ▼ microsoft                                    │
│   │  │  🔵 #4521 Fix auth timeout                  │
│                                                     │
│ ▼ GitHub                                    [≡]    │
│   │  ▼ microsoft                                    │
│   │  │  ▼ copilot-cli        · release:v0.1 [≡] [✕]│
│   │  │  │  #42 Implement streaming                 │
│   │  │  ▼ editless                         [≡]    │
│   │  │  │  (no filter — showing all)               │
```

---

## QuickPick Interaction Summary

| Trigger | Scope | Options Shown |
|---------|-------|---------------|
| Toolbar ≡ | Global | All backends, all sources, all filter types |
| [≡] on "Azure DevOps" | ADO only | Types, States, Tags |
| [≡] on "GitHub" | All GitHub repos | States only (labels are per-repo) |
| [≡] on specific repo | That repo only | Labels, States, Milestones |
| [≡] on milestone | That milestone | Labels, States |

---

## Recommendation

**Implement Variant D (Hybrid)** with these priorities:

1. **Phase 1**: Add backend-level hierarchy (ADO, GitHub as top-level nodes)
2. **Phase 2**: Add inline filter icons on backend groups
3. **Phase 3**: Add repo-level filter icons for GitHub repos
4. **Phase 4**: Deprecate global filter toolbar button (or keep as "filter all")

This gives Casey the scoped, hierarchical filter model he requested while preserving the quick global filter for simple use cases.

---

## Open Questions for Casey

1. **Hierarchy depth**: Should we show Org level (microsoft/) or collapse directly to Project/Repo?
2. **Milestone grouping**: Keep milestones as a grouping level, or flatten to repo level?
3. **Global filter**: Keep toolbar filter button, or replace entirely with level-scoped filters?
4. **Empty backend**: If user has no ADO configured, hide "Azure DevOps" node entirely or show "Configure ADO"?

---

## Next Steps

1. Casey reviews mockups and picks preferred variant (or mixes elements)
2. Summer refines based on feedback
3. Morty implements chosen design
4. Summer reviews implementation UX
