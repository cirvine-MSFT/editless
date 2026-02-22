# Session: Filter Redesign & Hierarchical UX (2026-02-22)

**Objective:** Design and implement hierarchical, backend-scoped filtering for work items.

## Team Summary

- **Summer**: Product Designer → UX mockups exploring flat QuickPick vs. hierarchical tree view. Casey's feedback drove pivot to hierarchical approach (Variant D).
- **Morty**: Extension Dev → Implemented 700-passing test suite with hierarchical work items tree (ADO/GitHub → Org → Project/Repo). Committed `873c8fe`.
- **Meeseeks**: QA → Filled 18 test gaps earlier (682→700 tests). Committed `124bb7b`.

## Decision Finalized

**Hierarchical, backend-aware filter model** (Variant D):
- Backend (ADO/GitHub) → Org → Project hierarchy with per-level filter icons
- Filter dimensions scoped to backend (ADO types only filter ADO, GitHub labels only affect GitHub)
- Inline filter affordances + scoped QuickPicks per level
- Global toolbar filter preserved for simple multi-backend filtering

## What Was Decided

1. **Architecture**: Split `labels` field → `githubLabels` + `adoTags`; rename `types` → `adoTypes`
2. **UI**: Inline `[≡]` icons on backend/org/repo nodes; right-click for context menu filters
3. **Behavior**: Apply only relevant filter dimensions per backend (no cross-contamination)
4. **Out of scope**: Filter persistence, per-repo profiles (Phase 2+)

## Test Coverage

- 700 tests passing (hierarchical tree structure verified)
- Backend-aware filter logic ready for integration

## Artifacts

- `.squad/decisions/inbox/summer-filter-ux-redesign.md` — Flat approach (rejected)
- `.squad/decisions/inbox/summer-filter-hierarchy-mockup.md` — Hierarchical mockup (chosen)
- Merged into `.squad/decisions.md` (canonical decision log)

## Next Steps

1. Morty continues implementation of inline filter icons
2. Summer reviews UX on real extension
3. Prep for Phase 2: Per-repo filter profiles, persistence

---

**Session Created:** 2026-02-22  
**Team:** Summer, Morty, Meeseeks  
**Status:** Decision finalized, implementation underway
