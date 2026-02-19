# Feature Removal Checklist Must Include Documentation

**Date:** 2026-02-19
**Author:** Rick (Lead)
**Context:** PR #320 review — Remove terminal layout restore feature (#309)

## Decision

When removing a feature, the removal checklist must include documentation cleanup alongside code cleanup. The checklist is:

1. **Source file** — delete the module
2. **Test file** — delete dedicated tests
3. **Extension wiring** — remove import + instantiation from `extension.ts`
4. **Test mocks** — remove `vi.mock` declarations in other test files that mock the deleted module
5. **Settings** — remove from `package.json` contributes.configuration
6. **Documentation** — search `docs/` for all references (architecture.md, SETTINGS.md, local-development.md, etc.)
7. **CHANGELOG** — update or annotate removed features

## Rationale

PR #320 had a clean code removal but missed 7 documentation references across 3 doc files. This is the same gap we saw in #303 (squad upgrade removal). Making docs cleanup explicit in the checklist prevents this recurring pattern.

## Impact

All team members performing feature removals (primarily Morty) should follow the expanded checklist. Summer should be consulted when doc changes are non-trivial.
