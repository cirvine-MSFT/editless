# Removal Batch 2 — Architecture Review

**Date:** 2026-02-20
**Author:** Rick (Lead)
**Status:** Merged

## Context

Four draft PRs removing v0.1 cruft identified in the retrospective. All targeted the same master SHA, reviewed and merged sequentially.

## PRs Reviewed

| PR | Issue | Verdict | Notes |
|----|-------|---------|-------|
| #352 | #311 Remove custom commands | ✅ APPROVE | Textbook removal. 4 files, -45 lines. |
| #353 | #306 Remove plan detection | ⚠️ APPROVE w/ notes | 3 dead imports left: `fs`, `path`, `TEAM_DIR_NAMES` in work-items-tree.ts |
| #354 | #302 Simplify session state | ✅ APPROVE | active/inactive/orphaned replaces broken 5-state model |
| #355 | #312 Remove CLI provider | ⚠️ APPROVE w/ notes | `getLaunchCommand()` duplicated in 3 files |

## Architectural Observations

### 1. getLaunchCommand duplication (from #355)
`getLaunchCommand()` is now defined identically in `discovery.ts`, `extension.ts`, and `terminal-manager.ts`. Each reads `editless.cli.launchCommand` with the same default. Should be extracted to a shared `cli-settings.ts` module before it drifts.

### 2. Dead imports (from #353)
`work-items-tree.ts` still imports `fs`, `path`, and `TEAM_DIR_NAMES` after plan detection removal. These are unused. Either lint isn't catching unused imports or `noUnusedLocals` isn't enabled for namespace imports.

### 3. Session state model is now honest
The old working/waiting-on-input/idle/stale model pretended to know things we couldn't reliably detect. The new active/inactive/orphaned model maps directly to observable signals (shell execution API). This is the right call — don't show information you can't trust.

### 4. Merge order matters for removal batches
These 4 PRs all based on the same SHA. Merging #352/#353/#354 first caused conflicts in #355 (terminal-manager.test.ts). Future batches should either rebase proactively or merge in dependency order.

## Follow-up Items

- [ ] Extract `getLaunchCommand()` to shared module (`cli-settings.ts`)
- [ ] Clean dead imports in `work-items-tree.ts` (`fs`, `path`, `TEAM_DIR_NAMES`)
- [ ] Consider enabling `noUnusedLocals` in tsconfig if not already set
