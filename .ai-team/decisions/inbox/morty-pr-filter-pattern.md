# PR Filter Mirrors Work Items Filter Pattern

**Date:** 2026-02-17
**Author:** Morty (Extension Dev)

The PR filter in `prs-tree.ts` mirrors the work items filter pattern exactly:
- `PRsFilter` interface with `repos`, `labels`, `statuses` arrays
- `setFilter()` / `clearFilter()` / `isFiltered` / `getFilterDescription()`
- `matchesLabelFilter()` with OR-within-group / AND-across-groups logic
- Context key `editless.prsFiltered` for menu visibility
- `view/title` menu buttons with `$(filter)` and `$(clear-all)` icons

When adding filter support to future tree views, follow this same pattern. The `matchesLabelFilter()` logic is duplicated between work-items-tree.ts and prs-tree.ts — a future refactor could extract it to a shared utility.
