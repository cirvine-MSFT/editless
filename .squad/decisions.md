### 2026-03-02: Worktree Feature — Resolved Design Decisions

**Date:** 2026-03-01  
**Author:** Casey Irvine (via Copilot)  
**Status:** Decided  
**Issue Context:** #422 (clone to worktree), #442 (auto-discover worktrees), #348 (branch labels)

---

## Decisions

### 1. Workspace Membership: Hybrid with "already in workspace" awareness

Worktrees are discovered via `git worktree list --porcelain`, NOT via workspace folder scan. A worktree is shown if its path is **under any workspace folder** (not just a top-level workspace folder). No need to "Add Folder to Workspace" separately if the worktree lives under an already-open parent folder.

Setting `editless.discovery.worktreesOutsideWorkspace` (default: false) shows worktrees outside the workspace, rendered dimmed.

### 2. Settings Inheritance: Field-by-field merge

```
Parent:    { model: "sonnet", additionalArgs: "--yolo", icon: "🔷" }
Worktree:  { model: "gpt-5.2-codex" }
Effective: { model: "gpt-5.2-codex", additionalArgs: "--yolo", icon: "🔷" }
```

Implementation: `{ ...parentSettings, ...worktreeOverrides }` — override one field, inherit the rest.

### 3. Hiding: Cascading + Independent

- Hiding a parent squad hides the parent AND all its worktrees (cascade down)
- Individual worktrees CAN be hidden independently (without affecting parent or siblings)
- Example: Hide 🌿 feat/old-experiment → only that worktree disappears
- Example: Hide 🔷 EditLess (parent) → entire squad + all worktrees disappear
- Implementation: `isHidden(id)` checks own ID first, then checks parent ID if it's a worktree

### 4. Clone-to-worktree (#422): Create + auto-add to workspace, no auto-session

Right-click → "Clone to Worktree" → prompt branch + path → `git worktree add` → auto-add folder to VS Code workspace. Does NOT auto-launch a session. Discovery handles tree appearance.

### 5. Dedup: Worktree-aware dedup before standard dedup

Detect worktree relationships via `git worktree list` BEFORE running dedup. Main checkout = parent, worktree copies = children with IDs `{parentId}:wt:{branch-kebab}`.

### 6. Branch info source: DiscoveredItem.branch

Terminal labels (#348) use `DiscoveredItem.branch` populated by `enrichWithWorktrees()` via `git worktree list`. Always available, no running session needed.

---

### 2026-02-28: Debounce Pattern for TerminalManager Change Events

**Author:** Morty  
**Date:** 2026-02-28  
**Issue:** #438  
**PR:** #439

## Decision

All `TerminalManager._onDidChange.fire()` calls are now routed through a 50ms debounced `_scheduleChange()` method. The `treeView.reveal()` call in `onDidChangeActiveTerminal` is separately debounced at 100ms.

## Rationale

During active terminal sessions, rapid-fire events (shell execution start/end, session watcher callbacks, reconciliation) caused the tree to rebuild multiple times per frame. The `reveal()` call would race with these rebuilds, resulting in stale or missed selections. Batching events into a single 50ms window eliminates redundant rebuilds, and the 100ms reveal delay ensures the tree has settled before selection.

## Impact

- Any new code that needs to signal a tree change in TerminalManager should call `this._scheduleChange()` instead of `this._onDidChange.fire()`.
- Tests asserting synchronous fire behavior must use `vi.useFakeTimers()` + `vi.advanceTimersByTime(50)`.

---

### 2026-03-01: v0.2 Branching Strategy — release/v0.1.x for Hotfixes, main for v0.2

**Date:** 2026-03-01  
**Author:** Birdperson (DevOps)  
**Status:** Proposed  
**Issue Context:** #438 (v0.1.3 hotfix), #399 (v0.2 refactor already merged)

## Context

PR #427 (auto-discover refactor) merged to main on 2026-02-27. This is a significant architectural change that belongs in v0.2, not v0.1.x. Meanwhile, PR #439 is a small debounce bug fix suitable for v0.1.3 hotfix release.

**Problem:** Main branch is already on the v0.2 track. We need a way to ship v0.1.3 hotfixes from the stable v0.1.2 codebase without backporting the v0.2 refactor.

## Decision

**Branching Model:**

1. **elease/v0.1.x** — Long-lived hotfix branch for v0.1 releases
   - Branched from 0.1.2 tag
   - Receives v0.1.3, v0.1.4, etc. bug fixes
   - Tagged as 0.1.3, 0.1.4, etc.

2. **main** — v0.2 development (current state)
   - Continues forward with v0.2 features and refactors
   - Eventually tagged as 0.2.0 when ready

3. **Hotfix flow:**
   - PR targets elease/v0.1.x (e.g., PR #439)
   - After merge, tag 0.1.3 on elease/v0.1.x
   - Cherry-pick to main if fix is still relevant (not always needed if v0.2 changes eliminate the bug)

4. **Feature flow:**
   - PR targets main (business as usual)
   - Tagged as 0.2.0-beta.1, 0.2.0-beta.2, etc. during development if needed

## Rationale

**Why elease/v0.1.x instead of keeping main stable?**
- Main already contains v0.2 changes (PR #427 merged). Reverting would be messy.
- Release branches are the standard Git-flow pattern for LTS maintenance.

**Why this works for Casey's worktree workflow:**
- Casey can have worktrees for both:
  - ~/code/work/editless-v01 (release/v0.1.x branch) — hotfix work
  - ~/code/work/editless (main branch) — v0.2 feature work
- Or use the git-worktree skill to manage them
- Both branches are long-lived and stable, not ephemeral

**Why not a dev/v0.2 feature branch?**
- Main is already committed to v0.2. A feature branch would require all existing squad/* branches to rebase onto dev/v0.2, which is disruptive.

## Implementation

**Commands to create the release branch:**
\\\ash
git checkout v0.1.2
git checkout -b release/v0.1.x
git push -u origin release/v0.1.x
\\\

**Update PR #439:**
- Change base branch from master to elease/v0.1.x
- After merge, tag 0.1.3 on elease/v0.1.x
- Cherry-pick to main if needed: git cherry-pick <commit-sha>

**Tag convention:**
- v0.1.x releases: 0.1.3, 0.1.4, ... (on elease/v0.1.x)
- v0.2 releases: 0.2.0-beta.1, 0.2.0, ... (on main)

## Two-Sentence Summary

**release/v0.1.x** is the hotfix branch for v0.1.3+ releases; **main** is now the v0.2 development branch. Hotfixes land on release/v0.1.x, get tagged there, and are cherry-picked to main if needed.

## Open Questions

1. Should we update CI workflows to run on elease/v0.1.x pushes?
2. Do we want automated cherry-pick reminders (e.g., a GitHub Action that comments on PRs merged to release/v0.1.x)?
3. Should we protect the elease/v0.1.x branch with the same rules as main?

## Files Modified (if approved)

- .squad/decisions.md — append this decision
- .github/workflows/ci.yml — add elease/v0.1.x to branch triggers (if we want CI on hotfix branch)
- PR #439 — update base branch to elease/v0.1.x

---
### 2026-03-01: v0.2 Milestone Plan — Worktree Integration

**Created:** 2026-03-01  
**Author:** Rick  
**Status:** APPROVED for execution

---

## Theme

v0.2 is the **worktree integration release**. EditLess becomes first-class for multi-worktree development — agents/squads follow worktree context, terminals are disambiguated by branch, and UX polish eliminates friction points.

---

## Scope (9 issues)

### Core Worktree Features (2)
- **#422** — Clone agent/squad in worktree (⭐ centerpiece feature)
- **#348** — Branch name in terminal labels for worktree disambiguation

### UX Improvements (3)
- **#440** — Auto-pick non-conflicting icons for new agents
- **#332** — Terminal link provider (clickable PRs/issues in output)
- **#329** — Copilot Sessions tree view (browse/resume sessions)

### Foundational Refactors (4)
- **#432** — Fix SessionContextResolver custom config directory support
- **#429** — Rename squad→agent for generic functions/types
- **#395** — Refactor: Separate state management from UI in editless-tree.ts
- **#394** — Refactor: Extract BaseTreeProvider from work-items-tree and prs-tree

---

## Triage Decisions

### Added to v0.2 (from unlabeled):
- **#432** — SessionContextResolver is foundational for worktree work; session resolution must work reliably before we add worktree-aware cloning
- **#429** — squad→agent rename is a natural post-#427 chore that keeps codebase clean for new worktree features

### Moved to backlog:
- **#282** (telemetry) — Nice-to-have, not urgent for worktree release
- **#43** (visual docs) — Needs planning, not blocking v0.2 ship

### Out of scope (already labeled elsewhere):
- **#438** (tree view session tabs) — staying in v0.1.3 with draft PR #439
- **#247, #246** (test antipatterns, god objects) — remain in backlog

---

## Execution Plan

### Phase 1: Foundation (refactors that unblock features)
**Start tonight. Parallel work. No blockers.**

1. **#394** — Extract BaseTreeProvider  
   - **Owner:** Morty  
   - **Effort:** 4–6 hours  
   - **Risk:** Medium (tree structure changes, regression risk)  
   - **Testing:** Verify work-items-tree and prs-tree still render correctly, test expand/collapse, test refresh  
   - **Blocks:** #395 (state management refactor builds on this)

2. **#432** — Fix SessionContextResolver custom config dirs  
   - **Owner:** Summer  
   - **Effort:** 3–4 hours  
   - **Risk:** Low (focused change in session-context.ts)  
   - **Testing:** Verify resume works with --config flag, verify CWD index, verify plan resolution  
   - **Blocks:** #422 (worktree cloning depends on session resolution working reliably)

3. **#429** — Rename squad→agent for generic functions  
   - **Owner:** Morty  
   - **Effort:** 2–3 hours (bulk rename + test updates)  
   - **Risk:** Low (mechanical change, depends on #427 being merged)  
   - **Testing:** Run full test suite, verify no context value breakage  
   - **Depends on:** PR #427 (auto-discover refactor) must merge first  
   - **Blocks:** Nothing (cleanup work)

**Phase 1 exit criteria:** BaseTreeProvider extracted, SessionContextResolver supports custom configs, squad→agent terminology cleaned up, #427 merged.

---

### Phase 2: Worktree Core (key features)
**Cannot start until #432 and #394 complete.**

4. **#422** — Clone agent/squad in worktree ⭐  
   - **Owner:** Unity  
   - **Effort:** 6–8 hours  
   - **Risk:** High (new command, worktree detection, .squad/ directory cloning logic)  
   - **Testing:** Clone squad in worktree, verify .squad/ structure, verify agents spawn correctly, test edge cases (no .squad/, nested worktrees)  
   - **Depends on:** #432 (session resolution), #394 (tree provider refactor for UI updates)  
   - **Blocks:** Nothing (this IS the centerpiece)

5. **#395** — Refactor: Separate state management from UI in editless-tree.ts  
   - **Owner:** Morty  
   - **Effort:** 5–7 hours  
   - **Risk:** High (core tree logic, tight coupling to refactor)  
   - **Testing:** Verify tree updates correctly, test drag-drop, test visibility toggles, test auto-refresh  
   - **Depends on:** #394 (BaseTreeProvider must be extracted first)  
   - **Blocks:** Nothing (quality improvement)

6. **#348** — Branch name in terminal labels for worktree disambiguation  
   - **Owner:** Summer  
   - **Effort:** 2–3 hours  
   - **Risk:** Low (UI label change, git branch detection)  
   - **Testing:** Verify labels show branch in worktree context, verify main repo still works  
   - **Depends on:** #422 (worktree feature ships first, then we add disambiguation)  
   - **Blocks:** Nothing

**Phase 2 exit criteria:** Worktree cloning works, terminal labels disambiguate by branch, state management is clean.

---

### Phase 3: UX Polish (nice-to-haves)
**Can start anytime. No dependencies.**

7. **#440** — Auto-pick non-conflicting icons for new agents  
   - **Owner:** Summer  
   - **Effort:** 3–4 hours  
   - **Risk:** Low (icon selection logic, no breaking changes)  
   - **Testing:** Add 5 agents, verify icons don't conflict, verify manual override still works  
   - **Blocks:** Nothing

8. **#332** — Terminal link provider (clickable PRs/issues)  
   - **Owner:** Summer  
   - **Effort:** 4–5 hours  
   - **Risk:** Medium (VS Code API integration, regex patterns)  
   - **Testing:** Print PR/issue URLs in terminal, verify click opens browser, test edge cases (invalid refs)  
   - **Blocks:** Nothing

9. **#329** — Copilot Sessions tree view (browse/resume)  
   - **Owner:** Unity  
   - **Effort:** 6–8 hours  
   - **Risk:** Medium (new tree view, session discovery logic)  
   - **Testing:** Verify session list populates, verify resume works, test stale session cleanup  
   - **Blocks:** Nothing

**Phase 3 exit criteria:** Icon auto-selection works, terminal links are clickable, sessions tree view is functional.

---

## Critical Path

\\\
Phase 1: #394 (BaseTreeProvider) → #395 (state management)
         #432 (SessionContextResolver) → #422 (worktree clone) → #348 (branch labels)
         #429 (squad→agent rename) [parallel, no blockers]

Phase 2: #422 ⭐ worktree clone (CENTERPIECE)
         #395, #348 (follow-ons)

Phase 3: #440, #332, #329 [all parallel]
\\\

**Longest path:** #394 → #395 (11–13 hours)  
**Blocking path:** #432 → #422 → #348 (11–15 hours)

**Total effort estimate:** ~40–50 dev hours across 3–4 devs = ~2 weeks elapsed with parallel work.

---

## Start Tonight

**Immediate actionable work (no dependencies):**
1. ✅ Morty starts #394 (BaseTreeProvider extraction)
2. ✅ Summer starts #432 (SessionContextResolver fix)
3. ⏳ Wait for #427 to merge, then Morty picks up #429 (squad→agent rename)

**Tomorrow (once #427 merges):**
- Morty finishes #394, picks up #429 or #395
- Summer finishes #432, picks up #348 or #440
- Unity starts #422 once #432 completes

**Phase 3 can start anytime** — Summer or Unity can pick up #440, #332, or #329 in parallel with Phase 2.

---

## Risk Mitigation

1. **Tree structure changes (#394, #395)** — High regression risk. Requires comprehensive manual testing of work-items-tree and prs-tree. Add visual regression checks if possible.

2. **Worktree clone (#422)** — New feature, new failure modes. Test matrix: main repo, worktree with .squad/, worktree without .squad/, nested worktrees, git worktree not available.

3. **Dependencies on #427** — Issue #429 blocks on auto-discover refactor merge. Monitor PR #427 status daily; merge conflicts will delay Phase 1.

4. **Session resolution (#432)** — Foundation for worktree work. If fix is incomplete, worktree cloning will inherit the bug. Validate against multiple config directories before marking done.

---

## Release Narrative

**"v0.2 makes EditLess multi-worktree native."**

- Work on feature branches in separate worktrees without losing agent/squad context
- Terminal labels show branch names so you never mix up which worktree you're in
- Clone your squad configuration to a new worktree with one command
- Auto-selected icons eliminate visual clutter when spawning new agents
- Clickable PR/issue links in terminal output for faster context switching
- Browse and resume past Copilot sessions from the new Sessions tree view

**Target audience:** Developers who use git worktrees for parallel feature development (i.e., Casey and advanced Git users).

---

## Success Metrics

- [ ] All 9 issues closed
- [ ] No regressions in existing tree views (work items, PRs, agents)
- [ ] Worktree clone command works in real-world Casey dogfooding
- [ ] Branch labels appear correctly in multi-worktree scenarios
- [ ] Icon auto-selection reduces onboarding friction (subjective, measure by Casey feedback)

---

## Post-v0.2 Backlog Grooming

After v0.2 ships, recommend:
1. Promote #247 (LLM test antipatterns) to v0.3 — quality debt is accumulating
2. Consider #246 (god objects) for v0.3 — editless-tree.ts refactor in #395 should inform this
3. Keep #282 (telemetry) in backlog until we have clear requirements
4. Revisit #43 (visual docs) after worktree features ship — better to document working UX

---
### 2026-02-26: Encapsulate Settings Persistence

**Date:** 2026-02-26  
**Author:** Copilot (as Rick)  
**Status:** Implemented  
**Commit:** 3b315c9

## Context

`AgentSettingsManager` was a passive data store, with `extension.ts` responsible for watching the underlying JSON file for changes. This leaked implementation details and led to scattered responsibility.

## Decision

`AgentSettingsManager` now:
1. Watches its own `agent-settings.json` file
2. Exposes an `onDidChange` event
3. Reloads itself automatically on change

`extension.ts` now subscribes to `agentSettings.onDidChange` to trigger UI refreshes, rather than watching the file system directly.

## Consequences

- Better encapsulation: `extension.ts` doesn't need to know about the file path or filesystem events
- Consistent state: `AgentSettingsManager` is always up-to-date with disk
- Implements `Disposable` for proper lifecycle management

---


### 2026-02-26: Eliminate agent-registry.json — Auto-Discover Refactor

**Date:** 2026-02-26  
**Author:** Morty  
**Status:** Implemented  
**Issue:** #399

## Context

The `agent-registry.json` file was a centralized registry that required explicit "Add to Registry" actions for discovered agents. This created friction — users had to manually promote items, and the registry was a single point of failure for the tree view.

## Decision

Replace `EditlessRegistry` + `AgentVisibilityManager` with a single `AgentSettingsManager` backed by `globalStorageUri/agent-settings.json`. All discovery results auto-show in a flat list. Settings file stores only overrides (hidden, model, name, icon, additionalArgs).

### Key Design Choices

1. **Persistence:** `globalStorageUri/agent-settings.json` — stable across workspace changes
2. **Key strategy:** ID-only keys (kebab-case)
3. **No "Discovered" section:** Everything auto-shows flat. No "Add to Registry" concept.
4. **Hidden agents shown inline, dimmed:** Gray icon via `ThemeColor('disabledForeground')`, "(hidden)" in description, contextValue `squad-hidden` enables "Show" context menu
5. **Reactivity:** Direct path for user actions (sync write + immediate refresh), 300ms debounced discovery for filesystem changes
6. **Migration:** Old registry.json automatically migrated on first load, renamed to .bak

## Impact

- Deleted: `src/registry.ts`, `src/visibility.ts`
- New: `src/agent-settings.ts`
- Modified: `src/extension.ts`, `src/editless-tree.ts`, `src/unified-discovery.ts`, `src/status-bar.ts`, `src/discovery.ts`, `package.json`
- 6 test files refactored (Meeseeks: 191 failures fixed)
- `discoverAll()` signature changed — no longer takes registry param
- `EditlessTreeProvider` constructor changed — takes `AgentSettingsManager` instead of `EditlessRegistry` + `AgentVisibilityManager`
- `EditlessStatusBar` constructor changed — takes `AgentSettingsManager` instead of `EditlessRegistry`

---

### 2026-02-26: Settings key strategy — ID-only

**Date:** 2026-02-26  
**Author:** Casey Irvine (Squad analysis)  
**Status:** Approved

**What:** `agent-settings.json` uses ID-only keys (e.g., `"editless"`, `"my-agent"`). No path scoping in v1. Per-worktree overrides (layered `id@path` pattern) deferred to v2 when worktree feature ships. Squad IDs are folder-name-based (via `toKebabCase`), agent IDs are filename-based (via `toKebabId`).

**Why:** Simplest approach, naturally supports worktree inheritance (same folder name = same ID = shared settings). Path-scoping is brittle (breaks on move/rename). Collision between two projects with same folder name is graceful (shared preferences, not data loss).

---

### 2026-02-26: No "Discovered" section — everything auto-shows

**Date:** 2026-02-26  
**Author:** Casey Irvine (Squad analysis)  
**Status:** Approved

**What:** Eliminate the "Discovered" section entirely. All agents/squads found on disk appear automatically in the flat tree. No "Add to Registry" / "promoteDiscoveredAgent" command. Users hide agents they don't want (right-click → Hide). Settings entries created lazily — only when user customizes (hide, model, icon, etc.). "Show Hidden Agents" command to bring hidden items back.

**Why:** Simpler UX. Auto-discover means everything is shown by default. The old "discovered → register" two-step flow adds friction with no value when registry is gone.

---

### 2026-02-26: Hidden agents shown inline with dimmed styling

**Date:** 2026-02-26  
**Author:** Casey Irvine (Squad analysis)  
**Status:** Approved

**What:** Hidden agents remain visible in the tree but are visually dimmed — gray icon via `ThemeColor('disabledForeground')`, "(hidden)" in description, `contextValue` changes to show "Show" instead of "Hide" in right-click menu. No separate "Hidden" group. Existing "Show Hidden Agents" command stays as batch unhide path. Pattern already exists in codebase (orphaned sessions use same dimming, line 586 of editless-tree.ts).

**Why:** Casey wants hidden agents to be discoverable and obvious. Complete removal from tree was confusing. Inline dimming is the smallest change that satisfies the requirement. Collapsible group was considered but adds complexity to an already large refactor.

---

### 2026-02-23: Default Exclusion of Closed/Merged Items

**Date:** 2026-02-23  
**Author:** Morty  
**Status:** Implemented  
**Issue:** #390

## Context

Work items and PRs trees showed closed/merged items by default, cluttering the view with stale items.

## Decision

All runtime filters now exclude closed work items and merged/closed PRs by default when no state/status filter is explicitly set. Users can see them by explicitly selecting those states in the filter QuickPick.

## Impact

- Tests that need closed/merged items must explicitly set state/status filters
- `applyRuntimeFilter`, `applyAdoRuntimeFilter`, `_applyGitHubLevelFilter`, and `_applyAdoLevelFilter` all enforce this
- Filter descriptions and `isFiltered` remain unchanged — this is a default behavior, not a visible filter state

---

### 2026-02-23: Filter UX Redesign: Hierarchical Backend-Aware Approach

**Date:** 2026-02-23  
**Status:** Approved (Morty implementing)  
**Context:** Work items filter breaks for multi-backend users (GitHub + ADO) due to flat QuickPick mixing incompatible filter dimensions.

## Decision

Adopt a **hierarchical, backend-scoped filter model** with per-level filtering in the tree view (Variant D from design exploration).

### Core Changes

1. **Tree hierarchy**: Backend (ADO/GitHub) → Org → Project/Repo hierarchy with inline filter icons `[≡]` on each level
2. **Backend-aware matching**: Filter dimensions apply only where relevant—ADO types only filter ADO items, GitHub labels only affect GitHub repos
3. **Per-level QuickPick**: Clicking a level's filter icon opens a scoped QuickPick showing only options for that level
4. **Global toolbar filter**: Preserved for quick multi-backend filtering with smart backend detection
5. **Filter state display**: Group nodes show active filters inline (e.g., `Azure DevOps · Bug, Active`)

### Why Hierarchical Over Flat

- ✅ **No cross-contamination**: ADO types can't accidentally hide GitHub issues
- ✅ **Intuitive scoping**: Users filter at the level they care about
- ✅ **VS Code native**: Inline actions + context menus are standard patterns
- ✅ **Addresses all pain points**: Type filter confusion, label scope mismatch, mixed flat options

### Architecture Changes

- `WorkItemsFilter`: Split `labels` → `githubLabels` + `adoTags`, rename `types` → `adoTypes`
- `applyRuntimeFilter`: Only apply relevant filter dimensions per backend
- `TreeItem.contextValue`: New values for backend/org/project/repo to scope filters

### Out of Scope (Later Phases)

- Filter persistence across sessions (intentional—filters are ephemeral)
- Per-repo filter profiles (overkill for MVP)

## Next Steps

1. Morty: Implement hierarchical tree with backend nodes
2. Morty: Add inline filter icons and scoped QuickPicks
3. Summer: Review implementation UX

---

### 2026-02-18: Dev Tooling: Isolated Environment Strategy

**Date:** 2026-02-18  
**Status:** Implemented  
**Context:** Local development setup for EditLess extension

## Decision

EditLess uses isolated VS Code environments for extension development to ensure clean testing without interference from personal VS Code configurations or other extensions.

## Implementation

1. **`.vscode/launch.json`** — Three debug configurations:
   - "Run Extension" — standard F5 Extension Development Host with pre-build task
   - "Run Extension (Isolated)" — clean environment using `--user-data-dir` and `--disable-extensions`
   - "Extension Tests" — runs vitest integration tests in Extension Development Host

2. **`.vscode/tasks.json`** — Build automation:
   - `npm: build` — default build task (required by launch configs)
   - `npm: watch` — background watch task with esbuild problem matcher

3. **`scripts/dev-isolated.ps1`** — PowerShell script for manual isolated launches:
   - Creates `.editless-dev/user-data/` directories
   - Launches VS Code with isolation flags
   - Includes `-Clean` switch to reset environment
   - Validates extension build before launching

4. **`scripts/dev-worktree.ps1`** — Primary workflow script:
   - Creates worktree + branch for an issue
   - Runs npm install + build
   - Launches isolated VS Code instance

5. **`.gitignore`** — Updated to exclude:
   - `.editless-dev/` — isolated test environments
   - `.vscode/launch.json` IS committed (team-wide config)

## Rationale

Isolated environments are critical for:
- Testing first-run activation and default settings
- Reproducing bugs without personal config interference  
- Verifying no conflicts with other extensions
- Clean state for each test run (via `-Clean` flag)

The three-way approach (debug config, tasks, and script) supports different workflows: F5 debugging in VS Code, manual script launches for testing, and automated builds.

## Key Patterns

- **Isolation flags:** `--user-data-dir=<path>` + `--disable-extensions` + `--extensionDevelopmentPath=<path>`
- **preLaunchTask:** All debug configs reference `${defaultBuildTask}` so esbuild runs before launch
- **Hidden terminals:** Build tasks use `hideFromUser: true` (see #127 decision)
- **Personal vs team config:** `.vscode/launch.json` and `.vscode/tasks.json` are committed

## Impact

This tooling is now the standard for all EditLess extension development. Team members should use "Run Extension (Isolated)" for bug reproduction and first-run testing, and the standard "Run Extension" config for daily development with their personal setup.

---

**Author:** Morty (Extension Dev)

# Workflow Documentation Structure

**Decided by:** Summer  
**Date:** 2026-02-16

## Decision

EditLess workflow how-to guides follow a consistent structure to make them easy to scan, write, and maintain.

## Pattern

Each workflow guide:
1. Opens with a one-sentence goal ("Do X in Y steps")
2. Contains 5–8 numbered steps (plain and scannable)
3. Includes a context subsection ("How to know if you need this" or "Why this matters")
4. Placeholder for future GIF: `<!-- TODO: Add GIF recording for this workflow -->`
5. Ends with three sections:
   - 💡 **Tip:** One pro-tip related to the workflow
   - 📖 **See Also:** Links to related docs
   - Back-link: `← [Back to Common Workflows](README.md)`

## Index Structure

The workflows index (`docs/workflows/README.md`) organizes guides into two sections:
- **Getting Started:** New how-to guides (core features)
- **Advanced Workflows:** Integration-specific docs (GitHub, ADO)

## Why This Works

- **Consistency:** New guides fit the pattern automatically
- **Scannability:** Users can find the steps they need in seconds
- **Extensibility:** Easy to add new workflows without restructuring
- **Future-proof:** GIF placeholders are explicit; no surprise missing recordings
- **Navigation:** Tip callouts and "See Also" links reduce user friction

## Related Docs

- `docs/workflows/README.md` — Index
- `docs/workflows/create-agent.md` — Add agents/squads
- `docs/workflows/create-session.md` — Launch and name sessions
- `docs/workflows/launch-from-work-item.md` — Open from work items

### 2026-02-17: Release Workflow vsce Fix Pattern

**Decided by:** Birdperson  
**Date:** 2026-02-17

## Decision

Use `npx @vscode/vsce` instead of bare `vsce` in CI/CD release workflows.

## Rationale

The v0.1.0 release failed at the marketplace publish step with `vsce: command not found` (exit code 127). The publish step was calling:

```yaml
run: vsce publish -p ${{ secrets.VSCE_PAT }}
```

But `vsce` was not installed or in $PATH. The tool is declared as a devDependency (`@vscode/vsce`), so it exists locally but npm didn't add its binary to $PATH in the GitHub Actions environment.

## Solution

Use npx to resolve the package:

```yaml
run: npx @vscode/vsce publish -p ${{ secrets.VSCE_PAT }}
```

npx:
1. Checks node_modules for `@vscode/vsce` and uses its binary if found
2. Falls back to downloading the package if not present
3. Executes the command in a safe subprocess

## Applies To

Any npm package binary that needs to run in CI. Pattern:
- ❌ Bare command: `vsce`, `tsc`, `eslint` (may not be in $PATH)
- ✅ With npx: `npx @vscode/vsce`, `npx tsc`, `npx eslint`

## Related

- PR: #275 (fix: install vsce before marketplace publish)
- Workflow: `.github/workflows/release.yml` line 83
- Config: `package.json` devDependencies includes `@vscode/vsce`

### 2026-02-17: Release branching strategy — ship from master, no release branches yet

**By:** Casey (via Copilot)  
**What:** v0.1.x bugfix releases and v0.2.0 feature releases both ship from master. No release branches until we need to hotfix an old version while new features are in flight. Version bump in package.json happens right before tagging (not after release). Workflow: fix bugs on master → bump package.json to 0.1.1 → commit → tag v0.1.1 → push tag → pipeline publishes. If we later need to hotfix v0.1.x while v0.2 is in progress, THEN create a `release/v0.1` branch from the last v0.1.x tag and cherry-pick.  
**Why:** Solo dev with one active line of development — release branches add complexity with no benefit right now. Keeping it simple until parallel release lines are actually needed.

### 2026-02-18: v0.1 Retrospective Learnings — Release Quality Gates

**Decided by:** Rick  
**Date:** 2026-02-17

## Decision

For v0.2 and beyond, EditLess releases must pass explicit quality gates before shipping.

## Context

The v0.1 retrospective analysis revealed systematic quality gaps:
- Duplicate PRs merged (PR#207 and PR#210 — same fix merged twice)
- Features shipped then removed (Custom Commands: built, shipped, discovered broken, removed)
- P0 issues labeled `release:v0.1` but still open post-release (#277 Resume Session, #278 Add Agent)
- Core workflows broken post-release (session state detection, clicking sessions, squad update detection)
- 20+ post-release issues (#277-#300) representing UX validation gaps

**Root cause:** Speed prioritized over validation. Aggressive parallel execution (96 PRs in 3 days) without sync points led to duplicate work and insufficient quality checks.

## Quality Gates for Future Releases

### 1. P0 Issue Gate
- All issues labeled `priority:p0` and `release:vX.Y` must be CLOSED before that release ships
- If a P0 cannot be resolved, it must be downgraded or moved to the next release
- No open P0s in release scope

### 2. Core Workflow Validation
- Manual testing checklist before release:
  - Add an agent (happy path + error cases)
  - Launch a session from a work item
  - Resume a crashed session
  - Click items in tree to navigate
  - Filter work items and PRs
- Don't rely on unit tests alone for UX validation

### 3. Code Review Standards
- Reviewers must check:
  - Does this PR duplicate an existing fix? (search closed PRs)
  - Does the feature work end-to-end?
  - Are configuration keys consistent with implementation?
  - Do tests validate behavior, not just mock calls?
- Broken features must not merge

### 4. Release Label Discipline
- `release:vX.Y` means "MUST ship in vX.Y" — enforce strictly
- If an issue is not started by release cutoff, remove the label
- Use `target:vX.Y` or `proposed:vX.Y` for "nice to have" items

### 5. Coordination for Parallel Work
- PR titles must reference issue numbers (makes duplicates visible)
- Assign issues before starting work (prevents collisions)
- Daily async "what are you working on?" check-ins during sprint

## Why This Matters

v0.1 shipped functional but rough. The technical foundation is solid (CLI Provider system, session persistence, CI/CD), but quality gaps degraded user experience.

v0.2 should focus on refinement: fix broken flows (#277, #278), rework session state model, reduce coupling (#246), improve test signal (#247).

**Goal:** v0.2 ships *well*, not just *fast*.

## Related

- `docs/retrospectives/v0.1-retrospective.md` — Full retrospective analysis
- [#246](https://github.com/cirvine-MSFT/editless/issues/246) — Reduce coupling and split god objects
- [#247](https://github.com/cirvine-MSFT/editless/issues/247) — Fix LLM-generated test antipatterns
- [#277](https://github.com/cirvine-MSFT/editless/issues/277) — Resume Session flow needs rework
- [#278](https://github.com/cirvine-MSFT/editless/issues/278) — Add Agent flow needs rework

### 2026-02-18: v0.1.1 is a quality-only release — remove broken features, fix core bugs, no new features

**By:** Casey Irvine (via Copilot)

**What:** v0.1.1 must be a quality release. Strategy: remove non-core/broken features (don't add any), fix core bugs, refactor for modularity, and improve UX testing for core functionality. Specific removals: update logic, scribe background, inbox notification review button (does nothing), terminal resume (broken), terminal expand after editor close. Root cause of v0.1 bug churn: running old extension versions led to re-filing bugs, creating unnecessary fix-on-fix work. Going forward, research better dev practices — potentially an MCP for Electron or VS Code for local debugging/testing.

**Why:** User request — captured for team memory. v0.1 shipped with too many half-baked features creating maintenance burden. Stripping down to core before building back up.

### 2026-02-18: v0.1.1 scope — quality release

**By:** Rick

**What:** Complete scope for v0.1.1 quality release

**Why:** Strip broken features, fix core bugs, refactor for modularity

---

## Executive Summary

v0.1 shipped 96 PRs in 3 days. The architecture is solid, but the surface area is too wide and some features don't work. v0.1.1 strips broken/half-baked features, fixes the bugs that affect core workflows, and starts the modularity refactor. **No new features.**

The codebase has 25 source files and 30 test files. After this release, we should be down to ~20 source files with cleaner module boundaries.

---

## REMOVALS — 7 Features to Strip

### R1: Squad Upgrader (version checking, upgrade commands, version comparison toasts)

**What it does:** Checks GitHub for latest Squad package version, compares to local, shows "upgrade available" badge on squads, provides upgrade commands via npx.

**Files to modify/delete:**
| Action | File | Lines | Notes |
|--------|------|-------|-------|
| DELETE | `src/squad-upgrader.ts` | 259 | Move `checkNpxAvailable`, `promptInstallNode`, `isSquadInitialized` to new `src/squad-utils.ts` first |
| DELETE | `src/__tests__/squad-upgrader.test.ts` | all | Keep tests for moved utilities |
| MODIFY | `src/extension.ts` | ~30 lines | Remove imports (line 10), upgrade command registration (207-231), startup check (228-230). Update `addSquad` import path. |
| MODIFY | `src/editless-tree.ts` | ~20 lines | Remove `getLocalSquadVersion` import (line 5), `_upgradeAvailable` map (line 78), `setUpgradeAvailable` (114-117), upgrade badge rendering (222-231), version tooltip (238-242) |
| MODIFY | `package.json` | commands, menus | Remove `editless.upgradeSquad`, `editless.upgradeAllSquads`, `editless.updateCliProvider` commands. Remove their menu entries. |

**package.json commands to remove:**
- `editless.upgradeSquad`
- `editless.upgradeAllSquads`

**package.json menus to remove:**
- `editless.upgradeAllSquads` from `view/title` (line with `editless.squadUpgradeAvailable`)
- `editless.upgradeSquad` from `view/item/context` (line with `squad-upgradeable`)

**Context keys to remove:**
- `editless.squadUpgradeAvailable`

**Risk:** LOW. Well-isolated. Only coupling is `addSquad` command using `checkNpxAvailable`/`promptInstallNode`/`isSquadInitialized` — solve by extracting those 3 functions to `squad-utils.ts`.

---

### R2: CLI Update Checks (provider update detection, update toast, update command)

**What it does:** On activation, runs each CLI provider's `updateCommand` to check if updates are available. Shows toast with version comparison. Provides "Update" button that runs the update.

**Files to modify/delete:**
| Action | File | Lines | Notes |
|--------|------|-------|-------|
| MODIFY | `src/cli-provider.ts` | ~113 lines (126-238) | Delete everything from `// --- Provider updates` to end of file: `setCliUpdateAvailable`, `runProviderUpdate`, `registerCliUpdateCommand`, prompt cache, `checkProviderUpdatesOnStartup`, `checkSingleProviderUpdate` |
| MODIFY | `src/cli-provider.ts` | line 3 | Remove `import { isNotificationEnabled } from './notifications'` |
| MODIFY | `src/extension.ts` | ~8 lines | Remove `registerCliUpdateCommand` import + registration (222), `checkProviderUpdatesOnStartup` call (225), `setContext cliUpdateAvailable` (40) |
| MODIFY | `package.json` | commands, menus | Remove `editless.updateCliProvider` command and its menu entry |

**package.json commands to remove:**
- `editless.updateCliProvider`

**package.json menus to remove:**
- `editless.updateCliProvider` from `view/title` (line with `editless.cliUpdateAvailable`)

**Context keys to remove:**
- `editless.cliUpdateAvailable`

**Risk:** LOW. Update checking is cleanly separated from provider detection/resolution. The core CLI provider detection (`probeAllProviders`, `resolveActiveProvider`, `getActiveProviderLaunchCommand`) stays untouched.

---

### R3: Inbox Auto-Flush (Scribe background — auto-flush decisions inbox on activation)

**What it does:** On activation, reads all .md files from each squad's `decisions/inbox/`, appends to `decisions.md`, and deletes the inbox files. This is the "scribe background" feature.

**Files to modify/delete:**
| Action | File | Lines | Notes |
|--------|------|-------|-------|
| DELETE | `src/inbox-flusher.ts` | 67 | Entire file |
| DELETE | `src/__tests__/inbox-flusher.test.ts` | all | |
| MODIFY | `src/extension.ts` | ~13 lines | Remove import (line 21) and the flush loop (lines 53-65) |

**Risk:** VERY LOW. Zero coupling. No other module imports or calls this.

---

### R4: Inbox Notification + Review Button

**What it does:** When a squad's inbox count transitions from 0→N, shows a warning toast with a "Review" button. The button calls `editlessTree.focus`. Casey reports the button "does nothing" — likely because focusing the tree doesn't navigate to the inbox.

**Files to modify/delete:**
| Action | File | Lines | Notes |
|--------|------|-------|-------|
| DELETE | `src/notifications.ts` | 33 | Entire file — both consumers (inbox + updates) are being removed |
| DELETE | `src/__tests__/notifications.test.ts` | all | |
| MODIFY | `src/extension.ts` | ~5 lines | Remove import (line 18), NotificationManager instantiation (76), checkAndNotify call (189) |

**Settings to remove from package.json:**
- `editless.notifications.enabled`
- `editless.notifications.inbox`
- `editless.notifications.updates`

**Risk:** VERY LOW. Only two consumers: (1) inbox toast in extension.ts and (2) `isNotificationEnabled('updates')` in cli-provider.ts — both are being removed.

---

### R5: Terminal Resume / Orphan Management (broken per #277)

**What it does:** After VS Code reload, detects "orphaned" sessions (persisted but unmatched terminals), shows them in the tree with relaunch/dismiss options, and shows a crash recovery notification. The `--resume` flag support is broken.

**Files to modify/delete:**
| Action | File | Lines | Notes |
|--------|------|-------|-------|
| MODIFY | `src/terminal-manager.ts` | ~90 lines | Remove `getOrphanedSessions()`, `reconnectSession()`, `relaunchSession()`, `dismissOrphan()`, `relaunchAllOrphans()` methods. Remove `_pendingSaved` field. Keep `reconcile()` and `_tryMatchTerminals()` — they're needed for session metadata survival across reloads. |
| MODIFY | `src/extension.ts` | ~30 lines | Remove crash recovery notification (108-121), relaunchSession command (902-910), dismissOrphan command (912-920), relaunchAllOrphans command (922-927) |
| MODIFY | `src/editless-tree.ts` | ~5 lines | Remove orphan rendering in `getSquadChildren` (308-310), remove `_buildOrphanItem` method |
| MODIFY | `package.json` | commands, menus, palette | Remove `editless.relaunchSession`, `editless.dismissOrphan`, `editless.relaunchAllOrphans` |

**package.json commands to remove:**
- `editless.relaunchSession`
- `editless.dismissOrphan`
- `editless.relaunchAllOrphans`

**package.json menus to remove:**
- `editless.relaunchSession` from `view/item/context` (orphanedSession)
- `editless.dismissOrphan` from `view/item/context` (orphanedSession)

**commandPalette hide entries to remove:**
- `editless.relaunchSession`
- `editless.dismissOrphan`

**Risk:** MEDIUM. `reconcile()` must stay — it's what reconnects terminal metadata (display names, labels, squad association) after VS Code reload. The orphan management builds on top of reconcile. Need to be surgical: keep the terminal<>metadata reconnection, remove the orphan UI and relaunch logic. After removal, terminals that can't be matched are simply forgotten (no orphan tree items, no crash notification).

**Important:** The `PersistedTerminalInfo` type stays because `_persist()` and `reconcile()` use it. The `'orphaned'` state in `SessionState` type can stay as dead code or be removed — low risk either way.

---

### R6: Terminal Layout Auto-Maximize (expand terminal panel when editors close)

**What it does:** Watches for editor tab changes. When all editors close and the panel was previously maximized, automatically re-maximizes the terminal panel. Controlled by `editless.restoreTerminalLayout` setting.

**Files to modify/delete:**
| Action | File | Lines | Notes |
|--------|------|-------|-------|
| DELETE | `src/terminal-layout.ts` | 53 | Entire file |
| DELETE | `src/__tests__/terminal-layout.test.ts` | all | |
| MODIFY | `src/extension.ts` | ~4 lines | Remove import (line 28) and instantiation (1173-1175) |

**Settings to remove from package.json:**
- `editless.restoreTerminalLayout`

**Risk:** VERY LOW. Completely standalone. Zero coupling to any other module.

---

### R7: Squad UI Integration (third-party SquadUI extension deep-linking)

**What it does:** Detects if the SquadUI extension is installed, sets a context key, and provides an "Open in Squad UI" context menu action on squads.

**Files to modify/delete:**
| Action | File | Lines | Notes |
|--------|------|-------|-------|
| DELETE | `src/squad-ui-integration.ts` | 34 | Entire file |
| DELETE | `src/__tests__/squad-ui-integration.test.ts` | all | |
| MODIFY | `src/extension.ts` | ~5 lines | Remove import (line 22), `initSquadUiContext` call (44), `openInSquadUi` command (751-753) |
| MODIFY | `package.json` | commands, menus, palette | Remove `editless.openInSquadUi` |

**package.json commands to remove:**
- `editless.openInSquadUi`

**package.json menus to remove:**
- `editless.openInSquadUi` from `view/item/context` (with `editless.squadUiAvailable`)

**commandPalette hide entries to remove:**
- `editless.openInSquadUi` (already hidden, but remove the entry)

**Context keys to remove:**
- `editless.squadUiAvailable`

**Risk:** VERY LOW. No coupling. This is a third-party integration nobody uses yet.

---

## SETTINGS SUMMARY — Remove from package.json configuration

| Setting | Reason |
|---------|--------|
| `editless.notifications.enabled` | All notification consumers removed |
| `editless.notifications.inbox` | Inbox notification removed |
| `editless.notifications.updates` | Update notification removed |
| `editless.restoreTerminalLayout` | Terminal layout feature removed |

**Settings to KEEP:**
- `editless.registryPath` — core
- `editless.discoveryDir` — core discovery
- `editless.discovery.scanPaths` — core discovery
- `editless.scanDebounceMs` — core
- `editless.cli.providers` — core (keep, but remove `updateCommand`, `updateRunCommand`, `upToDatePattern` fields from default value)
- `editless.cli.activeProvider` — core
- `editless.github.repos` — core
- `editless.github.issueFilter` — core
- `editless.ado.organization` — core
- `editless.ado.project` — core
- `editless.refreshInterval` — core
- `editless.agentCreationCommand` — core (addAgent)

---

## COMMANDS SUMMARY — Remove from package.json

| Command | Feature |
|---------|---------|
| `editless.updateCliProvider` | CLI update checks |
| `editless.upgradeSquad` | Squad upgrader |
| `editless.upgradeAllSquads` | Squad upgrader |
| `editless.openInSquadUi` | Squad UI integration |
| `editless.relaunchSession` | Terminal resume |
| `editless.dismissOrphan` | Terminal resume |
| `editless.relaunchAllOrphans` | Terminal resume |

**Commands to KEEP:** All others (launchSession, focusSession, renameSession, refresh, addNew, addAgent, addSquad, filterWorkItems, filterPRs, etc.)

---

## FILES SUMMARY

| Action | File | Reason |
|--------|------|--------|
| DELETE | `src/squad-upgrader.ts` | After extracting utilities to squad-utils.ts |
| DELETE | `src/inbox-flusher.ts` | Scribe background |
| DELETE | `src/notifications.ts` | All consumers removed |
| DELETE | `src/terminal-layout.ts` | Auto-maximize |
| DELETE | `src/squad-ui-integration.ts` | Third-party integration |
| CREATE | `src/squad-utils.ts` | Extract `checkNpxAvailable`, `promptInstallNode`, `isSquadInitialized` from squad-upgrader |
| DELETE | `src/__tests__/squad-upgrader.test.ts` | (create squad-utils.test.ts with relevant tests) |
| DELETE | `src/__tests__/inbox-flusher.test.ts` | |
| DELETE | `src/__tests__/notifications.test.ts` | |
| DELETE | `src/__tests__/terminal-layout.test.ts` | |
| DELETE | `src/__tests__/squad-ui-integration.test.ts` | |
| MODIFY | `src/extension.ts` | Remove ~80 lines of wiring for removed features |
| MODIFY | `src/editless-tree.ts` | Remove upgrade badge, orphan items, version tooltip |
| MODIFY | `src/terminal-manager.ts` | Remove orphan management methods |
| MODIFY | `src/cli-provider.ts` | Remove update checking (keep detection/resolution) |
| MODIFY | `package.json` | Remove commands, menus, settings |

**Net effect:** 5 source files deleted, 1 created, 4 modified. ~550 lines of production code removed. 5 test files deleted.

---

## BUGS TO FIX

### B1: #286 — $(agent) command line error when launching sessions
**Affects:** Core session launch (all agent types)
**Root cause:** The `$(agent)` placeholder in `launchCommand` is being interpreted as a VS Code icon reference or shell substitution rather than being replaced with the agent name. The `launchCommand` template in `cli.providers` default uses `$(agent)` but `getActiveProviderLaunchCommand()` returns the raw string without substitution.
**Fix:** In `terminal-manager.ts` `launchTerminal()`, replace `$(agent)` in the launch command with the squad/agent name before sending to terminal. Check if `config.launchCommand` or the active provider's command needs `$(agent)` → `config.name` substitution.
**Effort:** Small (1-2 hours)
**Priority:** P0 — blocks core workflow

### B2: #298 — Clicking session in tree doesn't always switch terminal
**Affects:** Core tree<>terminal navigation
**Root cause:** `treeView.reveal()` in `onDidChangeActiveTerminal` fires but `focusTerminal` click handler may conflict with tab-switching focus. Likely a race condition between `terminal.show()` and tree selection events.
**Fix:** Investigate the `focusTerminal` command handler and the `onDidChangeActiveTerminal` listener for mutual exclusion issues.
**Effort:** Medium (2-4 hours)
**Priority:** P1 — core UX issue

---

### 2026-02-18: Worktree Dev Launcher as Primary Workflow

**Author:** Morty (Extension Dev)
**Date:** 2026-02-18

## Decision

`scripts/dev-worktree.ps1` is now the recommended primary workflow for EditLess feature development. It replaces the manual worktree + isolated launch steps with a single command.

## What Changed

- **New:** `scripts/dev-worktree.ps1` — one command creates worktree, installs deps, builds, launches isolated VS Code
- **Removed:** `.vscode/mcp-dev.json.example` — EditLess doesn't use webviews; the chrome-devtools MCP example was speculative
- **Removed:** `.vscode/mcp.json` from `.gitignore` — no MCP example to copy from
- **Updated:** `scripts/dev-isolated.ps1` — still available for quick isolated launches but references `dev-worktree.ps1` as primary
- **Updated:** `docs/local-development.md` — worktree workflow is now the first section; MCP section trimmed to a short note

## Impact

- All team members should use `dev-worktree.ps1` for issue-based feature work
- `dev-isolated.ps1` remains for quick one-off isolated launches (no worktree creation)
- The "Dev Tooling: Isolated Environment Strategy" decision was updated to reflect the removal of the MCP example

---

### 2026-02-18: EditLess Dev Workflow Skill Created

**By:** Morty (Extension Dev)

## Decision

Created `.ai-team/skills/editless-dev-workflow/SKILL.md` documenting `scripts/dev-worktree.ps1` as the primary workflow for issue-driven development.

## What

Documented the dev workflow skill with:
- Parameters and usage for `scripts/dev-worktree.ps1`
- Branch naming conventions
- Integration notes for agents
- Anti-patterns and gotchas

## Why

Agents need to discover and use the dev-worktree script when asked to work on issues. Without the skill documentation:
- They'd try to use missing Manage-Worktree.ps1 (bootstrap-only tool)
- Fall back to manual git commands
- Miss the optimized all-in-one workflow pattern

This skill makes adoption immediate and unambiguous for all team members.

### B3: #278 — Add Agent flow needs rework
**Affects:** Core agent creation
**Root cause:** The current flow is complex (3 modes: custom command, CLI provider create, repo template) and the UX for discovered-agent-not-registered (#296) is confusing.
**Fix:** Simplify addAgent to: (1) Ask name, (2) Create `.github/agents/{name}.agent.md` from template, (3) Open it in editor. Remove the modal multi-step flow. CLI provider creation can use `agentCreationCommand` setting. Don't try to be clever.
**Effort:** Medium (half day)
**Priority:** P1 — usability

### B4: #283 — Adding squad feels buggy and slow
**Affects:** Core squad creation
**Root cause:** Squad init runs `npx -y github:bradygaster/squad init` in a hidden terminal, which downloads on every call. The auto-registration relies on terminal close event which is unreliable.
**Fix:** This is partially addressed by keeping the feature but cleaning up error handling. The real fix is caching npx or using a pre-installed binary. For v0.1.1, improve the UX: show progress, don't hide the terminal, handle errors visibly.
**Effort:** Medium (half day)
**Priority:** P2 — UX polish

### B5: #279 — Session status icons don't represent current state
**Affects:** Core session monitoring
**Root cause:** The `stateFromEvent` function relies on events.jsonl parsing, but the Copilot CLI doesn't always produce consistent events. Fallback to shell execution API is also unreliable.
**Fix:** Research-heavy. For v0.1.1, simplify: show working/idle/stale based on shell execution API only. Remove the events.jsonl dependency as it's fragile. Or just show a neutral icon always and remove the state detection complexity.
**Effort:** Research needed (1 day)
**Priority:** P2 — can ship with simplified icons

---

## ISSUES TO CLOSE (resolved by removal)

| Issue | Title | Resolution |
|-------|-------|------------|
| #288 | Squad update not detected | Resolved — update detection removed |
| #277 | Resume Session flow needs rework | Resolved — resume/orphan feature removed |
| #293 | SquadUI deep-link API | Resolved — SquadUI integration removed |

---

## ISSUES TO DEFER TO BACKLOG

| Issue | Title | Reason |
|-------|-------|--------|
| #300 | 5s cold start | Copilot CLI issue, not EditLess |
| #294 | Session rename feels slow | UX polish, not blocking |
| #292 | Work items: better filtering by type | Enhancement |
| #291 | ADO collapsible tree view | Enhancement |
| #285 | PR tree view missing features | Enhancement |
| #280 | PRs need better filtering | Enhancement |

---

## REFACTORING

### RF1: Split extension.ts (#246 partial)

**Current state:** `extension.ts` is 1310 lines with 23 imports, mixing activation wiring with command implementations.

**Proposed structure:**
```
src/
  extension.ts              (~150 lines — activation, wiring, exports)
  commands/
    agent-commands.ts        (~200 lines — addAgent, addSquad, addNew, renameSquad, changeModel, goToSquadSettings)
    session-commands.ts      (~150 lines — launchSession, focusSession, renameSession, closeTerminal, clearLabel)
    work-item-commands.ts    (~150 lines — filterWorkItems, filterPRs, launchFromWorkItem, launchFromPR, configureRepos/Ado)
    browser-commands.ts      (~50 lines — openInBrowser, goToPR, goToWorkItem, goToPRInBrowser)
  integration/
    github-integration.ts   (~40 lines — initGitHubIntegration, moved from extension.ts)
    ado-integration.ts       (~60 lines — initAdoIntegration, moved from extension.ts)
```

**Success criteria:** `extension.ts` under 200 lines. Each command module under 250 lines. Max 8 imports per file.

**Effort:** 1 day. Mechanical refactor, no logic changes.

### RF2: Clean up cli-provider.ts

After removing update logic, `cli-provider.ts` drops from 238 to ~125 lines. Clean module with single concern: CLI detection and resolution.

**Effort:** Done as part of R2 removal.

### RF3: Clean up terminal-manager.ts

After removing orphan management, `terminal-manager.ts` drops from 620 to ~450 lines. Could further split `stateFromEvent` and state helpers into `session-state.ts`, but not required.

**Effort:** Done as part of R5 removal.

### RF4: Clean up cli.providers default setting

The default `cli.providers` setting in package.json includes `updateCommand`, `updateRunCommand`, and `upToDatePattern` fields. These should be removed from the default value since update logic is gone. The CliProvider interface should also drop those fields.

```typescript
// Before
export interface CliProvider {
  name: string;
  command: string;
  versionCommand: string;
  versionRegex: string;
  launchCommand: string;
  createCommand: string;
  updateCommand: string;      // REMOVE
  updateRunCommand: string;   // REMOVE
  upToDatePattern: string;    // REMOVE
  detected: boolean;
  version?: string;
}

// After
export interface CliProvider {
  name: string;
  command: string;
  versionCommand: string;
  versionRegex: string;
  launchCommand: string;
  createCommand: string;
  detected: boolean;
  version?: string;
}
```

---

## TEST QUALITY (#247 partial)

For v0.1.1, the test work is:

1. **Delete tests for removed features** — 5 test files gone (squad-upgrader, inbox-flusher, notifications, terminal-layout, squad-ui-integration)
2. **Create squad-utils.test.ts** — test the 3 extracted utilities
3. **Update extension-commands.test.ts** — remove tests referencing deleted commands
4. **Update auto-refresh.test.ts** — remove imports of deleted modules
5. **Spot-check remaining tests** — ensure they still pass after removals

Full #247 test antipattern rewrite deferred to v0.2. The removal work naturally cuts ~30-40 low-signal tests.

---

## DEV PRACTICES

### DP1: Preventing the "old extension version" problem

Casey's insight: running old extension versions caused re-filing bugs that were already fixed. Ideas:

1. **Version badge in status bar** — show current extension version in EditLess status bar item. Quick visual check.
2. **Auto-update from VSIX** — not possible in VS Code without marketplace. BUT: could add a "check for updates" button that hits GitHub Releases API.
3. **Dev extension sideloading** — use `--extensionDevelopmentPath` for development, not installed VSIX. This ensures you always run the latest build.
4. **Build-on-save** — `npm run watch` + F5 launch config so changes are always hot-reloaded during development.

**Recommendation:** Add version to status bar (quick win). Document the `--extensionDevelopmentPath` dev workflow.

### DP2: MCP for Electron/VS Code debugging (#284, #289)

Research notes:
- VS Code extensions run in the Extension Host process (Node.js), not Electron renderer
- Standard Node.js debugging applies: `--inspect` flag, `launch.json` with `extensionHost` type
- MCP (Model Context Protocol) servers can be used alongside VS Code extensions but are separate processes
- For debugging EditLess specifically: use the built-in Extension Development Host (F5) with breakpoints
- Consider adding an output channel verbose mode (`editless.debug` setting) for production debugging without a debugger attached

### DP3: Better local dev workflow

1. **F5 development** — Use VS Code's Extension Development Host. Add `launch.json` config if missing.
2. **Watch mode** — `npm run watch` for continuous rebuild
3. **Test on save** — vitest has `--watch` mode. Use it during development.
4. **Version check** — Add `"editless.debug": true` setting that logs verbose info to output channel

---

## EXECUTION PLAN

| Phase | Work | Owner | Effort |
|-------|------|-------|--------|
| 1 | Extract `squad-utils.ts` from `squad-upgrader.ts` | Morty | 1 hour |
| 2 | Delete removed source files (R1-R4, R6-R7) | Morty | 2 hours |
| 3 | Modify `extension.ts` — remove all wiring for deleted features | Morty | 2 hours |
| 4 | Modify `editless-tree.ts` — remove upgrade badge + orphan items | Morty | 1 hour |
| 5 | Modify `terminal-manager.ts` — remove orphan management (R5) | Morty | 2 hours |
| 6 | Modify `cli-provider.ts` — remove update logic (R2) | Morty | 1 hour |
| 7 | Modify `package.json` — remove commands, menus, settings | Morty | 1 hour |
| 8 | Delete removed test files, update remaining tests | Meeseeks | 2 hours |
| 9 | Fix #286 ($(agent) launch command substitution) | Morty | 2 hours |
| 10 | Fix #298 (tree click not switching terminal) | Morty | 4 hours |
| 11 | Simplify #278 (addAgent flow) | Morty | 4 hours |
| 12 | Split extension.ts (RF1) | Morty | 8 hours |
| 13 | Verify all tests pass, manual workflow validation | Meeseeks + Casey | 2 hours |
| 14 | Update README/docs for removed features | Summer | 4 hours |

**Total estimated effort:** ~3 days

**Suggested branching:** One PR for removals (phases 1-8), one PR per bug fix (phases 9-11), one PR for refactor (phase 12).

---

## DEPENDENCY MAP — What To Do In What Order

```
Phase 1-7 (removals) ──→ Phase 8 (test cleanup) ──→ Phase 13 (validation)
                    ├──→ Phase 9 (fix #286) ─────────→ Phase 13
                    ├──→ Phase 10 (fix #298) ────────→ Phase 13
                    ├──→ Phase 11 (fix #278) ────────→ Phase 13
                    └──→ Phase 12 (refactor) ────────→ Phase 13 ──→ Phase 14 (docs)
```

Removals can be done as one atomic PR. Bug fixes are independent. Refactor should come after removals land (less code to move).


# Decision: SquadUI commands must use `currentRoot`, not `workspaceRoot`

**Author:** Unity (Integration Dev)
**Date:** 2026-02-18
**Status:** Implemented

## Context

SquadUI's deep-link API (`switchToRoot()`) allows external extensions like EditLess to point SquadUI at an arbitrary filesystem path. However, 14 command handlers were hardcoded to `workspaceRoot` or `workspaceFolders[0]`, ignoring the deep-linked path entirely.

## Decision

- **`workspaceRoot`** is for initialization only (detecting squad folder, creating the data provider, setting initial `currentRoot`).
- **`currentRoot`** must be used in all command handlers that read/write squad data (viewSkill, removeSkill, openLogEntry, finishAllocationIfReady, onTerminalClose, fileWatcher).
- Command registration functions (`registerAddSkillCommand`, `registerRemoveMemberCommand`) accept an optional `getCurrentRoot?: () => string` callback. When provided, it takes precedence over `workspaceFolders[0]`.
- The fallback pattern is: `getCurrentRoot?.() ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath`

## Impact

Any future SquadUI command that reads from the squad directory must use `currentRoot` (or the `getCurrentRoot` callback), never `workspaceRoot` directly. This applies to EditLess integration and any other extension using the deep-link API.

### 2026-02-19: User directive — Unified discovery/add flow for squads and agents

**By:** Casey Irvine (via Copilot)  
**What:** Squads and standalone agents should share roughly the same flow through the code for discovery and add. Special-casing is fine for details (which dirs to scan, how to register), but the user-facing experience should be unified — squads get a squad icon, agents get their own icon, but the paths (discovery, add, refresh) should be the same.  
**Why:** User request — captured for team memory. Current code has completely separate paths for squad discovery vs agent discovery, which leads to inconsistencies (e.g., refresh only does agent discovery, not squad discovery).

### 2026-02-19: User directive — Delete squad-upgrader.ts entirely (overrides prior design decision)

**By:** Casey Irvine (via Copilot)  
**What:** Delete squad-upgrader.ts entirely. Don't keep it around just for shared utilities — move the 4 kept functions elsewhere and delete the file. The design review decision to keep the file name is overridden.  
**Why:** User request — the file has no reason to exist once upgrade detection is removed. Cleaner to extract utilities and delete.  
**Override note:** This supersedes the 2026-02-19 Rick design review decision (#303) to keep squad-upgrader.ts. Proceeding with full file deletion.

### 2026-02-19: Redaction System Design Review

**Author:** Rick  
**Date:** 2026-02-19

## Summary

The design is **sound and practical for the stated goal**. It balances security (patterns stay local), usability (transparent replacement, not blocking), and low friction (no merge conflicts, per-machine config). Greenlight for implementation.

## Findings

### ✅ Pre-commit Hook — Right Choice

**Verdict:** Correct mechanism for this use case.

- **Pre-commit:** Best choice here. Sanitizes content before it even gets staged, which matches your goal ("replace any match"). Catches secrets before they enter git history.
- **Alternatives considered:**
  - Clean/smudge filters: Add complexity (need .gitattributes, requires git config on each machine). Overkill for this use case where you want to replace at commit time, not on every read.
  - Pre-push: Too late. By then, the commit already references the redacted content in the commit message or log. Better to sanitize earlier.
  - `.gitignore` alone: Doesn't solve the problem — doesn't redact content already in files, only excludes new files.

**Recommendation:** Stick with pre-commit. Simple, effective, clear semantics.

### ✅ Security Model — redacted.json as `.gitignore`d Local Config

**Verdict:** Good design. Patterns stay local, never committed.

**Strengths:**
- Patterns are developer-local. No accidental leaks of what you're protecting.
- `.gitignore` prevents the config file itself from being committed (add `redacted.json` to `.gitignore`).
- Each developer can have their own redactions. No centralized config means no single point of failure.

**Considerations (not blockers):**
- **If you later want team-wide patterns:** You could add a `.github/redaction-patterns.example.json` as documentation (no actual secrets, just examples). But the hook always checks local `redacted.json` first.
- **Audit trail:** No history of what was redacted (by design). If you need audit trails later, you'd need to log replacement operations separately.

**Recommendation:** Add `.ai-team/redacted.json` to `.gitignore` explicitly (not just `redacted.json`). This signals to the team that this file is local-only.

### ⚠️ Replacement String Format — Minor Adjustment Recommended

**Current proposal:** `<alias> found in <relative path to redacted.json>`  
**Example:** `"phone-us" found in .ai-team/redacted.json`

**Issues:**
1. **Ugly in diffs:** This string is visible in git diffs and PR reviews. It signals "something was sanitized here," which is good, but the format is verbose.
2. **Path confusion:** `<relative path to redacted.json>` always points to the config file location, not the file being sanitized. This is confusing — a reviewer sees `"phone-us" found in .ai-team/redacted.json` in a file like `src/app.ts` and doesn't immediately understand which file was redacted.

**Alternative recommendations:**
- **Option A (minimal):** `[REDACTED: alias]`  
  - Example: `[REDACTED: phone-us]`
  - Pros: Clear, scannable, not too verbose
  - Cons: Doesn't hint at config location (but that's fine — developers know to check `.ai-team/redacted.json` if needed)

- **Option B (informative):** `[REDACTED: alias] (see .ai-team/redacted.json)`  
  - Example: `[REDACTED: phone-us] (see .ai-team/redacted.json)`
  - Pros: Explicitly points to config
  - Cons: Still verbose in diffs

**Recommendation:** Use **Option A** (`[REDACTED: alias]`). It's clear, concise, and grep-friendly. If someone wants to know the regex, they can check `.ai-team/redacted.json` — that's expected.

### ✅ Edge Cases — Solid Plan

#### Binary Files
- **Decision:** Don't sanitize binary files (images, PDFs, compiled objects).
- **How:** Check MIME type or file extension before regex matching. Skip if binary.
- **Rationale:** Regex on binary can corrupt the file. Safe to skip.
- **Recommendation:** Document this in the hook with a comment.

#### Large Files
- **Decision:** Sanitize all sizes. Regex on large files will be slower but won't break.
- **How:** If performance is a concern later, add a file size threshold (e.g., skip files >10 MB).
- **Rationale:** Most code files are small; this is unlikely to be a bottleneck. Don't over-optimize.
- **Recommendation:** Don't add size checks initially. Benchmark and add only if needed.

#### Merge Commits
- **Decision:** Pre-commit runs on merge commits too. This is correct.
- **How:** The hook runs before *any* commit, including merges. No special handling needed.
- **Rationale:** You want every commit sanitized, merge or not.
- **Recommendation:** Verify the hook runs on `git merge --no-ff` commits during implementation. Should be automatic.

#### Interactive Rebases
- **Decision:** Pre-commit runs on each commit during rebase. Correct.
- **How:** When the user runs `git rebase -i` and picks/squashes/rewrites commits, each becomes a new commit and pre-commit fires.
- **Rationale:** You want the final history sanitized.
- **Recommendation:** Document this behavior so developers know rebases are safe — they can't accidentally unskip redaction.

### 🎯 Phone Number Regex — Pattern

**Formats to cover:**
- 555-666-7891
- 555.666.7891
- (555)-666-7891
- (555) 666-7891
- 555 666 7891
- 5556667891

**Recommended regex:**
```
\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})
```

**Breakdown:**
- `\(?` — optional opening paren
- `(\d{3})` — capture 3 digits (area code)
- `\)?` — optional closing paren (only if opening paren exists, but this regex doesn't enforce that — it's loose by design)
- `[\s.-]?` — optional space, dot, or dash
- `(\d{3})` — capture 3 digits
- `[\s.-]?` — optional separator
- `(\d{4})` — capture 4 digits

**Edge cases this covers:**
- ✅ 555-666-7891
- ✅ 555.666.7891
- ✅ (555)-666-7891
- ✅ (555) 666-7891
- ✅ 555 666 7891
- ✅ 5556667891
- ⚠️ (555-666-7891 (mismatched parens, but will match) — OK, false positive is safer than a miss

**Caveat:** This regex will also match non-US phone number formats. If you want US-only, add a negative lookbehind or enforce stricter formatting. For now, this is reasonable.

**Recommendation:** Document the regex in `redacted.json` with a comment explaining what it matches. If there are false positives (e.g., dates like 02-15-2026 being flagged), refine to require digit context or adjust.

## Implementation Checklist

- [ ] Add `.ai-team/redacted.json` to `.gitignore` (and document why in a comment)
- [ ] Pre-commit hook script: read `.ai-team/redacted.json`, iterate over alias → regex, sanitize staged files
- [ ] Replacement format: `[REDACTED: alias]`
- [ ] Skip binary files (check extension or MIME type)
- [ ] Handle merge commits and rebases (should work automatically)
- [ ] Verify hook runs on Windows (use PowerShell if needed; git hooks work cross-platform, but Windows sometimes has path/encoding quirks)
- [ ] Document the phone regex in `redacted.json` with example patterns

## Questions for Birdperson

1. **Hook install:** How should the hook be made available to team? (a) Check it in to `.git/hooks/` (local, requires post-clone setup)? (b) Create a setup script to install it? (c) Use `husky` or similar to manage hooks?
2. **Performance:** Any concerns about regex matching large diffs (e.g., 50+ MB PRs)? Suggest benchmarking during implementation.
3. **Bypass:** Should developers be able to `--no-verify` the hook? (Normally yes for flexibility, but if this is a hard compliance boundary, consider adding a check that prevents bypass on certain branches.)

## Decision

**Status:** APPROVED for implementation.

**Rationale:** The design is pragmatic, solves the stated problem without over-engineering, and handles edge cases correctly. The pre-commit hook is the right mechanism. Local pattern storage is secure. Replacement format can be improved (use `[REDACTED: alias]`). Phone regex is solid.

**Blockers:** None. Proceed to implementation.

**Next:** Birdperson implements hook + test cases. Rick reviews PR for compliance with this design.

---

### 2026-02-20: Squad Framework Integration Research

**By:** Squanchy (Squad Platform Expert)  
**What:** Comprehensive analysis of the `bradygaster/squad` framework (v0.4.1) and its integration surface with EditLess. This document maps every Squad state file, CLI command, and runtime pattern to concrete integration opportunities for EditLess.

**Why:** EditLess is the UI layer for Squad-managed teams. To build the integration plan, we need a ground-truth understanding of what Squad produces, what EditLess already consumes, and what's left on the table.

---

## 1. Squad Framework Overview

**Package:** `@bradygaster/create-squad` v0.4.1 (npm, installed via `npx github:bradygaster/squad`)
**Architecture:** No runtime daemon, no IPC, no event bus. Squad is a file-based coordination framework. All state lives in `.ai-team/` as Markdown and JSON files that agents read and write.

### CLI Commands

| Command | What it does | Integration potential |
|---------|-------------|----------------------|
| `(default)` | Initialize a squad — scaffolds `.ai-team/`, `.github/agents/squad.agent.md`, workflows | Squad Init Wizard |
| `upgrade` | Overwrites Squad-owned files (governance, templates, workflows). Never touches `.ai-team/` | Already integrated (squad-upgrader.ts) |
| `copilot` | Add/remove @copilot coding agent from roster | Toggle command in EditLess |
| `copilot --off` | Remove @copilot from team | Toggle command |
| `plugin marketplace add\|remove\|list\|browse` | Manage plugin marketplace sources | Plugin browser UI |
| `export` | Snapshot squad to JSON (agents, casting, skills) | Export command with file picker |
| `import` | Import squad from JSON snapshot | Import command with file picker |

### Governance File (`squad.agent.md`)

~1,771 lines. The brain of Squad. Key sections the coordinator reads at runtime:

- **Init Mode (Phase 1 & 2):** Team proposal → user confirmation → file creation
- **Team Mode:** Routing table, response modes (Direct/Lightweight/Standard/Full), parallel fan-out, model selection (4-layer hierarchy with fallback chains)
- **Spawn Templates:** Standard, lightweight, ceremony — all use the `task` tool
- **Drop-Box Pattern:** Agents write to `decisions/inbox/`, Scribe merges to `decisions.md`
- **Ceremonies:** Auto/manual triggers, before/after execution, facilitator pattern
- **Ralph (Work Monitor):** Autonomous backlog processor, GitHub Issues → agent spawns
- **Casting:** 33 fictional universes, persistent naming via registry.json
- **Worktree Awareness:** worktree-local vs main-checkout strategies
- **VS Code Compatibility:** Uses `runSubagent` instead of `task`, no per-spawn model selection
- **Source of Truth Hierarchy:** Explicit ownership table for every `.ai-team/` file

---

## 2. `.ai-team/` Directory — The State Surface

This is the integration API. Every file here is a potential data source for EditLess.

```
.ai-team/
├── team.md                          # ✅ ALREADY PARSED (scanner.ts → parseRoster)
├── routing.md                       # ❌ Not read by EditLess
├── decisions.md                     # ❌ Not read — high value
├── ceremonies.md                    # ❌ Not read
├── workflow.md                      # ✅ Project-specific (EditLess uses)
├── casting/
│   ├── policy.json                  # ❌ Universe allowlist — low value
│   ├── registry.json                # ❌ Agent→name mappings — medium value
│   └── history.json                 # ❌ Assignment snapshots — low value
├── agents/
│   ├── {name}/
│   │   ├── charter.md               # ❌ Not surfaced — high value
│   │   └── history.md               # ❌ Not surfaced — high value
│   └── _alumni/                     # ❌ Not surfaced — low value
├── decisions/
│   └── inbox/                       # ❌ Not watched — HIGH VALUE (real-time signal)
├── orchestration-log/               # ✅ MTIME ONLY (for status) — log content not read
├── log/                             # ✅ MTIME ONLY — log content not read
├── skills/
│   └── {name}/SKILL.md              # ❌ Not surfaced — medium value
├── plugins/
│   └── marketplaces.json            # ❌ Not read — low value
└── plans/                           # ❌ Project-specific planning docs
```

**Legend:** ✅ = EditLess reads today | ❌ = Not yet surfaced

---

## 3. Potential Integration Points (Ranked by Value)

### 🔴 Tier 1 — Highest Value (File-based, straightforward)

**1. Decision Inbox Monitor**
- **Watch:** `.ai-team/decisions/inbox/` file count
- **Surface:** Badge on squad node ("3 pending decisions"), notification when new files appear
- **Why highest:** This is the primary real-time signal that work is happening. When agents work, they drop decisions here. It's the heartbeat.
- **Cost:** Low — just count files in a directory, trigger on watcher events

**2. Agent Detail Panel**
- **Watch:** `.ai-team/agents/{name}/charter.md` and `history.md`
- **Surface:** Click agent in roster → open charter.md preview; show recent learnings in tooltip
- **Why highest:** Agents are first-class entities in Squad. Their charter defines who they are, their history defines what they know. Users need to see this without leaving VS Code.
- **Cost:** Low — file read + Markdown preview (VS Code has native Markdown support)

**3. Orchestration Timeline**
- **Watch:** `.ai-team/orchestration-log/*.md`
- **Surface:** Sub-tree under squad showing recent spawns: "🔧 Morty: Refactoring auth module (completed, 3m ago)"
- **Why highest:** This is the team's work history. Users come back and want to know what happened. Today they have to read raw Markdown files.
- **Cost:** Medium — parse orchestration log Markdown tables for agent, outcome, timestamp

**4. Session Log Browser**
- **Watch:** `.ai-team/log/*.md`
- **Surface:** "Session Logs" sub-tree or Quick Pick list. Click to preview.
- **Why highest:** Session logs are Scribe's output — the team's diary. Browsing them should be one click.
- **Cost:** Low — list files, open preview

### 🟡 Tier 2 — Medium Value (Enrichment features)

**5. Decisions Viewer**
- **Watch:** `.ai-team/decisions.md`
- **Surface:** Webview panel or tree showing parsed decision blocks (date, author, what, why). Searchable.
- **Cost:** Medium — need a Markdown block parser

**6. Skills Browser**
- **Watch:** `.ai-team/skills/*/SKILL.md`
- **Surface:** "Skills" sub-tree showing skill name, confidence level, description
- **Cost:** Low — list directories, parse SKILL.md frontmatter

**7. Squad CLI Commands**
- **Wrap:** `squad copilot`, `squad export`, `squad import`
- **Surface:** Command palette entries for toggle Copilot agent, export squad, import squad
- **Cost:** Low — exec child process, file pickers for import/export

**8. Ceremony Display**
- **Watch:** `.ai-team/ceremonies.md`
- **Surface:** Show enabled ceremonies in squad tooltip. "Design Review ✅, Retrospective ✅"
- **Cost:** Low — parse Markdown tables

**9. Casting Enrichment**
- **Read:** `casting/registry.json`
- **Surface:** Show agent count (active/retired) in squad description. Universe name already shown.
- **Cost:** Trivial — JSON parse

### 🟢 Tier 3 — Strategic Value (Requires deeper integration)

**10. GitHub Issue per Agent**
- **Source:** GitHub API (via MCP or `gh` CLI)
- **Surface:** Show `squad:{name}` labeled issues under each agent in the roster. "Morty: #42 Fix auth timeout"
- **Cost:** High — requires GitHub API integration, already partially possible via work-items-tree

**11. Ralph Heartbeat Dashboard**
- **Source:** GitHub Actions workflow runs (squad-heartbeat.yml)
- **Surface:** Ralph's status: last run, success/failure, issues processed
- **Cost:** High — requires Actions API integration

**12. Squad Init Wizard**
- **Trigger:** "Add Squad" command when no `.ai-team/` exists
- **Surface:** Multi-step VS Code input flow → exec `npx github:bradygaster/squad`
- **Cost:** Medium — custom VS Code wizard UI

**13. Migration Helper (`.ai-team/` → `.squad/`)**
- **Trigger:** Detect v0.5.0 upgrade or user request
- **Surface:** Command to run the migration tool when it ships in Squad v0.5.0
- **Cost:** Low once Squad ships the tool — just wrap the CLI command

**14. Plugin Marketplace Browser**
- **Read:** `.ai-team/plugins/marketplaces.json`
- **Surface:** Browse marketplace repos, install plugins via UI
- **Cost:** High — requires GitHub API + UI for browsing

---

## 4. Recommended Integration Scenarios for the Plan

**Phase 1 — Quick Wins (file reads, minimal new UI):**
1. Decision inbox badge (Tier 1, #1)
2. Agent charter/history click-through (Tier 1, #2)
3. Session log Quick Pick (Tier 1, #4)

**Phase 2 — Rich State Display (new sub-trees, parsers):**
4. Orchestration timeline (Tier 1, #3)
5. Skills browser (Tier 2, #6)
6. Decisions viewer (Tier 2, #5)

**Phase 3 — CLI Wrapping (commands, wizards):**
7. Copilot agent toggle (Tier 2, #7)
8. Export/Import commands (Tier 2, #7)
9. Squad Init Wizard (Tier 3, #12)

**Phase 4 — Deep Integration (API calls, workflows):**
10. GitHub Issues per agent (Tier 3, #10)
11. Ralph heartbeat dashboard (Tier 3, #11)

---

### 2026-02-20: Copilot Integration Research

**By:** Jaguar (Copilot SDK Expert)  
**Status:** Research Complete — Ready for Integration Planning  
**Audience:** Squanchy (Squad overlap), Morty (Extension Dev), Casey (Product)

---

## 1. Copilot API Surface Overview

### Stable APIs (Safe to Build On)

| API | Stable Since | Min VS Code | What It Does |
|-----|-------------|-------------|--------------|
| **Chat Participant API** | v1.93+ | ^1.93.0 | Register `@participant` handlers in Copilot Chat. Extension declares in `package.json` under `contributes.chatParticipants`, implements via `vscode.chat.createChatParticipant(id, handler)`. Receives request, context, stream, token. |
| **Language Model API** | v1.90+ | ^1.90.0 | `vscode.lm.selectChatModels({ vendor, family })` → returns model handles. `model.sendRequest(messages, options, token)` → streamed response. Extensions can call Copilot's LLM directly for inference. |
| **Language Model Tool API** | v1.95+ | ^1.95.0 | `vscode.lm.registerTool(name, implementation)` + `contributes.languageModelTools` in package.json. Extensions expose callable tools that Copilot Agent Mode can invoke. Both declaration and registration required. |
| **Shell Execution API** | v1.93+ | ^1.93.0 | `onDidStartTerminalShellExecution` / `onDidEndTerminalShellExecution` — EditLess already uses this. |

### Key Constraints

- **Tools MUST be declared in package.json** (`contributes.languageModelTools`) AND registered in code. Declaration-only = visible but broken. Code-only = invisible to Copilot.
- **No dynamic tool registration** — tools are static per extension version. Runtime-only tools are not discoverable by Copilot agent mode. Community discussions are ongoing but no timeline.
- **Chat participants require Copilot extension** — the `vscode.chat` namespace only activates when GitHub Copilot Chat is installed.
- **LM API requires Copilot or another model provider** — `selectChatModels()` returns empty if no provider is active.

---

## 2. Current EditLess ↔ Copilot Integration State

### What EditLess Already Does

| Feature | File | Mechanism |
|---------|------|-----------|
| **CLI detection** | `cli-provider.ts` | Probes `copilot version`, detects presence, tracks version. Self-heals if Copilot provider removed from config. |
| **Session launches** | `terminal-manager.ts` | Launches terminals with `copilot --agent $(agent)`. Supports `--resume` for orphan re-launch. |
| **Session ID detection** | `terminal-manager.ts` + `session-context.ts` | Scans `~/.copilot/session-state/` directories, matches by cwd and creation time. |
| **State monitoring** | `terminal-manager.ts` | Reads `events.jsonl` last line, maps event types to working/waiting/idle/stale states. |
| **Agent discovery** | `agent-discovery.ts` | Scans `~/.copilot/agents/` and `~/.copilot/` for `.agent.md` files. Merges with workspace agents. |
| **Session context extraction** | `session-context.ts` | Reads workspace.yaml (summary, branch, cwd) and plan.md (work item references). |
| **CLI updates** | `cli-provider.ts` | Checks for Copilot CLI updates, prompts user, runs update command. |

### Potential Integration Points (Ranked)

#### Tier 1: High Value, Stable API — Build Now

**1A. Language Model Tools — Expose Squad Operations to Copilot**

Register EditLess tools that Copilot Agent Mode can invoke:
- `editless_listSquads` — List all registered squads/teams and status
- `editless_getSquadState` — Get current state of a squad
- `editless_launchSession` — Launch a new terminal session
- `editless_getSessionState` — Get current state of an active session

**Why this matters:** Copilot Agent Mode becomes Squad-aware. User can say "launch a session for my-squad" in chat and Copilot invokes EditLess's tool.

**1B. Chat Participant — `@editless` in Copilot Chat**

Register an `@editless` chat participant for:
- `@editless what squads are active?` → list squads with status
- `@editless show sessions for my-squad` → terminal states
- `@editless what work items are assigned?` → work items summary
- `@editless launch my-squad` → start a new session

**Why this matters:** EditLess becomes conversational. Users interact with Squad through natural language in Copilot Chat.

#### Tier 2: High Value, Requires Careful Implementation

**2A. LM API — AI-Powered Squad Features**

Use Copilot's LLM directly for:
- Session summarization — feed events.jsonl to LM, get human-readable summary
- Work item triage — analyze open issues, suggest squad member assignment
- Decision summarization — summarize decisions.md for team overview
- Intelligent notifications — use LM to decide if state change is worth notifying

**Caution:** Couples EditLess features to Copilot availability. Must degrade gracefully when no model is available.

**2B. Custom Agent Generation — `.agent.md` for Squads**

EditLess could generate `.github/agents/{squad-name}.agent.md` files that make each squad member available as a custom Copilot agent.

---

## 3. Copilot ↔ Squad Overlap Areas (For Squanchy)

| Area | Copilot's Surface | Squad's Surface | Integration Point |
|------|-------------------|-----------------|-------------------|
| **Agent definitions** | `.agent.md` files in `.github/agents/` or `~/.copilot/agents/` | `.ai-team/agents/{name}/charter.md` | EditLess could generate .agent.md from charter.md |
| **Instructions** | `copilot-instructions.md`, `.instructions.md` | `.ai-team/routing.md`, `.ai-team/decisions.md` | Already bridged — copilot-instructions.md references .ai-team/ |
| **Skills** | `SKILL.md` in `.github/skills/` or `~/.copilot/skills/` | `.ai-team/skills/` | EditLess already has skills in `.ai-team/skills/`. Format is compatible. |
| **Agent spawning** | Copilot coding agent picks up issues autonomously | Squad routing assigns work to team members | Copilot coding agent IS a squad member (`@copilot` in team.md) |
| **Session state** | `~/.copilot/session-state/` | EditLess terminal manager tracking | Already integrated via session-context.ts |
| **Branch conventions** | Agent creates `copilot/fix-{slug}` branches | Squad uses `squad/{issue}-{slug}` | Bridged via copilot-instructions.md override |

---

## 4. Recommended Integration Scenarios

### Phase 1 (Immediate — uses stable APIs only)

1. Register Language Model Tools for squad listing, session state, and session launch. Purely additive — no existing behavior changes.
2. Register `@editless` Chat Participant with basic squad status and session management commands.
3. Both require Copilot to be present but EditLess continues working without it (progressive detection).

### Phase 2 (Short-term — after Phase 1 validates)

4. Use LM API for session summarization — replace static events.jsonl last-line with LM-generated summaries when available.
5. Generate .agent.md files from squad charters — make squad members available in Copilot Chat.

---

### 2026-02-19: User Directive — PR Review Requirement

**By:** Casey Irvine (via Copilot)  
**Date:** 2026-02-19  
**What:** Every PR should be reviewed by at least 2 squad members before merging.  
**Why:** User request — captured for team memory.

### 2026-02-19: User directive (updated)
**By:** Casey Irvine (via Copilot)
**What:** All PRs require review from at least 2 squad members before merging. Reviews should happen BEFORE the PR is created — squad members review the code, then the PR is opened.
**Why:** User request — captured for team memory. Updated from original directive to clarify review timing.


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


# Copilot Terminal Integration Analysis

**Author:** Jaguar (Copilot SDK Expert)  
**Date:** 2026-02-15  
**Status:** Research Complete

## Executive Summary

This document analyzes how EditLess can improve integration with VS Code's terminal system for managing Copilot CLI sessions. The current implementation uses basic `createTerminal` + `sendText` with custom state tracking that often gets out of sync with VS Code's native terminal state. We've identified **10 integration opportunities** ranging from immediate high-value APIs (Shell Integration, Environment Variables) to experimental features (Terminal Profiles). All findings are based on stable VS Code APIs as of v1.100.0.

---

## Research Questions & Findings

### 1. Terminal Profile API (`contributes.terminal.profiles`)

**Status:** ✅ Stable API (VS Code 1.93+)

**What it is:**
Extensions can register custom terminal profiles via `package.json` contribution point + runtime provider. When a user creates a "Copilot CLI" terminal from the dropdown, your provider supplies the terminal configuration.

**Example package.json:**
```json
"contributes": {
  "terminal": {
    "profiles": [
      {
        "title": "Copilot CLI (EditLess)",
        "id": "editless.copilot-cli-profile",
        "icon": "robot"
      }
    ]
  }
}
```

**Example provider registration:**
```typescript
vscode.window.registerTerminalProfileProvider('editless.copilot-cli-profile', {
  provideTerminalProfile: async (token) => {
    return new vscode.TerminalProfile({
      name: 'Copilot CLI',
      shellPath: 'copilot',
      args: ['--agent', 'my-agent', '--allow-all'],
      iconPath: new vscode.ThemeIcon('robot'),
      color: new vscode.ThemeColor('terminal.ansiCyan')
    });
  }
});
```

**Value for EditLess:**
- **Native UI integration:** "Copilot CLI" appears in the built-in terminal profile dropdown alongside PowerShell, Bash, etc.
- **Profile-based terminals are tracked differently:** VS Code knows this terminal came from a specific profile, which could aid reconnection logic
- **Declarative configuration:** Users can set default launch args/flags per profile

**Risks:**
- **User-created terminals only:** This doesn't help with programmatically launched terminals via `launchTerminal()` — those still use `createTerminal()` directly
- **Limited customization:** Profiles are primarily for user-initiated terminal creation, not programmatic control
- **Not a tracking solution:** Profile metadata isn't exposed via Terminal API for querying "which terminals came from which profile"

**Recommendation:** ⚠️ **Low priority.** Profiles are valuable for power users who want a "Copilot CLI" option in the dropdown, but don't solve EditLess's core tracking problems. Consider for Phase 2 polish.

---

### 2. Shell Integration API (`onDidStartTerminalShellExecution` / `onDidEndTerminalShellExecution`)

**Status:** ✅ Stable API (VS Code 1.93+)

**What we're already using:**
EditLess already subscribes to `onDidStartTerminalShellExecution` and `onDidEndTerminalShellExecution` to track shell activity state (`_shellExecutionActive` map).

**What we're NOT using:**
1. **Command streaming (`execution.read()`):** The `TerminalShellExecution` object provides an async iterable stream of raw output (including ANSI escape sequences). You can read the output of commands as they run.

   ```typescript
   vscode.window.onDidStartTerminalShellExecution(event => {
     const execution = event.execution;
     (async () => {
       for await (const data of execution.read()) {
         // Process live command output
         if (data.includes('ERROR')) {
           // Detect errors in real-time
         }
       }
     })();
   });
   ```

2. **Command line introspection:** Access the exact command line string (`execution.commandLine.value`) and its "confidence" level (how sure VS Code is it parsed the command correctly).

3. **Exit code via `onDidEndTerminalShellExecution`:** When a command completes, the event provides `exitCode` (number or `undefined` if killed).

   ```typescript
   vscode.window.onDidEndTerminalShellExecution(event => {
     const exitCode = event.exitCode;
     if (exitCode === 0) {
       // Success
     } else if (exitCode === undefined) {
       // Killed by user
     } else {
       // Error: exitCode > 0
     }
   });
   ```

**Value for EditLess:**
- **Real-time error detection:** Parse copilot CLI output streams for error patterns, "waiting for input" prompts, or completion signals
- **Session state inference:** Detect when `copilot --agent` command exits (session ended) vs still running
- **No file polling:** Currently EditLess reads `events.jsonl` from disk. Streaming output could provide richer, faster state signals.

**Risks:**
- **Shell integration must be enabled:** This API only works when the terminal has shell integration active. PowerShell, Bash, Zsh auto-enable it, but custom shells or minimal environments may not.
- **ANSI escape codes:** The raw stream includes VT sequences. You need a parser to extract clean text.
- **Copilot CLI doesn't emit structured events to stdout:** The CLI writes session state to `~/.copilot/session-state/`, not to the terminal output stream. Streaming terminal output won't give you the `events.jsonl` data.

**Recommendation:** 🟡 **Medium priority.** Useful for detecting when the copilot CLI process itself exits (crashed vs normal exit) and for error detection in output. However, it won't replace `events.jsonl` polling because Copilot CLI doesn't emit session state to stdout. Consider for Phase 2: supplement file-based state with process-level signals.

---

### 3. Terminal Environment Variables (`TerminalOptions.env`)

**Status:** ✅ Stable API (VS Code 1.0+)

**How it works:**
When creating a terminal, you can inject environment variables via `TerminalOptions.env`. The terminal process inherits these variables.

```typescript
const terminal = vscode.window.createTerminal({
  name: 'Copilot CLI',
  cwd: squadPath,
  env: {
    EDITLESS_SQUAD_ID: config.id,
    EDITLESS_SESSION_ID: sessionId,
    COPILOT_MODEL: 'claude-sonnet-4.6',
    COPILOT_ALLOW_ALL: 'true',
  },
  strictEnv: false  // Merge with existing env, don't replace
});
```

**What Copilot CLI reads from environment:**
Based on `copilot help environment`, the CLI supports:
- `COPILOT_MODEL`: Set the default model
- `COPILOT_ALLOW_ALL`: Auto-approve all tools (equivalent to `--allow-all`)
- `COPILOT_CUSTOM_INSTRUCTIONS_DIRS`: Additional directories for custom instructions
- `COPILOT_GITHUB_TOKEN` / `GH_TOKEN` / `GITHUB_TOKEN`: Auth token
- `XDG_CONFIG_HOME` / `XDG_STATE_HOME`: Override config/state directories

**Value for EditLess:**
- **Pass squad context to CLI:** Inject `EDITLESS_SQUAD_ID`, `EDITLESS_AGENT_NAME`, etc. as env vars that copilot CLI custom agents could read via `$env:EDITLESS_SQUAD_ID` (PowerShell) or `$EDITLESS_SQUAD_ID` (Bash)
- **Pre-configure permissions:** Set `COPILOT_ALLOW_ALL=true` for specific squads to skip approval dialogs
- **Model configuration:** Set `COPILOT_MODEL` per-squad without requiring CLI flags
- **Custom instructions paths:** Point to `.ai-team/` directories via `COPILOT_CUSTOM_INSTRUCTIONS_DIRS`

**Risks:**
- **One-way communication:** You can pass data to the CLI, but the CLI can't pass data back via env vars
- **No session ID injection:** The Copilot CLI generates session IDs internally; there's no env var or flag to pre-assign one
- **Custom agent support required:** The Copilot CLI custom agents would need to be written to read `EDITLESS_*` env vars — this is a convention EditLess would establish, not a built-in feature

**Recommendation:** 🟢 **High priority.** This is immediately useful for configuring Copilot CLI behavior per-squad (model, permissions, instructions paths) and for passing squad context to custom agents. Implement in Phase 1.

---

### 4. TerminalShellExecution API (Command Tracking)

**Status:** ✅ Stable API (VS Code 1.93+)

**What it is:**
When you use `terminal.sendText(command)`, VS Code's shell integration API sees it as a `TerminalShellExecution` event. You can track command execution, duration, and exit codes.

**Current EditLess usage:**
EditLess calls `terminal.sendText(config.launchCommand || getActiveProviderLaunchCommand())` to start the copilot CLI. This shows up as a shell execution event.

**What we can get:**
- **Command line:** The exact command string sent (e.g., `copilot --agent my-agent`)
- **Exit code:** When the command completes, `onDidEndTerminalShellExecution` provides the exit code
- **Execution duration:** Calculate time between start and end events
- **Execution object:** The `TerminalShellExecution` object itself, which you can store for later reference

**Value for EditLess:**
- **Detect when copilot CLI exits:** Know when the session ends without polling files
- **Distinguish crashes from normal exits:** Exit code 0 = normal, non-zero = error, undefined = killed by user
- **Correlate terminals to commands:** Track which terminals are running copilot CLI vs other commands

**Risks:**
- **Shell integration required:** Doesn't work in all shells/environments
- **Multi-command terminals:** If a user runs multiple commands in the same terminal, you need logic to identify which execution is the copilot CLI process
- **No PID access:** The API doesn't expose the process ID, so you can't correlate with OS-level process info

**Recommendation:** 🟢 **High priority.** This is the most direct way to detect when a copilot CLI session ends (exit code available). Combine with `onDidCloseTerminal` to handle both cases: "CLI exited normally" vs "terminal closed by user". Implement in Phase 1.

---

### 5. Copilot CLI Session-State Directory Structure

**Status:** 🔍 Reverse-engineered from filesystem inspection

**What exists:**
```
~/.copilot/session-state/{sessionId}/
├── workspace.yaml       # CWD, summary, timestamps
├── events.jsonl         # Session event log
├── checkpoints/
│   └── index.md         # Checkpoint summaries
└── files/               # (empty in sample session)
```

**workspace.yaml structure:**
```yaml
id: 00031334-f9b2-4f01-ae31-37d7231db0a0
cwd: C:\Windows\System32
summary_count: 0
created_at: 2026-02-11T05:15:55.621Z
updated_at: 2026-02-11T05:16:44.570Z
summary: "Scan Microsoft Teams for caseybot mentions..."
```

**events.jsonl structure:**
Each line is a JSON object with `type`, `timestamp`, `id`, `parentId`, `data`:
- `session.start`: Session initialization
- `user.message`: User input
- `session.resume`: Session resumed from disk
- `session.model_change`: Model changed mid-session
- `assistant.turn_start`: Agent started responding
- `assistant.message`: Agent response with tool calls
- `tool.execution_start`: Tool call initiated
- `tool.execution_complete`: Tool call finished

**checkpoints/index.md:**
High-level checkpoint summaries (generated by `@copilot`).

**files/ directory:**
Purpose unknown; was empty in inspected session. May be used for session-specific file caching.

**Value for EditLess:**
- **Already implemented:** EditLess reads `workspace.yaml` and `events.jsonl` for session state detection
- **checkpoints/index.md:** Could surface checkpoint summaries in the EditLess UI for session progress tracking
- **files/ directory:** Investigate if this could be used for session artifacts (e.g., generated code, logs)

**Risks:**
- **Undocumented format:** This is reverse-engineered; Copilot CLI may change the structure without notice
- **No official API:** Direct file access is brittle compared to an API

**Recommendation:** 🟡 **Medium priority.** Continue reading `workspace.yaml` and `events.jsonl` as primary state source. Explore `checkpoints/index.md` for UI enhancements in Phase 2. Request an official API from GitHub Copilot team for long-term stability.

---

### 6. Copilot CLI Flags (`--resume`, `--agent`, `--allow-all`, etc.)

**Status:** ✅ Documented via `copilot --help`

**Key flags for EditLess:**

| Flag | Purpose | Value for EditLess |
|------|---------|-------------------|
| `--resume [sessionId]` | Resume a previous session by ID, or pick from a list | ✅ Already used in `relaunchSession()` |
| `--agent <agent>` | Specify custom agent to use | ✅ Already used in launch commands |
| `--allow-all` | Enable all permissions (no prompts) | 🟢 **High value:** Auto-approve for specific squads |
| `--model <model>` | Set AI model | 🟢 **High value:** Per-squad model selection |
| `--config-dir <dir>` | Override config directory | 🟡 **Medium value:** Isolate squad configs |
| `--log-dir <dir>` | Override log directory | 🟡 **Medium value:** Per-squad logging |
| `--add-dir <dir>` | Allow access to additional directories | 🟢 **High value:** Pre-approve workspace paths |
| `--allow-tool [tools...]` | Pre-approve specific tools | 🟢 **High value:** Fine-grained permissions |
| `--deny-tool [tools...]` | Block specific tools | 🟡 **Medium value:** Safety constraints |
| `--no-ask-user` | Disable ask_user tool (autopilot mode) | 🟡 **Medium value:** Fully autonomous sessions |
| `--experimental` | Enable experimental features | ⚠️ **Use with caution:** May be unstable |

**Notable absences:**
- ❌ **No `--session-id` flag:** You cannot pre-assign a session ID. The CLI generates it.
- ❌ **No `--json` output flag:** The CLI doesn't support structured JSON output for scripting.
- ❌ **No `--event-stream` flag:** Session events are written to `events.jsonl`, not stdout.

**Value for EditLess:**
- **Per-squad launch profiles:** Store flags in squad config, build launch command dynamically:
  ```typescript
  const flags = [
    `--agent ${config.agentName}`,
    config.allowAll ? '--allow-all' : '',
    config.model ? `--model ${config.model}` : '',
    `--add-dir ${config.path}`,
    config.allowedTools.map(t => `--allow-tool ${t}`).join(' '),
  ].filter(Boolean).join(' ');
  terminal.sendText(`copilot ${flags}`);
  ```

**Risks:**
- **CLI version compatibility:** Flags may change between Copilot CLI versions. EditLess should detect CLI version (`copilot --version`) and adapt.
- **No flag validation:** If you pass an invalid flag, the CLI will error or silently ignore it.

**Recommendation:** 🟢 **High priority.** Build a CLI flag builder utility that constructs launch commands from squad config. Support `--allow-all`, `--model`, `--add-dir`, `--allow-tool` as first-class squad settings. Implement in Phase 1.

---

### 7. VS Code Copilot API for Terminal Sessions

**Status:** 🔍 Partial API exposure (2024)

**What exists:**
- **Copilot extension exposes `ICopilotCLITerminalIntegration` service:** This internal API allows opening/resuming Copilot CLI sessions programmatically from the VS Code Copilot extension
- **`openTerminal` method:** Takes CLI arguments and terminal location (panel, editor, beside)
- **Session tracking:** The Copilot extension tracks its own launched sessions

**What's NOT exposed:**
- ❌ **No public API for third-party extensions:** EditLess cannot call the Copilot extension's terminal management functions
- ❌ **No event for "Copilot session started":** VS Code doesn't fire an event when the Copilot extension launches a terminal session
- ❌ **No session registry API:** EditLess cannot query "which terminals are Copilot sessions?" from the Copilot extension

**Value for EditLess:**
- **Detect VS Code-native Copilot sessions:** If the Copilot extension exposed an API or event, EditLess could discover and adopt those sessions (show them in the EditLess tree)
- **Avoid duplicate tracking:** If both EditLess and Copilot extension track the same terminal, they could share state

**Risks:**
- **API doesn't exist yet:** This is a feature request, not a current capability
- **Extension dependencies:** EditLess would depend on the Copilot extension being installed and activated

**Recommendation:** ⚠️ **Not actionable (yet).** File a feature request with the GitHub Copilot team for a public extension API. For now, EditLess and the Copilot extension operate independently — accept that some terminals may not be tracked by EditLess if launched directly from Copilot Chat UI.

---

### 8. Native Copilot Session Naming & Tracking

**Status:** 🔍 Observed behavior (no API)

**How VS Code Copilot extension names terminals:**
When the Copilot extension launches a terminal session (e.g., via Chat → "Open in Terminal"), it typically uses:
- **Name pattern:** `"Copilot CLI"` or `"Copilot CLI (Agent Name)"`
- **No icon or color customization:** Uses default terminal styling

**How it tracks sessions:**
- **Internal service registry:** The Copilot extension maintains its own map of terminals → session IDs
- **No persistence:** If VS Code reloads, the Copilot extension does not reconnect to orphaned sessions (as of 2024)

**Value for EditLess:**
- **Detect Copilot-launched terminals by name:** EditLess could scan `vscode.window.terminals` for terminals named "Copilot CLI" and attempt to adopt them
- **Orphan matching heuristic:** If a terminal name matches `"Copilot CLI"` + CWD matches a squad path, EditLess could reconnect it

**Risks:**
- **Name collisions:** Users or other extensions could create terminals with the same name
- **Fragile heuristic:** Terminal names can be changed by users or shells

**Recommendation:** 🟡 **Medium priority.** Add a "scan for Copilot CLI terminals" heuristic to EditLess's orphan reconnection logic. Match on name pattern + CWD. Implement in Phase 2 as a "Discover Copilot Sessions" command.

---

### 9. Terminal Link Provider (`registerTerminalLinkProvider`)

**Status:** ✅ Stable API (VS Code 1.93+)

**What it is:**
Extensions can make text in the terminal clickable by registering a link provider. When a user clicks a matched pattern (URL, file path, issue number), your handler is invoked.

**Example:**
```typescript
vscode.window.registerTerminalLinkProvider({
  provideTerminalLinks: (context, token) => {
    // Match GitHub issue/PR numbers: #1234
    const regex = /#(\d+)/g;
    const matches = [...context.line.matchAll(regex)];
    return matches.map(match => ({
      startIndex: match.index,
      length: match[0].length,
      tooltip: `Open issue ${match[1]}`,
      data: match[1],  // Issue number
    }));
  },
  handleTerminalLink: (link) => {
    const issueNumber = link.data;
    const repoUrl = 'https://github.com/owner/repo';
    vscode.env.openExternal(vscode.Uri.parse(`${repoUrl}/issues/${issueNumber}`));
  }
});
```

**Value for EditLess:**
- **Clickable PR links:** If copilot CLI output includes "PR #12345", make it clickable to open in browser/VS Code
- **Clickable issue links:** Same for "Issue #67890"
- **Clickable file paths:** If the CLI outputs file paths, make them open in editor
- **Clickable work item IDs:** "ADO-12345" → open in Azure DevOps
- **Session links:** "Session abc-123-def" → focus that session in EditLess tree

**Risks:**
- **Regex maintenance:** You need to maintain regex patterns for all link types
- **Ambiguous matches:** Terminal output may have false positives (e.g., "#1234" could be a color code, not an issue number)
- **No control over Copilot CLI output:** You can't force the CLI to output specific patterns

**Recommendation:** 🟢 **High priority.** This is a quick UX win with minimal risk. Implement link providers for common patterns (PR numbers, issue numbers, file paths). Implement in Phase 1.

---

### 10. TerminalExitStatus (`terminal.exitStatus` + `onDidCloseTerminal`)

**Status:** ✅ Stable API (VS Code 1.93+)

**How it works:**
When a terminal closes, `onDidCloseTerminal` fires. The closed terminal object has an `exitStatus` property:
- `exitStatus.code`: Exit code as a number (0 = success, >0 = error, `undefined` = killed)

```typescript
vscode.window.onDidCloseTerminal(terminal => {
  const info = this._terminals.get(terminal);
  if (!info) return;
  
  const exitStatus = terminal.exitStatus;
  if (exitStatus) {
    if (exitStatus.code === 0) {
      // Session ended normally
    } else if (exitStatus.code > 0) {
      // Session crashed or errored
      vscode.window.showErrorMessage(`Session ${info.displayName} exited with code ${exitStatus.code}`);
    }
  } else {
    // Terminal killed by user (Ctrl+C, close button, etc.)
  }
});
```

**Value for EditLess:**
- **Distinguish crashes from intentional closures:** Show error notifications only for non-zero exit codes
- **Session health tracking:** Log exit codes for debugging ("Why did this session end?")
- **Orphan prioritization:** If a session crashed (exit code >0), prioritize it in the "Re-launch" list

**Risks:**
- **Not available for all closure types:** If the terminal was killed forcefully (not a clean exit), `exitStatus` may be `undefined`
- **Doesn't work for long-running sessions:** If the copilot CLI process stays running, closing the terminal doesn't give you the CLI's exit code — it gives you the terminal's exit code (which may be different)

**Recommendation:** 🟢 **High priority.** Add exit status tracking to `onDidCloseTerminal` handler. Use it to improve error reporting and orphan session UX. Implement in Phase 1.

---

## Integration Opportunities (Ranked)

### 🟢 Phase 1: High Value, Low Risk (Implement Now)

1. **Environment Variables (`TerminalOptions.env`)** — Pass squad context and CLI config via env vars
2. **CLI Flag Builder** — Dynamically construct launch commands with `--allow-all`, `--model`, `--add-dir`, etc.
3. **Exit Status Tracking (`terminal.exitStatus`)** — Detect crashes vs normal exits
4. **Shell Execution Tracking** — Use `onDidEndTerminalShellExecution` to get exit codes from copilot CLI process
5. **Terminal Link Provider** — Make PR/issue/file links clickable in terminal output

**Estimated effort:** 2-3 days  
**Risk:** Low (all stable APIs)

### 🟡 Phase 2: Medium Value, Moderate Complexity

6. **Command Output Streaming** — Use `execution.read()` to parse copilot CLI output in real-time
7. **Checkpoint UI Integration** — Surface `checkpoints/index.md` content in EditLess sidebar
8. **Copilot Session Discovery** — Scan for "Copilot CLI" terminals launched by other extensions
9. **CLI Version Detection** — Parse `copilot --version` and adapt flag usage based on version

**Estimated effort:** 3-5 days  
**Risk:** Medium (shell integration dependency, heuristic-based matching)

### ⚠️ Phase 3: Experimental / Low Priority

10. **Terminal Profile Contribution** — Add "Copilot CLI" to VS Code's terminal dropdown
11. **Request Copilot Extension API** — File feature request for public session tracking API

**Estimated effort:** 2-4 weeks (includes upstream feature requests)  
**Risk:** High (depends on external teams, API changes)

---

## Compatibility & Stability Assessment

| Feature | API Status | VS Code Version | Risk Level |
|---------|-----------|----------------|-----------|
| Environment Variables | ✅ Stable | 1.0+ | 🟢 Low |
| Shell Integration | ✅ Stable | 1.93+ | 🟢 Low |
| Terminal Link Provider | ✅ Stable | 1.93+ | 🟢 Low |
| Exit Status | ✅ Stable | 1.93+ | 🟢 Low |
| Command Streaming | ✅ Stable | 1.93+ | 🟡 Medium (requires shell integration) |
| Terminal Profiles | ✅ Stable | 1.93+ | 🟢 Low (but limited value) |
| Copilot Extension API | ❌ Not public | N/A | 🔴 High (doesn't exist) |
| Session-State Files | ⚠️ Undocumented | N/A | 🟡 Medium (may change) |

**All Phase 1 recommendations use stable APIs** available since VS Code 1.93. EditLess targets `^1.100.0`, so all features are safe to implement.

---

## Implementation Recommendations

### 1. Environment Variable Injection

**Add to `TerminalManager.launchTerminal()`:**
```typescript
const terminal = vscode.window.createTerminal({
  name: displayName,
  cwd: config.path,
  env: {
    EDITLESS_SQUAD_ID: config.id,
    EDITLESS_SQUAD_NAME: config.name,
    EDITLESS_AGENT_NAME: config.agentName || 'default',
    COPILOT_MODEL: config.model || undefined,
    COPILOT_ALLOW_ALL: config.autoApprove ? 'true' : undefined,
    COPILOT_CUSTOM_INSTRUCTIONS_DIRS: config.customInstructionsDirs?.join(','),
  },
  strictEnv: false,
});
```

**Add to squad config schema:**
```typescript
interface AgentTeamConfig {
  // ...existing fields
  model?: string;               // Copilot model to use
  autoApprove?: boolean;        // Auto-approve tools (COPILOT_ALLOW_ALL)
  customInstructionsDirs?: string[];  // Additional instruction directories
}
```

### 2. CLI Flag Builder Utility

**Create `src/copilot-cli-builder.ts`:**
```typescript
export interface CopilotCliOptions {
  agent?: string;
  model?: string;
  allowAll?: boolean;
  allowedTools?: string[];
  deniedTools?: string[];
  additionalDirs?: string[];
  noAskUser?: boolean;
}

export function buildCopilotCommand(options: CopilotCliOptions): string {
  const parts = ['copilot'];
  
  if (options.agent) parts.push(`--agent ${options.agent}`);
  if (options.model) parts.push(`--model ${options.model}`);
  if (options.allowAll) parts.push('--allow-all');
  
  options.allowedTools?.forEach(tool => parts.push(`--allow-tool ${tool}`));
  options.deniedTools?.forEach(tool => parts.push(`--deny-tool ${tool}`));
  options.additionalDirs?.forEach(dir => parts.push(`--add-dir "${dir}"`));
  
  if (options.noAskUser) parts.push('--no-ask-user');
  
  return parts.join(' ');
}
```

### 3. Enhanced Exit Status Tracking

**Extend `TerminalManager`:**
```typescript
private readonly _exitStatuses = new Map<string, vscode.TerminalExitStatus>();

constructor(context: vscode.ExtensionContext) {
  // ...existing code
  
  this._disposables.push(
    vscode.window.onDidCloseTerminal(terminal => {
      const info = this._terminals.get(terminal);
      if (!info) return;
      
      if (terminal.exitStatus) {
        this._exitStatuses.set(info.id, terminal.exitStatus);
        
        if (terminal.exitStatus.code && terminal.exitStatus.code > 0) {
          vscode.window.showErrorMessage(
            `Session "${info.displayName}" exited with error code ${terminal.exitStatus.code}`,
            'View Logs', 'Re-launch'
          ).then(action => {
            if (action === 'Re-launch') {
              // Re-launch logic
            }
          });
        }
      }
      
      // ...existing cleanup
    })
  );
}
```

### 4. Terminal Link Provider

**Register in `extension.ts`:**
```typescript
context.subscriptions.push(
  vscode.window.registerTerminalLinkProvider({
    provideTerminalLinks: (context, token) => {
      const links: vscode.TerminalLink[] = [];
      
      // GitHub PR links: PR #12345
      const prRegex = /PR #(\d+)/g;
      for (const match of context.line.matchAll(prRegex)) {
        links.push({
          startIndex: match.index!,
          length: match[0].length,
          tooltip: `Open Pull Request ${match[1]}`,
          data: { type: 'pr', number: match[1] },
        });
      }
      
      // GitHub issue links: Issue #67890
      const issueRegex = /Issue #(\d+)/g;
      for (const match of context.line.matchAll(issueRegex)) {
        links.push({
          startIndex: match.index!,
          length: match[0].length,
          tooltip: `Open Issue ${match[1]}`,
          data: { type: 'issue', number: match[1] },
        });
      }
      
      // File paths: src/components/MyComponent.tsx
      const fileRegex = /(?:src|test|docs)\/[\w\/-]+\.[\w]+/g;
      for (const match of context.line.matchAll(fileRegex)) {
        links.push({
          startIndex: match.index!,
          length: match[0].length,
          tooltip: `Open ${match[0]}`,
          data: { type: 'file', path: match[0] },
        });
      }
      
      return links;
    },
    
    handleTerminalLink: (link) => {
      const data = link.data as any;
      
      if (data.type === 'pr' || data.type === 'issue') {
        const repo = getCurrentRepo();  // Get from workspace git remote
        const url = `https://github.com/${repo}/${data.type === 'pr' ? 'pull' : 'issues'}/${data.number}`;
        vscode.env.openExternal(vscode.Uri.parse(url));
      } else if (data.type === 'file') {
        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        if (wsFolder) {
          const filePath = vscode.Uri.joinPath(wsFolder.uri, data.path);
          vscode.window.showTextDocument(filePath);
        }
      }
    }
  })
);
```

---

## Risks & Mitigations

### Risk: Shell Integration Dependency

**Issue:** Several features (`execution.read()`, `onDidEndTerminalShellExecution`) require shell integration to be active. This doesn't work in all environments (minimal shells, custom terminals, Windows Command Prompt without setup).

**Mitigation:**
- Check if `terminal.shellIntegration` exists before relying on shell execution events
- Fall back to file-based state detection (`events.jsonl` polling) when shell integration is unavailable
- Document in EditLess README that full terminal integration requires PowerShell 5.1+, Bash 4+, or Zsh 5.0+

### Risk: Copilot CLI Version Compatibility

**Issue:** Copilot CLI flags and session-state file formats may change between versions. EditLess may break if the CLI is updated.

**Mitigation:**
- Detect CLI version on startup: `copilot --version`
- Maintain a version compatibility matrix mapping CLI versions → supported flags
- Gracefully degrade features if CLI version is unknown (use minimal flags, skip advanced features)
- Add a "CLI Version" indicator in EditLess status bar

### Risk: Undocumented Session-State Format

**Issue:** The `~/.copilot/session-state/` directory structure and `events.jsonl` format are undocumented and may change without notice.

**Mitigation:**
- Wrap all file parsing in try-catch blocks with fallback behavior
- Log parsing errors for debugging but don't crash EditLess
- File a feature request with GitHub Copilot team for an official session state API
- Consider contributing to the Copilot CLI open-source project to stabilize the format

---

## Next Steps

1. **Implement Phase 1 features** (env vars, CLI flag builder, exit status tracking, link provider)
2. **Update EditLess documentation** with new squad configuration options (model, autoApprove, etc.)
3. **Write tests** for CLI flag builder and terminal link provider
4. **Monitor CLI version compatibility** as Copilot CLI releases new versions
5. **File feature requests** with GitHub Copilot team:
   - Public extension API for session tracking
   - Official session-state directory schema documentation
   - `--json` output flag for programmatic consumption

---

## References

- [VS Code Terminal Profiles Documentation](https://code.visualstudio.com/docs/terminal/profiles)
- [VS Code Terminal Shell Integration](https://code.visualstudio.com/docs/terminal/shell-integration)
- [VS Code Terminal API Reference](https://code.visualstudio.com/api/references/vscode-api#window)
- [VS Code Terminal Extension Samples](https://github.com/microsoft/vscode-extension-samples/tree/main/terminal-sample)
- [GitHub Copilot CLI Help Output](copilot --help)
- [GitHub Copilot VS Code Extension](https://github.com/microsoft/vscode-copilot-chat)

---

**End of Analysis**


# Terminal Integration Deep Audit

**Author:** Morty (Extension Dev)  
**Date:** 2026-02-20  
**Type:** Research & Analysis  

## Executive Summary

This audit identifies **14 critical bugs**, **8 unused VS Code Terminal APIs**, and **5 architectural limitations** in EditLess's terminal integration. The current implementation has race conditions in session matching, performance issues in state detection, and misses key VS Code APIs for terminal lifecycle management.

**Top 5 Priorities (by impact × effort):**
1. **P0** — Session ID detection race condition (high impact, medium effort)
2. **P0** — Terminal creation race condition with sendText (high impact, small effort)  
3. **P1** — Orphan matching substring logic too greedy (medium impact, small effort)
4. **P1** — Adopt TerminalOptions.isTransient for ephemeral terminals (medium impact, small effort)
5. **P1** — Use terminal.state.isInteractedWith for better state detection (medium impact, medium effort)

---

## 1. Terminal Creation Flow Analysis

### Current Flow (lines 96–129 in terminal-manager.ts)

```typescript
launchTerminal(config: AgentTeamConfig, customName?: string): vscode.Terminal {
  const terminal = vscode.window.createTerminal({
    name: displayName,
    cwd: config.path,
  });
  
  terminal.sendText(config.launchCommand || getActiveProviderLaunchCommand());
  terminal.show();
  
  this._terminals.set(terminal, { ...info });
  // ...
}
```

### Bug #1: Race Condition with sendText (P0)
**Severity:** P0  
**Lines:** 107–108

**Issue:** `sendText()` is called immediately after `createTerminal()` without waiting for the shell to initialize. On slow systems or with custom shell profiles, the text is buffered and may execute before the shell CWD is set, causing commands to run in the wrong directory.

**Evidence:**
- VS Code docs: "Text is queued and sent when the terminal is ready"
- Issue: No feedback if queueing fails
- Windows Terminal has a 1–2 second initialization delay with oh-my-posh

**Fix:**
```typescript
const terminal = vscode.window.createTerminal({
  name: displayName,
  cwd: config.path,
  // Wait for shell ready before making terminal visible
});

// Queue command BEFORE show() to minimize timing issues
terminal.sendText(config.launchCommand || getActiveProviderLaunchCommand());

// show() triggers shell initialization — terminal becomes visible when ready
terminal.show();
```

**Pattern:** Always call `sendText()` before `show()` to ensure commands queue properly before the shell starts processing.

---

### Bug #2: Missing TerminalOptions Fields (P1)
**Severity:** P1  
**Lines:** 102–105, 227–230

**Issue:** `createTerminal()` only uses `name` and `cwd`. Missing fields cause:
- No visual distinction between squad terminals (all use default shell icon)
- Session terminals appear in tab restore (should be transient)
- No environment variable injection for session metadata

**Unused Options:**
1. **`iconPath`** — ThemeIcon for visual squad identification
2. **`color`** — ThemeColor for squad-specific terminal highlighting
3. **`isTransient`** — Prevents terminals from being restored in future sessions
4. **`env`** — Inject `EDITLESS_SQUAD_ID`, `EDITLESS_SESSION_ID` for script access

**Fix (High Impact):**
```typescript
const terminal = vscode.window.createTerminal({
  name: displayName,
  cwd: config.path,
  iconPath: new vscode.ThemeIcon('organization'), // Squad icon
  color: new vscode.ThemeColor('terminal.ansiCyan'), // Visual grouping
  isTransient: true, // Don't restore in future sessions
  env: {
    EDITLESS_SQUAD_ID: config.id,
    EDITLESS_SESSION_ID: info.id,
    EDITLESS_SQUAD_NAME: config.name,
  },
});
```

**Benefits:**
- Users can visually distinguish squad terminals from personal terminals
- Session metadata is available to shell scripts
- Tab restore doesn't clutter workspace with old sessions
- Less reliance on terminal name parsing

---

### Bug #3: No Validation of Terminal Creation Success (P2)
**Severity:** P2  
**Lines:** 102

**Issue:** `createTerminal()` always returns a Terminal object even if shell initialization fails. No error handling if the CWD doesn't exist or the shell profile is broken.

**Fix:** Listen for `onDidCloseTerminal` immediately after creation with a timeout:
```typescript
const terminal = vscode.window.createTerminal({ ... });

// Detect immediate failure (shell init error)
const earlyCloseDetector = vscode.window.onDidCloseTerminal(closed => {
  if (closed === terminal && Date.now() - createdAt < 2000) {
    vscode.window.showErrorMessage(`Terminal for ${config.name} failed to initialize`);
    this._terminals.delete(terminal);
    this._onDidChange.fire();
  }
  earlyCloseDetector.dispose();
}, this);

// Dispose detector after 5 seconds if terminal survived
setTimeout(() => earlyCloseDetector.dispose(), 5000);
```

---

## 2. Orphan Management Bugs

### Current Strategy (lines 381–485 in terminal-manager.ts)

Four-pass matching:
1. Exact `terminalName` match (line 464)
2. Exact `originalName` match (line 465)
3. Exact `displayName` match (line 466)
4. **Substring fallback** (lines 467–470) ← 🔴 PROBLEM

```typescript
runPass((t, p) => {
  const orig = p.originalName ?? p.displayName;
  return t.name.includes(orig) || p.terminalName.includes(t.name);
});
```

---

### Bug #4: Substring Matching Too Greedy (P1)
**Severity:** P1  
**Lines:** 467–470

**Issue:** The substring fallback causes false positives:
- Terminal "pwsh" matches ANY persisted terminal with "pwsh" in the name
- Multiple terminals named "🚀 My Squad #1", "🚀 My Squad #2" all match "My Squad"
- Shells that strip emoji leave ambiguous names ("My Squad" vs "My Squad")

**Example Failure:**
```
Persisted: "🚀 DevOps Squad #1" → shell modifies to "DevOps Squad"
Persisted: "🚀 DevOps Squad #2" → shell modifies to "DevOps Squad"
Live terminals: ["DevOps Squad", "DevOps Squad"]
Result: Both persisted entries match both live terminals (race)
```

**Root Cause:** The comment on line 426 acknowledges this:
> "Sort by creation time so positional matching aligns with vscode.window.terminals creation order — prevents off-by-one when terminal names are non-unique (e.g., shell-modified to 'pwsh')."

But positional matching only helps if the ORDER is stable. If terminals close/open during reconcile, order breaks.

**Fix (Option A — Heuristic Strengthening):**
```typescript
// Substring match ONLY if:
// 1. Length difference is small (max 5 chars for emoji strip)
// 2. Terminal index is embedded in the name
runPass((t, p) => {
  const orig = p.originalName ?? p.displayName;
  const indexMatch = t.name.includes(`#${p.index}`) || orig.includes(`#${p.index}`);
  const lengthDelta = Math.abs(t.name.length - orig.length);
  return indexMatch && lengthDelta < 10 && (
    t.name.includes(orig.replace(/[^\w\s#]/g, '')) || // Strip non-alphanumeric
    orig.includes(t.name.replace(/[^\w\s#]/g, ''))
  );
});
```

**Fix (Option B — Unique Terminal IDs via env vars):**
```typescript
// Inject unique ID during creation
env: {
  EDITLESS_TERMINAL_ID: info.id,
}

// VS Code doesn't expose env vars for matching, so this requires registerTerminalProfileProvider
```

**Recommendation:** Option A for v0.1.1, Option B for v0.2.0 (requires profile provider).

---

### Bug #5: MAX_REBOOT_COUNT = 2 Too Aggressive (P2)
**Severity:** P2  
**Lines:** 381, 392–394

**Issue:** Terminals that fail to match in 2 reload cycles (60 seconds with 30s persist interval) are permanently evicted. This is too aggressive for:
- Multi-window workflows where terminals are in different windows
- Terminals in background VS Code windows
- Slow shell initialization (oh-my-posh on Windows)

**Current Logic:**
```typescript
private static readonly MAX_REBOOT_COUNT = 2;

reconcile(): void {
  this._pendingSaved = saved
    .map(entry => ({ ...entry, rebootCount: (entry.rebootCount ?? 0) + 1 }))
    .filter(entry => entry.rebootCount < TerminalManager.MAX_REBOOT_COUNT);
}
```

**Fix:** Increase to 5 (2.5 minutes) or 10 (5 minutes), OR change logic to time-based:
```typescript
private static readonly MAX_RECONCILE_AGE_MS = 5 * 60 * 1000; // 5 minutes

reconcile(): void {
  const now = Date.now();
  this._pendingSaved = saved
    .map(entry => ({ ...entry, rebootCount: (entry.rebootCount ?? 0) + 1 }))
    .filter(entry => {
      const age = now - entry.lastSeenAt;
      return age < TerminalManager.MAX_RECONCILE_AGE_MS;
    });
}
```

---

### Bug #6: _scheduleMatch() Debounce May Be Insufficient (P2)
**Severity:** P2  
**Lines:** 408–416

**Issue:** 200ms debounce may not be enough for rapid terminal creation (e.g., "Relaunch All Orphans" creates 5 terminals in 50ms). Race condition: terminals created during the debounce window miss the first match attempt.

**Fix:** Increase to 500ms and add a counter to track pending match attempts:
```typescript
private _matchDebounceMs = 500;
private _pendingMatchCount = 0;

private _scheduleMatch(): void {
  this._pendingMatchCount++;
  if (this._matchTimer !== undefined) {
    clearTimeout(this._matchTimer);
  }
  this._matchTimer = setTimeout(() => {
    this._matchTimer = undefined;
    this._tryMatchTerminals();
    this._pendingMatchCount = 0;
  }, this._matchDebounceMs);
}
```

---

### Bug #7: _pendingSaved Can Grow Unbounded (P1)
**Severity:** P1  
**Lines:** 406, 511

**Issue:** `_pendingSaved` persists unmatched terminals even after they're dismissed or relaunched. The array grows indefinitely if terminals are created and closed rapidly.

**Evidence:**
- Line 406: `_pendingSaved: PersistedTerminalInfo[] = [];` — no size limit
- Line 511: Unmatched entries are re-added to the array every `_persist()` call

**Fix:** Limit array size to 50 entries, oldest first:
```typescript
private _persist(): void {
  // ... existing logic ...
  
  for (const pending of this._pendingSaved) {
    if (!entries.some(e => e.id === pending.id)) {
      entries.push(pending);
    }
  }
  
  // Limit total persisted entries to 50 (prevent unbounded growth)
  const sorted = entries.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  const limited = sorted.slice(0, 50);
  
  this.context.workspaceState.update(STORAGE_KEY, limited);
}
```

---

## 3. State Detection Accuracy

### Current Detection Paths

#### Primary: events.jsonl (lines 345–350)
```typescript
if (info.agentSessionId && this._sessionResolver) {
  const lastEvent = this._sessionResolver.getLastEvent(info.agentSessionId);
  if (lastEvent) {
    return stateFromEvent(lastEvent);
  }
}
```

#### Fallback: Shell Execution (lines 352–367)
```typescript
const isExecuting = this._shellExecutionActive.get(terminal);
if (isExecuting) { return 'working'; }

const lastActivity = this._lastActivityAt.get(terminal);
// ... idle/stale threshold logic
```

---

### Bug #8: WORKING_EVENT_TYPES Incomplete (P1)
**Severity:** P1  
**Lines:** 580–587

**Issue:** The `WORKING_EVENT_TYPES` set is missing several event types that indicate work:

**Current Set:**
```typescript
const WORKING_EVENT_TYPES = new Set([
  'session.start',
  'user.message',
  'assistant.turn_start',
  'assistant.message',
  'tool.execution_start',
  'tool.execution_complete',
]);
```

**Missing Events:**
- `tool.execution_progress` — streaming tool output
- `assistant.thinking` — model reasoning (claude-opus-4)
- `session.checkpoint` — session save (long-running sessions)
- `error` — error handling (still working)

**Fix:**
```typescript
const WORKING_EVENT_TYPES = new Set([
  'session.start',
  'user.message',
  'assistant.turn_start',
  'assistant.message',
  'assistant.thinking',
  'tool.execution_start',
  'tool.execution_progress',
  'tool.execution_complete',
  'session.checkpoint',
  'error',
]);
```

---

### Bug #9: EventCacheEntry TTL Too Short (P1)
**Severity:** P1  
**Lines:** 36, 43, 77

**Issue:** 3-second cache TTL causes the tree view to show stale state during rapid updates:
- Tree view refreshes every time terminal manager fires `onDidChange`
- Each refresh reads the last event from cache
- If 3+ seconds have passed since the event was written, the cache is invalidated
- Next read hits disk (slow), blocks UI thread

**Evidence:**
```typescript
interface EventCacheEntry {
  timestamp: number;
  event: SessionEvent | null;
}
private static readonly EVENT_CACHE_TTL_MS = 3_000;
```

**Impact:** Noticeable lag when switching between terminals in the tree view.

**Fix:** Increase TTL to 10 seconds (balances freshness vs performance):
```typescript
private static readonly EVENT_CACHE_TTL_MS = 10_000;
```

---

### Bug #10: Idle/Stale Thresholds Too Aggressive (P2)
**Severity:** P2  
**Lines:** 47–48, 362–366

**Issue:** 
- **IDLE_THRESHOLD_MS = 5 minutes** — too short for reading documentation or stepping through debugger
- **STALE_THRESHOLD_MS = 60 minutes** — too short for lunch breaks

**User Impact:** Terminals show "stale — re-launch?" while the user is still actively working.

**Recommended Values:**
```typescript
const IDLE_THRESHOLD_MS = 15 * 60 * 1000;  // 15 minutes (was 5)
const STALE_THRESHOLD_MS = 120 * 60 * 1000; // 2 hours (was 1 hour)
```

---

### Bug #11: Shell Execution Fallback Is Binary (P1, Design Issue)
**Severity:** P1 (design issue documented in decisions.md)  
**Lines:** 81–90, 352–367

**Issue:** The shell execution fallback only knows `executing=true/false`. It cannot distinguish:
- User typing a command (but not executing yet)
- Agent waiting for user input (prompt visible)
- Terminal scrollback review (no activity but user is present)
- Background process running (e.g., `npm run watch`)

**Root Cause:** `onDidStartTerminalShellExecution` / `onDidEndTerminalShellExecution` only fire for commands executed via the shell, not for:
- User typing (no event)
- Agent prompts (no event)
- Background processes (`&` on Unix, `Start-Job` on Windows)

**Fix Options:**

**Option A — Terminal Output Parsing (Proposed API):**
```typescript
// Requires VS Code Proposed API: onDidWriteTerminalData
vscode.window.onDidWriteTerminalData(e => {
  const output = e.data;
  
  // Detect agent prompts (heuristic)
  if (output.includes('? ') || output.includes('(y/n)') || output.match(/\[.*\]:/)) {
    this._waitingOnInput.set(e.terminal, true);
    this._onDidChange.fire();
  }
});
```

**Option B — Agent Protocol Extension:**
```typescript
// Agent writes state to a well-known file
// ~/.copilot/session-state/{sessionId}/ui-state.json
// { "state": "waiting-on-input", "prompt": "Continue? (y/n)" }

// EditLess reads this file in detectSessionIds()
```

**Option C — Invert Default to Idle:**
```typescript
// Change fallback logic to default to 'idle' instead of 'waiting-on-input'
// Only set 'waiting-on-input' when we have a positive signal

getSessionState(terminal: vscode.Terminal): SessionState | undefined {
  // ... existing primary path ...
  
  // Fallback: shell execution API
  const isExecuting = this._shellExecutionActive.get(terminal);
  if (isExecuting) { return 'working'; }
  
  // NEW: Check for waiting-on-input signal (positive, not inferred)
  if (this._waitingOnInput.get(terminal)) { return 'waiting-on-input'; }
  
  // Default to idle (not waiting-on-input)
  const lastActivity = this._lastActivityAt.get(terminal);
  if (!lastActivity || Date.now() - lastActivity < IDLE_THRESHOLD_MS) {
    return 'idle';
  }
  
  return Date.now() - lastActivity < STALE_THRESHOLD_MS ? 'idle' : 'stale';
}
```

**Recommendation:** Option C for v0.1.1 (safest, no API changes), Option A for v0.2.0 if proposed API graduates.

---

## 4. Session ID Detection

### Current Implementation (lines 288–330)

```typescript
detectSessionIds(): void {
  if (!this._sessionResolver) return;
  
  const squadPaths: string[] = [];
  for (const info of this._terminals.values()) {
    if (!info.agentSessionId && info.squadPath) {
      squadPaths.push(info.squadPath);
    }
  }
  
  const sessions = this._sessionResolver.resolveAll(squadPaths);
  
  for (const [terminal, info] of this._terminals) {
    if (info.agentSessionId || !info.squadPath) continue;
    const ctx = sessions.get(info.squadPath);
    if (!ctx) continue;
    
    // Only claim sessions created AFTER the terminal
    const sessionCreated = new Date(ctx.createdAt).getTime();
    if (sessionCreated < info.createdAt.getTime()) continue;
    
    // Check not already claimed by another terminal
    const alreadyClaimed = [...this._terminals.values()].some(
      other => other !== info && other.agentSessionId === ctx.sessionId,
    );
    if (alreadyClaimed) continue;
    
    info.agentSessionId = ctx.sessionId;
    changed = true;
  }
}
```

---

### Bug #12: Performance Issue — Scans ALL Sessions (P1)
**Severity:** P1  
**Lines:** 112–130 in session-context.ts

**Issue:** `detectSessionIds()` calls `resolveAll()` which scans EVERY directory in `~/.copilot/session-state/` (potentially 100+ sessions):

```typescript
private _scan(squadPaths: string[]): Map<string, SessionContext> {
  let sessionDirs: string[];
  try {
    sessionDirs = fs.readdirSync(this._sessionStateDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);  // <-- ALL directories
  } catch {
    return result;
  }
  
  for (const sessionId of sessionDirs) {  // <-- Loops over EVERY session
    // Read workspace.yaml, parse, check CWD match
  }
}
```

**Impact:**
- `detectSessionIds()` runs inside `_persist()` (line 489)
- `_persist()` runs every 30 seconds (line 70)
- 100 sessions × 2 file reads × 0.5ms = 100ms blocked I/O every 30 seconds

**Fix:** Index sessions by CWD (cached):
```typescript
class SessionContextResolver {
  private _cwdIndex: Map<string, string[]> | null = null; // CWD → session IDs
  
  private _buildCwdIndex(): Map<string, string[]> {
    const index = new Map<string, string[]>();
    const sessionDirs = fs.readdirSync(this._sessionStateDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
    
    for (const sessionId of sessionDirs) {
      const workspacePath = path.join(this._sessionStateDir, sessionId, 'workspace.yaml');
      try {
        const yaml = parseSimpleYaml(fs.readFileSync(workspacePath, 'utf-8'));
        const cwd = normalizePath(yaml['cwd']);
        if (!index.has(cwd)) index.set(cwd, []);
        index.get(cwd)!.push(sessionId);
      } catch { /* skip */ }
    }
    
    return index;
  }
  
  resolveAll(squadPaths: string[]): Map<string, SessionContext> {
    if (!this._cwdIndex) {
      this._cwdIndex = this._buildCwdIndex();
      // Invalidate cache after 30s
      setTimeout(() => { this._cwdIndex = null; }, 30_000);
    }
    
    // Now only read workspace.yaml for sessions matching the requested CWD
    const result = new Map<string, SessionContext>();
    for (const squadPath of squadPaths) {
      const normalized = normalizePath(squadPath);
      const matchingSessionIds = this._cwdIndex.get(normalized) ?? [];
      for (const sessionId of matchingSessionIds) {
        // Read full session details only for matches
      }
    }
    return result;
  }
}
```

**Performance Gain:** 100ms → 5ms (20x faster)

---

### Bug #13: Race Condition — Multiple Terminals in Same CWD (P0)
**Severity:** P0  
**Lines:** 307–324

**Issue:** When two terminals launch in the same squad CWD within seconds of each other:
1. Terminal A launches, creates session-state dir, starts Copilot CLI
2. Terminal B launches, creates session-state dir, starts Copilot CLI
3. `detectSessionIds()` runs 5 seconds later
4. Both terminals see the same CWD, both claim the SAME session ID (last one wins)

**Evidence:**
```typescript
const ctx = sessions.get(info.squadPath);  // CWD-based lookup, not terminal-specific

// Only claim sessions created AFTER the terminal
const sessionCreated = new Date(ctx.createdAt).getTime();
if (sessionCreated < info.createdAt.getTime()) continue;
```

**Failure Case:**
- Squad path: `/home/user/my-squad/`
- Terminal A launched: 10:00:00, Copilot session created: 10:00:03
- Terminal B launched: 10:00:01, Copilot session created: 10:00:04
- `detectSessionIds()` runs: 10:00:10
- Sessions map: `{ '/home/user/my-squad/': <sessionB created 10:00:04> }`
- Terminal A claims sessionB (wrong!)
- Terminal B also claims sessionB (correct)

**Root Cause:** The code assumes one terminal per CWD, but users often launch multiple Copilot sessions in the same squad.

**Fix:** Match terminals to sessions by creation timestamp proximity:
```typescript
detectSessionIds(): void {
  if (!this._sessionResolver) return;
  
  const squadPaths: string[] = [];
  for (const info of this._terminals.values()) {
    if (!info.agentSessionId && info.squadPath) {
      squadPaths.push(info.squadPath);
    }
  }
  
  // Get ALL sessions for each squad path, not just the latest
  const allSessions = this._sessionResolver.resolveAllSessions(squadPaths);
  
  for (const [terminal, info] of this._terminals) {
    if (info.agentSessionId || !info.squadPath) continue;
    
    const candidateSessions = allSessions.get(info.squadPath) ?? [];
    
    // Find the session created closest to (but after) the terminal creation time
    let bestMatch: SessionContext | null = null;
    let bestDelta = Infinity;
    
    for (const session of candidateSessions) {
      const sessionCreated = new Date(session.createdAt).getTime();
      const terminalCreated = info.createdAt.getTime();
      
      // Only consider sessions created after terminal
      if (sessionCreated < terminalCreated) continue;
      
      // Find closest match (smallest time delta)
      const delta = sessionCreated - terminalCreated;
      if (delta < bestDelta) {
        // Check not already claimed
        const alreadyClaimed = [...this._terminals.values()].some(
          other => other !== info && other.agentSessionId === session.sessionId,
        );
        if (!alreadyClaimed) {
          bestMatch = session;
          bestDelta = delta;
        }
      }
    }
    
    if (bestMatch) {
      info.agentSessionId = bestMatch.sessionId;
      changed = true;
    }
  }
}
```

**Requires:** New method in SessionContextResolver:
```typescript
resolveAllSessions(squadPaths: string[]): Map<string, SessionContext[]> {
  // Returns ALL sessions per CWD, not just the latest
}
```

---

### Bug #14: Skips Sessions Created Before Terminal (P2)
**Severity:** P2  
**Lines:** 313–314

**Issue:** The code skips sessions created before the terminal:
```typescript
const sessionCreated = new Date(ctx.createdAt).getTime();
if (sessionCreated < info.createdAt.getTime()) continue;
```

**Why This Exists:** To avoid claiming old sessions when relaunching a terminal.

**Problem:** If a user:
1. Starts Copilot CLI manually in a terminal (session created: 10:00:00)
2. EditLess reconciles and tracks that terminal (terminal created: 10:00:05)
3. `detectSessionIds()` skips the session (created before terminal)

**Fix:** Remove this check and rely on the "already claimed" check instead:
```typescript
// Remove this check entirely
// const sessionCreated = new Date(ctx.createdAt).getTime();
// if (sessionCreated < info.createdAt.getTime()) continue;

// The "alreadyClaimed" check is sufficient
const alreadyClaimed = [...this._terminals.values()].some(
  other => other !== info && other.agentSessionId === ctx.sessionId,
);
if (alreadyClaimed) continue;
```

---

## 5. VS Code Terminal APIs — Unused Opportunities

### 5.1 High Impact APIs (Should Adopt)

#### A. `vscode.window.registerTerminalProfileProvider` (High Impact, Medium Effort)
**Status:** Not used  
**Opportunity:** Custom terminal profiles for squads

**Current Problem:** Terminals are created with `createTerminal()` which uses the user's default shell. No way to inject squad-specific shell initialization.

**Use Case:**
```typescript
vscode.window.registerTerminalProfileProvider('editless-squad', {
  provideTerminalProfile(token) {
    return new vscode.TerminalProfile({
      options: {
        name: 'Squad Terminal',
        env: {
          EDITLESS_SQUAD_ID: '...',
          PS1: '(🚀 Squad) $ ', // Custom prompt
        },
        shellPath: '/bin/bash',
        shellArgs: ['--init-file', '~/.editless/squad-init.sh'],
      },
    });
  },
});
```

**Benefits:**
- Inject squad-specific environment variables
- Custom shell prompts to distinguish squad terminals
- Pre-load squad-specific aliases or functions
- Better terminal matching (profiles have stable IDs)

**Effort:** Medium (requires profile registration, shell init script generation)

---

#### B. `terminal.creationOptions` (High Impact, Small Effort)
**Status:** Not used  
**Opportunity:** Read back the exact options used to create a terminal

**Current Problem:** Reconcile logic guesses terminal properties by matching names. No way to confirm if a terminal is an EditLess-managed terminal.

**Use Case:**
```typescript
// During reconcile
const liveTerminals = vscode.window.terminals;
for (const terminal of liveTerminals) {
  const options = terminal.creationOptions as vscode.TerminalOptions;
  if (options?.env?.EDITLESS_TERMINAL_ID) {
    // This is definitely an EditLess terminal
    const id = options.env.EDITLESS_TERMINAL_ID;
    const persisted = savedEntries.find(e => e.id === id);
    if (persisted) {
      this._terminals.set(terminal, { ...persisted });
    }
  }
}
```

**Benefits:**
- 100% accurate terminal matching (no substring heuristics)
- Read back squadId, sessionId from env vars
- Detect non-EditLess terminals (ignore them)

**Effort:** Small (requires injecting `EDITLESS_TERMINAL_ID` in `env` during creation)

---

#### C. `TerminalOptions.isTransient` (High Impact, Small Effort)
**Status:** Not used  
**Opportunity:** Mark session terminals as transient (don't restore)

**Current Problem:** VS Code restores terminals on workspace reload. EditLess terminals are restored as zombie terminals (no shell state).

**Fix:**
```typescript
const terminal = vscode.window.createTerminal({
  name: displayName,
  cwd: config.path,
  isTransient: true, // <-- Add this
});
```

**Benefits:**
- No zombie terminals on reload
- Cleaner workspace restore
- Less confusion for users

**Effort:** Trivial (one line)

---

#### D. `terminal.state.isInteractedWith` (Medium Impact, Small Effort)
**Status:** Not used  
**Opportunity:** Detect if user has typed in the terminal

**Current Problem:** State detection can't distinguish "terminal open but unused" from "user actively typing".

**Use Case:**
```typescript
getSessionState(terminal: vscode.Terminal): SessionState | undefined {
  // ... existing logic ...
  
  // If terminal has never been interacted with, it's probably idle
  if (!terminal.state.isInteractedWith) {
    return 'idle';
  }
  
  // If terminal was interacted with recently, it's more likely to be active
  const lastActivity = this._lastActivityAt.get(terminal);
  if (terminal.state.isInteractedWith && lastActivity && Date.now() - lastActivity < 60_000) {
    return 'waiting-on-input'; // User was typing recently
  }
  
  return 'idle';
}
```

**Benefits:**
- Better "waiting-on-input" detection
- Avoid false positives for background terminals

**Effort:** Small (requires reading `terminal.state.isInteractedWith`)

---

#### E. `onDidChangeTerminalState` (Medium Impact, Small Effort)
**Status:** Not used  
**Opportunity:** React to terminal state changes (interactedWith)

**Current Problem:** State detection relies on shell execution events, which don't fire for user typing.

**Use Case:**
```typescript
vscode.window.onDidChangeTerminalState(e => {
  const info = this._terminals.get(e.terminal);
  if (!info) return;
  
  if (e.terminal.state.isInteractedWith) {
    // User just typed in this terminal
    this._lastActivityAt.set(e.terminal, Date.now());
    this._onDidChange.fire();
  }
});
```

**Benefits:**
- Detect user typing (not just command execution)
- More accurate "last activity" timestamp

**Effort:** Small (one event listener)

---

### 5.2 Medium Impact APIs (Consider for v0.2.0)

#### F. `TerminalOptions.iconPath` / `TerminalOptions.color` (Medium Impact, Small Effort)
**Status:** Not used (mentioned in Bug #2)

**Opportunity:** Visual distinction for squad terminals

**Benefits:**
- Users can visually identify squad terminals in the tab bar
- Color-code squads (e.g., blue for frontend, green for backend)
- Reduce reliance on terminal name parsing

**Effort:** Small (already covered in Bug #2 fix)

---

#### G. `TerminalDimensions` / `onDidChangeTerminalDimensions` (Low Impact, Small Effort)
**Status:** Not used  
**Opportunity:** Adjust terminal output based on size

**Use Case:** 
- Copilot CLI could adapt its output width based on terminal size
- EditLess could warn if terminal is too small for the agent UI

**Effort:** Small, but requires agent protocol changes

---

### 5.3 Low Priority APIs (Future Research)

#### H. `window.createExtensionTerminal` (Pseudo-terminal) (Low Impact, High Effort)
**Status:** Not used  
**Opportunity:** Full control over terminal I/O

**Use Case:**
- Implement a custom terminal UI for agent interactions
- Capture all terminal output for logging/debugging
- Inject custom rendering (e.g., syntax highlighting)

**Effort:** High (requires pty implementation, full terminal emulation)

**Recommendation:** Not worth it unless we want to build a custom agent UI (out of scope for v0.1.x)

---

#### I. `onDidWriteTerminalData` (Proposed API) (High Impact, Unknown Effort)
**Status:** Proposed API (not stable)  
**Opportunity:** Parse terminal output for state detection

**Use Case:**
```typescript
vscode.window.onDidWriteTerminalData(e => {
  const output = e.data;
  if (output.includes('? ')) {
    this._waitingOnInput.set(e.terminal, true);
  }
});
```

**Benefits:**
- Detect agent prompts without protocol changes
- Better "waiting-on-input" detection

**Effort:** Unknown (API may never graduate to stable)

**Recommendation:** Monitor this API, adopt if it graduates to stable in VS Code 1.101+

---

#### J. `onDidExecuteTerminalCommand` (Proposed API) (Medium Impact, Unknown Effort)
**Status:** Proposed API (not stable)  
**Opportunity:** Detect command execution with full context (not just start/end)

**Recommendation:** Same as I — monitor, don't adopt yet

---

#### K. `window.registerTerminalQuickFixProvider` (Low Impact, Medium Effort)
**Status:** Not used  
**Opportunity:** Provide quick fixes for terminal errors

**Use Case:**
- Detect "command not found: copilot" → suggest "npm install -g @copilot-cli"
- Detect permission errors → suggest `sudo` or `chmod`

**Effort:** Medium (requires error pattern matching)

**Recommendation:** Nice-to-have for v0.2.0, not critical

---

## 6. Terminal Naming Strategy

### Current Approach (lines 98, 227)

```typescript
const displayName = customName ?? `${config.icon} ${config.name} #${index}`;
```

**Example:** "🚀 My Squad #1"

---

### Bug #15: Shells Strip/Modify Unicode Emoji (P1, Design Issue)
**Severity:** P1  
**Lines:** 98, 227

**Issue:** Different shells handle Unicode emoji differently:
- **PowerShell (Windows):** Strips emoji → "My Squad #1"
- **bash (Linux):** Preserves emoji → "🚀 My Squad #1"
- **zsh (macOS):** Preserves emoji → "🚀 My Squad #1"
- **cmd.exe (Windows):** Replaces emoji with `?` → "? My Squad #1"

**Impact:** Reconcile substring matching (Bug #4) breaks because persisted `originalName` has emoji, but `terminal.name` doesn't.

**Options:**

**Option A — Strip Emoji from Terminal Names (Safest):**
```typescript
function stripEmoji(text: string): string {
  return text.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
}

const displayName = customName ?? `${stripEmoji(config.icon)} ${config.name} #${index}`;
```

**Option B — Use ASCII Markers:**
```typescript
const displayName = customName ?? `[${config.id.slice(0, 3)}] ${config.name} #${index}`;
```
**Example:** "[dev] My Squad #1"

**Option C — Use Terminal Color/Icon (Requires Bug #2 fix):**
```typescript
// Name is plain text, icon/color provide visual distinction
const displayName = customName ?? `${config.name} #${index}`;

const terminal = vscode.window.createTerminal({
  name: displayName,
  iconPath: new vscode.ThemeIcon('organization'),
  color: new vscode.ThemeColor('terminal.ansiCyan'),
});
```

**Recommendation:** Option C (best UX), with Option A as a fallback for v0.1.1 if Bug #2 fix is delayed.

---

### Bug #16: No Support for `workbench.action.terminal.renameWithArg` (P2)
**Severity:** P2  
**Lines:** None (missing feature)

**Issue:** VS Code supports programmatic terminal renaming via `workbench.action.terminal.renameWithArg`, but EditLess uses `terminal.name` assignment which is read-only.

**Current Workaround:** `renameSession()` updates internal state but doesn't rename the VS Code terminal tab.

**Fix:**
```typescript
renameSession(terminal: vscode.Terminal, newDisplayName: string): void {
  const info = this._terminals.get(terminal);
  if (!info) return;
  
  // Update internal state
  info.displayName = newDisplayName;
  
  // Update VS Code terminal tab
  vscode.commands.executeCommand('workbench.action.terminal.renameWithArg', {
    name: newDisplayName,
  });
  
  this._persist();
  this._onDidChange.fire();
}
```

**Note:** `workbench.action.terminal.renameWithArg` requires the terminal to be active first.

---

## 7. Recommended Priority Order

### P0 — Critical (Ship Blockers)
1. **Bug #13** — Session ID race condition (multiple terminals per CWD)  
   - **Impact:** Data loss (sessions overwritten)  
   - **Effort:** Medium (requires `resolveAllSessions` method)  
   - **Fix:** Match terminals to sessions by creation timestamp proximity

2. **Bug #1** — Terminal creation race condition (sendText)  
   - **Impact:** Commands fail to execute, CWD is wrong  
   - **Effort:** Small (move `sendText()` before `show()`)  
   - **Fix:** Reorder lines 107–108

### P1 — High Priority (v0.1.1)
3. **Bug #4** — Substring matching too greedy  
   - **Impact:** False positive orphan matches  
   - **Effort:** Small (strengthen heuristic)  
   - **Fix:** Option A (index-based matching)

4. **Bug #2** — Missing TerminalOptions fields (isTransient, iconPath, color, env)  
   - **Impact:** Poor UX, no visual distinction, zombie terminals  
   - **Effort:** Small (add 4 fields)  
   - **Fix:** Add all 4 options

5. **Bug #12** — Performance issue (scans all sessions)  
   - **Impact:** 100ms UI lag every 30 seconds  
   - **Effort:** Medium (build CWD index)  
   - **Fix:** Index sessions by CWD

6. **Bug #7** — _pendingSaved unbounded growth  
   - **Impact:** Memory leak, slow persist  
   - **Effort:** Small (limit array to 50)  
   - **Fix:** Slice to 50 entries

7. **Bug #11** — Shell execution fallback is binary (design issue)  
   - **Impact:** Incorrect "waiting-on-input" state  
   - **Effort:** Medium (Option C — invert default)  
   - **Fix:** Default to 'idle', require positive signal for 'waiting-on-input'

### P2 — Medium Priority (v0.2.0)
8. **Bug #8** — WORKING_EVENT_TYPES incomplete  
   - **Impact:** Missed work events  
   - **Effort:** Trivial (add 4 events)  
   - **Fix:** Add missing event types

9. **Bug #9** — EventCacheEntry TTL too short  
   - **Impact:** Disk I/O lag  
   - **Effort:** Trivial (change constant)  
   - **Fix:** Increase to 10 seconds

10. **Bug #5** — MAX_REBOOT_COUNT too aggressive  
    - **Impact:** Terminals evicted too quickly  
    - **Effort:** Small (change constant or time-based logic)  
    - **Fix:** Increase to 5 or use time-based eviction

11. **Bug #15** — Shells strip emoji  
    - **Impact:** Reconcile failures  
    - **Effort:** Small (strip emoji or use color/icon)  
    - **Fix:** Option C (use color/icon instead of emoji)

12. **Bug #3** — No validation of terminal creation success  
    - **Impact:** Silent failures  
    - **Effort:** Medium (add early close detector)  
    - **Fix:** Listen for immediate close

### P3 — Low Priority (Future)
13. **Bug #6** — _scheduleMatch debounce insufficient  
    - **Impact:** Race condition in rapid terminal creation  
    - **Effort:** Trivial (increase timeout)  
    - **Fix:** 500ms + counter

14. **Bug #10** — Idle/stale thresholds too aggressive  
    - **Impact:** False "stale" warnings  
    - **Effort:** Trivial (change constants)  
    - **Fix:** 15 min idle, 2 hr stale

15. **Bug #14** — Skips sessions created before terminal  
    - **Impact:** Manual terminals not detected  
    - **Effort:** Trivial (remove check)  
    - **Fix:** Rely on "already claimed" check

16. **Bug #16** — No support for renameWithArg  
    - **Impact:** Terminal tab name doesn't update  
    - **Effort:** Small (call command)  
    - **Fix:** Use `workbench.action.terminal.renameWithArg`

---

## 8. Code Examples — Top 5 Improvements

### Fix #1: Terminal Creation Race Condition (P0, Small)

**Before (lines 102–108):**
```typescript
const terminal = vscode.window.createTerminal({
  name: displayName,
  cwd: config.path,
});

terminal.sendText(config.launchCommand || getActiveProviderLaunchCommand());
terminal.show();
```

**After:**
```typescript
const terminal = vscode.window.createTerminal({
  name: displayName,
  cwd: config.path,
  isTransient: true, // Don't restore on reload
  iconPath: new vscode.ThemeIcon('organization'),
  color: new vscode.ThemeColor('terminal.ansiCyan'),
  env: {
    EDITLESS_TERMINAL_ID: id, // For accurate reconcile
    EDITLESS_SQUAD_ID: config.id,
    EDITLESS_SESSION_ID: id,
  },
});

// Queue command BEFORE show() to avoid race
terminal.sendText(config.launchCommand || getActiveProviderLaunchCommand());
terminal.show();
```

---

### Fix #2: Session ID Race Condition (P0, Medium)

**Before (lines 307–324):**
```typescript
detectSessionIds(): void {
  // ...
  const sessions = this._sessionResolver.resolveAll(squadPaths);
  
  for (const [terminal, info] of this._terminals) {
    const ctx = sessions.get(info.squadPath);  // <-- Only returns LATEST session per CWD
    if (!ctx) continue;
    
    const sessionCreated = new Date(ctx.createdAt).getTime();
    if (sessionCreated < info.createdAt.getTime()) continue;
    
    info.agentSessionId = ctx.sessionId;
  }
}
```

**After:**
```typescript
detectSessionIds(): void {
  if (!this._sessionResolver) return;
  
  const squadPaths: string[] = [];
  for (const info of this._terminals.values()) {
    if (!info.agentSessionId && info.squadPath) {
      squadPaths.push(info.squadPath);
    }
  }
  
  // Get ALL sessions per CWD, not just the latest
  const allSessions = this._sessionResolver.resolveAllSessions(squadPaths);
  
  let changed = false;
  for (const [terminal, info] of this._terminals) {
    if (info.agentSessionId || !info.squadPath) continue;
    
    const candidateSessions = allSessions.get(info.squadPath) ?? [];
    
    // Find session created closest to (but after) terminal creation
    let bestMatch: SessionContext | null = null;
    let bestDelta = Infinity;
    
    for (const session of candidateSessions) {
      const sessionCreated = new Date(session.createdAt).getTime();
      const terminalCreated = info.createdAt.getTime();
      
      if (sessionCreated < terminalCreated) continue;
      
      const delta = sessionCreated - terminalCreated;
      if (delta < bestDelta) {
        const alreadyClaimed = [...this._terminals.values()].some(
          other => other !== info && other.agentSessionId === session.sessionId,
        );
        if (!alreadyClaimed) {
          bestMatch = session;
          bestDelta = delta;
        }
      }
    }
    
    if (bestMatch) {
      info.agentSessionId = bestMatch.sessionId;
      changed = true;
    }
  }
  
  if (changed) {
    this._persist();
    this._onDidChange.fire();
  }
}
```

**New method in SessionContextResolver:**
```typescript
resolveAllSessions(squadPaths: string[]): Map<string, SessionContext[]> {
  const result = new Map<string, SessionContext[]>();
  
  for (const sp of squadPaths) {
    const normalized = normalizePath(sp);
    const sessions: SessionContext[] = [];
    
    for (const sessionId of sessionDirs) {
      // ... existing scan logic ...
      if (normalizedCwd === normalized) {
        sessions.push(ctx);
      }
    }
    
    result.set(sp, sessions);
  }
  
  return result;
}
```

---

### Fix #3: Substring Matching Strengthening (P1, Small)

**Before (lines 467–470):**
```typescript
runPass((t, p) => {
  const orig = p.originalName ?? p.displayName;
  return t.name.includes(orig) || p.terminalName.includes(t.name);
});
```

**After:**
```typescript
runPass((t, p) => {
  const orig = p.originalName ?? p.displayName;
  
  // Only match if index is embedded in both names
  const terminalHasIndex = t.name.includes(`#${p.index}`);
  const persistedHasIndex = orig.includes(`#${p.index}`);
  if (!terminalHasIndex && !persistedHasIndex) return false;
  
  // Strip non-alphanumeric for fuzzy match (handles emoji strip)
  const stripNonAlnum = (s: string) => s.replace(/[^\w\s#]/g, '');
  const tStripped = stripNonAlnum(t.name);
  const origStripped = stripNonAlnum(orig);
  
  // Length difference must be < 10 chars (emoji strip tolerance)
  const lengthDelta = Math.abs(tStripped.length - origStripped.length);
  if (lengthDelta > 10) return false;
  
  return tStripped.includes(origStripped) || origStripped.includes(tStripped);
});
```

---

### Fix #4: CWD Indexing for Performance (P1, Medium)

**Before (session-context.ts lines 112–130):**
```typescript
private _scan(squadPaths: string[]): Map<string, SessionContext> {
  // ... 
  for (const sessionId of sessionDirs) {  // Loop over ALL sessions
    // Read workspace.yaml for every session
  }
}
```

**After:**
```typescript
class SessionContextResolver {
  private _cwdIndex: Map<string, string[]> | null = null;
  private _cwdIndexTimestamp = 0;
  private static readonly CWD_INDEX_TTL_MS = 30_000;
  
  private _ensureCwdIndex(): void {
    const now = Date.now();
    if (this._cwdIndex && (now - this._cwdIndexTimestamp) < SessionContextResolver.CWD_INDEX_TTL_MS) {
      return;
    }
    
    this._cwdIndex = new Map<string, string[]>();
    const sessionDirs = fs.readdirSync(this._sessionStateDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
    
    for (const sessionId of sessionDirs) {
      const workspacePath = path.join(this._sessionStateDir, sessionId, 'workspace.yaml');
      try {
        const yaml = parseSimpleYaml(fs.readFileSync(workspacePath, 'utf-8'));
        const cwd = normalizePath(yaml['cwd']);
        if (!this._cwdIndex.has(cwd)) {
          this._cwdIndex.set(cwd, []);
        }
        this._cwdIndex.get(cwd)!.push(sessionId);
      } catch { /* skip */ }
    }
    
    this._cwdIndexTimestamp = now;
  }
  
  private _scan(squadPaths: string[]): Map<string, SessionContext> {
    this._ensureCwdIndex();
    const result = new Map<string, SessionContext>();
    
    for (const sp of squadPaths) {
      const normalized = normalizePath(sp);
      const sessionIds = this._cwdIndex!.get(normalized) ?? [];
      
      // Only read workspace.yaml for sessions matching this CWD
      for (const sessionId of sessionIds) {
        const sessionDir = path.join(this._sessionStateDir, sessionId);
        // ... existing read logic ...
      }
    }
    
    return result;
  }
}
```

---

### Fix #5: Invert waiting-on-input Default (P1, Medium)

**Before (lines 334–368):**
```typescript
getSessionState(terminal: vscode.Terminal): SessionState | undefined {
  // ... primary path ...
  
  // Fallback: shell execution API
  const isExecuting = this._shellExecutionActive.get(terminal);
  if (isExecuting) { return 'working'; }
  
  const lastActivity = this._lastActivityAt.get(terminal);
  if (!lastActivity) {
    return 'idle';
  }
  
  const ageMs = Date.now() - lastActivity;
  if (ageMs < IDLE_THRESHOLD_MS) {
    return 'idle';  // <-- BUG: Should return 'waiting-on-input' here
  }
  
  if (ageMs < STALE_THRESHOLD_MS) { return 'idle'; }
  return 'stale';
}
```

**After:**
```typescript
getSessionState(terminal: vscode.Terminal): SessionState | undefined {
  const info = this._terminals.get(terminal);
  if (!info) { return undefined; }
  
  // Primary: events.jsonl for Copilot sessions
  if (info.agentSessionId && this._sessionResolver) {
    const lastEvent = this._sessionResolver.getLastEvent(info.agentSessionId);
    if (lastEvent) {
      return stateFromEvent(lastEvent);
    }
  }
  
  // Fallback: shell execution API
  const isExecuting = this._shellExecutionActive.get(terminal);
  if (isExecuting) { return 'working'; }
  
  // NEW: Check for positive waiting-on-input signal
  // (Future: populate this via terminal output parsing or agent protocol)
  if (this._waitingOnInput.get(terminal)) {
    return 'waiting-on-input';
  }
  
  // DEFAULT TO IDLE (not waiting-on-input)
  const lastActivity = this._lastActivityAt.get(terminal);
  if (!lastActivity) {
    return 'idle';
  }
  
  const ageMs = Date.now() - lastActivity;
  if (ageMs < STALE_THRESHOLD_MS) {
    return 'idle';
  }
  
  return 'stale';
}
```

**Add new map:**
```typescript
private readonly _waitingOnInput = new Map<vscode.Terminal, boolean>();
```

---

## 9. Summary — Bugs by Severity

| Severity | Count | Bugs |
|----------|-------|------|
| **P0** | 2 | #1 (sendText race), #13 (session ID race) |
| **P1** | 7 | #2 (missing options), #4 (substring matching), #7 (unbounded growth), #8 (event types), #9 (cache TTL), #11 (binary fallback), #12 (performance), #15 (emoji) |
| **P2** | 5 | #3 (no validation), #5 (reboot count), #6 (debounce), #10 (thresholds), #14 (skip old sessions), #16 (renameWithArg) |

---

## 10. Next Steps

### Immediate (v0.1.1)
1. Fix Bug #1 (sendText race) — 10 minutes
2. Fix Bug #13 (session ID race) — 2 hours
3. Fix Bug #4 (substring matching) — 30 minutes
4. Fix Bug #2 (add isTransient, iconPath, color, env) — 1 hour

### Short-term (v0.2.0)
5. Fix Bug #12 (CWD indexing) — 2 hours
6. Fix Bug #11 (invert waiting-on-input default) — 1 hour
7. Adopt `terminal.creationOptions` for reconcile (API B) — 1 hour
8. Adopt `terminal.state.isInteractedWith` for state detection (API D) — 30 minutes

### Long-term (v0.3.0+)
9. Research `registerTerminalProfileProvider` (API A) — 1 week
10. Monitor `onDidWriteTerminalData` proposed API (API I)
11. Implement custom terminal UI if needed (`createExtensionTerminal`)

---

**Total Effort Estimate (v0.1.1):** 5–6 hours  
**Total Effort Estimate (v0.2.0):** 10–12 hours  
**Total Effort Estimate (v0.3.0+):** 2–3 weeks  

---

**End of Audit**


# Squad-Specific Terminal Integration Research

**Date:** 2026-02-20  
**Author:** Squanchy (Squad Platform Expert)  
**Context:** Analyzing how multi-agent squads, orchestration, and squad state should interact with EditLess terminal management

---

## Research Question 1: Squad Session Lifecycle

### What SHOULD happen when a user launches a session in a squad context?

**Current Reality:**
- EditLess launches a terminal with `copilot` (or `copilot --agent squad` for squad-aware launches)
- Terminal is tagged with `squadId` only
- No awareness of what the session is actually doing

**Squad Orchestration Model:**
The Squad coordinator doesn't "spawn agents in terminals" the way a developer might think. Key insight from `squad.agent.md`:

1. **CLI Mode:** Coordinator uses the `task` tool with `agent_type`, `mode: "background"`, and `read_agent` for parallel spawns
2. **VS Code Mode:** Coordinator uses `runSubagent` — all subagents run in the SAME parent session context, returning results synchronously in parallel

**What this means for terminals:**
- **One terminal = one coordinator session**, NOT one terminal per agent
- When the coordinator says "🏗️ Rick analyzing... 🔧 Morty implementing... 🧪 Summer testing...", those are **subagents** running inside the coordinator's session context
- The terminal is showing the coordinator's orchestration work, not individual agent terminals

### Ceremony Sessions

From `squad.agent.md` (lines 852-977), ceremonies work via a **facilitator pattern**:
- Facilitator agent is spawned sync (`agent_type: "general-purpose"`)
- Facilitator then spawns each participant as a sub-task (sync)
- Results collected, ceremony summary written to `.ai-team/log/`, decisions to inbox
- Scribe spawned last to merge everything

**Terminal implication:** A ceremony is a single terminal session where the facilitator orchestrates multiple sequential participant spawns. The user sees ONE terminal doing the ceremony work, not N terminals for N participants.

### Ralph (Work Monitor)

From `squad.agent.md` (lines 1362-1406), Ralph is a continuous work loop:
- Scans GitHub issues every 3-5 rounds
- Spawns agents for work (parallel when possible)
- IMMEDIATELY loops back to scan again without user input
- Cycles until the board is clear or user says "idle"

**Terminal implication:** Ralph is a long-running background session. Should be:
- Launched with `detach: true` so it survives EditLess reloads
- Visually distinct (different icon, "🔄 Ralph — monitoring backlog")
- State should show "monitoring" or "working on issue #42"

---

## Research Question 2: Squad State → Terminal State Mapping

**Current SessionState enum (terminal-manager.ts:10):**
```typescript
export type SessionState = 'working' | 'waiting-on-input' | 'idle' | 'stale' | 'orphaned';
```

**Current state detection (terminal-manager.ts:334-368):**
1. Primary: reads `events.jsonl` via SessionContextResolver
2. Fallback: VS Code shell execution API
3. Uses event types to infer state:
   - `WORKING_EVENT_TYPES`: session.start, user.message, assistant.turn_start, tool.execution_start, etc.
   - `assistant.turn_end` → 'waiting-on-input' if recent, 'idle' if older

### Squad-Specific States: Do We Need Them?

**Analysis of squad operations:**

| Squad Operation | Duration | Event Pattern | Current State Mapping | Proposed State |
|-----------------|----------|---------------|----------------------|----------------|
| Coordinator routing | ~2-5s | user.message → assistant.message → tool calls | working | ✅ working (fine as-is) |
| Single agent spawn | ~8-35s | tool.execution_start (task) → tool.execution_complete | working | ✅ working (fine as-is) |
| Parallel fan-out (3-5 agents) | ~40-60s | Multiple tool.execution_start → Multiple tool.execution_complete | working | ✅ working (fine as-is) |
| Ceremony facilitation | ~2-5 min | tool.execution_start → nested subagent spawns → tool.execution_complete | working | 🟡 Could be 'in-ceremony' but not critical |
| Ralph monitoring loop | hours/days | Continuous cycle of working → idle → working | alternating | 🟢 NEW: 'monitoring' |
| User reviewing results | variable | assistant.turn_end → (pause) | waiting-on-input | ✅ waiting-on-input (fine as-is) |

**Recommendation:**
- Add ONE new state: **`'monitoring'`** for Ralph-style long-running work loops
- Detection: If session has been cycling between working/idle for >30 minutes with no user input, AND the session cwd matches a squad path with Ralph enabled in `ceremonies.md` → mark as 'monitoring'
- All other squad operations map cleanly to existing states

**Why not add 'orchestrating' or 'in-ceremony'?**
- These are transient (seconds to minutes) and already covered by 'working'
- Adding granular states increases complexity without clear UX benefit
- The state icon is 2x2 pixels — user can't see "orchestrating vs working" difference anyway

---

## Research Question 3: Squad Context in Terminal Naming

**Current naming (terminal-manager.ts:98):**
```typescript
const displayName = customName ?? `${config.icon} ${config.name} #${index}`;
// Example: "🚀 EditLess #1"
```

**Problems:**
1. Doesn't tell you what the session is doing
2. Doesn't tell you which agent is active (when a specific agent is spawned)
3. Doesn't tell you if it's a ceremony, Ralph session, or normal work

### Proposed Naming Strategy

**Tier 1: Auto-detect from session context (when agentSessionId is linked)**

Read from `~/.copilot/session-state/{sessionId}/workspace.yaml`:
- `summary` field contains the task description
- Example: `"Rick: refactoring auth module"`

**Naming format:**
```
{squad.icon} {squad.name} — {summary}
```

Example: `🚀 EditLess — Rick: refactoring auth module`

**Tier 2: Detect ceremonies from orchestration log**

If the most recent `.ai-team/orchestration-log/*.md` entry for this squad has `Mode: ceremony` → extract ceremony name:
```
🚀 EditLess — 📋 Design Review
```

**Tier 3: Detect Ralph**

If session summary contains "Ralph" or "monitoring" or "backlog":
```
🚀 EditLess — 🔄 Ralph: monitoring backlog
```

**Tier 4: Fallback (current behavior)**
```
🚀 EditLess #1
```

### Implementation Approach

**New method in TerminalManager:**
```typescript
updateDisplayNameFromContext(terminal: vscode.Terminal): void {
  const info = this._terminals.get(terminal);
  if (!info?.agentSessionId || !this._sessionResolver) return;
  
  const ctx = this._sessionResolver.resolveForSquad(info.squadPath);
  if (!ctx?.summary) return;
  
  const newName = `${info.squadIcon} ${info.squadName} — ${ctx.summary}`;
  if (newName !== info.displayName) {
    this.renameSession(terminal, newName);
  }
}
```

Call this:
1. When session ID is detected/linked
2. On a 30s interval for active terminals
3. When `SquadWatcher` fires (squad state changed)

---

## Research Question 4: Multi-Terminal Squad Scenarios

### Scenario 1: "Team, build the login page" → 4+ agents in parallel

**What actually happens (from squad.agent.md:520-537):**
```
Coordinator spawns all agents in ONE tool-calling turn:
- task(agent_type: "general-purpose", mode: "background", ...) x4
- Each agent runs independently
- Coordinator uses read_agent to collect results
```

**Terminal reality:** ONE terminal shows the coordinator orchestrating. The parallel agents are invisible subprocesses.

**Proposed UX:**
- Terminal name updates to show progress: `🚀 EditLess — Team: building login page (3/4 complete)`
- Terminal tooltip shows which agents are working:
  ```
  Active agents:
  - ✅ Rick (completed 2m ago)
  - ✅ Morty (completed 1m ago)  
  - ⏳ Summer (working)
  - 🕒 Meeseeks (queued)
  ```

**How to implement:**
- Read `events.jsonl` for tool.execution_start/complete events where toolName = "task"
- Parse the agent name from the task description
- Track completion state per agent
- Update terminal tooltip dynamically

### Scenario 2: Ralph → continuous background work

**What actually happens:**
- User says "Ralph, activate"
- Coordinator spawns Ralph as a detached background process
- Ralph loops indefinitely: scan → spawn work → scan → spawn work
- Each "spawn work" is a nested agent spawn (could be parallel)

**Terminal reality:** ONE long-running Ralph terminal. Work spawns are invisible.

**Proposed UX:**
- Terminal name: `🚀 EditLess — 🔄 Ralph: monitoring (active)`
- Terminal state: 'monitoring' (new state)
- Terminal tooltip shows recent activity:
  ```
  Ralph Work Monitor
  Status: Active (2h 15m)
  Last activity: 3m ago
  Recent work:
  - Issue #42 → Morty (completed)
  - Issue #43 → Rick (in progress)
  - Backlog: 5 untriaged issues
  ```

**How to implement:**
- Detect Ralph sessions by checking if workspace.yaml summary contains "Ralph" or "work monitor"
- Add badge to terminal showing elapsed time
- Read `.ai-team/orchestration-log/` for Ralph's recent spawns
- Show last 3-5 spawns in tooltip

### Scenario 3: Ceremony → facilitator + participants

**What actually happens:**
- Coordinator spawns facilitator (sync)
- Facilitator spawns each participant (sync, sequential)
- Facilitator collects input, writes ceremony summary
- Scribe merges decisions

**Terminal reality:** ONE facilitator terminal. Participants are invisible subspawns.

**Proposed UX:**
- Terminal name: `🚀 EditLess — 📋 Design Review (Rick facilitating)`
- Terminal state: 'working' (existing state is fine)
- Terminal tooltip:
  ```
  Ceremony: Design Review
  Facilitator: Rick
  Participants: Morty, Summer, Meeseeks
  Progress: 2/3 collected
  ```

**How to implement:**
- Detect ceremony by reading most recent `.ai-team/orchestration-log/*.md` with `Mode: ceremony`
- Parse facilitator, participants from the log entry
- Track progress by counting tool.execution_complete events for participant spawns

### Scenario 4: Multiple worktrees → simultaneous work

**What actually happens:**
- Developer has 3 worktrees for 3 different issues
- Each worktree has its own `.ai-team/` directory (symlinked or copied)
- Each worktree can have an independent squad session

**Terminal reality:** 3+ terminals, one per worktree, potentially working simultaneously.

**Proposed UX:**
- Terminal names distinguish by worktree/branch:
  ```
  🚀 EditLess (feat/auth) — Rick: implementing OAuth
  🚀 EditLess (fix/crash) — Morty: debugging null check
  🚀 EditLess (main) — idle
  ```
- Tree view groups terminals by branch or worktree path

**How to implement:**
- Read `branch` field from `workspace.yaml`
- Include branch in terminal name when multiple terminals exist for the same squad
- Tree view: add branch grouping option

---

## Research Question 5: Session-to-Squad Context Bridge

**Current approach (session-context.ts):**
- Scans `~/.copilot/session-state/` directories
- Reads `workspace.yaml` to get `cwd`
- Normalizes paths and matches to squad paths (CWD-based matching)
- Caches results for 30s

**Gap analysis:**
| Squad State File | Current Usage | Potential Usage |
|------------------|---------------|-----------------|
| `workspace.yaml` | ✅ Read (cwd, summary, branch) | ✅ Already optimal |
| `events.jsonl` | ✅ Read (last event for state detection) | 🟡 Could parse tool calls for agent names |
| `plan.md` | ✅ Read (extract PR/WI references) | ✅ Already used |
| `.ai-team/decisions.md` | ❌ Not read | 🟢 Could show decision count in tooltip |
| `.ai-team/decisions/inbox/` | ❌ Not monitored | 🟢 Badge when non-empty (= agents actively working) |
| `.ai-team/orchestration-log/` | ❌ Not read | 🟢 Parse for agent activity, ceremony detection |
| `.ai-team/log/` | ❌ Not read | 🟡 Could show session summaries in terminal history |
| `.ai-team/agents/*/history.md` | ❌ Not read | ❌ Not useful for terminal UX |
| `.ai-team/agents/*/charter.md` | ❌ Not read | ❌ Not useful for terminal UX |

**Highest-value additions:**

### 1. Monitor `decisions/inbox/` as activity heartbeat

**Why:** From squad-integration-surface skill: "The `decisions/inbox/` directory is the **heartbeat**. When agents work, files appear here."

**Implementation:**
```typescript
class SquadActivityMonitor {
  watchInbox(squadPath: string): Observable<boolean> {
    const inboxPath = path.join(squadPath, '.ai-team/decisions/inbox');
    return fs.watch(inboxPath).pipe(
      map(() => fs.readdirSync(inboxPath).length > 0)
    );
  }
}
```

**UX:**
- Terminal badge: `📥 3` when inbox has files
- Terminal tooltip: "3 decisions pending merge (agents actively working)"
- Tree view: squad-level badge showing total inbox count

### 2. Parse `orchestration-log/` for recent agent activity

**Why:** This is the spawn evidence. Each `.ai-team/orchestration-log/*.md` file documents an agent spawn with:
- Agent name
- Mode (background/sync/ceremony)
- Files read/produced
- Outcome

**Implementation:**
```typescript
interface OrchestrationEntry {
  timestamp: Date;
  agent: string;
  mode: string;
  outcome: string;
  filesProduced: string[];
}

function getRecentSpawns(squadPath: string, limit: number): OrchestrationEntry[] {
  const logDir = path.join(squadPath, '.ai-team/orchestration-log');
  const entries = fs.readdirSync(logDir)
    .filter(f => f.endsWith('.md'))
    .map(f => parseOrchestrationLog(path.join(logDir, f)))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
  return entries;
}
```

**UX:**
- Terminal tooltip shows last 3-5 agent spawns:
  ```
  Recent agent activity:
  - Rick: feature implementation (completed 5m ago)
  - Morty: bug fix (completed 12m ago)
  - Summer: test creation (in progress)
  ```

### 3. Parse `events.jsonl` for agent names in tool calls

**Why:** When coordinator spawns agents via `task` tool, the tool arguments contain the agent name.

**Implementation:**
```typescript
function parseAgentNamesFromEvents(sessionId: string): string[] {
  const eventsPath = path.join(sessionStateDir, sessionId, 'events.jsonl');
  const lines = fs.readFileSync(eventsPath, 'utf-8').split('\n');
  
  const agentNames: string[] = [];
  for (const line of lines.reverse()) { // Read backwards for recency
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    
    if (event.type === 'tool.execution_start' && event.data?.toolName === 'task') {
      const description = event.data.arguments?.description;
      // Extract agent name from description like "Rick: implementing auth"
      const match = description?.match(/^(\w+):/);
      if (match) agentNames.push(match[1]);
    }
  }
  
  return [...new Set(agentNames)]; // dedupe
}
```

**UX:**
- Terminal name updates to show active agent: `🚀 EditLess — Rick: implementing OAuth`
- Terminal tooltip shows all agents involved in this session

---

## Research Question 6: Squad-Specific Terminal Features

### Feature 1: "Launch session as {AgentName}"

**Use case:** User wants to spawn a specific agent directly without going through the coordinator.

**Implementation:**
```typescript
// In terminal-manager.ts
launchAgentSession(config: AgentTeamConfig, agentName: string): vscode.Terminal {
  const command = `${config.launchCommand} --agent ${agentName.toLowerCase()}`;
  const terminal = vscode.window.createTerminal({
    name: `${config.icon} ${config.name} — ${agentName}`,
    cwd: config.path,
  });
  terminal.sendText(command);
  terminal.show();
  return terminal;
}
```

**UX:**
- Right-click squad in tree → "Launch session as..." → submenu with agent names
- Command palette: "EditLess: Launch {AgentName} Session"

### Feature 2: Squad dashboard webview

**Use case:** Real-time orchestration state visualization.

**Implementation:**
- Webview panel showing:
  - Active sessions with agent names
  - Decision inbox count
  - Recent orchestration log entries
  - Ceremony history
  - Ralph status (if active)
- Auto-refreshes when SquadWatcher fires

**UX:**
- Command: "EditLess: Show Squad Dashboard"
- Button in squad tree view item
- Live updates as squad state changes

### Feature 3: Terminal decorations for agent activity

**Use case:** Visual indicator of which agents are working without opening terminals.

**Implementation:**
```typescript
// Terminal background color by state
terminal.options.color = new vscode.ThemeColor(
  info.agentName === 'Ralph' ? 'terminal.ansiBlue' : 'terminal.ansiGreen'
);

// Terminal icon by agent role
terminal.iconPath = new vscode.ThemeIcon(
  info.agentRole === 'Lead' ? 'star' : 
  info.agentRole === 'Tester' ? 'beaker' : 
  'circle-outline'
);
```

**UX:**
- Terminals color-coded by agent type (lead = gold, dev = blue, tester = green, etc.)
- Icons show agent role

### Feature 4: Terminal grouping by squad

**Use case:** User has 3 squads, each with 2-3 terminals. Wants to collapse/expand per squad.

**Implementation:**
- Tree view already groups by squad
- Add "Collapse all terminals" / "Expand all terminals" per squad
- Persist collapsed state

**UX:**
- Tree view section per squad with collapsible terminal list
- Keyboard shortcut to toggle collapse

### Feature 5: One-click decision view

**Use case:** User sees "📥 3 decisions pending" and wants to read them.

**Implementation:**
```typescript
// Command: editless.viewPendingDecisions
async function viewPendingDecisions(squadPath: string) {
  const inboxPath = path.join(squadPath, '.ai-team/decisions/inbox');
  const files = fs.readdirSync(inboxPath).map(f => path.join(inboxPath, f));
  
  // Open in diff editor against merged decisions.md
  const decisionsPath = path.join(squadPath, '.ai-team/decisions.md');
  for (const file of files) {
    await vscode.commands.executeCommand('vscode.diff',
      vscode.Uri.file(decisionsPath),
      vscode.Uri.file(file),
      `Decision: ${path.basename(file)}`
    );
  }
}
```

**UX:**
- Click `📥 3` badge on terminal → opens all inbox files in diff view
- Shows what's new vs what's already merged

### Feature 6: Session history browser

**Use case:** User wants to see past sessions and their outcomes.

**Implementation:**
- Read `.ai-team/log/*.md` files
- Parse frontmatter/tables to extract: date, agent(s), context, outcome
- Display in tree view or webview table
- Click to open log file

**UX:**
- Tree view: "Session History" section per squad
- Shows last 10 sessions with date, agent, one-line summary
- Click to view full log

---

## Research Question 7: Agent Mode vs CLI Session Differences

**Agent Mode (VS Code built-in chat):**
- Runs in chat panel, not terminal
- Uses `runSubagent` for spawning (if Squad-aware)
- Same `.ai-team/` state as CLI
- Session state in `~/.copilot/session-state/` (same location)

**CLI Mode:**
- Runs in terminal
- Uses `task` tool for spawning
- Same `.ai-team/` state

**Should EditLess track Agent Mode sessions?**

**Analysis:**
- Agent Mode sessions have the same `workspace.yaml` and `events.jsonl` structure
- SessionContextResolver already reads these files — it doesn't care if the session is CLI or Agent Mode
- The only difference: Agent Mode sessions aren't launched BY EditLess, so they won't have TerminalInfo

**Recommendation:** YES, track Agent Mode sessions, but as "unowned" sessions:

```typescript
interface UnownedSessionInfo {
  sessionId: string;
  squadPath: string;
  summary: string;
  branch: string;
  mode: 'cli' | 'agent-mode'; // detected from... (TBD)
}

class TerminalManager {
  getUnownedSessions(): UnownedSessionInfo[] {
    const allSessions = this._sessionResolver.getAllSessions();
    const ownedIds = new Set([...this._terminals.values()].map(i => i.agentSessionId));
    return allSessions.filter(s => !ownedIds.has(s.sessionId));
  }
}
```

**UX:**
- Tree view section: "Active Sessions"
  - Owned terminals (launched by EditLess)
  - Unowned sessions (Agent Mode or external CLI)
- Unowned sessions show: summary, branch, last activity
- Click to "Claim session" → opens terminal and links it

**How to detect Agent Mode vs CLI:**
- Agent Mode: `workspace.yaml` has `producer: "vscode"` or similar
- CLI: `producer: "cli"` or missing
- (This is speculative — would need to verify actual field names)

---

## Data Flow Diagrams

### Diagram 1: Terminal State Detection Flow

```
┌─────────────────┐
│ VS Code Terminal│
└────────┬────────┘
         │
         ├─────────► EditLess TerminalManager
         │           - Tracks terminal → TerminalInfo mapping
         │           - TerminalInfo includes: squadId, agentSessionId
         │
         ├─────────► SessionContextResolver
         │           - Scans ~/.copilot/session-state/
         │           - Matches session CWD → squad path
         │           - Reads workspace.yaml (summary, branch)
         │           - Reads events.jsonl (last event)
         │
         └─────────► SquadWatcher
                     - Watches .ai-team/** changes
                     - Fires event → TerminalManager
                     - TerminalManager updates state/name

Terminal State = f(
  sessionEvents,     // from events.jsonl
  shellExecution,    // from VS Code API
  squadActivity      // from .ai-team/decisions/inbox/
)
```

### Diagram 2: Squad Activity → Terminal UX Flow

```
Squad State Files                    Detection                 Terminal UX
─────────────────                    ─────────                ────────────

.ai-team/decisions/inbox/     ───►  Non-empty inbox?  ───►  Badge: 📥 3
                                     (fs.readdirSync)         Tooltip: "3 decisions pending"

.ai-team/orchestration-log/   ───►  Recent spawns?    ───►  Tooltip: "Rick (5m ago)"
                                     (parse .md files)        Name: "— Rick: auth work"

events.jsonl                  ───►  tool.execution_*? ───►  State: 'working'
                                     (read last line)         Icon: spinner

workspace.yaml (summary)      ───►  Extract summary   ───►  Name: "— {summary}"
                                     (read yaml)

workspace.yaml (branch)       ───►  Extract branch    ───►  Name: "EditLess (feat/auth)"
                                     (when multiple)
```

### Diagram 3: Multi-Agent Spawn → Single Terminal

```
User Request: "Team, build login page"
         │
         ▼
┌─────────────────┐
│  Coordinator    │  ONE terminal session
│  (in terminal)  │  
└────────┬────────┘
         │
         ├──► spawn(Rick, mode: background)   ───► subprocess (invisible)
         ├──► spawn(Morty, mode: background)  ───► subprocess (invisible)
         ├──► spawn(Summer, mode: background) ───► subprocess (invisible)
         └──► spawn(Scribe, mode: background) ───► subprocess (invisible)
                   │
                   ▼
         read_agent(Rick)     ───► collect result
         read_agent(Morty)    ───► collect result
         read_agent(Summer)   ───► collect result
         read_agent(Scribe)   ───► collect result
                   │
                   ▼
         Assemble final response in ONE terminal

Terminal shows: "Team: build login page (4 agents working)"
Events.jsonl shows: tool.execution_start (task, Rick), tool.execution_start (task, Morty), ...
```

---

## Prioritized Squad-Specific Terminal Improvements

### Priority 1: Essential (MVP)

**1. Decision inbox badge**
- **Effort:** Small (1-2 hours)
- **Value:** High — direct indicator that agents are working
- **Implementation:** Watch `.ai-team/decisions/inbox/`, show count badge on terminal + squad tree item

**2. Session summary in terminal name**
- **Effort:** Small (2-3 hours)
- **Value:** High — user immediately knows what the terminal is doing
- **Implementation:** Read `workspace.yaml` summary, update terminal name on link/change

**3. Branch in terminal name (when multiple terminals for same squad)**
- **Effort:** Small (1 hour)
- **Value:** Medium — critical for worktree workflows
- **Implementation:** Read `workspace.yaml` branch, append to name when count > 1

### Priority 2: High Value

**4. Parse orchestration log for agent activity**
- **Effort:** Medium (4-6 hours)
- **Value:** High — shows who's working and when
- **Implementation:** Read `.ai-team/orchestration-log/*.md`, parse table, show in tooltip

**5. Ralph monitoring state**
- **Effort:** Small (2-3 hours)
- **Value:** Medium — distinguishes long-running monitors from regular sessions
- **Implementation:** New SessionState = 'monitoring', detect from summary + duration

**6. "Launch session as {Agent}" command**
- **Effort:** Small (2 hours)
- **Value:** Medium — power user feature for direct agent interaction
- **Implementation:** Read `.ai-team/team.md` roster, add command per agent

### Priority 3: Nice to Have

**7. Squad dashboard webview**
- **Effort:** Large (8-12 hours)
- **Value:** Medium — comprehensive view but not essential
- **Implementation:** Webview panel with live squad state

**8. Session history browser**
- **Effort:** Medium (6-8 hours)
- **Value:** Low-Medium — useful but not urgent
- **Implementation:** Tree view of `.ai-team/log/*.md` files

**9. Agent Mode session tracking**
- **Effort:** Medium (4-6 hours)
- **Value:** Low-Medium — depends on Agent Mode adoption
- **Implementation:** Detect unowned sessions, show in tree view

**10. Terminal decorations (colors/icons by agent role)**
- **Effort:** Small (2-3 hours)
- **Value:** Low — visual polish, not functional
- **Implementation:** Map agent role → VS Code theme color/icon

### Priority 4: Future / Research Needed

**11. Multi-agent progress tracking (e.g., "3/4 complete")**
- **Effort:** Large (8-10 hours)
- **Value:** Medium — cool but complex
- **Implementation:** Parse events.jsonl for tool.execution_* per agent, track state
- **Blocker:** Requires deep events.jsonl parsing and state management

**12. One-click decision diff view**
- **Effort:** Medium (4-6 hours)
- **Value:** Low — users can open files manually
- **Implementation:** Open inbox files in diff editor vs decisions.md

---

## Key Learnings for history.md

1. **Squad operations are NOT one-terminal-per-agent.** The coordinator orchestrates in one session; agents are subprocesses. EditLess should never show "N terminals for N agents."

2. **The `decisions/inbox/` directory is the squad activity heartbeat.** When files appear, agents are working. When files disappear, Scribe merged them. This is THE real-time signal to watch.

3. **Ceremonies and Ralph are special terminal types.** Ceremonies are facilitator-led sequential spawns. Ralph is a detached long-runner. Both need distinct UX.

4. **Session context from `workspace.yaml` is gold.** The `summary` field tells you exactly what the session is doing. Use it in terminal names.

5. **Squad terminal improvements should prioritize data-richness over granular state tracking.** Instead of adding 10 new SessionState values, add more context to tooltips and terminal names from squad state files.

6. **`orchestration-log/` is spawn evidence.** Each `.md` file is a receipt showing which agent was spawned, when, why, and what they produced. This is the best source for "recent activity."

7. **Branch awareness is critical for worktree workflows.** When a user has 3 worktrees × 3 squads, terminal names MUST include branch to avoid confusion.

8. **Agent Mode and CLI sessions are interchangeable from EditLess's perspective.** Both write to `~/.copilot/session-state/`, both interact with `.ai-team/` files. EditLess should track both.



# Terminal Integration Synthesis

**Author:** Rick (Lead)  
**Date:** 2026-02-20  
**Type:** Architecture Decision — Synthesis  
**Inputs:** Jaguar (Copilot SDK), Morty (Extension Dev Audit), Squanchy (Squad Platform)

---

## Executive Summary

Three specialists independently researched terminal integration from different angles. Their findings converge on a clear picture: EditLess's terminal system has solid bones but is under-using VS Code's native APIs, has two P0 race conditions that corrupt session tracking, and lacks the squad context that would make terminals genuinely useful for multi-agent workflows. This synthesis merges their recommendations into one phased plan.

---

## Architecture Overview

### Data Flow: Terminal Creation → State Tracking → Tree View

```
┌──────────────────────────────────────────────────────────────────────┐
│                         TERMINAL CREATION                           │
│                                                                     │
│  User clicks "Launch Session"                                       │
│       │                                                             │
│       ▼                                                             │
│  TerminalManager.launchTerminal()                                   │
│       │                                                             │
│       ├─► createTerminal({                                          │
│       │     name, cwd, isTransient: true,                           │
│       │     iconPath, color,                                        │
│       │     env: { EDITLESS_TERMINAL_ID, EDITLESS_SQUAD_ID }        │
│       │   })                                                        │
│       │                                                             │
│       ├─► CopilotCliBuilder.build(squadConfig) → command string     │
│       │                                                             │
│       ├─► terminal.sendText(command)  // BEFORE show()              │
│       └─► terminal.show()                                           │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       SESSION ID LINKING                            │
│                                                                     │
│  SessionContextResolver (runs on 30s interval)                      │
│       │                                                             │
│       ├─► CWD Index (cached, ~5ms)                                  │
│       │     Map<normalizedCWD, sessionId[]>                         │
│       │                                                             │
│       ├─► For each unlinked terminal:                               │
│       │     Get ALL sessions matching CWD                           │
│       │     Match by timestamp proximity (closest after creation)   │
│       │     Check not already claimed                               │
│       │                                                             │
│       └─► Link: terminal ←→ agentSessionId                         │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        STATE DETECTION                              │
│                                                                     │
│  Three signal sources (priority order):                             │
│                                                                     │
│  1. events.jsonl (primary, via SessionContextResolver)              │
│     └─► Last event type → working / waiting-on-input / idle         │
│         (WORKING_EVENT_TYPES set — needs 4 missing types added)     │
│                                                                     │
│  2. Shell Execution API (secondary)                                 │
│     ├─► onDidStartTerminalShellExecution → working                  │
│     ├─► onDidEndTerminalShellExecution → exit code tracking         │
│     └─► Default to 'idle' (not 'waiting-on-input') when unknown     │
│                                                                     │
│  3. Terminal State API (tertiary, NEW)                              │
│     ├─► terminal.state.isInteractedWith → user activity signal      │
│     └─► onDidChangeTerminalState → last activity timestamp          │
│                                                                     │
│  State enum: working | waiting-on-input | idle | stale | orphaned   │
│                           (+ 'monitoring' for Ralph, Phase 3)       │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       TREE VIEW DISPLAY                             │
│                                                                     │
│  EditlessTreeProvider                                                │
│       │                                                             │
│       ├─► Terminal name: "{icon} {squad} — {summary}"               │
│       │     (from workspace.yaml summary field)                     │
│       │     Branch appended when multiple terminals for same squad  │
│       │                                                             │
│       ├─► Terminal icon: ThemeIcon based on state                    │
│       │     working → sync~spin, idle → circle-outline, etc.        │
│       │                                                             │
│       ├─► Terminal color: ThemeColor per squad                      │
│       │                                                             │
│       ├─► Badge (Phase 3): decisions/inbox count → "📥 3"           │
│       │                                                             │
│       └─► Tooltip (Phase 3): recent agent activity from             │
│             orchestration-log/*.md                                   │
└──────────────────────────────────────────────────────────────────────┘
```

### Module Boundaries

**Stays in `terminal-manager.ts`:**
- Terminal creation, persistence, reconciliation, orphan matching
- Shell execution event handling
- Terminal lifecycle (close, rename, relaunch)

**New module: `copilot-cli-builder.ts`:**
- CLI flag construction from squad config
- Per-squad launch profiles (model, permissions, tools, dirs)
- Version compatibility checks

**New module: `terminal-link-provider.ts`:**
- Clickable PR/issue/file links in terminal output
- Pattern matching for GitHub and ADO identifiers

**Modified: `session-context.ts`:**
- CWD index for performance (replace full scan)
- `resolveAllSessions()` returning all sessions per CWD (not just latest)
- Increased event cache TTL (3s → 10s)

**New in Phase 3: `squad-activity-monitor.ts`:**
- Watch `decisions/inbox/` for activity heartbeat
- Parse `orchestration-log/*.md` for agent spawn history
- Feed context to terminal names and tooltips

---

## Where All Three Agree (Highest Confidence)

These are findings independently surfaced by 2+ specialists:

1. **`sendText()` before `show()`** — Morty (Bug #1) and Jaguar (terminal creation flow) both flag the race condition. Trivial fix, high impact.

2. **Use `TerminalOptions.env` for squad context** — Jaguar (Research Q3, Phase 1) and Morty (Bug #2) both recommend injecting `EDITLESS_TERMINAL_ID`, `EDITLESS_SQUAD_ID` as env vars. Also enables accurate reconciliation via `terminal.creationOptions.env`.

3. **Use `isTransient: true`** — Morty (Bug #2, §5.1C) and Jaguar (TerminalOptions) agree: squad terminals should not survive VS Code session restore as zombies.

4. **Session ID detection scans too broadly** — Morty (Bug #12, Bug #13) and Squanchy (session-context gap analysis) both flag the full-scan performance issue. CWD indexing is the fix.

5. **`workspace.yaml` summary is the best terminal naming source** — Squanchy (Research Q3) and Jaguar (session-state analysis) both identify the `summary` field as gold for terminal display names.

6. **Shell execution exit codes should be tracked** — Jaguar (Research Q4, Q10) and Morty (Bug #11, §5.1) both recommend using `onDidEndTerminalShellExecution` exit codes to distinguish crashes from normal exits.

7. **One terminal = one coordinator session for squads** — Squanchy (Research Q1, Q4) is definitive: sub-agents are invisible subprocesses, not separate terminals. This is a critical mental model for the entire design.

---

## Where They Disagree — My Calls

### Conflict 1: Terminal Profile Provider Priority

- **Jaguar** says low priority (profiles don't solve core tracking problems)
- **Morty** says high impact (§5.1A — enables env-based matching, custom prompts)

**My call: Morty's right, but Jaguar's framing is correct.** Profile providers help with user-initiated terminal creation, which isn't our core flow. The env var injection from `createTerminal()` gives us 90% of the value. Profiles are Phase 3 polish. **Verdict: Phase 3.**

### Conflict 2: Event Cache TTL

- **Morty** says increase to 10 seconds (Bug #9)
- Jaguar and Squanchy don't address this

**My call: 10 seconds is fine for now.** The real fix (Phase 2) is event-driven invalidation rather than polling, but bumping the TTL is a safe stopgap. **Verdict: Phase 1 (trivial constant change).**

### Conflict 3: Squad-Specific States

- **Squanchy** proposes adding `'monitoring'` state for Ralph
- **Morty** doesn't mention squad-specific states (focuses on fixing existing states)

**My call: Squanchy's analysis is sound but premature.** The `'monitoring'` state requires Ralph to be a real product feature, not just a convention. Add it in Phase 3 after the state detection system is actually reliable (Phase 1-2 fixes). **Verdict: Phase 3.**

### Conflict 4: `onDidWriteTerminalData` (Proposed API)

- **Morty** proposes using it for prompt detection (Bug #11 Option A)
- **Jaguar** warns this is a proposed API, not stable

**My call: Don't touch proposed APIs.** We learned this lesson in v0.1 — stick to stable APIs. Morty's Option C (invert default to 'idle') is the right immediate fix. **Verdict: Phase 1 uses Option C, proposed APIs monitored for Phase 4+.**

### Conflict 5: Agent Mode Session Tracking

- **Squanchy** says YES, track Agent Mode sessions as "unowned"
- Jaguar and Morty don't address this

**My call: Interesting but not now.** Agent Mode sessions write to the same session-state directory, so detection is technically possible. But the UX is unclear — what does the user DO with an unowned session in the tree view? **Verdict: Phase 4, needs Casey's input.**

---

## Unified Priority Matrix

| Rank | Item | Priority | Source(s) | Effort | Impact | Risk |
|------|------|----------|-----------|--------|--------|------|
| 1 | **Session ID race condition** — multiple terminals per CWD claim same session | P0 | Morty #13 | Medium | 🔴 Critical — data corruption | Low |
| 2 | **sendText() race condition** — command executes before shell ready | P0 | Morty #1, Jaguar | Small | 🔴 Critical — commands fail | Low |
| 3 | **Substring matching too greedy** — false positive orphan matches | P1 | Morty #4 | Small | 🟠 High — wrong terminals restored | Low |
| 4 | **Add TerminalOptions** — isTransient, iconPath, color, env | P1 | Morty #2, Jaguar Q3 | Small | 🟠 High — zombie terminals, no visual distinction | Low |
| 5 | **Session scan performance** — scans ALL session dirs every 30s | P1 | Morty #12, Squanchy | Medium | 🟠 High — 100ms UI lag | Low |
| 6 | **_pendingSaved unbounded growth** — memory leak | P1 | Morty #7 | Small | 🟡 Medium — slow persist | Low |
| 7 | **Shell fallback defaults to 'waiting-on-input'** — should default to 'idle' | P1 | Morty #11 | Medium | 🟡 Medium — incorrect state shown | Low |
| 8 | **WORKING_EVENT_TYPES incomplete** — misses 4 event types | P2 | Morty #8 | Trivial | 🟡 Medium — missed work events | Low |
| 9 | **Event cache TTL too short** (3s → 10s) | P2 | Morty #9 | Trivial | 🟡 Medium — disk I/O lag | Low |
| 10 | **Exit status tracking** — detect crashes vs normal exits | P1 | Jaguar Q10, Morty | Small | 🟡 Medium — better error UX | Low |
| 11 | **Terminal link provider** — clickable PR/issue/file links | P1 | Jaguar Q9 | Small | 🟡 Medium — UX win | Low |
| 12 | **CLI flag builder** — dynamic launch commands from squad config | P1 | Jaguar Q6 | Small | 🟡 Medium — per-squad configuration | Low |
| 13 | **Session summary in terminal name** — from workspace.yaml | P1 | Squanchy Q3, Jaguar | Small | 🟡 Medium — user knows what terminal does | Low |
| 14 | **MAX_REBOOT_COUNT too aggressive** (2 → 5) | P2 | Morty #5 | Trivial | 🟢 Low-Med — terminals evicted too fast | Low |
| 15 | **Emoji stripping in terminal names** — shells modify Unicode | P2 | Morty #15 | Small | 🟡 Medium — reconcile failures | Low |
| 16 | **Idle/stale thresholds too aggressive** — 5m/60m → 15m/2h | P3 | Morty #10 | Trivial | 🟢 Low — false stale warnings | Low |
| 17 | **No validation of terminal creation failure** | P2 | Morty #3 | Medium | 🟢 Low — silent failures | Low |
| 18 | **Branch in terminal name** — worktree disambiguation | P1 | Squanchy Q3 | Small | 🟡 Medium — critical for worktrees | Low |
| 19 | **Decision inbox badge** — activity heartbeat | P1 | Squanchy Q5 | Small | 🟠 High — real-time agent signal | Low |
| 20 | **Orchestration log parsing** — agent activity in tooltips | P2 | Squanchy Q5 | Medium | 🟡 Medium — who's working | Medium |
| 21 | **`terminal.state.isInteractedWith`** — user activity signal | P2 | Morty §5.1D | Small | 🟢 Low-Med — better state detection | Low |
| 22 | **Terminal profile provider** — "Copilot CLI" in dropdown | P3 | Jaguar Q1, Morty §5.1A | Medium | 🟢 Low — power user feature | Low |
| 23 | **`'monitoring'` state** — Ralph sessions | P3 | Squanchy Q2 | Small | 🟢 Low-Med — Ralph-specific UX | Low |
| 24 | **Command output streaming** — `execution.read()` | P3 | Jaguar Q2 | Medium | 🟢 Low — real-time error detection | Medium |
| 25 | **Agent Mode session tracking** — unowned sessions | P3 | Squanchy Q7 | Medium | 🟢 Low — unclear UX value | Medium |
| 26 | **Squad dashboard webview** | P3 | Squanchy Q6 | Large | 🟡 Medium — comprehensive but not essential | Medium |
| 27 | **`renameWithArg` support** — VS Code tab rename | P2 | Morty #16 | Small | 🟢 Low — name updates | Low |

---

## Phase Plan

### Phase 1: Critical Fixes (v0.1.1)

**Goal:** Fix the two P0 race conditions and the worst P1 bugs. Ship stability.

**What ships:**
1. Fix `sendText()` race — call before `show()` (Rank #2)
2. Fix session ID race — `resolveAllSessions()` with timestamp matching (Rank #1)
3. Add `isTransient`, `iconPath`, `color`, `env` to `createTerminal()` (Rank #4)
4. Strengthen substring matching — index-based + emoji-strip tolerance (Rank #3)
5. Cap `_pendingSaved` at 50 entries (Rank #6)
6. Invert shell fallback default to 'idle' (Rank #7)
7. Add 4 missing event types to `WORKING_EVENT_TYPES` (Rank #8)
8. Bump event cache TTL to 10s (Rank #9)
9. Bump idle/stale thresholds to 15m/2h (Rank #16)
10. Increase MAX_REBOOT_COUNT to 5 (Rank #14)

**Depends on:** Nothing  
**Unblocks:** Phase 2 (env vars enable accurate reconciliation), Phase 3 (reliable state detection is prerequisite for squad context)  
**Effort:** ~3-5 days  
**Risk:** Low — all changes are in existing modules, all use stable APIs

### Phase 2: Native Integration (v0.2.0)

**Goal:** Use VS Code APIs we're currently ignoring. Better terminal UX.

**What ships:**
1. CWD index in SessionContextResolver — 20x faster session resolution (Rank #5)
2. Exit status tracking via `onDidEndTerminalShellExecution` (Rank #10)
3. Terminal link provider — clickable PR/issue/file links (Rank #11)
4. CLI flag builder utility — per-squad launch profiles (Rank #12)
5. `terminal.state.isInteractedWith` for activity detection (Rank #21)
6. `onDidChangeTerminalState` listener for last-activity timestamps
7. Early close detector for terminal creation failures (Rank #17)
8. `renameWithArg` support for dynamic tab names (Rank #27)
9. Terminal name includes emoji-stripped fallback for cross-shell compat (Rank #15)

**Depends on:** Phase 1 (env vars in TerminalOptions, stable state detection)  
**Unblocks:** Phase 3 (link provider and CLI builder are infrastructure for squad features)  
**Effort:** ~5-8 days  
**Risk:** Low-Medium — shell integration dependency for exit codes (graceful fallback needed)

### Phase 3: Rich State (v0.2.x)

**Goal:** Terminal names and tree view actually tell you what's happening.

**What ships:**
1. Session summary in terminal name from `workspace.yaml` (Rank #13)
2. Branch in terminal name when multiple terminals for same squad (Rank #18)
3. Decision inbox badge — `📥 N` on squad/terminal tree items (Rank #19)
4. Orchestration log parsing — recent agent spawns in tooltip (Rank #20)
5. `'monitoring'` state for Ralph-style long-running sessions (Rank #23)
6. Squad-specific terminal naming tiers (summary → ceremony → Ralph → fallback)
7. Terminal profile provider for "Copilot CLI" in dropdown (Rank #22)

**Depends on:** Phase 2 (CWD index for perf, rename support for dynamic names)  
**Unblocks:** Phase 4 (activity monitoring infrastructure)  
**Effort:** ~8-12 days  
**Risk:** Medium — parsing squad state files adds coupling to `.ai-team/` format

### Phase 4: Squad Intelligence (v0.3.0+)

**Goal:** EditLess becomes a squad operations dashboard, not just a terminal launcher.

**What ships:**
1. Multi-agent progress tracking in terminal tooltip ("3/4 agents complete")
2. Agent Mode session tracking — discover unowned sessions
3. Command output streaming — real-time error detection
4. Squad dashboard webview — comprehensive state visualization
5. "Launch session as {Agent}" command — direct agent spawning
6. Session history browser — past sessions from `.ai-team/log/`
7. One-click decision diff view — inbox files vs merged decisions.md

**Depends on:** Phase 3 (squad activity monitor, rich naming)  
**Unblocks:** Future squad automation features  
**Effort:** ~15-20 days  
**Risk:** Medium-High — deep events.jsonl parsing, webview complexity, Agent Mode detection is speculative

---

## Key Decisions Needed from Casey

### Decision 1: Should we use `isTransient: true` on all squad terminals?

**Context:** `isTransient` prevents VS Code from restoring terminals on reload. EditLess already has its own persistence/reconciliation system. Morty and Jaguar both recommend it.

**Trade-off:** If we set `isTransient: true`, terminals won't appear as zombies after reload — EditLess controls the full lifecycle. But if EditLess has a bug in reconciliation, users lose their terminal state entirely (no VS Code fallback).

**My recommendation:** Yes, use `isTransient`. Our persistence system works (PR #12 validated this). Zombie terminals are a worse UX than the edge case where our reconciliation fails.

### Decision 2: Should we invest in `ExtensionTerminal` (pseudoterminal) for squad sessions?

**Context:** Morty (§5.3H) mentions `window.createExtensionTerminal()` which gives full I/O control. Squanchy's multi-agent progress tracking (Scenario 1) would be much easier with a pseudoterminal (we could inject status lines into the output).

**Trade-off:** Pseudoterminals are a fundamentally different architecture. We'd control all rendering but lose native shell features (tab completion, oh-my-posh, etc.). High effort, high risk.

**My recommendation:** No, not for v0.2 or v0.3. The ROI isn't there. Standard terminals + rich tree view context (names, tooltips, badges) gets us 80% of the value at 20% of the cost. Revisit if Casey wants a custom agent UI in v0.4+.

### Decision 3: Should we track Agent Mode sessions launched from VS Code Chat?

**Context:** Squanchy (Research Q7) notes that Agent Mode sessions write to the same `~/.copilot/session-state/` directory. EditLess could discover and display them as "unowned" sessions in the tree view.

**Trade-off:** It's technically feasible (SessionContextResolver already reads those dirs). But the UX is unclear — what action does the user take on an unowned session? There's no terminal to focus, no way to send input. It's display-only information.

**My recommendation:** Defer to Phase 4. Let's see if users actually ask for this. If Agent Mode becomes the primary way people interact with squads, we'll need it. But right now, CLI sessions are the core flow.

---

## Risks & Concerns

### 1. Undocumented Session-State Format (All three flagged this)

The `~/.copilot/session-state/` directory, `workspace.yaml` schema, and `events.jsonl` format are all reverse-engineered. Copilot CLI could change any of these without notice.

**Mitigation:** Wrap all file parsing in try-catch with graceful degradation. File a feature request with the Copilot team for an official API. Monitor Copilot CLI releases for breaking changes. The CWD index approach (Phase 2) actually reduces our coupling — we read workspace.yaml once for indexing rather than on every poll.

### 2. Shell Integration Dependency

Exit code tracking, command streaming, and the shell execution API all require shell integration to be active. This works in PowerShell 5.1+, Bash 4+, Zsh 5.0+ — but not in cmd.exe, minimal containers, or SSH remotes without setup.

**Mitigation:** Always maintain the file-based state detection (`events.jsonl`) as the primary path. Shell integration features are *supplementary* signals, not replacements. Check `terminal.shellIntegration` before using these APIs.

### 3. Performance of Squad State File Watching (Phase 3)

Watching `decisions/inbox/`, `orchestration-log/`, and `workspace.yaml` across multiple squads adds filesystem watchers. VS Code has limits on watchers, and some filesystems (network drives, WSL mounts) have poor watcher support.

**Mitigation:** Use polling with reasonable intervals (30-60s) rather than fs.watch for squad state. Only watch active squads (those with open terminals). Aggregate file reads into single scan passes.

### 4. Backwards Compatibility

Phase 1 changes how terminals are created (new options) and how sessions are matched (new algorithm). If the new matching algorithm has bugs, users lose terminal-session links.

**Mitigation:** Ship Phase 1 as a patch release (v0.1.1) with a manual override: `editless.terminal.legacyMatching` setting that falls back to the old algorithm. Remove the setting in v0.2.0 once the new algorithm is validated.

### 5. Scope Creep from Squad Features

Squanchy's analysis is comprehensive but ambitious. The dashboard webview, session history browser, and multi-agent progress tracking are each significant features. Starting Phase 4 work before Phase 1-2 are solid would repeat the v0.1 mistake of speed over quality.

**Mitigation:** Hard gate: no Phase 3 work starts until Phase 1 ships and is validated by Casey. No Phase 4 work starts until Phase 2 is stable. Each phase ships independently and delivers visible value.

---

## Appendix: Specialist Credit

- **Jaguar** provided the API surface analysis — which VS Code APIs are stable, which are proposed, what Copilot CLI actually supports. The compatibility matrix is invaluable.
- **Morty** found the bugs — 16 specific issues with line numbers, severity ratings, and code-level fixes. This is the actionable implementation guide.
- **Squanchy** provided the squad mental model — one terminal per coordinator (not per agent), decisions/inbox as heartbeat, ceremony/Ralph as special terminal types. This shapes the Phase 3-4 architecture.

All three converge on the same core insight: **EditLess needs to stop treating terminals as dumb launch pads and start treating them as rich state containers.** The data is there (session-state files, VS Code APIs, squad state files) — we just need to wire it up.




### 2026-02-19: Session Rename & Resume — Copilot CLI Integration

# Session Rename & Resume — Copilot CLI Integration Research

**Date:** 2026-02-19  
**Researcher:** Jaguar  
**Requested by:** Casey Irvine

## Question 1: Session Rename Synchronization

### Current State
EditLess renames sessions via `editless.renameSession`:
- Updates `TerminalInfo.displayName`
- Renames VS Code terminal tab (via `workbench.action.terminal.renameWithArg`)
- Updates EditLess session label (via `SessionLabelManager`)

**BUT:** The Copilot CLI session has its own summary in `~/.copilot/session-state/{sessionId}/workspace.yaml` which is NOT synchronized.

### Research Findings

#### 1.1 Can we write to workspace.yaml while CLI is running?

**Answer: NO — unsafe and unsupported.**

**Evidence:**
- Copilot CLI persists `workspace.yaml` as part of live operation with regular writes
- Manual edits risk conflicting with in-memory state or corrupting the data format
- Session metadata (including `summary`) is auto-generated and used internally for context window management, checkpoints, resuming state, and display logic
- Direct modification can crash the session, desynchronize history, or cause data loss
- Source: [DeepWiki - Session State & Lifecycle Management](https://deepwiki.com/github/copilot-cli/6.2-session-state-and-lifecycle-management)

**Observed structure:**
```yaml
id: 00031334-f9b2-4f01-ae31-37d7231db0a0
cwd: C:\Windows\System32
summary_count: 0
created_at: 2026-02-11T05:15:55.621Z
updated_at: 2026-02-11T05:16:44.570Z
summary: "Scan Microsoft Teams for caseybot mentions from the last 4 hours.\r  \r  IMPORTANT: Start with Step 0 -..."
```

#### 1.2 Does Copilot CLI support a rename/re-summarize command?

**Answer: NO built-in rename command.**

**Evidence:**
- `copilot --help` shows no flags for `--session-name`, `--rename`, or `--summary`
- Interactive commands (`copilot help commands`) include `/rename <name>` which is **aliased to `/session rename`**
- **This is an INTERACTIVE-ONLY command** — it renames the session WHILE INSIDE a running Copilot CLI session
- EditLess cannot send this command via `terminal.sendText()` reliably because:
  - It requires the terminal to be in Copilot's interactive prompt state
  - Timing issues (race conditions) with when the CLI is ready to accept input
  - No programmatic API to verify command success

**Partial solution:**
- Users could manually type `/rename <name>` in the terminal
- EditLess could provide a "Copy rename command" button that puts `/rename {newName}` on the clipboard

#### 1.3 Can we set session name BEFORE launch?

**Answer: NO — no CLI flags for pre-launch naming.**

**Evidence:**
- `copilot --help` shows no `--name`, `--session-name`, `--title`, or similar flags
- CLI generates session IDs (UUIDs) and initial summaries based on first user message
- The `summary` field in `workspace.yaml` is auto-generated by the agent, not user-controlled

**Environment variables checked:**
- `COPILOT_CUSTOM_INSTRUCTIONS_DIRS`: affects instruction paths, not session names
- `COPILOT_MODEL`: sets model, not session name
- No env var for session naming found in `copilot help environment`

#### 1.4 Session state file structure

**Observed files in `~/.copilot/session-state/{sessionId}/`:**
```
├── checkpoints/
│   └── index.md
├── files/
├── events.jsonl
└── workspace.yaml
```

**Key files:**
- `workspace.yaml`: Session metadata (id, cwd, summary, timestamps)
- `events.jsonl`: Event log (session.start, user.message, assistant.turn_start/end, tool.execution_*)
- `checkpoints/index.md`: Session checkpoint summaries

**EditLess currently reads:**
- ✅ `events.jsonl` (for session state detection)
- ✅ `workspace.yaml` (session ID, cwd)
- ❌ `plan.md` (not read, but present in some sessions)

#### 1.5 Could plan.md influence displayed name?

**Answer: NO — plan.md does not affect session naming.**

**Evidence:**
- `plan.md` is a workspace artifact created by `/plan` command
- It contains the implementation plan but is not read by CLI for session naming
- The session summary comes from LLM-generated summaries, not file contents

### Summary: Session Rename

| Approach | Feasibility | Risks |
|----------|-------------|-------|
| Modify `workspace.yaml` while running | ❌ Unsafe | Data corruption, session crash |
| Send `/rename` via `terminal.sendText()` | 🟡 Possible but unreliable | Race conditions, no confirmation |
| Pre-launch CLI flags | ❌ Not supported | No such flags exist |
| Read-only display (show both names) | ✅ Safe | Confusing UX (two names) |

**Recommendation:**
1. **Phase 1 (safe):** Display both names in EditLess UI: "My Team #3 (Copilot: Add OAuth login)"
2. **Phase 2 (risky):** Provide "Copy rename command" button that puts `/rename {name}` on clipboard for manual paste
3. **Phase 3 (future):** Request Copilot CLI feature: `copilot --session-name` flag or IPC-based rename API

---

## Question 2: Session Resume via VS Code Native Support

### Current State
EditLess resumes sessions via `relaunchSession()` in `terminal-manager.ts`:
1. Create new terminal
2. Send `{launchCommand} --resume {agentSessionId}` via `terminal.sendText()`

**Problem:** Fragile, race conditions (see issue #277 — P0 bug)

### Research Findings

#### 2.1 Does --resume work reliably? What does it resume?

**Answer: YES — --resume is a first-class CLI feature.**

**Evidence from `copilot --help`:**
```
--resume [sessionId]    Resume from a previous session (optionally specify 
                        session by ID, or start a new session with a specific UUID
```

**What it resumes:**
- ✅ Conversation history
- ✅ File context (tracked files in `session-state/{id}/files/`)
- ✅ Working directory (from `workspace.yaml` `cwd` field)
- ✅ Checkpoints (from `checkpoints/index.md`)
- ✅ Tool permissions (if `--allow-all` was used, may need to re-specify)

**How it works:**
1. Without argument: `copilot --resume` → shows session picker
2. With session ID: `copilot --resume <uuid>` → directly resumes that session
3. With new UUID: `copilot --resume <new-uuid>` → starts NEW session with that ID

**Resume modes:**
- `--continue`: Resume MOST RECENT session (no picker)
- `--resume`: Resume with picker OR specific session ID

#### 2.2 Other resume-related flags?

**Answer: YES — `--continue` is the "resume latest" shortcut.**

**Evidence:**
```bash
# Resume most recent session (no picker)
copilot --continue

# Resume with session picker
copilot --resume

# Resume specific session by ID
copilot --resume <session-id>

# Resume with auto-approval
copilot --allow-all-tools --resume
```

**Additional flags:**
- `--allow-all-tools`, `--allow-all-paths`, `--allow-all-urls` (or `--yolo`)
- `--model <model>` (override model for resumed session)
- `--add-dir <directory>` (add additional allowed directories)

#### 2.3 Does VS Code's Copilot extension have its own resume mechanism?

**Answer: NO public API for Copilot CLI session resume.**

**Evidence:**
- VS Code Copilot extension has an **internal** `ICopilotCLITerminalIntegration` service (undocumented)
- Community extensions (Copilot Chat History, Copilot Session Sync) read session state by:
  1. Reading `%APPDATA%\Code\User\workspaceStorage\[workspace-id]\chatSessions\` (for Chat extension sessions)
  2. Reading `~/.copilot/session-state/` (for CLI sessions)
- **These are DIFFERENT session types:**
  - Copilot Chat (in VS Code panel): stored in `workspaceStorage/chatSessions/`
  - Copilot CLI (in terminal): stored in `~/.copilot/session-state/`

**No cross-surface resume:**
- You cannot resume a CLI session from Chat panel
- You cannot resume a Chat session from CLI

**Source:**
- [Copilot Chat History extension on Marketplace](https://marketplace.visualstudio.com/items?itemName=arbuzov.copilot-chat-history)
- [GitHub: Arbuzov/copilot-chat-history](https://github.com/Arbuzov/copilot-chat-history)

#### 2.4 What files must exist for resume to work?

**Answer: Minimal requirement is `workspace.yaml` + `events.jsonl`.**

**Required:**
- `workspace.yaml` (session metadata)
- `events.jsonl` (conversation history)

**Optional but recommended:**
- `checkpoints/index.md` (checkpoint summaries)
- `files/` directory (file snapshots)

**Corruption detection:**
- EditLess could check if `workspace.yaml` is valid YAML before offering resume
- Check if `events.jsonl` is non-empty and has valid JSON lines
- Check if session directory has been modified recently (detect stale sessions)

#### 2.5 Can we detect if a session is resumable?

**Answer: YES — via file system checks.**

**Detection logic:**
```typescript
function isSessionResumable(sessionId: string): boolean {
  const sessionDir = path.join(os.homedir(), '.copilot', 'session-state', sessionId);
  const workspaceYaml = path.join(sessionDir, 'workspace.yaml');
  const eventsJsonl = path.join(sessionDir, 'events.jsonl');
  
  // Check required files exist
  if (!fs.existsSync(workspaceYaml) || !fs.existsSync(eventsJsonl)) {
    return false;
  }
  
  // Check files are non-empty
  const workspaceSize = fs.statSync(workspaceYaml).size;
  const eventsSize = fs.statSync(eventsJsonl).size;
  if (workspaceSize === 0 || eventsSize === 0) {
    return false;
  }
  
  // Optional: Check YAML validity
  try {
    const yaml = fs.readFileSync(workspaceYaml, 'utf8');
    const parsed = YAML.parse(yaml);
    return parsed && parsed.id === sessionId;
  } catch {
    return false;
  }
}
```

**Stale session detection:**
- EditLess already tracks `lastSeenAt` and `rebootCount` in `PersistedTerminalInfo`
- Could add check for `workspace.yaml` `updated_at` field
- Sessions not updated in 7+ days could be marked "stale" in UI

#### 2.6 Is the VS Code session-state directory the same as CLI?

**Answer: NO — different locations for different surfaces.**

**Storage paths:**
| Surface | Location |
|---------|----------|
| Copilot CLI | `~/.copilot/session-state/{uuid}/` |
| Copilot Chat (VS Code) | `%APPDATA%\Code\User\workspaceStorage\{workspace-id}\chatSessions\` |
| EditLess persistence | VS Code `workspaceState` API (`editless.terminalSessions`) |

**EditLess currently:**
- ✅ Reads CLI session state (`~/.copilot/session-state/`)
- ❌ Does NOT read Chat session state (`workspaceStorage/chatSessions/`)
- ✅ Persists terminal metadata in `workspaceState`

### Summary: Session Resume

| Aspect | Status | Notes |
|--------|--------|-------|
| `--resume` reliability | ✅ Reliable | First-class CLI feature |
| Resume scope | ✅ Complete | History, files, cwd, checkpoints |
| Alternative flags | ✅ `--continue` | Resume latest without picker |
| VS Code native resume | ❌ No public API | Different session types |
| Resumability detection | ✅ Possible | File system checks |
| Stale session detection | ✅ Possible | Check `updated_at` timestamp |

**Recommendations:**
1. **Phase 1 (P0 fix for #277):** Replace `terminal.sendText()` with `TerminalOptions` + environment variable approach
2. **Phase 2:** Add pre-resume validation (check `workspace.yaml` + `events.jsonl` exist and are valid)
3. **Phase 3:** Add stale session warnings (not updated in 7+ days)
4. **Phase 4:** Add "Resume with..." menu (auto-approval, different model, etc.)

**Fix for #277 (sendText race condition):**
```typescript
// BEFORE (fragile):
terminal.sendText(`${entry.launchCommand} --resume ${entry.agentSessionId}`);

// AFTER (reliable):
const terminal = vscode.window.createTerminal({
  name: entry.displayName,
  cwd: entry.squadPath,
  env: {
    EDITLESS_SESSION_ID: entry.id,
    EDITLESS_AGENT_SESSION_ID: entry.agentSessionId,
  },
  shellIntegration: {
    args: ['--resume', entry.agentSessionId],
  },
});
terminal.show();
```

---

## Question 3: "Resume in EditLess" in VS Code's Native Session View

### Current State
VS Code has a chat history/sessions view in the Copilot Chat panel sidebar. Casey wants to add a "Resume in EditLess" button there.

### Research Findings

#### 3.1 Does VS Code have a public API for the chat history sidebar?

**Answer: NO public API for chat history sidebar integration.**

**Evidence:**
- The Copilot Chat history sidebar is part of the `GitHub.copilot-chat` extension
- It is NOT exposed as an extension point in VS Code API
- Community extensions that show chat history (like Arbuzov's Copilot Chat History) do so by:
  1. Reading `workspaceStorage/{workspace-id}/chatSessions/` directly
  2. Rendering their OWN tree view (not integrating with native view)

**Source:**
- [Copilot Chat History extension source](https://github.com/Arbuzov/copilot-chat-history)
- VS Code API reference (no `copilot.sessions` or `chatHistory` contribution point)

#### 3.2 Can extensions contribute actions to the Copilot chat session list?

**Answer: NO — no contribution points for Copilot Chat UI.**

**Evidence:**
- Searched VS Code contribution points documentation
- No `contributes.chatHistoryActions`, `contributes.copilotSessionActions`, or similar
- The Copilot Chat extension UI is closed to third-party contributions

**What IS possible:**
- Extensions can contribute to `editor/context` (right-click menus in editor)
- Extensions can contribute to `view/title` (buttons in tree view title bars)
- Extensions can create their OWN views with `contributes.views`

#### 3.3 Could a Chat Participant provide resume capability?

**Answer: PARTIAL — can provide `/resume` command, but NOT in history view.**

**How Chat Participants work:**
- Declared in `package.json` under `contributes.chatParticipants`
- Invoked with `@participant` in chat input
- Can provide slash commands like `/resume`

**Example:**
```json
{
  "contributes": {
    "chatParticipants": [
      {
        "id": "editless.session-manager",
        "fullName": "EditLess Session Manager",
        "name": "editless",
        "description": "Manage EditLess terminal sessions",
        "isSticky": true,
        "commands": [
          {
            "name": "resume",
            "description": "Resume a saved EditLess session"
          }
        ]
      }
    ]
  }
}
```

**Implementation:**
```typescript
const participant = vscode.chat.createChatParticipant('editless.session-manager', async (request, context, stream, token) => {
  if (request.command === 'resume') {
    // Show session picker
    const sessions = terminalManager.getOrphanedSessions();
    // ... handle resume logic
  }
});
```

**Limitations:**
- This adds `/resume` command to chat INPUT, not to history sidebar
- Users would type `@editless /resume` in chat, not click a button
- Does NOT integrate with native Copilot session history

**Source:**
- [VS Code Chat Participant API](https://code.visualstudio.com/api/extension-guides/ai/chat)
- [Chat Participants Tutorial](https://code.visualstudio.com/api/extension-guides/ai/chat-tutorial)

#### 3.4 Could a Language Model Tool expose resume capability?

**Answer: YES — but NOT for UI integration.**

**How Language Model Tools work:**
- Declared in `package.json` under `contributes.languageModelTools`
- Registered in code via `vscode.lm.registerTool()`
- Available to LLMs (like Copilot) to call during conversations

**Example:**
```json
{
  "contributes": {
    "languageModelTools": [
      {
        "id": "editless.resumeSession",
        "displayName": "Resume EditLess Session",
        "description": "Resume a saved EditLess terminal session",
        "inputSchema": {
          "type": "object",
          "properties": {
            "sessionId": {
              "type": "string",
              "description": "The session ID to resume"
            }
          }
        }
      }
    ]
  }
}
```

**Use case:**
- User: "Resume my last EditLess session"
- Copilot: [calls `editless.resumeSession` tool]
- EditLess: [launches terminal with --resume]

**Limitations:**
- This is LLM-driven, not a UI button
- Only works when user mentions resuming in natural language
- Does NOT add a button to Copilot's history sidebar

**Source:**
- [VS Code Language Model Tool API](https://code.visualstudio.com/api/extension-guides/ai/tools)
- [Language Model Tools sample](https://deepwiki.com/microsoft/vscode-extension-samples/3.5-language-model-tools)

#### 3.5 Could we create our own "Copilot Sessions" view?

**Answer: YES — this is the BEST option.**

**How:**
1. Create a custom tree view with `contributes.views`
2. Read session state from `~/.copilot/session-state/`
3. Add "Resume in EditLess" button per session

**Example:**
```json
{
  "contributes": {
    "views": {
      "editless-explorer": [
        {
          "id": "editless.copilotSessions",
          "name": "Copilot Sessions"
        }
      ]
    },
    "menus": {
      "view/item/context": [
        {
          "command": "editless.resumeInEditless",
          "when": "view == editless.copilotSessions && viewItem == copilotSession",
          "group": "inline"
        }
      ]
    }
  }
}
```

**Implementation:**
```typescript
class CopilotSessionsProvider implements vscode.TreeDataProvider<SessionItem> {
  getChildren(): SessionItem[] {
    const sessionDir = path.join(os.homedir(), '.copilot', 'session-state');
    const sessions = fs.readdirSync(sessionDir).map(id => {
      const workspace = YAML.parse(fs.readFileSync(
        path.join(sessionDir, id, 'workspace.yaml'), 'utf8'
      ));
      return new SessionItem(id, workspace.summary, workspace.cwd);
    });
    return sessions;
  }
}

vscode.window.registerTreeDataProvider('editless.copilotSessions', new CopilotSessionsProvider());
```

**Benefits:**
- ✅ Full UI control (buttons, icons, context menus)
- ✅ Shows ALL Copilot sessions (not just EditLess-launched)
- ✅ Can add filters (by workspace, by date, by squad)
- ✅ Can show session metadata (cwd, last update, size)

**Placement options:**
- In EditLess sidebar (under Squads tree)
- As a separate view container
- In the Explorer sidebar

#### 3.6 Search for chatSessions contribution points

**Answer: NONE found.**

**Searched for:**
- `chatSessions`
- `chatHistory`
- `copilot.sessions`
- `contributes.chatParticipants` (exists, but no history actions)

**Result:** No extension points for integrating with native Copilot Chat history UI.

### Summary: "Resume in EditLess" Button

| Approach | Feasibility | Notes |
|----------|-------------|-------|
| Add button to native Copilot Chat history | ❌ Not possible | No extension point |
| Chat Participant (`@editless /resume`) | 🟡 Possible but limited | Chat input only, not sidebar |
| Language Model Tool | 🟡 Possible but limited | LLM-driven, not UI button |
| Custom "Copilot Sessions" tree view | ✅ Best option | Full control, best UX |

**Recommendations:**
1. **Phase 1:** Create custom "Copilot Sessions" tree view in EditLess sidebar
2. **Phase 2:** Add filters (by workspace, by squad, by date)
3. **Phase 3:** Add session metadata (cwd, last update, model used)
4. **Phase 4 (nice-to-have):** Register Chat Participant for natural language resume (`@editless /resume`)
5. **Phase 5 (future):** Request VS Code API for `contributes.copilotSessionActions`

**Example UX:**
```
EditLess Explorer
├─ Squads
│  ├─ 🦁 Rick #1 · idle
│  └─ 🦄 Pixel #2 · working
└─ Copilot Sessions
   ├─ 📝 Add OAuth login (main, 2h ago)
   │  └─ [Resume in EditLess] button
   ├─ 🐛 Fix session crash (feature/fix-277, 1d ago)
   │  └─ [Resume in EditLess] button
   └─ 🎨 Refactor CSS (main, 3d ago)
      └─ [Resume in EditLess] button
```

---

## What's Possible Today vs What Needs API Changes

### Possible Today (with current VS Code APIs)

✅ **Session rename workarounds:**
- Display both names (EditLess + Copilot summary)
- "Copy rename command" button (clipboard helper)

✅ **Reliable session resume:**
- File system validation before resume
- Stale session detection
- Fix #277 with TerminalOptions approach

✅ **Custom "Copilot Sessions" view:**
- Read `~/.copilot/session-state/`
- Show sessions in tree view
- "Resume in EditLess" button per session

✅ **Chat Participant:**
- `@editless /resume` command
- Natural language session management

✅ **Language Model Tool:**
- LLM-driven session resume
- "Resume my last session" natural language

### Needs VS Code/Copilot API Changes

❌ **Session rename API:**
- `copilot --session-name <name>` flag
- IPC-based rename (like Language Server Protocol)

❌ **Native history integration:**
- `contributes.copilotSessionActions`
- Extension hooks in Copilot Chat history sidebar

❌ **Cross-surface resume:**
- Resume CLI session from Chat panel
- Resume Chat session from CLI

❌ **Session metadata API:**
- Programmatic read/write of `workspace.yaml`
- Session state change events

---

## Risks & Workarounds

### Risk: workspace.yaml Corruption
**Mitigation:** Never write to `workspace.yaml` while CLI is running. Only read.

### Risk: sendText() Race Conditions (#277)
**Mitigation:** Use `TerminalOptions` with environment variables + shell integration.

### Risk: Stale Sessions
**Mitigation:** Add UI warnings for sessions not updated in 7+ days.

### Risk: Session State File Format Changes
**Mitigation:** Defensive parsing with try/catch, version detection in `workspace.yaml`.

### Risk: Two Sources of Truth (EditLess name vs Copilot summary)
**Mitigation:** Display both names, clearly labeled. "My Team #3 (Copilot: Add OAuth login)"

---

## Next Steps

1. **Fix #277 (P0):** Implement TerminalOptions approach for resume
2. **Add session validation:** Check `workspace.yaml` + `events.jsonl` before resume
3. **Create "Copilot Sessions" view:** Show all sessions with "Resume in EditLess" button
4. **Add dual-name display:** Show EditLess name + Copilot summary in UI
5. **Prototype Chat Participant:** `@editless /resume` for natural language resume
6. **File feature request:** Ask VS Code team for `contributes.copilotSessionActions`

---

## Code Examples

### Reliable Resume (Fix #277)
```typescript
// terminal-manager.ts
relaunchSession(entry: PersistedTerminalInfo): vscode.Terminal {
  // Validate session is resumable
  if (!this.isSessionResumable(entry.agentSessionId)) {
    vscode.window.showErrorMessage(
      `Session ${entry.displayName} cannot be resumed (missing or corrupt session state)`
    );
    return;
  }

  const terminal = vscode.window.createTerminal({
    name: entry.displayName,
    cwd: entry.squadPath,
    env: {
      // Metadata for shell integration
      EDITLESS_SESSION_ID: entry.id,
      EDITLESS_AGENT_SESSION_ID: entry.agentSessionId,
    },
  });

  // Wait for terminal to be ready, THEN send resume command
  terminal.show();
  
  // Use executeCommand instead of sendText to wait for shell ready
  vscode.commands.executeCommand('workbench.action.terminal.sendSequence', {
    text: `${entry.launchCommand} --resume ${entry.agentSessionId}\r`,
  });

  return terminal;
}

private isSessionResumable(sessionId: string): boolean {
  const sessionDir = path.join(os.homedir(), '.copilot', 'session-state', sessionId);
  const workspaceYaml = path.join(sessionDir, 'workspace.yaml');
  const eventsJsonl = path.join(sessionDir, 'events.jsonl');
  
  return fs.existsSync(workspaceYaml) 
    && fs.existsSync(eventsJsonl)
    && fs.statSync(workspaceYaml).size > 0
    && fs.statSync(eventsJsonl).size > 0;
}
```

### Dual-Name Display
```typescript
// session-label-manager.ts
getSessionLabel(terminal: vscode.Terminal): string {
  const info = this.terminalManager.getTerminalInfo(terminal);
  if (!info) return terminal.name;
  
  const editlessName = info.displayName;
  const copilotSummary = this.getCopilotSummary(info.agentSessionId);
  
  if (copilotSummary && copilotSummary !== editlessName) {
    return `${editlessName} (Copilot: ${copilotSummary})`;
  }
  
  return editlessName;
}

private getCopilotSummary(sessionId?: string): string | undefined {
  if (!sessionId) return undefined;
  
  const workspaceYaml = path.join(
    os.homedir(), '.copilot', 'session-state', sessionId, 'workspace.yaml'
  );
  
  if (!fs.existsSync(workspaceYaml)) return undefined;
  
  try {
    const yaml = YAML.parse(fs.readFileSync(workspaceYaml, 'utf8'));
    return yaml.summary;
  } catch {
    return undefined;
  }
}
```

### Custom Copilot Sessions View
```typescript
// copilot-sessions-provider.ts
export class CopilotSessionsProvider implements vscode.TreeDataProvider<CopilotSessionItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: CopilotSessionItem): vscode.TreeItem {
    return element;
  }

  getChildren(): CopilotSessionItem[] {
    const sessionDir = path.join(os.homedir(), '.copilot', 'session-state');
    if (!fs.existsSync(sessionDir)) return [];

    return fs.readdirSync(sessionDir)
      .filter(id => {
        const workspaceYaml = path.join(sessionDir, id, 'workspace.yaml');
        return fs.existsSync(workspaceYaml);
      })
      .map(id => {
        const workspaceYaml = path.join(sessionDir, id, 'workspace.yaml');
        const yaml = YAML.parse(fs.readFileSync(workspaceYaml, 'utf8'));
        return new CopilotSessionItem(id, yaml.summary, yaml.cwd, yaml.updated_at);
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
}

class CopilotSessionItem extends vscode.TreeItem {
  constructor(
    public readonly sessionId: string,
    public readonly summary: string,
    public readonly cwd: string,
    public readonly updatedAt: string,
  ) {
    super(summary, vscode.TreeItemCollapsibleState.None);
    
    this.tooltip = `Session: ${sessionId}\nDirectory: ${cwd}\nLast updated: ${new Date(updatedAt).toLocaleString()}`;
    this.contextValue = 'copilotSession';
    this.iconPath = new vscode.ThemeIcon('vm-running');
    
    const ageMs = Date.now() - new Date(updatedAt).getTime();
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    if (ageDays > 7) {
      this.description = `${ageDays}d ago (stale)`;
    } else if (ageDays > 0) {
      this.description = `${ageDays}d ago`;
    } else {
      const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
      this.description = `${ageHours}h ago`;
    }
  }
}
```

---

**End of Research**


### 2026-02-19: CLI provider abstraction replaced with inline settings

**By:** Morty

**What:** Removed the entire CLI provider abstraction layer (`src/cli-provider.ts`) and replaced it with direct `editless.cli.*` settings (command, launchCommand, createCommand). All consumers now read settings directly instead of going through provider resolution and probing.

**Why:** The generic provider infrastructure served no purpose — there was only one provider (Copilot CLI), no UI to switch providers, and the `execSync`-based version probing at startup was blocking extension activation (flagged in #107). The abstraction added complexity without providing value. Direct settings are simpler, faster (no startup probing), and easier to test (configuration mocks instead of provider module mocks).

**Affected files:**
- Deleted: `src/cli-provider.ts`, `src/__tests__/cli-provider.test.ts`
- Added settings: `editless.cli.command`, `editless.cli.launchCommand`, `editless.cli.createCommand`
- Updated: `src/extension.ts`, `src/discovery.ts`, `src/terminal-manager.ts`
- Test mocks updated in: `auto-refresh.test.ts`, `extension-commands.test.ts`, `discovery-commands.test.ts`, `discovery.test.ts`, `terminal-manager.test.ts`

**Pattern for future work:** If you find yourself building a "provider" abstraction with only one implementation and no UI to switch, inline it as direct settings instead. Provider patterns are only justified when runtime pluggability is needed.


# Decision: Simplified Session State Model

**Date:** 2026-02-19  
**Author:** Morty (Extension Dev)  
**PR:** #354  
**Issue:** #302  

## Context

The granular session state model (working, waiting-on-input, idle, stale, orphaned) was identified in the v0.1 retrospective as fundamentally flawed. Four PRs touched state detection logic and it still didn't work reliably. The model combined:
- Time-based thresholds (IDLE_THRESHOLD_MS = 5 minutes, STALE_THRESHOLD_MS = 1 hour)
- events.jsonl parsing via `stateFromEvent()` and `WORKING_EVENT_TYPES`
- Shell execution tracking as a fallback

This created complexity, race conditions, and unreliable state transitions.

## Decision

**Simplify to a 3-state model:** `active`, `inactive`, `orphaned`

### Implementation

**SessionState type:**
```typescript
export type SessionState = 'active' | 'inactive' | 'orphaned';
```

**getSessionState() logic:**
1. If terminal ID is in `_pendingSaved` → return `'orphaned'`
2. If shell execution is running (`_shellExecutionActive.get(terminal) === true`) → return `'active'`
3. Otherwise → return `'inactive'`

**State icons (team-agreed from decisions.md):**
- `active` → `loading~spin` (working state)
- `inactive` → `circle-outline` (idle state)
- `orphaned` → `eye-closed` (stale/disconnected state)

**State descriptions:**
- `active` / `inactive` → relative time since last activity ("just now", "23m", "2h")
- `orphaned` → "previous session"

### What was removed

- `stateFromEvent()` function (~15 lines)
- `WORKING_EVENT_TYPES` set definition (~8 lines)
- `IDLE_THRESHOLD_MS` and `STALE_THRESHOLD_MS` constants (~2 lines)
- events.jsonl-based state inference in `getSessionState()` (~7 lines)
- Granular state icon cases and descriptions (~25 lines)
- ~130 lines of granular state tests (2 entire `describe` blocks)

### What was kept

- `_shellExecutionActive` tracking via onDidStart/EndTerminalShellExecution — this is the core signal
- `_lastActivityAt` tracking — used for relative time display
- `agentSessionId` and `SessionContextResolver` infrastructure — useful for future features
- `session-context.ts` module — does more than just state (session metadata, plan reading)

## Rationale

**Simpler is better:** Shell execution is a reliable, built-in VS Code signal. Time-based thresholds and event parsing added complexity without clear benefit.

**User experience:** The distinction between "idle" and "stale" was not meaningful to users. Active (shell running) vs. inactive (shell idle) is clear and actionable.

**Maintainability:** The new model is ~300 lines shorter (prod + test) and has no magic numbers or event type lists to maintain.

## Impact

- Terminals now show only 3 states in the tree view
- State transitions are immediate and deterministic (no 5-minute or 1-hour thresholds)
- Code is simpler and easier to test
- Future enhancements (e.g., waiting-on-input detection via inbox items) can be layered on top if needed

## Related Decisions

- Terminal Integration audit (decisions.md) — identified state detection as P1 priority
- Terminal UX conventions (decisions.md) — agreed-upon icons for state representation




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


---

### 2026-02-20: Terminal Command Ordering: sendText before show

**Author:** Morty (Extension Dev)  
**Date:** 2026-02-20  
**PR:** #365 (Closes #322)

## Decision

When launching or relaunching terminals with a command, always call `terminal.sendText()` **before** `terminal.show()`. This queues the command in the terminal's input buffer before the terminal becomes visible, preventing the race condition where the shell isn't ready to accept input.

## Context

The previous `relaunchSession()` flow called `show()` then `sendText()`. On slow machines or under load, the shell process hadn't fully started by the time `sendText()` fired, causing the resume command to be silently dropped. Users clicked "Resume" and nothing happened — a P0 bug.

## Impact

- All terminal launch paths in `terminal-manager.ts` should follow this pattern
- `launchTerminal()` already had the correct order (sendText before show at lines 105-106)
- `relaunchSession()` was the only violator — now fixed
- Future terminal launch code must maintain this ordering

---

### 2026-02-20: CLI Flag Builder Pattern

**Date:** 2026-02-20
**Author:** Morty (Extension Dev)
**PR:** #366
**Issue:** #325

## Decision

CLI commands are now built via `buildCopilotCommand(options: CopilotCommandOptions)` in `src/copilot-cli-builder.ts` instead of storing raw command strings with `` interpolation tokens. The `` pattern is eliminated from the codebase.

## Key Details

- **`buildCopilotCommand(options)`** — takes typed options, returns a complete CLI command string
- **`buildDefaultLaunchCommand()`** — replacement for `getLaunchCommand()`, reads `editless.cli.defaultAgent` setting
- **New setting** `editless.cli.defaultAgent` (default: `"squad"`) controls the `--agent` flag value
- **`editless.cli.launchCommand`** default changed from `"copilot --agent "` to `""` (empty = use builder)
- **`getLaunchCommand()`** kept as deprecated wrapper — call `buildDefaultLaunchCommand()` for new code

## Why

`` was never interpolated at runtime, causing broken CLI commands. Direct typed construction is safer and extensible (supports `--resume`, `--model`, `--add-dir`, etc.)

---

### 2026-02-20: Terminal Command Ordering: sendText before show

**Author:** Morty (Extension Dev)  
**Date:** 2026-02-20  
**PR:** #365 (Closes #322)

## Decision

When launching or relaunching terminals with a command, always call 	erminal.sendText() **before** 	erminal.show(). This queues the command in the terminal's input buffer before the terminal becomes visible, preventing the race condition where the shell isn't ready to accept input.

## Context

The previous elaunchSession() flow called show() then sendText(). On slow machines or under load, the shell process hadn't fully started by the time sendText() fired, causing the resume command to be silently dropped. Users clicked "Resume" and nothing happened — a P0 bug.

## Impact

- All terminal launch paths in 	erminal-manager.ts should follow this pattern
- launchTerminal() already had the correct order (sendText before show at lines 105-106)
- elaunchSession() was the only violator — now fixed
- Future terminal launch code must maintain this ordering

---

### 2026-02-20: CLI Flag Builder Pattern

**Date:** 2026-02-20
**Author:** Morty (Extension Dev)
**PR:** #366
**Issue:** #325

## Decision

CLI commands are now built via uildCopilotCommand(options: CopilotCommandOptions) in src/copilot-cli-builder.ts instead of storing raw command strings with (agent) interpolation tokens. The (agent) pattern is eliminated from the codebase.

## Key Details

- **uildCopilotCommand(options)** — takes typed options, returns a complete CLI command string
- **uildDefaultLaunchCommand()** — replacement for getLaunchCommand(), reads ditless.cli.defaultAgent setting
- **New setting** ditless.cli.defaultAgent (default: "squad") controls the --agent flag value
- **ditless.cli.launchCommand** default changed from "copilot --agent (agent)" to "" (empty = use builder)
- **getLaunchCommand()** kept as deprecated wrapper — call uildDefaultLaunchCommand() for new code

## Why

(agent) was never interpolated at runtime, causing broken CLI commands. Direct typed construction is safer and extensible (supports --resume, --model, --add-dir, etc.)

---

# Decision: Unified Discovery Architecture for Agents & Squads

**Date:** 2026-02-20  
**Author:** Rick (Lead)  
**Scope:** EditLess extension discovery and registration flows
**Status:** Decision filed for v0.2 planning

## Current State

**Two separate code paths:**

- **Squads:** `autoRegisterWorkspaceSquads()` (startup), `checkDiscoveryOnStartup()` (config scan), `editless.discoverSquads` (manual + file picker), `editless.addSquad` (folder init). Discovered squads → toast notification → add flow.
- **Agents:** `discoverAllAgents()` (workspace + ~/.copilot scan), no toast, displayed in sidebar under "Discovered Agents" section. Agents are read-only from the tree (can be promoted but no "add" flow).
- **Refresh command:** Only re-discovers agents, not squads (bug fixed in PR #364).
- **"Add New" menu:** Branches to different commands for Squad vs Agent.

**Problems identified by Casey:**
- Different user flows feel inconsistent (toasts for squads, sidebar for agents).
- Discovery directory concept unclear — users add workspace folders but also configure scan paths for squads only.
- Not obvious that discovered items can be hidden/shown.

## Target State (v0.2)

**One unified discovery flow:**

1. **Scan phase** (unified): Discover both standalone agents AND squads from the same sources
   - Workspace roots (`.github/agents/*.agent.md` + root `*.agent.md`, `.squad/` or `.ai-team/` folders)
   - Optional: `~/.copilot/agents/` (agents only, for personal agent library)

2. **List phase** (unified): Display discovered items in the tree view in a single section
   - Same row format for agents and squads: `[icon] [name] [universe/type]`
   - Squads show `🔷`, agents show icon TBD (e.g., `🤖` or `⚙️`)
   - Items come from registry (already-added) and discovered (new)

3. **Action phase** (unified): Hide/add from the same quick-pick menu
   - Single "Add agents/squads" flow with multi-select
   - Items can be hidden via visibility manager (same for both types)
   - No separate toast flow

**Key architectural decisions:**

- **Discovery dirs:** Replace `editless.discovery.scanPaths` config with workspace-folder-based discovery only. Users add squad directories to their workspace root — no separate config needed. (Aligns with Shayne's workspace integration vision.)
- **Agent library:** Keep `~/.copilot/agents/` scanning optional (personal agent library), always enabled, no config.
- **Refresh:** Runs unified discovery (agents + squads from all sources).
- **Visibility:** Single hide/show mechanism for agents and squads.

## Impact on Issues

| Issue | Action | Timeline |
|-------|--------|----------|
| **#317 (Refresh button bug)** | **MERGE PR #364** | Now (v0.1.1 patch) |
| **#318 (Unify discovery/add flows)** | **SCOPE EXPANSION FOR v0.2** | Backlog (v0.2 architecture) |

## Recommendation

- **PR #364:** APPROVE & MERGE (surgical refresh discovery fix, ships now)
- **#318 (feature work):** Promote to v0.2; assign architectural refactor to Morty
- **Discovery dirs:** Deprecate `editless.discovery.scanPaths` in v0.2; remove in v0.3

## Why This Approach

- PR #364 is a **surgical fix** to a real bug (refresh not discovering squads). It's small, testable, and has no side effects.
- Casey's broader vision (unified flow, workspace-centric discovery) is **architecture work for v0.2**, not blocking v0.1.1.
- Removing discovery dirs aligns with workspace integration — users already manage workspace folders in their workspace settings; forcing them to also configure scan paths is redundant.
- Keeping the PR small and shipping it now maintains momentum on bug fixes while planning the larger architecture refactor.

---

# Decision: Unified Discovery UX — Agents & Squads

**Date:** 2026-02-21  
**Author:** Summer (Product Designer)  
**For:** Casey Irvine (issue #317 refresh + #318 add from existing)

## Proposed Solution

### 1. **Unified "Discovered" Section** (Tree View)

A collapsible root section that shows:
- All newly found agents **and** squads
- Visual distinction: agents ≠ squads
- Action buttons per item: **Add**, **Hide**

**Tree structure:**
```
📦 Agents (registered)
   🤖 Agent Name
📦 Squads (registered)
   🔷 Squad Name
🔍 Discovered (X)           ← New collapsible section
   🤖 agent-name            ← Icon = agent
      description/source    ← Description (25 chars max)
   🔷 squad-name            ← Icon = squad
      Universe/path         ← Description (25 chars max)
🚫 Hidden (Y)               ← Optional: if user has hidden items
```

**Behavior:**
- Discovered section shows only NEW items (not in registry + not hidden)
- Sorting: squads first, then agents (alphabetical within each)
- Count badge on "Discovered": updates live as user adds/hides
- Expands by default on first discovery

### 2. **Item Actions** (Context Menu)

For each discovered item:
- **Add to Registry** — moves item from "Discovered" → active section (Agents/Squads)
- **Hide** — moves item to "Hidden" section; no longer offered

### 3. **Visual Distinction** (Icons & Styling)

| Item Type | Icon | Example |
|-----------|------|---------|
| Agent (workspace) | 🤖 (hubot) | `my-agent` |
| Agent (system) | 🤖 (hubot) | `copilot-agent` |
| Squad | 🔷 (organization) | `my-squad` |

**Tree item structure:**
- **Label:** Icon + Name (e.g., `🤖 my-agent`)
- **Description:** Source/universe (25 chars max, right-aligned)
- **Tooltip:** Full path, universe, file location, all metadata

### 4. **"Add from Existing" (#318) Integration**

**Command:** `editless.addAgentFromExisting`

**Flow:**
```
User: Right-click "Discovered" section
      → "Add Existing Agent/Squad"
      → Opens file picker
      → User picks file/folder
      → Item added to registry
      → Item removed from "Discovered"
```

## Code Changes Required (Sketch)

1. **`editless-tree.ts`**
   - Add new TreeItemType: `'discovered'`
   - Add `DiscoveredSquad` type alongside `DiscoveredAgent`
   - Merge discovered section logic

2. **`visibility.ts` (new or existing)**
   - Track hidden IDs (agents + squads)
   - `hideItem(id)` and `revealItem(id)`
   - Persist to `context.globalState`

3. **`discovery.ts`**
   - Keep existing agents/squads discovery functions
   - New function: `getDiscoveredItems()` — returns both types, minus registry + hidden

4. **`extension.ts`**
   - Register commands: `editless.addDiscovered`, `editless.hideDiscovered`, `editless.revealHidden`

5. **`package.json` (contributes.menus)**
   - Add context menu for `discovered-agent` and `discovered-squad`

## Information Hierarchy

### At-a-Glance (Tree Item)
- Icon (state/type)
- Name (label)
- Source/description (25 chars, right-aligned)

### On Hover (Tooltip)
```
🤖 agent-name

Source: workspace
File: /Users/me/my-repo/.agent.md
Last seen: just now
```

## Implementation Phases

### MVP (v0.2.0)
1. Add "Discovered" section to tree (agents only, initially)
2. Context menu: "Add to Registry" + "Hide"
3. Persist hidden items to `context.globalState`
4. Refresh command re-scans and updates tree

### Phase 2 (v0.2.x, if time)
1. Include squads in discovered section
2. "Add Existing" command with file picker
3. "Hidden" section with unhide option

## Q&A

**Q: Should discovered items auto-add on workspace open?**  
A: No — keeps UX deliberate. User explicitly reviews and accepts. Reduces clutter.

**Q: What if user clears "Hidden" later?**  
A: Items re-appear in "Discovered" on next refresh. No data loss.

**Q: How does this interact with auto-register squads?**  
A: Squads in workspace root auto-register immediately. Squads from `discovery.scanPaths` appear in "Discovered" for user confirmation first.

---

# Decision: extraArgs Dedup Strategy for CLI Builder

**Date:** 2026-02-20  
**Author:** Morty (Extension Dev)  
**Context:** PR #366 review feedback on `copilot-cli-builder.ts`

## Decision

`CopilotCommandOptions.extraArgs` accepts arbitrary CLI flags appended after typed flags. Intelligent dedup prevents conflicts:

- **Typed flag is set + same flag in extraArgs** → typed value wins, extraArgs duplicate silently dropped (with `console.warn` for debugging)
- **Typed flag NOT set + flag in extraArgs** → passes through (user providing via freeform)
- **Unknown flags** (e.g. `--yolo`) → always pass through

## Rationale

Users need escape-hatch for flags we haven't typed yet, but we can't let them accidentally override typed options. Silent drop with warn is least-surprising: typed options are the "source of truth," and the warn helps developers debug without cluttering the UI.

## Implementation

- `src/copilot-cli-builder.ts` — implementation
- `src/__tests__/copilot-cli-builder.test.ts` — 7 new tests covering all dedup scenarios

## Example

```typescript
// All typed flags (model, agent, resume)
buildCopilotCommand({
  model: 'gpt-4',
  agent: 'squad',
  resume: 'session-123',
  extraArgs: ['--model', 'gpt-3.5', '--unknown-flag', 'value']
});

// Result: `copilot --agent squad --resume session-123 --model gpt-4 --unknown-flag value`
// Note: --model gpt-3.5 from extraArgs is deduped (typed --model wins); unknown flags pass through
// Console warns: "Deduped extraArg --model (typed value takes precedence)"
```

(agent) was never interpolated at runtime, causing broken CLI commands. Direct typed construction is safer and extensible (supports --resume, --model, --add-dir, etc.)

---

# Decision: Unified Discovery Architecture for Agents & Squads

**Date:** 2026-02-20  
**Author:** Rick (Lead)  
**Scope:** EditLess extension discovery and registration flows
**Status:** Decision filed for v0.2 planning

## Current State

**Two separate code paths:**

- **Squads:** `autoRegisterWorkspaceSquads()` (startup), `checkDiscoveryOnStartup()` (config scan), `editless.discoverSquads` (manual + file picker), `editless.addSquad` (folder init). Discovered squads → toast notification → add flow.
- **Agents:** `discoverAllAgents()` (workspace + ~/.copilot scan), no toast, displayed in sidebar under "Discovered Agents" section. Agents are read-only from the tree (can be promoted but no "add" flow).
- **Refresh command:** Only re-discovers agents, not squads (bug fixed in PR #364).
- **"Add New" menu:** Branches to different commands for Squad vs Agent.

**Problems identified by Casey:**
- Different user flows feel inconsistent (toasts for squads, sidebar for agents).
- Discovery directory concept unclear — users add workspace folders but also configure scan paths for squads only.
- Not obvious that discovered items can be hidden/shown.

## Target State (v0.2)

**One unified discovery flow:**

1. **Scan phase** (unified): Discover both standalone agents AND squads from the same sources
   - Workspace roots (`.github/agents/*.agent.md` + root `*.agent.md`, `.squad/` or `.ai-team/` folders)
   - Optional: `~/.copilot/agents/` (agents only, for personal agent library)

2. **List phase** (unified): Display discovered items in the tree view in a single section
   - Same row format for agents and squads: `[icon] [name] [universe/type]`
   - Squads show `🔷`, agents show icon TBD (e.g., `🤖` or `⚙️`)
   - Items come from registry (already-added) and discovered (new)

3. **Action phase** (unified): Hide/add from the same quick-pick menu
   - Single "Add agents/squads" flow with multi-select
   - Items can be hidden via visibility manager (same for both types)
   - No separate toast flow

**Key architectural decisions:**

- **Discovery dirs:** Replace `editless.discovery.scanPaths` config with workspace-folder-based discovery only. Users add squad directories to their workspace root — no separate config needed. (Aligns with Shayne's workspace integration vision.)
- **Agent library:** Keep `~/.copilot/agents/` scanning optional (personal agent library), always enabled, no config.
- **Refresh:** Runs unified discovery (agents + squads from all sources).
- **Visibility:** Single hide/show mechanism for agents and squads.

## Impact on Issues

| Issue | Action | Timeline |
|-------|--------|----------|
| **#317 (Refresh button bug)** | **MERGE PR #364** | Now (v0.1.1 patch) |
| **#318 (Unify discovery/add flows)** | **SCOPE EXPANSION FOR v0.2** | Backlog (v0.2 architecture) |

## Recommendation

- **PR #364:** APPROVE & MERGE (surgical refresh discovery fix, ships now)
- **#318 (feature work):** Promote to v0.2; assign architectural refactor to Morty
- **Discovery dirs:** Deprecate `editless.discovery.scanPaths` in v0.2; remove in v0.3

## Why This Approach

- PR #364 is a **surgical fix** to a real bug (refresh not discovering squads). It's small, testable, and has no side effects.
- Casey's broader vision (unified flow, workspace-centric discovery) is **architecture work for v0.2**, not blocking v0.1.1.
- Removing discovery dirs aligns with workspace integration — users already manage workspace folders in their workspace settings; forcing them to also configure scan paths is redundant.
- Keeping the PR small and shipping it now maintains momentum on bug fixes while planning the larger architecture refactor.

---

# Decision: Unified Discovery UX — Agents & Squads

**Date:** 2026-02-21  
**Author:** Summer (Product Designer)  
**For:** Casey Irvine (issue #317 refresh + #318 add from existing)

## Proposed Solution

### 1. **Unified "Discovered" Section** (Tree View)

A collapsible root section that shows:
- All newly found agents **and** squads
- Visual distinction: agents ≠ squads
- Action buttons per item: **Add**, **Hide**

**Tree structure:**
```
📦 Agents (registered)
   🤖 Agent Name
📦 Squads (registered)
   🔷 Squad Name
🔍 Discovered (X)           ← New collapsible section
   🤖 agent-name            ← Icon = agent
      description/source    ← Description (25 chars max)
   🔷 squad-name            ← Icon = squad
      Universe/path         ← Description (25 chars max)
🚫 Hidden (Y)               ← Optional: if user has hidden items
```

**Behavior:**
- Discovered section shows only NEW items (not in registry + not hidden)
- Sorting: squads first, then agents (alphabetical within each)
- Count badge on "Discovered": updates live as user adds/hides
- Expands by default on first discovery

### 2. **Item Actions** (Context Menu)

For each discovered item:
- **Add to Registry** — moves item from "Discovered" → active section (Agents/Squads)
- **Hide** — moves item to "Hidden" section; no longer offered

### 3. **Visual Distinction** (Icons & Styling)

| Item Type | Icon | Example |
|-----------|------|---------|
| Agent (workspace) | 🤖 (hubot) | `my-agent` |
| Agent (system) | 🤖 (hubot) | `copilot-agent` |
| Squad | 🔷 (organization) | `my-squad` |

**Tree item structure:**
- **Label:** Icon + Name (e.g., `🤖 my-agent`)
- **Description:** Source/universe (25 chars max, right-aligned)
- **Tooltip:** Full path, universe, file location, all metadata

### 4. **"Add from Existing" (#318) Integration**

**Command:** `editless.addAgentFromExisting`

**Flow:**
```
User: Right-click "Discovered" section
      → "Add Existing Agent/Squad"
      → Opens file picker
      → User picks file/folder
      → Item added to registry
      → Item removed from "Discovered"
```

## Code Changes Required (Sketch)

1. **`editless-tree.ts`**
   - Add new TreeItemType: `'discovered'`
   - Add `DiscoveredSquad` type alongside `DiscoveredAgent`
   - Merge discovered section logic

2. **`visibility.ts` (new or existing)**
   - Track hidden IDs (agents + squads)
   - `hideItem(id)` and `revealItem(id)`
   - Persist to `context.globalState`

3. **`discovery.ts`**
   - Keep existing agents/squads discovery functions
   - New function: `getDiscoveredItems()` — returns both types, minus registry + hidden

4. **`extension.ts`**
   - Register commands: `editless.addDiscovered`, `editless.hideDiscovered`, `editless.revealHidden`

5. **`package.json` (contributes.menus)**
   - Add context menu for `discovered-agent` and `discovered-squad`

## Information Hierarchy

### At-a-Glance (Tree Item)
- Icon (state/type)
- Name (label)
- Source/description (25 chars, right-aligned)

### On Hover (Tooltip)
```
🤖 agent-name

Source: workspace
File: /Users/me/my-repo/.agent.md
Last seen: just now
```

## Implementation Phases

### MVP (v0.2.0)
1. Add "Discovered" section to tree (agents only, initially)
2. Context menu: "Add to Registry" + "Hide"
3. Persist hidden items to `context.globalState`
4. Refresh command re-scans and updates tree

### Phase 2 (v0.2.x, if time)
1. Include squads in discovered section
2. "Add Existing" command with file picker
3. "Hidden" section with unhide option

## Q&A

**Q: Should discovered items auto-add on workspace open?**  
A: No — keeps UX deliberate. User explicitly reviews and accepts. Reduces clutter.

**Q: What if user clears "Hidden" later?**  
A: Items re-appear in "Discovered" on next refresh. No data loss.

**Q: How does this interact with auto-register squads?**  
A: Squads in workspace root auto-register immediately. Squads from `discovery.scanPaths` appear in "Discovered" for user confirmation first.

---

# Decision: extraArgs Dedup Strategy for CLI Builder

**Date:** 2026-02-20  
**Author:** Morty (Extension Dev)  
**Context:** PR #366 review feedback on `copilot-cli-builder.ts`

## Decision

`CopilotCommandOptions.extraArgs` accepts arbitrary CLI flags appended after typed flags. Intelligent dedup prevents conflicts:

- **Typed flag is set + same flag in extraArgs** → typed value wins, extraArgs duplicate silently dropped (with `console.warn` for debugging)
- **Typed flag NOT set + flag in extraArgs** → passes through (user providing via freeform)
- **Unknown flags** (e.g. `--yolo`) → always pass through

## Rationale

Users need escape-hatch for flags we haven't typed yet, but we can't let them accidentally override typed options. Silent drop with warn is least-surprising: typed options are the "source of truth," and the warn helps developers debug without cluttering the UI.

## Implementation

- `src/copilot-cli-builder.ts` — implementation
- `src/__tests__/copilot-cli-builder.test.ts` — 7 new tests covering all dedup scenarios

## Example

```typescript
// All typed flags (model, agent, resume)
buildCopilotCommand({
  model: 'gpt-4',
  agent: 'squad',
  resume: 'session-123',
  extraArgs: ['--model', 'gpt-3.5', '--unknown-flag', 'value']
});

// Result: `copilot --agent squad --resume session-123 --model gpt-4 --unknown-flag value`
// Note: --model gpt-3.5 from extraArgs is deduped (typed --model wins); unknown flags pass through
// Console warns: "Deduped extraArg --model (typed value takes precedence)"
```

---

### 2026-02-20T13:56:12Z: User directive — Unified discovery is v0.1.1, not v0.2
**By:** Casey Irvine (via Copilot)
**What:** The unified discovery flow for agents and squads is NOT a v0.2 feature — it's a v0.1.1 fix. The current divergent flows don't make sense and need to be unified now. PR #364 should be closed and replaced with a unified implementation. This is a code simplification, not a new feature.
**Why:** User request — overrides Rick's "merge now, rework later" recommendation. Casey wants it fixed properly now.


---

## 2026-02-22 — Post-Work Session Merge (Morty #337 Completion)

### 2026-02-22T06:43:00Z: User directive — Attention state is CORE value prop
**By:** Casey Irvine (via Copilot)
**What:** Attention state (working / idle / needs-decision) is a CORE value prop of EditLess and must NOT be cut. Users need to understand from the sidebar what needs their attention across all modalities — Copilot CLI, Squad CLI, and VS Code native chat. If we need to look into Squad APIs to surface this for squad-cli terminals, then we should. This is not "rich status" scope creep — this is the fundamental reason EditLess exists.
**Why:** User directive — corrects Summer's recommendation to cut attention state. The three states (working, idle, needs-decision) are the minimum viable attention signal, not optional polish.

---

### 2026-02-22T06:43:00Z: User directive — EditLess integrates frontends, not builds them
**By:** Casey Irvine (via Copilot)
**What:** EditLess should integrate with frontends others build (like SquadUI), not build its own frontend. Brady wants lots of people to build frontends for Squad — EditLess's role is to manage windows/tabs and route users to those frontends. Don't integrate with frontends that don't make sense. SquadUI is a strong candidate because it's a VS Code extension. The SDK's "frontend" concept is not something EditLess should implement — we're the orchestrator, not the renderer.
**Why:** User directive — defines EditLess's position in the Squad frontend ecosystem.

---

### 2026-02-22T04:05:00Z: User directive — Minimal Squad integration scope
**By:** Casey Irvine (via Copilot)
**What:** Keep Squad integration minimal. Only two integration points: (1) know if terminal is squad-cli vs copilot-cli and handle differently, (2) refresh SquadUI when terminal activity completes so the views stay fresh. No rich idle/working status. No active-work markers. No SDK event monitoring. Ship users to SquadUI for anything squad-in-depth. Support launching squad terminals and having multiple squad tabs open.
**Why:** User directive — EditLess is a window manager, not a Squad dashboard.

---

### 2026-02-22T06:43:00Z: User directive — Native chat support is DEFERRED, not cut
**By:** Casey Irvine (via Copilot)
**What:** Native chat (VS Code Copilot Chat) support is DEFERRED, not cut. It must stay on the roadmap. Users will want to do things in CLI or native chat interchangeably, and EditLess needs to manage both — including minimizing the terminal panel when switching to a chat tab. The flow for managing terminals-as-tabs alongside chat-as-tabs needs to be figured out. Scope it out of v0.2 if needed, but keep it as a future modality.
**Why:** User directive — ensures native-chat doesn't get permanently dropped from the vision.

---

### 2026-02-22T15:54:00Z: User directive — Scope guard for Squad CLI command integration
**By:** Casey Irvine (via Copilot)
**What:** When integrating new Squad CLI commands (from PR #131 remote mode, repo mode, hub mode), only add commands that make sense for the add/remove flows in EditLess. SquadUI will likely integrate with the rest. Don't duplicate what SquadUI will cover. This is future work, not high priority.
**Why:** User directive — scoping guard for Squad CLI command integration.

---

### 2026-02-22T06:45:00Z: User directive (REVISED) — Squad upgrades and insider mode owned by SquadUI
**By:** Casey Irvine (via Copilot)
**What:** Squad upgrades and insider mode are fully owned by SquadUI. EditLess does NOT need upgrade buttons, settings, or commands. If SquadUI is installed, users go to SquadUI for upgrade/insider functionality. EditLess just needs to ensure `squad-ui-integration.ts` can detect and link to SquadUI's upgrade capabilities when available.
**Why:** SquadUI v0.8.0 already has `upgradeSquad` and `checkForUpdates` commands. No reason to duplicate. Noted as part of #377 (modality icons) existing work.
**Supersedes:** Initial directive to "bring back squad upgrades with upgrade button per squad + insider mode setting" — scope collapsed after confirming SquadUI covers it.

---

### 2026-02-22T04:12:00Z: User directive — Unified vision for tab/terminal management
**By:** Casey Irvine (via Copilot)
**What:** EditLess needs a congealed, unified vision for tab/terminal management across all session types: squad CLI terminals, squad UI tabs, regular copilot CLI terminals, and potentially VS Code native chat. Squads are first-class citizens but also "just agents" — don't add a ton of squad-specific features. The tab management should eventually work with all modalities (including native VS Code chat integration). There's a real tension between VS Code terminal tabs and editor-area tabs that may need solving — possibly via pseudo-terminals as editor tabs. Whatever we build for squad integration should fit into this broader unified flow, not be a one-off.
**Why:** User directive — ensures squad integration doesn't create disconnected UX concepts that conflict with the broader EditLess vision.

---

# CWD-Indexed Session Cache (v0.1.1 Performance)

**Date:** 2026-02-21  
**Author:** Morty (Extension Dev)  
**Issue:** #331  

## Decision

SessionContextResolver now uses a CWD → session ID index (`Map<normalizedCWD, CwdIndexEntry[]>`) instead of linearly scanning all session-state directories on every cache miss.

## Architecture

- **Index structure:** `CwdIndexEntry` stores sessionId, cwd, summary, branch, createdAt, updatedAt — everything except plan.md references (read lazily only for matching sessions).
- **Invalidation strategy:** Directory count comparison. `_ensureIndex()` calls `readdirSync` to count directories; if count matches `_indexedDirCount`, the existing index is reused. New sessions trigger a full rebuild.
- **Cache layers:** Two-level — `_cache` (30s TTL, per-call results) gates calls to `_scan()`, which uses `_cwdIndex` (invalidated by dir count) for O(1) lookups.
- **clearCache()** clears both layers.

## Trade-offs

- Directory count is a heuristic — if a session is deleted and replaced (same count), the index won't rebuild until the next `clearCache()` or count change. Acceptable for append-only session lifecycle.
- `readdirSync` still runs on every `_scan()` call (~1ms for 200 dirs), but avoids 200× `readFileSync` calls (~100ms savings).

## Impact

Reduces per-poll session resolution from ~100ms to <5ms for 200+ sessions. No API changes — `resolveAll()` and `resolveForSquad()` behave identically.

---

# Architecture: Registry ↔ Workspace Interaction Pattern

**Author:** Rick (Lead Architect)  
**Requested by:** Casey  
**Date:** 2025-07-17  
**Status:** Recommendation (Phase 1 implementation ready)  
**Scope:** `agent-registry.json`, unified discovery, workspace folder integration, SquadUI interop

## Context

EditLess has three interacting subsystems for discovering squads/agents:
1. **Registry** (`agent-registry.json`) — User-added squads with metadata (icon, universe, launchCommand)
2. **Discovery** (`unified-discovery.ts`) — Filesystem scan of workspace folders + parents + `~/.copilot/`
3. **VS Code workspace** — `workspaceFolders` managed by VS Code

The coupling problem: registered squads can live outside workspace folders, discovery can't find external paths if registry is deleted, and SquadUI integration is brittle for external squads.

## Recommendation: Hybrid (Option 3)

Registry stays as metadata source and source of truth. Workspace folders are a derived view kept in soft sync via opt-in reconciliation:

- **Registry → Workspace:** On activation, offer to add registry squad paths to workspace folders (respecting user preference per path).
- **Workspace → Registry:** Existing `autoRegisterWorkspaceSquads()` auto-registers new workspace squads.
- **Stale detection:** On activation, check each registry path for existence; mark stale entries with warning icon.

This provides SquadUI file-watching benefit (squads in workspace) without forcing multi-root workspaces on unwilling users.

## Implementation Phases

### Phase 1: Foundation (Minimal, Safe)
1. Add `removeSquad()` / `removeAgent()` commands (UI + API)
2. Add stale entry detection on `loadSquads()`
3. Add `editless.autoAddToWorkspace` setting ("prompt" | "always" | "never")

### Phase 2: Reconciliation
1. Registry → Workspace sync on activation
2. Workspace → Registry sync (wire up existing `autoRegisterWorkspaceSquads()`)
3. SquadUI integration improvement (no extra calls needed after `updateWorkspaceFolders()`)

### Phase 3: Polish
1. Multi-root registry resolution (resolve relative paths against workspace storage root)
2. Optional: Remove from workspace on `removeSquad()`

## Edge Cases Handled

| Scenario | After Phase 2 |
|----------|--------------|
| Squad in registry, folder deleted from disk | Tree shows ⚠️ stale indicator; "Remove stale" command available |
| Squad in registry, not in workspace folders | Prompt to add to workspace (or auto-add per setting) |
| Squad in workspace folders, not in registry | `autoRegisterWorkspaceSquads()` auto-registers on activation |
| User removes workspace folder via VS Code UI | Squad stays in registry; SquadUI removal is optional |
| User manually edits registry JSON to add entry | `watchRegistry()` fires; reconciliation offers to add path to workspace |

---

# Squad Ecosystem v0.2: Scope Narrowed — Watch Daemon Removed, Native-Chat Deferred

**Date:** 2026-02-22  
**Lead:** Rick  
**Status:** Implemented (5 GitHub issues updated)  
**Issues Updated:** #373, #374, #375, #376, #377

## Decision

EditLess is a **terminal session manager**, not a process daemon launcher. v0.2 scope is narrowed to focus on user-facing interactive sessions. Background daemons (watch, background processes) and infrastructure integrations (SDK, native chat) are deferred to v0.3+.

## Rationale

Casey's core directive for v0.2: "The user needs to know when something is working, when it's idle, or when it needs a decision. Whether they're looking at Copilot CLI or Squad CLI, it should be obvious from the sidebar what needs their attention."

v0.2 spec was creeping into infrastructure concerns: process daemon management, SDK integration, chat UI integration. These are valuable future work but distract from core v0.2 value prop.

## Changes

### Issue #373: Squad CLI Command Builder
- **Old scope:** `squad`, `squad loop`, `squad watch`, `squad init`, `squad upgrade`, `squad status`
- **New scope:** `squad`, `squad loop`, `squad init`, `squad upgrade`, `squad add` (watch daemon removed)
- **Watch removed:** "watch is intentionally excluded — it's a background daemon, not a terminal session."

### Issue #374: Session Modality Type System
- **Old scope:** 5 modalities (copilot-cli, squad-cli, squad-sdk, native-chat, unknown)
- **New scope:** 3 modalities (copilot-cli, squad-cli, unknown)
- **Future modalities (deferred, not cut):** native-chat deferred to v0.3+

### Issue #375: Squad CLI Terminal Launch Commands
- **Old scope:** `launchSquad`, `launchSquadLoop`, `launchSquadWatch`
- **New scope:** `launchSquad`, `launchSquadLoop` (watch removed)

### Issue #376: Terminal Attention State Tracking
- **Old approach (rejected):** Complex heuristics (output pattern matching, timeout-based idle detection)
- **New approach:** Three-state model using only VS Code shell execution events:
  ```typescript
  type AttentionState = 'working' | 'idle' | 'needs-decision';
  ```
  - `working` — shell execution is active
  - `idle` — shell execution ended, no pending prompt detected
  - `needs-decision` — shell execution ended AND terminal has recent output

**Key principle:** "Do NOT add complex heuristics. Start with shell execution events only. The detection may be imperfect initially. That's OK — ship it, iterate."

### Issue #377: Modality-Aware Terminal Icons
- **Old scope:** 5 modality icons (including squad-sdk, native-chat); emoji vs SVG decision deferred
- **New scope:** VS Code ThemeIcons (themeable, consistent with design language) for 3 modalities only:
  - `copilot-cli` → `$(copilot)` or `$(github)`
  - `squad-cli` (REPL) → `$(organization)` or `$(people)`
  - `squad-cli` (loop) → `$(sync)`
- **Future:** "native-chat icon deferred to when native-chat modality is added."

## Architecture Clarity

EditLess is a **session manager**, not a process daemon launcher.

- **In scope:** User-facing terminal sessions (copilot-cli, squad CLI REPL, squad CLI loop)
- **Out of scope v0.2:** Background daemons (watch), programmatic SDKs, chat UI platforms
- **Design principle:** "The editorless IDE panel" — focus on user interaction, not infrastructure

## User Impact

v0.2 delivers on Casey's core directive without scope creep:

1. **Multi-modality support:** Users can run Copilot CLI and Squad CLI sessions side-by-side
2. **Attention state:** Clear visual signals (tree icons, status bar) for which sessions need interaction vs. which are working
3. **No feature debt:** No half-baked SDK integration, no chat UI placeholders
4. **Clear deferred work:** Native-chat integration is acknowledged, dated to v0.3+

---

# Launch Progress Indicator — Transient State UX

**Author:** Summer (Product Designer)  
**Date:** 2026-02-22  
**Status:** Implemented  
**Issue:** #337  

## Decision

Added 'launching' as a transient fourth state to `SessionState`: `'launching' | 'active' | 'inactive' | 'orphaned'`.

**Icon:** `loading~spin` — same spinner as 'active'. Both states mean "something is happening." The description text differentiates them.

**Description:** `'launching…'` — this is the only state that shows status text instead of relative time in the tree item description. Justified because there's no meaningful time to show during a 2-5 second transient startup window.

**Transitions:**
- `launchTerminal()` / `relaunchSession()` → sets 'launching'
- Shell execution starts → clears to 'inactive'
- events.jsonl data arrives → clears to 'active' or 'inactive'
- 10-second timeout → falls back to 'inactive'

## Rationale

Users reported 2-8 seconds of uncertainty after clicking "Launch Session" with no visual feedback. The 'inactive' circle-outline icon implied nothing was happening. The spinner provides immediate confirmation that the extension received the launch command and is working on it.

---

# Squad CLI Integration — Comprehensive UX Review

**Reviewer:** Summer (Product Designer)  
**Date:** 2025-01-28  
**Status:** Design Review — Strategy Document  

## Executive Summary

EditLess should NOT become SquadUI-lite. The proposed integration should be stripped down to two primitives: (1) terminal type differentiation, (2) refresh trigger. Everything else is scope creep.

The core design principle: **EditLess is a router**, not a replacement for SquadUI or Squad CLI. It manages windows/tabs and routes user attention, not dashboards or work tracking.

## Minimum Viable Differentiation

**Icons (only visible differentiation needed):**
- Copilot CLI: `$(github)` or `$(copilot)`
- Squad CLI REPL: `$(organization)` or `$(people)`
- Squad loop: `$(sync)` or `$(debug-continue)`

**No new statuses needed beyond active/inactive.** Existing active/inactive state covers "needs attention" via VS Code shell execution events.

## What to KEEP ✅

1. **Terminal launch commands** — `launchSession` from squads, agents, work items
2. **Session lifecycle tracking** — active, inactive, orphaned states
3. **SquadUI command forwarding** — `openDashboard`, `viewCharter`
4. **Terminal type differentiation (icons only)** — visual distinction between copilot/squad sessions

## What to CUT ❌

1. **Rich modality tracking** — no "working", "idle", "awaiting input" statuses beyond active/inactive
2. **Agent mention resolution** — parsing @agent syntax from terminal output
3. **Auto-refresh SquadUI on terminal activity** — do NOT ping SquadUI on every event
4. **Squad watch monitoring** — do NOT track `squad watch` processes
5. **Session-specific work item display** — "this terminal is working on PR #42"

## What to ADD (Minimal) 🟢

1. **Squad CLI command builder** — `buildSquadCommand()` helper function
2. **"Show Dashboard + Terminal" command** — split view for squad dashboard + terminal
3. **Status bar attention indicator** — "$(bell) Terminal needs attention" → click to focus

## EditLess as Router (Not Dashboard)

EditLess's role:
- **Launch sessions fast** (existing)
- **Organize sessions clearly** (existing)
- **Route users to the right place** (terminal panel, SquadUI dashboard, etc.)

When a user clicks a terminal in the sidebar: focus the terminal panel.  
When a user clicks "Open in Squad UI": open the dashboard tab.  
When a session finishes: show clickable status bar item (if enabled) or rely on native terminal badges.

## Terminal Pseudo-Tab Problem (Acknowledged, Not v0.2)

There's real tension between VS Code terminal tabs (bottom panel) and editor-area tabs (where SquadUI dashboards live). This creates three attention zones (Editor, Terminal Panel, EditLess Sidebar). Pseudo-terminals as editor tabs might reduce this to two zones, but:

- ❌ High implementation cost (finicky APIs)
- ❌ Breaks user expectations
- ❌ Doesn't solve for users who keep terminal panel open anyway

**Recommendation:** Don't pursue pseudo-terminals yet. Lean into EditLess as a router. Phase 4+ research (not v0.2).

## SquadUI Integration Details

### Commands EditLess Can Call (SquadUI v0.8.0)
- `squadui.openDashboard` → Opens/switches singleton dashboard ✅
- `squadui.viewCharter` → Opens agent charter in markdown preview ✅
- `squadui.refreshTree` → Refreshes SquadUI's tree views ⚠️ Use after squad file changes
- `squadui.generateStandup`, `checkForUpdates`, `upgradeSquad`, `initSquad` → ❌ Don't integrate

### Status Model Distinction (Important)

EditLess shows **terminal session state**: active/inactive/orphaned (based on shell execution).  
SquadUI shows **task/work state**: working/idle/monitoring (based on log activity).

These are **complementary signals**, not conflicts. A terminal can be "active" (running) but "idle" in SquadUI (no recent logs).

### Risks

- **Medium Risk:** SquadUI's FileWatcher only watches workspace root. External squads show stale data until manually refreshed. **Mitigation:** Call `squadui.refreshTree(teamRoot)` after `openDashboard()` for external paths.
- **Not a risk:** Multi-dashboard. SquadUI uses singleton WebviewPanel. This is the right model for foreseeable future.

## Next Steps

---

### 2026-02-26T02:43:00Z: User Directive — Agents Naming Convention

**By:** Casey Irvine (via Copilot)  
**Status:** Pending Implementation

## What

Registry JSON `squads` array should be renamed to `agents`. Any code that handles both agents and squads should use "agents" as the term. Only squad-specific paths (e.g., squad init, squad directory watcher) should refer to "squads".

## Why

User request — the current naming is confusing because standalone agents are stored under a `squads` key, and code that handles both types uses squad terminology.

## Impact

- All registry schema references: `squads: Squad[]` → `agents: Agent[]`
- Code comments and variable names handling both types should use "agents" terminology
- Only retain "squads" terminology for: squad initialization, squad-specific watchers, squad module directories
- Tests and mocks must be updated to reflect new terminology

---

### 2026-02-27: addAgent Command — Registry-Before-Workspace Ordering

**Date:** 2026-02-27  
**Author:** Morty  
**Status:** Implemented  
**Issue:** #399

## Context

The `editless.addAgent` command registers an agent in the registry then adds the project folder to the workspace. The `onDidChangeWorkspaceFolders` event fires `refreshDiscovery()`, which deduplicates discovered agents against registry entries. If the workspace folder is added before the registry write, the discovery handler finds the agent file but doesn't see it in the registry — so it appears under "Discovered" instead of "Registered."

## Decision

1. **Ordering:** Always call `registry.addSquads()` BEFORE `ensureWorkspaceFolder()`. The workspace folder change event's `refreshDiscovery()` then sees the registry entry and correctly deduplicates.
2. **Error handling:** Wrap `addSquads` `writeFileSync` in try/catch. Log a warning on failure. In-memory state still updates so the current session works even if disk persistence fails.

## Impact

- Any future command that adds to the registry AND modifies workspace folders must follow this pattern: registry write → workspace change → explicit refresh.
- `addSquads` no longer throws on write failures — callers should not rely on exceptions for flow control.

---

### 2026-02-26: Explicit Refresh over File-Watcher-Only for Programmatic Registry Changes

**Author:** Morty  
**Date:** 2026-02-26  
**Status:** Implemented  
**Issue:** #399

## Decision

Always call `treeProvider.refresh()` explicitly after programmatic `registry.addSquads()` calls. Do not rely solely on the file system watcher (`watchRegistry`) for tree updates triggered by in-process code.

## Rationale

`vscode.workspace.createFileSystemWatcher` does not reliably fire for files outside the current workspace folders. When the registry file lives in the extension directory (no workspace open) or when the path is external, the watcher never fires and the tree never updates. The watcher remains as a bonus for external edits (manual JSON editing, other processes), but explicit refresh is the reliable path for anything the extension does itself.

## Also

Added `ensureWorkspaceFolder(dirPath)` — when registering external squads/agents, auto-add the folder to the VS Code workspace so file watchers work and the folder appears in Explorer.

---

### 2026-02-26: UI Reactivity Analysis for Auto-Discover Refactor

**Author:** Morty (Extension Dev)  
**Date:** 2026-02-26  
**Status:** Analysis Complete, Decisions Pending Implementation  
**Epic:** #368 — Squad Auto-Discovery Optimization

## Summary

Comprehensive reactivity analysis for auto-discover refactor. Finding: Current system ALREADY 95% reactive (< 10ms tree updates for all user-initiated actions). No major redesign needed.

## Key Findings

1. **Registry-First Pattern is FAST** — `registry.addSquads()` → `registryWatcher` → `treeProvider.refresh()` = 5-25ms (imperceptible)
2. **Hybrid Model Already Exists** — Direct add path (instant) + background discovery (async) separation is already working
3. **No Redesign Needed** — Preserve current watchers and update patterns; optimize bottlenecks instead
4. **Bottlenecks Identified:**
   - `scanSquad()` called in SquadWatcher callback but result discarded (pure sync I/O waste)
   - `squadWatcher.updateSquads()` recreates FS watchers synchronously, blocking event loop
   - `watchRegistry` callback receives unloaded squads, causing redundant disk reads

## Proposed Optimizations (Phase 1)

1. **Add Debouncing** — 300ms debounce on `refreshDiscovery()` to prevent rapid-fire rescans when multiple workspace events fire
2. **NEW Copilot Agent Directory Watcher** — Catch manual file drops in `~/.copilot/agents/*.agent.md`, trigger discovery rescan (300ms debounced)
3. **Remove Redundant Calls** — Trust the watchers; eliminate manual `refreshDiscovery()` and `treeProvider.refresh()` calls in command handlers
4. **Watchers Confirmed Fast:**
   - Workspace Folder Watcher: Synchronous event
   - Registry File Watcher: ~0ms in-process
   - Squad File Watcher: ~0ms in-process
   - Workspace team.md Watcher: ~0ms in-process

## Event Flow (Post-Optimization)

```
┌─ USER-INITIATED (Instant)        ┌─ BACKGROUND (Auto-Discover)
│ + Add Agent                       │ Workspace folder added
│ + Add Squad (existing dir)        │ Extension activated
│ Hide/Show                         │ Manual "Refresh" command
│ Change model/args/icon            │ team.md created
│ "Add" discovered item             │ File dropped in ~/.copilot/agents/
└─ registry.addSquads()             └─ refreshDiscovery()
   ↓ registryWatcher (0ms)             ↓ Scan workspace + copilot-dir
   ↓ treeProvider.refresh()            ↓ setDiscoveredItems(items)
   ✅ Tree updates < 10ms              ✅ "Discovered" updates (background)
```

## Testing Implications

- **707 tests unaffected** (76%)
- **~160 tests to rewrite** (17%) — Discovery/watcher logic
- **~93 new tests needed** (10%) — Debounce patterns, Copilot watcher, new lifecycle
- **Post-refactor total:** ~960 tests

## Phase 2 Optimizations (Later)

- Optimize `invalidate()` to subtree refresh (less redraw for large trees)
- Cache discovery results (skip rescan if < 5 seconds old)
- Dead code removal (47 functions identified in audit)

---

1. **Keep current integration as-is.** Context menu "Open in Squad UI" is the right pattern.
2. **Add a `refreshTree` call** after `openDashboard` in `squad-ui-integration.ts` for external paths.
3. **Document the two-status-model distinction** in user-facing docs.
4. **Watch SquadUI's future releases** for `exports` field or new commands (signals programmatic API expansion).
5. **Don't add any new SquadUI integration points.** Keep EditLess focused on terminal/tab routing.

---

# SquadUI Dashboard Integration — UX Design & Architecture

**Author:** Summer (Product Designer)  
**Date:** 2026-02-22  
**Status:** Proposal  

## Core Constraint & Mental Model

SquadUI's dashboard is a **singleton webview panel** — only one instance can be open at a time. When `squadui.openDashboard(teamRoot)` is called with a different path, the existing panel switches context (refreshes data for the new squad).

This maps cleanly to EditLess's role: we're a **window manager**, not a dashboard. We don't own the dashboard content — we just tell SquadUI which squad to show. The right analogy is **VS Code's Source Control view** with multiple repositories.

## Recommended UX Flow

### Click Behavior (Default)
- **Clicking a squad** in the tree view: **Expands/collapses** the squad to show terminal sessions and roster. No side effects.
- **Clicking a terminal session** under a squad: **Focuses that terminal.** This is the core EditLess value.

### "Show Dashboard" Action
- **Context menu** on squad items: "Open in Squad UI" (gated by `editless.squadUiSupportsDeepLink`)
- **No inline dashboard button.** Rationale: EditLess is a terminal/window manager. Adding a dashboard button to every squad item promotes SquadUI over EditLess's own value (session management). The context menu is discoverable enough.
- **Command palette**: `EditLess: Open in Squad UI` remains available for keyboard-first users.

### Switching Behavior
When switching squads in SquadUI (via EditLess context menu):
- **SquadUI switches context automatically.** The `switchToRoot()` function handles this — updates data provider, refreshes tree, re-renders dashboard panel.
- **No confirmation dialog needed.** The user initiated the action; result is self-evident.
- **No toast/notification.** The dashboard tab title stays "Squad Dashboard" — the content changes. Mirrors clicking a different file in Explorer.

### When SquadUI Isn't Installed
- The "Open in Squad UI" context menu item is **hidden** (`editless.squadUiSupportsDeepLink` context key is false)
- **No nagging prompts.** EditLess stands on its own as a terminal manager. If the user wants dashboards, they'll find SquadUI through marketplace or docs.

### Multiple Terminals + Dashboard (Typical Layout)

```
┌──────────────────────────────────────┐
│ EditLess Sidebar │ Squad Dashboard   │
│ 🏢 My Squad     │ or                 │
│   ├─ 🔄 rick    │ Terminal: Rick     │
│   ├─ 🔄 morty   │ working on #42     │
│   └─ ⭕ summer  │                    │
│                  │                    │
│ 🤖 Standalone   │                    │
│   └─ 🔄 copilot │                    │
└──────────────────────────────────────┘
```

The dashboard is another **editor tab**. Terminals occupy the **terminal panel** below. EditLess manages **attention state** (which sessions are active). The dashboard provides **analysis** (velocity, burndown). These are complementary, not competing.

## What NOT to Do

1. **Don't auto-open the dashboard** when a squad is selected. Violates window-manager philosophy.
2. **Don't add an inline dashboard icon** on squad tree items. Visual clutter that promotes SquadUI over EditLess's core value.
3. **Don't try to sync state bidirectionally.** EditLess → SquadUI is one-way via `openDashboard(teamRoot)`. SquadUI doesn't expose events we need.
4. **Don't duplicate SquadUI features.** No burndown charts, no velocity views, no standup reports in EditLess. We manage terminals and attention; they manage dashboards.

## SquadUI Integration Surface (v0.8.0)

### Commands EditLess Should Call
- `squadui.openDashboard` (teamRoot?: string) ✅ Already wired
- `squadui.viewCharter` (memberName, teamRoot?: string) ✅ Already wired
- `squadui.refreshTree` (teamRoot?: string) ⚠️ Consider after squad file changes

### Commands NOT to Call
- `squadui.generateStandup` — it's SquadUI's feature
- `squadui.checkForUpdates` / `squadui.upgradeSquad` — per Casey's directive, SquadUI owns this
- `squadui.initSquad` — SquadUI owns initialization

### High-Risk Integration Points

1. **SquadUI's FileWatcher only watches workspace root.** External squads show stale data until manual refresh. **Mitigation:** Call `squadui.refreshTree(teamRoot)` after `openDashboard()` for external paths.

2. **Status model confusion.** EditLess shows "is terminal alive?" SquadUI shows "is agent producing work?" **Mitigation:** Clear documentation distinguishing the two models.

## Next Steps (Concrete)

1. **Keep current integration as-is.** Context menu "Open in Squad UI" with deep-link gating is the right pattern.
2. **Add a `refreshTree` call** after `openDashboard` in `squad-ui-integration.ts` when opening external squad paths.
3. **Document the two-status-model distinction** in user-facing docs when both extensions are installed.
4. **Watch SquadUI's `package.json`** for an `exports` field or new commands. If they expose events, EditLess could subscribe to agent status changes for richer attention state.
5. **Don't add any new SquadUI integration points.** Casey's directive: minimal squad functionality. Be a good tab/terminal manager, not a feature duplicate.

---

# Decision: Unified Discovery Flow — Agents & Squads

**Date:** 2026-02-21
**Author:** Morty (Extension Dev)
**For:** Issues #317 (refresh discovery) and #318 (add from existing)

## Decision

Agent and squad discovery are now unified into a single tree section and code path.

## What Changed

1. **New module: `src/unified-discovery.ts`** — exports `DiscoveredItem` interface and `discoverAll()` function that scans workspace folders for both `.agent.md` files AND `.squad/team.md` directories in one pass, plus `~/.copilot/agents/` for personal agent library. Returns items minus already-registered.

2. **Unified "Discovered" tree section** — replaces the old "Discovered Agents" header. Shows both agents (🤖 hubot icon) and squads (🔷 organization icon) with a count badge ("3 new"). Squads sort first, then agents.

3. **No more toast notifications** — `checkDiscoveryOnStartup()` with its modal toast + QuickPick flow is removed from extension activation. Discovered items appear passively in the tree.

4. **Single refresh path** — `refreshDiscovery()` in extension.ts re-runs both `discoverAllAgents()` and `discoverAll()` in one go. Used by the refresh command, workspace folder changes, and post-promote cleanup.

5. **Promote handles both types** — `editless.promoteDiscoveredAgent` command now checks unified `discoveredItems` first (handles both agents and squads), then falls back to legacy `discoveredAgents`.

6. **Deprecated settings** — `editless.discoveryDir` and `editless.discovery.scanPaths` marked deprecated in package.json descriptions. Not removed yet for backward compat.

## Why

Casey directed: "I want the unified flow NOW to simplify the code." Two completely separate discovery flows (agents: silent sidebar, squads: toast+QuickPick) created confusion and code duplication. Summer's UX spec (in decisions.md) defined the target state.

## Impact

- Tree view shows unified section instead of flat discovered agents list
- `discovered-squad` is a new TreeItemType with context menu actions
- `CategoryKind` expanded: `'roster' | 'discovered' | 'hidden'`
- The old `promptAndAddSquads()` and `registerDiscoveryCommand()` still exist in `discovery.ts` for the manual `editless.discoverSquads` command

---

## 2026-02-21: Copilot CLI Integration Flags for EditLess

**Date:** 2026-02-21  
**Author:** Jaguar (Copilot SDK Expert)  
**Status:** Approved  
**Affects:** terminal-manager.ts, session-context.ts, cli-provider.ts  

### Context

Researched Copilot CLI v0.0.414 flags and session management to answer integration questions. The CLI has evolved significantly — no visible session ID in terminal output, but robust file-based session state and new structured protocol support.

### Decisions

**1. Session ID Detection Strategy**

Use `--resume <pre-generated-uuid>` to control session IDs.

The CLI's `--resume` flag accepts a UUID to start a *new* session with that ID. EditLess should:
- Generate a UUID before launching the terminal
- Pass it via `--resume <uuid>` in the launch command
- Immediately know the session ID without parsing terminal output
- Watch `~/.copilot/session-state/<uuid>/events.jsonl` for state

Fallback: parse `workspace.yaml` (`id:` field) or first line of `events.jsonl` (`session.start` event with `data.sessionId`).

**2. Recommended Launch Flags for EditLess**

```
copilot --resume <editless-uuid> --no-alt-screen --allow-all-tools --agent <agent> --model <model> --add-dir <workspace>
```

Optional integration flags:
- `--additional-mcp-config @<path>` — inject EditLess MCP server config at launch
- `--no-custom-instructions` — when EditLess wants full control of instructions
- `--log-dir <session-specific-dir>` — capture logs per-session for debugging
- `--config-dir <dir>` — isolate config if needed (affects all settings)
- `-p <prompt> --allow-all -s` — non-interactive mode for automated tasks (silent output)

**3. Status Detection via events.jsonl**

State machine derived from event types:
```
IDLE:     after session.start or assistant.turn_end
WORKING:  after assistant.turn_start
TOOL_RUN: after tool.execution_start (until tool.execution_complete)
WAITING:  no turn active + no recent assistant.turn_end (user input needed)
```

Additional signals:
- `update_terminal_title` config (default: true) updates terminal title with agent intent
- Exit code from `-p` mode signals success/failure

**4. Future: ACP (Agent Client Protocol)**

The `--acp` flag runs CLI as a structured protocol server (likely JSON-RPC). This is the proper machine-to-machine integration path but needs further investigation. Should be tracked as a future work item for EditLess.

### Flags NOT Available (Confirmed Absent)

- ❌ `--ide` / `--editor` — no IDE identification flag
- ❌ `--json` — no machine-readable output mode
- ❌ `--session-id` — no flag to output session ID
- ❌ No structured status stream in interactive mode

### Impact

- `terminal-manager.ts`: Update launch command builder to use `--resume <uuid>` pattern
- `session-context.ts`: Can simplify session ID detection (known at launch time)
- `cli-provider.ts`: Update flag inventory for capability detection

---

## 2026-02-21: Pseudoterminal Spike Assessment — Issue #321

**Date:** 2026-02-21  
**Author:** Morty (Extension Dev)  
**Status:** Assessment Complete  
**Type:** Technical Evaluation  

### Summary

Assessment of pseudoterminal spike vs master for status detection. The spike is an unfinished proof-of-concept that is not wired into the extension. Casey is correct that he can't see status changes — they literally don't exist in the running extension.

### Findings

**1. The spike didn't change terminal-manager.ts at all**

`terminal-manager.ts` is byte-for-byte identical on master and the spike branch. Zero diff. The spike added a standalone `copilot-pseudoterminal.ts` module (264 lines) with 30 unit tests, but never integrated it into:
- `terminal-manager.ts` (still uses `vscode.window.createTerminal` + `sendText`)
- `editless-tree.ts` (still reads state from `_shellExecutionActive`)
- `extension.ts` (no imports, no feature flag, no wiring)

**Casey's experience is correct:** The spike branch behaves identically to master for status detection.

**2. What the pseudoterminal module DOES implement (in isolation)**

The standalone `CopilotPseudoterminal` class implements:
- **5 states:** `starting`, `idle`, `working`, `waiting`, `closed` (vs master's 3: `active`, `inactive`, `orphaned`)
- **Output-based state detection:** Regex patterns on a rolling 4KB buffer
  - Idle: prompt patterns (`>`, `copilot>`, `[project]>` at end of output)
  - Working: tool markers (`🔧 Running tool:`, `Executing:`, `Tool call:`, `⚙️`)
  - Waiting: fallback when output exists but no markers match
- **Session ID extraction:** `/Session ID:\s*([a-f0-9-]+)/i` regex on output
- **Callbacks:** `onStateChange` and `onSessionIdDetected` (never connected to anything)

**3. Why status detection WOULD be better — theoretical advantages**

A pseudoterminal gives us `child_process.spawn()` with piped stdio, meaning:
- **Every byte of stdout/stderr flows through our code** — master gets nothing from terminal output
- **We can inject overlay messages** (dim status text) without affecting the child process
- **We get exit codes directly** from the `exit` event
- **No sendText race** — we control process lifecycle directly
- **No filesystem polling** for session IDs — we read them from output

Master's status detection is limited to:
- `onDidStartTerminalShellExecution` / `onDidEndTerminalShellExecution` — binary active/inactive
- Filesystem-based session ID detection via `SessionContextResolver` (polling `~/.copilot/session-state/`)

**4. Session ID detection — the regex won't match**

The spike looks for `Session ID: <uuid>` in terminal output. Casey reports the CLI doesn't print this anymore. This is a fragile dependency on CLI output format. The existing master approach (scanning session-state directories by cwd match) is actually more robust because it doesn't depend on CLI output format — it reads the filesystem artifacts the CLI always creates.

### Recommendation

**Don't abandon the approach, but don't merge this spike as-is.** The pseudoterminal architecture is sound for the theoretical reasons, but the spike is incomplete:

1. **No integration** — The module exists in a vacuum
2. **Pattern fragility** — The prompt/working patterns are guesses, not validated against real CLI output
3. **Session ID regex** — Depends on CLI output that apparently changed
4. **Shell loss** — The `NO_COLOR=1` env var and lack of shell means degraded visual experience
5. **Windows SIGWINCH** — `setDimensions` is a no-op on Windows (our primary platform)

**If pursuing further:**
- First validate what the actual CLI output looks like for prompts and session IDs
- Wire it into `TerminalManager.launchTerminal()` behind a feature flag as the spike doc suggests
- Connect `onStateChange` → `_shellExecutionActive` → `_onDidChange.fire()` → tree refresh
- Test with real Copilot CLI sessions, not just mocked child_process

**If not pursuing:** The current master approach (shell execution events + filesystem session detection) is working and has been battle-tested. The pseudoterminal's main advantage (richer state detection) requires CLI cooperation that may not exist.

### Cross-Agent Alignment

Jaguar's discovery (CLI no longer prints `Session ID:`) validates the concern that the pseudoterminal's regex-based session detection is fragile. The existing master approach (filesystem scanning) is more robust.


---

## 2026-02-21: Pseudoterminal Architecture Trade-off Analysis — Issue #321

# Pseudoterminal Architecture Decision

**Date:** 2026-02-21  
**Decision Owner:** Rick (Lead)  
**Context:** Issue #321 spike analysis – Morty found the pseudoterminal module was written but never integrated. Jaguar validated `events.jsonl` + `--resume` + `--acp` strategy. Casey asked: can we use pseudoterminal UX AND events.jsonl integration?

---

## Analysis

### 1. Regular Terminal + events.jsonl + --resume Strategy

**What you get:**
- ✅ Real-time state detection via `events.jsonl` file watching (idle/working/tool-running)
- ✅ Accurate session resumption via `--resume <uuid>` (pre-generate UUID before launch)
- ✅ VS Code terminal API handles I/O, shell features, resizing natively
- ✅ Shell features work: tab completion, history, aliases
- ✅ Minimal integration surface (just wire up event watchers)
- ✅ Path forward to `--acp` protocol (structured machine-to-machine) with no rework

**What you lose:**
- ❌ Terminal I/O is a black box after launch — you can't read stdout/stderr to detect state
- ❌ Terminal resize/Ctrl+C handling is automatic but not controllable
- ❌ No structured logging injection without parsing terminal output
- ❌ State detection via `events.jsonl` is an extra I/O dependency (adds 10-30ms per poll)

---

### 2. Pseudoterminal + events.jsonl + --resume Strategy

**What you get:**
- ✅ Full I/O control: read stdout/stderr in real-time for custom state detection
- ✅ Inject structured messages into terminal output (no CLI output pollution)
- ✅ Same `events.jsonl` + `--resume` integration as approach #1
- ✅ Session ID detection from CLI output (fire callback immediately on detection)
- ✅ Controlled shutdown: send Ctrl+C, SIGKILL timeout

**What you lose:**
- ❌ **Pseudoterminal implements NO shell features** — Copilot pseudoterminal.ts explicitly accepts this tradeoff (line 61-62 comment). Tab completion, shell history, aliases, sourcing `.bashrc` — all gone.
- ❌ Extra maintenance burden: terminal I/O parsing, state detection patterns, error handling
- ❌ Windows doesn't support PTY resizing via SIGWINCH (line 120-122) — resize events silently fail
- ❌ Pseudoterminal architecture is orthogonal to `events.jsonl` — you're implementing state detection TWICE (pattern matching + file watching)
- ❌ Terminal state detection is fragile: depends on CLI output format staying stable, output buffering, pattern order
- ❌ CLI updates that change prompt format break state detection (no resilience)

---

### 3. Is "Best of Both Worlds" Possible?

**Short answer: No. They solve different problems.**

- `events.jsonl` is **the authoritative source of truth** for CLI state. It's structured, version-stable, machine-readable.
- Pseudoterminal I/O parsing is **inherently fragile** — it's fighting against terminal formatting, buffering, and CLI output changes.

**Why combining them doesn't work:**
- If you have `events.jsonl`, you don't need I/O state detection — you already have the signal.
- If you use pseudoterminal for I/O control, you're doing state detection work that `events.jsonl` already solved.
- The pseudoterminal **doesn't solve any problem that `events.jsonl` + regular terminal doesn't solve**.
- Adding pseudoterminal adds maintenance debt and loses shell features — the cost/benefit is negative.

---

### 4. The Hide/Show Behavior (Casey's Original Observation)

**The question:** When you close a pseudoterminal and reopen it, it hides/shows instead of launching a new instance. Is this pseudoterminal-specific?

**Answer: No. This is VS Code terminal behavior + EditLess session persistence.**

- VS Code terminal `dispose()` closes the UI but the process keeps running (if you don't kill it)
- EditLess TerminalManager already implements hide/show reconnection (terminal-manager.ts lines 185-216): `reconnectSession()` finds orphaned terminals by name and re-attaches them
- The "relaunch" path (lines 222-287) is what happens when no orphan is found — it starts a new process
- **You get this behavior from regular terminals too.** The pseudoterminal adds nothing here.

**Why this works today:**
```typescript
// From terminal-manager.ts:222-266
// When relaunching, we DON'T kill the process — we reuse it
terminal.sendText(`${entry.launchCommand} --resume ${entry.agentSessionId}`);
// The terminal was already created + shown. If process was still alive, sendText queues to stdin.
```

---

### 5. What About --acp (Structured Protocol)?

**The future path:** Copilot CLI is moving to `--acp` for structured machine-to-machine integration.

- `--acp` is a protocol for programmatic control (event subscriptions, tool definitions, response routing)
- Pseudoterminal is designed for **human interactive terminal emulation**
- When `--acp` ships, you'll want to use a **WebSocket or stdio pipe**, not a terminal at all
- Pseudoterminal becomes a dead end — you'll have to rip it out and replace it with the ACP client

**Why pseudoterminal is not a stepping stone:**
- ACP is not "pseudoterminal + structure" — it's a fundamentally different integration model
- Pseudoterminal skills don't transfer to ACP (completely different APIs, lifecycle, I/O model)
- Building pseudoterminal now wastes engineering time that won't help ACP implementation

---

# Settings & Registry Edge Cases — Comprehensive Analysis

**Date:** 2026-02-23  
**Author:** Rick  
**Status:** Analysis complete  
**Requested by:** Casey Irvine  

## Context

Casey asked for a full edge case audit of VS Code settings ↔ agent-registry.json interactions before documenting the system. This covers settings precedence, migration hazards, config.path overloading, flag duplication, file watcher races, runtime settings changes, and invalid registry states.

## Decision

The following 15 edge cases are catalogued with severity and issue status. **3 are already filed. 12 need new issues or should be folded into existing ones.**

The highest-impact findings are:
1. **`changeModel` uses fragile regex surgery on launchCommand strings** — this is the single most dangerous pattern in the codebase right now.
2. **No `onDidChangeConfiguration` listener for CLI settings** — settings changes are silently ignored until next terminal launch.
3. **`config.path` overloading** — already partially addressed by #403 but the dedup-key problem remains.

## Numbered Edge Cases

### 1. 🔴 `changeModel` regex surgery on launchCommand (CRITICAL)

`extension.ts:283-296` uses `config.launchCommand.replace('--model X', '--model Y')` — a naive string replace. Breaks when:
- `--model` appears twice in the string (only first replaced)
- Model name contains regex-special characters
- `--model=value` syntax (not matched by `--model\s+`)
- launchCommand is undefined (early return on line 281 handles this, but newly registered agents without launchCommand silently skip model changes)

**Filed:** Partially covered by #404 (duplicate flags), but the regex fragility is a **separate bug**. Needs new issue.

### 2. 🔴 Settings changes don't propagate to existing terminals (CRITICAL)

There is **no** `onDidChangeConfiguration` listener for `editless.cli.*` settings. The only config change listener is for `editless.refreshInterval` (line 1371). If a user changes `editless.cli.command`, `editless.cli.defaultAgent`, or `editless.cli.launchCommand` in settings:
- Already-running terminals: unaffected (expected)
- **Already-registered agents**: their `launchCommand` was baked in at registration time by `buildDefaultLaunchCommand()` and persisted to agent-registry.json. Changing settings **never updates existing registry entries**.
- **New terminals**: `launchTerminal()` line 148 checks `config.launchCommand` first, only falls back to settings if undefined. So registered agents ignore settings changes entirely.

**Filed:** No. Needs new issue. This is a settings-are-lies problem — user changes a setting, nothing happens.

### 3. 🟡 `launchCommand` is baked at registration, never refreshed (MEDIUM)

Every code path that registers agents calls `buildDefaultLaunchCommand()` at registration time and stores the result in `launchCommand`:
- `discovery.ts:121` (discoverAgentTeams)
- `discovery.ts:207, 217` (autoRegisterWorkspaceSquads)
- `extension.ts:167` (workspace watcher)
- `extension.ts:520-521` (promoteDiscoveredAgent)
- `extension.ts:539` (promoteDiscoveredAgent fallback)
- `extension.ts:1236` (addAgent command)
- `extension.ts:1283, 1319` (addSquad command)

The launch command string `"copilot --agent squad"` is frozen in JSON. If the user later changes `editless.cli.command` to `ghcs` or `editless.cli.defaultAgent` to `my-agent`, old registrations still say `"copilot --agent squad"`.

**Filed:** Partially covered by #401 (universe stays 'unknown' forever — same root cause: no re-detection). Should be expanded to cover launchCommand staleness.

### 4. 🟡 `config.path` dual-purpose collision for personal agents (MEDIUM)

`config.path` is used as:
- Terminal CWD (`terminal-manager.ts:159`)
- Squad scanner root (`scanner.ts:135` via `resolveTeamDir(config.path)`)
- File watcher root (`watcher.ts:35` via `path.join(squad.path, teamDirName)`)
- Dedup key (`discovery.ts:96` — `existingPaths` set, case-insensitive)

For personal agents where `path = ~/.copilot/agents/`, the scanner tries to find `.squad/team.md` inside `~/.copilot/agents/` (fails silently), the watcher watches `~/.copilot/agents/.squad/**/*` (doesn't exist), and **multiple personal agents with the same path are deduplicated as one entry** because the dedup key is path-based.

**Filed:** #403 covers CWD, but watcher/scanner/dedup issues are **not filed**. Needs expansion or new issue.

### 5. 🟡 `changeModel` command ignores agents without launchCommand (MEDIUM)

Line 281: `if (!config?.launchCommand) return;` — silently no-ops. If an agent was registered with `launchCommand: undefined` (possible via manual edit or code path that doesn't set it), the "Change Model" context menu item appears but does nothing. No error shown to user.

**Filed:** No. Needs new issue or fold into #404.

### 6. 🟡 Registry write-read race in `updateSquad` and `addSquads` (MEDIUM)

Both `updateSquad` (line 38) and `addSquads` (line 55) follow this pattern:
1. `this.loadSquads()` — reads file into memory
2. Modify in-memory array
3. Read file AGAIN (line 43-49) to get the `existing` wrapper
4. Write back to file

Step 3 re-reads the file independently of step 1. If another process (or the file watcher) modifies the file between steps 1 and 3, the in-memory squads and the `existing` wrapper could be out of sync. The write on line 51 uses the step-1 squads array overwriting whatever step 3 read for `existing.squads`.

Also: `fs.writeFileSync` is not atomic. A crash mid-write corrupts the file. No backup or temp-file-rename pattern.

**Filed:** No. Needs new issue.

### 7. 🟡 File watcher triggers loadSquads during concurrent write (MEDIUM)

`watchRegistry` (line 96-109) calls `registry.loadSquads()` on every file change event. If `addSquads` is writing to the file (line 69), the watcher fires, reads a partial/mid-write file, and `JSON.parse` throws. The catch block (line 23-30) sets `_squads = []` — temporarily blanking the in-memory registry.

The debounce in `SquadWatcher` (500ms) doesn't help here because `watchRegistry` has **no debounce** — it fires on every `onDidChange` event immediately.

**Filed:** No. Needs new issue. Could cause momentary "empty tree" flicker.

### 8. 🟡 TYPED_FLAGS dedup doesn't cover --model (MEDIUM)

`copilot-cli-builder.ts:63`: `TYPED_FLAGS = new Set(['--agent', '--resume', '--add-dir'])`. The dedup logic only strips `--agent`, `--resume`, and `--add-dir` when they conflict with typed options. `--model` is **not** in TYPED_FLAGS because it's passed through `extraArgs`, not as a typed option.

This means if `extraArgs` contains `['--model', 'gpt-5', '--model', 'claude-sonnet-4']`, **both** pass through. The copilot CLI gets duplicate `--model` flags.

**Filed:** #404 covers this exact scenario. This is the code-level confirmation.

### 9. 🟡 `changeModel` string replace can corrupt launchCommand (MEDIUM)

`extension.ts:294-296`: `config.launchCommand.replace('--model X', '--model Y')` uses JavaScript's `String.replace` which only replaces the **first** occurrence. If launchCommand is `"copilot --model gpt-5 --add-dir /path --model gpt-5"` (duplicated via bug #404), only the first `--model` gets replaced, leaving an inconsistent command.

Worse: if the model name contains a substring of another flag value, the replace could match incorrectly (e.g., model name `gpt-5.1` partially matching `gpt-5.1-codex`).

**Filed:** Related to #404 but this is a **separate** string-manipulation bug. Needs new issue.

### 10. 🟢 Empty/invalid registry file handling (LOW)

- **Empty file:** `JSON.parse('')` throws → catch block sets `_squads = []`. Fine.
- **Invalid JSON:** Same catch path. Fine.
- **Valid JSON, missing `squads` key:** Line 15 `Array.isArray(data.squads) ? data.squads : []` → returns empty. Fine.
- **Valid JSON, `squads` is not array:** Same check → returns empty. Fine.
- **File doesn't exist:** ENOENT caught specifically (line 24). Fine.
- **Missing fields on individual entries:** No validation. An entry with `{id: "x"}` and no `path`, `name`, etc. will be loaded and cause crashes downstream when accessed.

**Filed:** No. Low severity — only happens via manual editing. Could add schema validation but not urgent.

### 11. 🟢 Registry migration from squad-registry.json is rename-only (LOW)

`createRegistry` line 86-91: If `agent-registry.json` doesn't exist but `squad-registry.json` does, it renames the file. This is correct but **one-way**. If the user has both files (manually created), only `agent-registry.json` is used, and `squad-registry.json` is silently ignored. No warning.

Also: the `replace('agent-registry.json', 'squad-registry.json')` on line 88 is a string replace on the **full path**. If the path contains `agent-registry.json` as a directory name component, this could misfire. Unlikely but worth noting.

**Filed:** No. Low risk.

### 12. 🟢 `getCliCommand` strips `$(agent)` from legacy settings (LOW)

`copilot-cli-builder.ts:34`: `raw.replace(/\s*--agent\s+\$\(agent\)\s*/g, ' ').trim()` — this handles backward compat for users who had `"copilot --agent $(agent)"` in their settings. But if a user has `"copilot --agent $(agent) --model gpt-5"`, the regex strips `--agent $(agent)` but leaves `--model gpt-5`. This orphaned `--model` then gets appended to every command built by `buildDefaultLaunchCommand`, potentially conflicting with per-agent model settings.

**Filed:** No. Low risk — legacy migration edge case.

### 13. 🟢 Default agent launch uses `getCliCommand()` without `--agent` (LOW)

`extension.ts:327`: The built-in Copilot CLI default agent sets `launchCommand: getCliCommand()` — which is just the binary name (e.g., `"copilot"`), **without** `--agent`. This is intentional for the default agent. But if `getCliCommand()` returns a command with leftover flags from legacy settings (see #12), those flags leak into the default agent launch.

**Filed:** No. Low risk.

### 14. 🟢 `--resume` appended outside builder for registered agents (LOW)

`terminal-manager.ts:149`: `launchCmd = '${config.launchCommand} --resume ${uuid}'` — string concatenation outside the builder. If `config.launchCommand` already contains `--resume` (stale from a previous session or manual edit), the CLI gets duplicate `--resume` flags.

**Filed:** No. Low risk — `--resume` values are UUIDs so collision is astronomically unlikely, but the pattern is inconsistent with the builder's dedup philosophy.

### 15. 🟢 Tree view reads stale registry on every render (LOW)

`editless-tree.ts:180`: `getRootItems()` calls `this.registry.loadSquads()` — which reads the file from disk on **every** tree render. This is intentional for freshness but means: (a) file I/O on every tree paint, and (b) if the file is mid-write from `addSquads`, the tree briefly shows stale or empty data.

**Filed:** No. Performance issue, not correctness. Low priority.

## Summary

| Severity | Count | Filed | New Issues Needed |
|----------|-------|-------|-------------------|
| 🔴 Critical | 2 | 0 | 2 |
| 🟡 Medium | 7 | 2 (#403, #404) | 5 |
| 🟢 Low | 6 | 0 | 0 (documentation-only) |

## Recommended Actions

1. **File issues for #1 and #2** (critical) immediately — block v0.1.2 on these.
2. **Expand #401** to cover launchCommand staleness (#3), not just universe.
3. **Expand #403** to cover watcher/scanner/dedup path issues (#4).
4. **File issue for #6 and #7** (registry write race) — can be one combined issue.
5. **#404 is confirmed** — the dedup gap (#8) is exactly what the issue describes.
6. **File issue for #9** (changeModel string corruption) — separate from #404.
7. **Low-severity items** (#10-15) should be documented in a "Known Limitations" section rather than filed as issues.

---

# 2026-02-22T18:43Z: User Directive — Always Show Default Copilot CLI Agent

**By:** Casey Irvine (via Copilot)  
**What:** EditLess should always show a default "Copilot CLI" agent in the tree, even with no squads/agents configured. This is the generic copilot CLI agent (no --agent flag). New users should never see an empty tree — they can launch a session parented to the generic agent without knowing about squads.  
**Why:** User request — captured for team memory

---

# Inline Action Icons for Work Items & PRs

**Date:** 2026-02-24  
**Author:** Summer (Product Designer)  
**Status:** Proposed  
**Requested by:** Casey Irvine  

## Decision

Replace `$(play)` with `$(add)` for session launch on work item and PR leaf nodes. Keep `$(link-external)` for "Open in Browser." Two inline icons per item, consistent across both views.

## Rationale

### Why `$(add)` replaces `$(play)`

1. **Consistency with main tree.** The Agents view already uses `$(add)` for "Launch Session" on squad/agent nodes (`inline@0`). Work items and PRs perform the same action — creating a new terminal session. Same action → same icon.

2. **Casey's explicit ask.** _"There's maybe like a plus button that's like 'add a session.'"_ The `$(add)` icon directly maps to this mental model: you're _adding_ a session to your workspace, not _playing_ a recording.

3. **Semantic accuracy.** `$(play)` implies "run" or "resume" — a state transition on something that already exists. `$(add)` implies "create" — which is what actually happens. The user selects an agent from a QuickPick and a new terminal session is created. That's an "add" operation.

4. **No `$(play)` + `$(add)` dual icons.** Having both would raise the question "what's the difference?" The answer is nothing — they'd do the same thing. One icon, one meaning.

### Why `$(link-external)` stays

`$(link-external)` is VS Code's established convention for "open external URL" (used in Settings UI, built-in Git, etc.). Users already understand it. The `$(link-external)` collision with "Open in Squad UI" on squad nodes is a non-issue — squad nodes live in the Agents tree, not the Work Items or PRs trees. A user never sees both meanings simultaneously.

### Why only 2 inline icons

VS Code tree items get visually cluttered past 2-3 inline icons. Two icons keeps the layout clean and scannable. All supplementary actions (Go to Work Item, Go to PR) belong in the context menu where there's room for labels.

## Spec

### Inline Icons — Work Item Leaf Nodes

Applies to `viewItem =~ /^(work-item|ado-work-item|ado-parent-item)$/`

| Position | Icon | Command | Tooltip |
|---|---|---|---|
| `inline@0` | `$(add)` | `editless.launchFromWorkItem` | Launch with Agent |
| `inline@1` | `$(link-external)` | `editless.openInBrowser` | Open in Browser |

### Inline Icons — PR Leaf Nodes

Applies to `viewItem =~ /^(pull-request|ado-pull-request)$/`

| Position | Icon | Command | Tooltip |
|---|---|---|---|
| `inline@0` | `$(add)` | `editless.launchFromPR` | Launch with Agent |
| `inline@1` | `$(link-external)` | `editless.openInBrowser` | Open in Browser |

### Visual Layout (left → right)

```
Bug #1234: Fix login timeout     [+] [↗]
PR #567: Add retry logic          [+] [↗]
```

`[+]` = `$(add)` — primary action, leftmost, closest to label
`[↗]` = `$(link-external)` — secondary action, rightmost

### Command Icon Changes

Update the command definition for `editless.launchFromWorkItem` and `editless.launchFromPR`:

| Command | Current Icon | New Icon |
|---|---|---|
| `editless.launchFromWorkItem` | `$(play)` | `$(add)` |
| `editless.launchFromPR` | `$(play)` | `$(add)` |

### Position Changes

| Item | Current | New |
|---|---|---|
| Work item "Open in Browser" | `inline` (no position) | `inline@1` |
| Work item "Launch with Agent" | `inline@10` | `inline@0` |
| PR "Open in Browser" | `inline` (no position) | `inline@1` |
| PR "Launch with Agent" | `inline@10` | `inline@0` |

## Context Menu

The right-click menu complements the inline icons with labeled entries. Every inline action should also appear in the context menu (discoverability — users who don't recognize an icon can right-click to find the same action with a text label).

### Work Item Context Menu

| Group | Command | Label |
|---|---|---|
| `work-item@1` | `editless.launchFromWorkItem` | Launch with Agent |
| `work-item@2` | `editless.openInBrowser` | Open in Browser |
| `work-item@3` | `editless.goToWorkItem` | Go to Work Item |

### PR Context Menu

| Group | Command | Label |
|---|---|---|
| `pull-request@1` | `editless.launchFromPR` | Launch with Agent |
| `pull-request@2` | `editless.openInBrowser` | Open in Browser |
| `pull-request@3` | `editless.goToPRInBrowser` | Go to PR |

### Context Menu vs Inline Decision

| Action | Inline? | Context Menu? | Why |
|---|---|---|---|
| Launch with Agent | ✅ | ✅ | Primary action — needs maximum discoverability |
| Open in Browser | ✅ | ✅ | Common action — icon is universally understood, but label helps |
| Go to Work Item / Go to PR | ❌ | ✅ | Tertiary action — would clutter inline; context menu is sufficient |

## Migration Notes

- The `editless.launchFromWorkItem` and `editless.launchFromPR` command definitions change their `icon` property from `$(play)` to `$(add)`.
- The `view/item/context` menu entries change their `group` positions as specified above.
- No new commands are needed. No command IDs change.
- The `$(play)` icon is fully removed from the work items and PR views.

## Consistency Matrix

| View | Primary Action | Icon | Secondary Action | Icon |
|---|---|---|---|---|
| Agents tree (squad/agent) | Launch Session | `$(add)` | — | — |
| Work Items tree (leaf) | Launch with Agent | `$(add)` | Open in Browser | `$(link-external)` |
| PRs tree (leaf) | Launch with Agent | `$(add)` | Open in Browser | `$(link-external)` |

All three views now use `$(add)` for "create a session." One icon vocabulary across the entire extension.

---

# Default Copilot CLI Agent

**Date:** 2026-02-22  
**Author:** Morty (Extension Dev)  
**Issue:** #337  

## Decision

The EditLess tree always shows a built-in "Copilot CLI" entry at the top, even when no squads or agents are registered. This entry launches the generic Copilot CLI without a `--agent` flag. It cannot be hidden or deleted.

## Rationale

- New users should never see an empty sidebar — the default agent provides an immediate "launch" action.
- The old welcome state (Welcome to EditLess / Add squad / Discover agents) is replaced — the default agent IS the onboarding entry point.
- Uses `contextValue: 'default-agent'` to get the launch button but NOT delete/edit/hide context menu actions.

## Implementation

- `DEFAULT_COPILOT_CLI_ID = 'builtin:copilot-cli'` exported from `editless-tree.ts`
- Synthetic `AgentTeamConfig` created on-the-fly in `launchSession` handler (not persisted to registry)
- `launchCommand` set to `getCliCommand()` (just `copilot`) so no `--agent` flag is appended
- Terminal sessions tracked under the sentinel squad ID like any other agent

---

# Decision: Defer orphan check until terminal matching settles

**Date:** 2026-02-23  
**Author:** Morty  
**Status:** Implemented  

## Context

On window reload, `reconcile()` registers a debounced `onDidOpenTerminal` listener (200ms) because VS Code provides terminals lazily. But the orphan check in `extension.ts` ran synchronously right after `reconcile()`, before late-arriving terminals could be matched. This caused false-positive "Resume All" toasts that launched duplicate terminals.

## Decision

Added `TerminalManager.waitForReconciliation()` — a Promise that resolves when either (a) all pending saved entries are matched, or (b) a 2s max timeout expires. Extension.ts now defers the orphan toast behind this promise.

## Impact

- Any future code that reads `_pendingSaved` or `getOrphanedSessions()` after `reconcile()` should await `waitForReconciliation()` first
- The `dispose()` method cleans up the reconciliation timer
- Test mocks for TerminalManager must include `waitForReconciliation: vi.fn().mockResolvedValue(undefined)`

---

# Decision: Remove "Resume All" toast from activation

**Author:** Morty (Extension Dev)  
**Date:** 2025-07-25  
**Requested by:** Casey Irvine  

## Context

On activation, EditLess showed a toast notification when orphaned sessions were found, offering "Resume All" / "Dismiss" buttons. Casey flagged two problems:

1. **UX pressure** — a toast creates urgency for immediate action, which isn't appropriate during startup.
2. **Race conditions** — the toast could fire before terminal reconciliation fully settled, leading to stale orphan counts.

## Decision

- Removed the `waitForReconciliation()` → `showInformationMessage` block from `activate()` in `src/extension.ts`.
- Orphaned sessions now appear silently in the tree view. Terminals that reconnect during reconciliation auto-reattach. Users can resume individual orphans from the tree or use the `editless.relaunchAllOrphans` command from the palette.
- The `waitForReconciliation()` method is preserved in `terminal-manager.ts` for future use.
- The `editless.relaunchAllOrphans` command registration is preserved (tree context menu / command palette).

## Impact

- No user-facing notification on activation. Orphans are discoverable via the tree view.
- All 793 tests pass. Lint clean.

---

# Universe Auto-Detection from Casting Registry

**Author:** Morty  
**Date:** 2026-02-23  
**Issue:** #393  

## Decision

When `parseTeamMd()` returns `universe: 'unknown'` (no `**Universe:**` marker in team.md), discovery now falls back to reading `.squad/casting/registry.json` (or `.ai-team/casting/registry.json`) and extracting the `universe` field from the first active agent entry.

## Detection Priority

1. `**Universe:**` in team.md — explicit user override, highest priority
2. `.squad/casting/registry.json` universe field — automatic fallback
3. `'unknown'` — final fallback when neither source has a universe

## Architecture

- `parseTeamMd()` remains pure (text-only, no filesystem access)
- New `readUniverseFromRegistry(squadPath)` handles the file read
- Fallback logic lives at caller sites: `discoverAgentTeams()`, `autoRegisterWorkspaceSquads()`, `discoverAll()`
- Checks `.squad/` before `.ai-team/` (same priority order as `resolveTeamMd`)
- Only reads from active agents (`status: 'active'`)
- Errors handled gracefully — malformed/missing files silently fall through to 'unknown'

## Impact

All discovery paths (scan, auto-register, unified) now consistently resolve the universe. Squads with casting data no longer show "unknown" in the tree view.

---

## The Recommendation

**Use regular terminal + events.jsonl + --resume. Do NOT build the pseudoterminal.**

### Rationale

1. **State detection is solved.** `events.jsonl` file watching gives you real-time state (idle/working/tool-running) without parsing terminal output. It's structured, version-stable, and doesn't break on CLI output changes.

2. **Session resumption is solved.** `--resume <uuid>` pre-generated before launch means sessions don't need post-hoc detection from CLI output. Session IDs come from EditLess, not pattern-matched from stdout.

3. **Hide/show behavior is already implemented.** EditLess TerminalManager reconnects orphaned terminals by name — this works with regular terminals and requires zero pseudoterminal code.

4. **Pseudoterminal is a net loss in every dimension:**
   - Loses shell features (tab completion, history, aliases)
   - Adds I/O parsing maintenance (fragile, breaks on CLI format changes)
   - Duplicates state detection (`events.jsonl` already does this)
   - No UX win over regular terminal + hide/show reconnect
   - Is a dead end when `--acp` ships (will be ripped out and replaced)

5. **Cost/benefit is terrible.** Pseudoterminal spiking cost: ~16 hours of engineering. Actual benefits: zero (everything it provides is already solved or worse than the alternative). This is the definition of sunk-cost thinking — don't throw good money after bad.

6. **ACP is the right investment.** When Copilot SDK ships `--acp` support, you'll want to build an ACP client (WebSocket-based, fully structured). Pseudoterminal skills don't transfer; resources spent here are wasted.

### What To Do Instead

1. **Confirm events.jsonl stability.** Have Jaguar validate that `events.jsonl` schema is stable across CLI versions and won't change without warning. If it's not stable, that's a blocker for both approaches.

2. **Land the regular terminal + --resume infrastructure.**
   - Extend TerminalManager to accept optional `agentSessionId` (use `--resume` if provided)
   - Add env injection (`EDITLESS_AGENT_SESSION_ID`) for CLI to detect relaunch
   - Test reconnect flow: close terminal → reopen → sendText `--resume <id>` → terminal resumes

3. **Build the events.jsonl watcher** (low cost, high value):
   - Poll `~/.copilot/session-state/<sessionId>/events.jsonl` every 500-1000ms
   - Parse for state markers: `"idle"`, `"working"`, `"tool-running"`
   - Update EditLess UI status in real-time (don't wait for terminal output)
   - This is what Casey liked about the pseudoterminal — live status updates — but it's a file watcher, not I/O parsing.

4. **Archive the pseudoterminal spike.** Don't ship it. Document in #321 that spike was explored, is architecturally unnecessary given `events.jsonl`, and would become dead code when `--acp` ships. This is a reasonable decision, not a failure.

5. **Plan for --acp.** Once Copilot SDK stabilizes `--acp`, create an issue for ACP client integration. That's where the real value is.

---

## Decision Implications

- **Code:** Delete `copilot-pseudoterminal.ts`. It's 284 lines of perfectly-written code that we don't need.
- **Testing:** events.jsonl file watching (new) needs 5-6 test cases. Much cheaper than pseudoterminal tests.
- **Documentation:** Update terminal integration docs to explain `events.jsonl` as the source of truth for state, not terminal output parsing.
- **Roadmap:** Add ACP client work to v0.3 backlog (defer pending Copilot SDK stability).

---

## Decision Record

**Decided:** Rick (Lead)  
**Approved by:** —  
**Date:** 2026-02-21  
**Status:** ✅ Recommended (awaiting Casey approval)

If Casey agrees, this should be immediately documented in issue #321 to unblock the team.

---

## 2026-02-21: Analysis: Pseudoterminal + --resume + events.jsonl + --acp Integration

# Analysis: Pseudoterminal + --resume + events.jsonl + --acp Integration

**Date:** 2026-02-21  
**Author:** Jaguar (Copilot SDK Expert)  
**Requested by:** Casey Irvine  
**Context:** Evaluating whether pseudoterminal architecture can coexist with Copilot CLI's structured integration paths.

---

## Question 1: Pseudoterminal + --resume + events.jsonl — Would This Work?

### The Combination
- **Pseudoterminal** (EditLess owns process lifecycle via `child_process.spawn()`)
- **--resume <uuid>** (CLI flag to start new session with known ID)
- **events.jsonl** (file-based status stream watched by EditLess)

### Analysis: ✅ YES, No Conflicts

**Architecture:**
```
EditLess Extension
  ├─ Generate UUID before spawn
  ├─ Pass to CLI: copilot --resume <uuid> --no-alt-screen --no-color
  ├─ Spawn as child process (pty gives EditLess piped stdout/stderr)
  ├─ Watch ~/.copilot/session-state/<uuid>/events.jsonl
  ├─ Parse events.jsonl for state transitions
  └─ Render in extension UI (no terminal rendering needed)
```

**Why it works:**
1. **No lifecycle conflicts**: `--resume` just tells CLI "use this UUID for session dir naming" — it doesn't care about process management. PTY handles process.
2. **No state conflicts**: `--resume` uses the same `workspace.yaml` + `events.jsonl` storage that EditLess already watches. The CLI writes to files; EditLess watches files. Independent concerns.
3. **events.jsonl is robust**: Pre-generated UUID ensures EditLess knows the session ID before launch, eliminating the fragile regex-on-terminal-output approach that Morty flagged.
4. **Both flags independent**: 
   - `--resume` controls session naming
   - `--no-alt-screen` disables terminal graphics (helps with PTY)
   - `--stream off` ensures events.jsonl is the source of truth, not stdout
   - None interfere with each other

**Proven flags from CLI help:**
- `--resume [sessionId]` — "start a new session with a specific UUID"
- `--stream <mode>` — "on|off" to control streaming
- `--no-alt-screen` — explicitly disable terminal alt buffer (compatible with PTY)

---

## Question 2: Pseudoterminal + --acp — Would This Replace or Coexist?

### What --acp Actually Does
Based on research and CLI help:

**--acp starts CLI as Agent Client Protocol server:**
```bash
copilot --acp --stdio           # JSON-RPC over stdin/stdout
copilot --acp --port 3000       # TCP socket mode
```

**Capabilities (per ACP spec):**
- Sends prompts via JSON-RPC messages
- Receives structured responses (code, files, edits, permissions)
- **Session management**: Creates isolated sessions, manages lifecycle
- **Real-time streaming**: Agent sends incremental updates as NDJSON
- **Tool execution control**: Client can approve/deny tool calls
- **No visible terminal needed**: All I/O is JSON-RPC, not a terminal UI

**Key difference from interactive mode:**
- Interactive mode: User sees terminal, types prompts, CLI outputs to terminal
- ACP mode: Client library sends JSON, gets JSON back. **Process is invisible to user.**

### Answer: ⚠️ --acp REPLACES, not coexists with terminal

**You cannot do both:**
```bash
# ❌ INVALID
copilot --acp --resume <uuid>  # These are mutually exclusive
```

**Why replacement, not coexistence:**
1. **Different I/O models**: 
   - Terminal mode: stdout/stderr are user-visible
   - ACP mode: stdout/stderr are protocol messages (NDJSON, not user text)
2. **Session lifecycle differs**:
   - Terminal: User controls (Ctrl+C, close tab, etc.)
   - ACP: Client protocol controls (via JSON messages)
3. **CLI makes a choice**: When `--acp` is passed, CLI enters server loop, not terminal loop

**Architectural implication:**
- **Terminal + --resume + events.jsonl**: Pseudoterminal controls process, CLI runs in interactive-like mode (even if hidden), writes events
- **ACP (--acp --stdio)**: Client library owns process, sends/receives JSON, no terminal concept

---

## Question 3: The Hide/Show UX — Does Pseudoterminal Give Us Something Regular Terminal Doesn't?

### The Observation
> "When you close the terminal panel, the CLI process keeps running in the background. Close terminal → reopen shows same session, doesn't relaunch CLI."

### Real VS Code Terminal Behavior

**Current EditLess (using `vscode.window.createTerminal`):**
- User closes terminal tab → `onDidCloseTerminal` fires → EditLess reconciliation logic
- **Process status**: Likely **KILLED** by VS Code (process termination on close is standard)
- **Proof**: Per VS Code docs, closing terminal sends SIGTERM to shell process, then forcibly kills if needed

**With Pseudoterminal (`vscode.window.createExtensionTerminal`):**
- EditLess owns process lifecycle explicitly
- User closes terminal UI → terminal closed, but EditLess **can keep process running** if it chooses
- User reopens vs. new terminal → EditLess can reconnect to existing process
- **Actual difference**: Pseudoterminal lets ExtensionTerminal UI disconnect from process without killing it

### Answer: ✅ YES, Pseudoterminal Gives Real UX Advantage

**What you gain with pseudoterminal:**
```
Close terminal panel
  ↓
- Old behavior: Process dies, CLI session ends
- Pseudoterminal: Process keeps running (EditLess didn't send kill)
  
Reopen terminal
  ↓
- Old behavior: Relaunch CLI with --resume (start new interactive session)
- Pseudoterminal: Reconnect to existing process, same PID still running
```

**Why this matters for Copilot CLI:**
- `--resume` *starts* a new interactive session (even with same UUID, it's a new invocation)
- Pseudoterminal process can keep running through UI hide/show cycles
- One continuous Copilot CLI process instead of repeated relaunches

**But there's a catch:**
- EditLess still needs `isTransient` terminals (EditLess decision from 2026-02-19)
- With `isTransient: true`, VS Code clears terminal from sidebar but process may or may not survive depending on OS
- Pseudoterminal doesn't guarantee process persistence; you'd need additional logic to prevent kill signals

---

## Question 4: What Does Copilot CLI Team Actually WANT Extensions to Do?

### Evidence from CLI Design

**1. Session ID visibility:**
- ❌ NOT in terminal output (banner is cosmetic only)
- ✅ YES in filesystem: `workspace.yaml` + `events.jsonl`
- **Signal**: CLI team assumes clients will watch the filesystem, not parse terminal output

**2. Flag philosophy:**
- `--resume <uuid>` exists for "pre-determined session ID" use cases
- `--additional-mcp-config <json>` allows injecting extension context as MCP server
- **Signal**: CLI team expects extensions to launch CLI programmatically with specific flags, not via user terminal

**3. Structured integration:**
- `--acp --stdio` (JSON-RPC over stdio)
- `--stream on|off` (control event stream)
- `--log-level`, `--config-dir`, `--log-dir` (extension-friendly logging)
- **Signal**: CLI is designed for programmatic integration, not just user-facing terminal

**4. No `--ide` or `--json` flags:**
- ❌ NO `--ide` flag (no special IDE mode)
- ❌ NO `--json` machine-readable output
- ✅ INSTEAD: `--acp` for structured integration, `events.jsonl` for state
- **Signal**: CLI team chose filesystem + protocol, not terminal-based hacks

### Conclusion: **Two Preferred Paths, Not Three**

**Path A: Terminal + Filesystem (Current Master)**
```
EditLess launches Copilot CLI interactively in VS Code terminal
Watches ~/.copilot/session-state/ for session state
User sees CLI output, types prompts interactively
Process tied to terminal lifecycle
```
**Pros:** Simple, user sees CLI, standard terminal features (completion, history)
**Cons:** Process dies when terminal closes, no programmatic control

**Path B: ACP Protocol (Future-Proof)**
```
EditLess launches: copilot --acp --stdio
Sends prompts via JSON-RPC client library
Receives responses as structured JSON
EditLess renders in custom UI (or passes through as text)
Process lifecycle controlled by ExtensionTerminal or headless subprocess
```
**Pros:** Maximum programmatic control, structured data, testable
**Cons:** Requires ACP client library integration, less visible to user

**Path C: Pseudoterminal (Hybrid, Not Preferred)**
```
EditLess launches copilot in pseudoterminal (via child_process.spawn)
Watches events.jsonl for state
Optionally injects status overlays into terminal output
Process lifecycle fully controlled by EditLess
```
**Pros:** Richer state detection than terminal output, process persistence
**Cons:** High complexity, not a stated first-class use case, duplicates ACP goals

### What CLI Team SEEMS to Want
✅ Use `--resume <uuid>` to control session IDs
✅ Watch `~/.copilot/session-state/` for state
✅ Use `--acp` for deep integration (not just terminal launch)
❌ Don't parse terminal output (it's not a contract)
❌ Don't assume session IDs appear in terminal (they don't)

**Grain direction:** You're going with the grain if you:
1. Pre-generate UUID, pass to CLI
2. Watch filesystem for state
3. Consider --acp for v0.3 or v0.4 phase

---

## Final Verdict

| Combination | Works? | Conflicts? | Recommended? |
|---|---|---|---|
| **PTY + --resume + events.jsonl** | ✅ YES | ❌ NONE | 🟡 Yes (for Phase 2) |
| **PTY + --acp** | ❌ NO | ✅ MUTUALLY EXCLUSIVE | ❌ No, choose one |
| **Regular terminal + --resume + events.jsonl** | ✅ YES | ❌ NONE | ✅ Yes (current) |
| **ACP (--acp --stdio)** | ✅ YES | ❌ NONE | 🟡 Yes (Phase 3+) |

### Casey's Question: "Do we gain both best of both worlds?"

**Short answer:** Not quite. You get two options:

1. **Keep current approach (Path A)**: Regular terminal, works now, limited to what you can parse
2. **Upgrade to ACP (Path B)**: Structured integration, future-proof, requires library work
3. **Pseudoterminal (Path C)**: Rich state detection + process control, but CLI team didn't design for this, adds complexity without clear win over ACP

**The "best of both worlds" is actually ACP (Path B):** You get structured state data (like pseudoterminal promises) *and* programmatic control, all designed by CLI team for extension integration.

---

## Recommendations for EditLess Roadmap

1. **Phase 1 (current)**: Keep terminal + --resume + events.jsonl. It works, proven.
2. **Phase 2 (optional)**: Add pseudoterminal option if you want process persistence UX. Use `--resume <uuid>` + events.jsonl for state. But don't merge Morty's spike without integration; it's incomplete.
3. **Phase 3 (future)**: Evaluate ACP. This is what CLI team designed for. May eliminate need for pseudoterminal entirely.

**Don't pursue:** Mixing pseudoterminal + --acp (they're mutually exclusive).


---

## Jaguar ACP Deep Dive (Phase M5, 2026-02-22)

**Author:** Jaguar (Copilot SDK Expert)

Definitive analysis of the Agent Client Protocol (ACP) for EditLess integration. Key findings:

- ACP is a JSON-RPC 2.0 standard (not GitHub-proprietary) for editor ↔ AI agent communication
- Copilot CLI supports ACP in public preview as of Jan 28, 2026
- ACP replaces the terminal UI entirely (headless subprocess with structured JSON-RPC communication)
- Provides typed tool call content, permission interception, plan visibility, and session loading
- **Recommendation:** Phase 1 (current) use Option A (Terminal + events.jsonl). Phase 2+ consider Option B (Full ACP) if EditLess evolves into full IDE panel ownership.

**Sources:** ACP Spec, GitHub Docs, live testing with Copilot CLI v0.0.414

---

## ACP Model/Mode Switching — Log Only for Now (2026-02-23)

**Author:** Jaguar

UI dropdowns for model and mode selection are wired but protocol calls are deferred. session/new returns available models/modes, but no dedicated session/changeModel or session/changeMode method exists in current ACP spec.

**Decision:** Log selection changes to output channel; implement switching once mechanism is discovered in future ACP SDK versions (pre-1.0 protocol still evolving).

---

## Phase 2 Test Coverage Gaps — 6 Tests Required (2026-02-20)

**Author:** Meeseeks (Tester)

Existing 18 Phase 2 tests are well-structured but miss critical session watcher lifecycle coverage.

**Required additions:**
- P0: launchTerminal calls watchSession with pre-generated UUID
- P0: Watcher cleanup on terminal close
- P0: dispose() clears all session watchers  
- P0: Watcher wiring in econnectSession and elaunchSession
- P1: Custom config.launchCommand path with --resume UUID append
- P1: Malformed JSON graceful degradation in watchSession

**Rationale:** FS watchers are a known source of resource leaks if dispose isn't called. Watcher lifecycle is the core new behavior in Phase 2.

---

## Windows Shell Quoting in ProcessPool Tests (2026-02-20)

**Author:** Meeseeks

When writing integration tests for ProcessPool (uses spawn() with shell: true), avoid console.log() in -e/-p arguments and single-quoted literals. On Windows, shell: true routes through cmd.exe which strips single quotes and interprets parentheses as grouping.

**Safe patterns:** 
ode --version, 
ode -e "process.exit(42)", 
ode -p "'string'" does NOT work

---

## ACP Terminal Operations Use child_process.spawn, Not VS Code Terminals (2026-02-22)

**Author:** Morty

ACP 	erminal/create, 	erminal/output, 	erminal/kill implemented with child_process.spawn() in ProcessPool class, not VS Code Terminal API.

**Rationale:** ACP requires programmatic stdout/stderr capture and exit code tracking. VS Code Terminal API is a rendering surface only.

**Impact:** ProcessPool is Disposable; DefaultAcpRequestHandler owns instance; xtension.ts calls handler.dispose() on ACP panel close. File writes auto-approve for now (spike scope).

---

## Terminal UUID Pre-generation Pattern (2026-02-21)

**Author:** Morty

Implemented across issues #323, #324, #326:

**UUID Pre-generation:** Generate crypto.randomUUID() before launching terminal; pass to CLI via --resume <uuid>. Eliminates race conditions and orphan detection. Immediate session tracking from terminal creation.

**Terminal Options:** isTransient: true (prevents zombie terminals), iconPath: new vscode.ThemeIcon('terminal'), env vars EDITLESS_TERMINAL_ID, EDITLESS_SQUAD_ID, EDITLESS_SQUAD_NAME

**File Watching:** SessionContextResolver.watchSession(sessionId, callback) uses s.watch() with 100ms debouncing, tail-reads events.jsonl, auto-retries if file doesn't exist (1s interval). Returns VS Code Disposable.

**Stable Focus:** ocusTerminal() accepts 	erminal | string. String ID lookups find terminal from map, validates existence before showing.

**Backward Compatibility:** detectSessionIds() retained for pre-UUID terminals.

---

## Terminal Constants Bumped (#328, 2026-02-21)

**Author:** Morty

| Constant | Old | New | Rationale |
|---|---|---|---|
| EVENT_CACHE_TTL_MS | 3s | 10s | Reduce events.jsonl disk I/O |
| STALE_SESSION_DAYS | 7 | 14 | Sessions resumable longer |
| MAX_REBOOT_COUNT | 2 | 5 | Orphans survive more restarts |
| isWorkingEvent() types | 5 | 9 | Added assistant.thinking, assistant.code_edit, tool.result, session.resume |

Note: IDLE_THRESHOLD_MS and STALE_THRESHOLD_MS removed in PR #354.

---

## Phase 2 Code Review — APPROVE with Advisory Notes (2026-02-21)

**Author:** Rick (Lead)

**Approved:** UUID pre-generation, TerminalOptions, focusTerminal string overload, fs.watch lifecycle, buildCopilotCommand integration

**Advisory (non-blocking):**
1. Soft validation in elaunchSession — shows error but continues; consider early return
2. Unbounded retry in watchSession.setupWatch() — retries 1s forever; recommend max ~30 retries or exponential backoff
3. watchSessionDir is dead code (not called from production; acceptable as Phase 3 forward-looking API)

**Platform note:** s.watch behavior differs (macOS kqueue, Linux inotify, Windows ReadDirectoryChangesW); 100ms debounce mitigates.

---

## Empty State & Onboarding UX (2026-02-22)

**Author:** Summer

Three distinct empty states implemented:

1. **First-time / empty workspace:** $(rocket) "Welcome to EditLess" + $(add) "Add a squad directory" + $(search) "Discover agents"
2. **All items hidden:** $(eye-closed) "All agents hidden" (power-user message, never on first launch)
3. **Squad with zero sessions:** $(info) "No active sessions"

**Icon conventions:** ocket = welcome, dd = create, search = discover, info = hint, ye-closed = hidden (power user)

**Rationale:** First-time user sees clear, clickable actions; returning users see appropriate context for their state.

---

## Unified Work Item Types (2026-02-22)

**Author:** Rick (Lead)
**Status:** Accepted

**Context:** We support both Azure DevOps (Work Items) and GitHub (Issues). ADO has native "Types" (Bug, User Story, Task), while GitHub uses labels.

**Decision:** We will treat GitHub labels starting with `type:` as equivalent to ADO Work Item types.
- `type:bug` ≈ Bug
- `type:feature` ≈ Feature/User Story
- `type:task` ≈ Task

The UI will present a unified "Type" filter that maps to these underlying representations.

**Consequences:**
- Users must follow `type:{name}` convention in GitHub for filters to work.
- We standardized on "Labels" as the UI term for tags/labels across both providers.
### 2026-02-22: Squad Ecosystem Integration Roadmap — 3-Phase Plan

**Author:** Rick (Orchestration)  
**Date:** 2026-02-22  
**Status:** Planned

## Decision

Three-phase integration plan (12 GitHub issues) to position EditLess as the universal terminal orchestration layer for Squad ecosystem.

**Phase 1 (Foundation, v0.2.0):** Session modality types, Squad CLI builder, launch commands, attention state, icons — 5 issues unblocked.  
**Phase 2 (SDK Research, v0.2.x):** Copilot SDK spike, session discovery — 2 issues.  
**Phase 3 (Blocked):** EventBus, RalphMonitor, HookPipeline, Ralph integration — 4 issues in backlog pending Brady's SDK.

**Key Insights:** Session modality awareness + file-based events unblock Phase 1. EditLess becomes universal terminal layer for all Squad modalities (CLI, SDK, native-chat).

---

### 2026-02-22: Squad CLI/SDK Integration Architecture

**Author:** Squanchy (Architecture)  
**Date:** 2026-02-22  
**Status:** Planned

## Decision

Squad CLI/SDK are process orchestration (not terminal management). Design extends TerminalInfo with modality awareness and event subscriptions.

**Session Modality Type:** 'copilot-standard' | 'squad-loop' | 'squad-watch' | 'squad-interactive' | 'unknown'

**Event Consumption:** File-based events via .squad/events-realtime.jsonl (Option C) — aligns with Squad architecture, unblocks Phase 1, swappable when SDK ships real EventBus.

**Actionable NOW (7 hours):** Modality detection + file watcher + Ralph badge detection. No SDK required.

---

### 2026-02-22: SquadUI Integration Surface Analysis

**Author:** Unity (Integration)  
**Date:** 2026-02-22  
**Status:** Planned

## Decision

SquadUI v0.7.3 surface sufficient for Tier 1 integration (4 hours, v0.1). Keep tree views separate (EditLess terminal-centric, SquadUI team-centric). Lazy sync for root coordination.

**Tier 1 NOW:** Charter deep-link, refreshTree on selection, openDashboard root-aware, shared globalState squad.currentRoot.

---

### 2026-02-22: User Directive — Brady's Multi-Frontend Vision

**From:** Casey Irvine (2026-02-22T03:39Z)  
**What:** Brady confirmed multi-frontend approach. EditLess integrates Squad CLI as launchable session type + SquadUI as complementary sidebar. @github/copilot-sdk v0.1.25 is JSON-RPC foundation.

---
### 2026-02-22T03:20:00Z: User directive
**By:** Casey Irvine (via Copilot)
**What:** Be mindful of work items that look like they've already been tackled. Don't put changes on top of changes if the existing code in master already handles the issue. Verify what's already fixed before making new changes.
**Why:** User request — captured for team memory. Several v0.1.1 issues were already partially or fully fixed (as discovered during triage). Agents should check existing code before implementing, to avoid redundant or conflicting changes.

---
### 2026-02-22T03:51:00Z: User directive
**By:** Casey Irvine (via Copilot)
**What:** EditLess is a window/tab/terminal manager — NOT a dashboard or information display. SquadUI should handle the dashboard, team info, decisions view, etc. EditLess just manages what's running where and which tabs need attention. "I really just want to be like a window kind of manager. I don't necessarily want to be sending a bunch of information back and forth."
**Why:** User directive — scopes EditLess's role in the Squad ecosystem


---

# Decision: Context Value Naming Convention for Tree View Nodes

**Date:** 2026-02-22  
**Author:** Rick  
**Context:** Architecture review of hierarchical filter implementation (#390)  
**Status:** Observation / Recommended Convention

## Background

The hierarchical filter implementation (commits 873c8fe→98ebb34) introduced backend-aware context values for Work Items and PRs tree nodes:

- **Work Items:** `ado-backend`, `github-backend`, `ado-org`, `ado-project`, `github-org`, `github-repo`
- **PRs:** `ado-pr-backend`, `github-pr-backend`, `ado-pr-org`, `ado-pr-project`, `github-pr-org`, `github-pr-repo`

The `-pr-` infix prevents collisions when the same logical node type (e.g., "backend") appears in different tree views.

## Decision

**Adopt a naming convention for context values when multiple tree views need similar hierarchical structures:**

```
{source}-{domain}-{level}
```

Where:
- `source` = backend provider (e.g., `ado`, `github`)
- `domain` = tree-specific namespace (e.g., `pr`, `workitem`, omitted if unique)
- `level` = hierarchy level (e.g., `backend`, `org`, `project`, `repo`)

**Examples:**
- Work Items (domain omitted): `ado-backend`, `github-org`, `ado-project`
- PRs: `ado-pr-backend`, `github-pr-org`
- Future (hypothetical) commits tree: `ado-commit-backend`, `github-commit-repo`

## Rationale

1. **Collision Prevention:** package.json `when` clauses match context values across all tree views. Without namespacing, `ado-backend` in Work Items would conflict with `ado-backend` in PRs.

2. **Pattern Consistency:** When adding new hierarchical trees, developers can follow this convention without reverse-engineering existing code.

3. **Regex Maintainability:** package.json uses regexes like `/^(ado|github)-pr-(backend|org|project|repo)$/` to match nodes. The convention makes these patterns predictable.

## Implementation Notes

- Context values set via `item.contextValue = 'ado-pr-backend'` in tree provider's `getChildren()`.
- package.json contributions use regex patterns for inline menus:
  ```json
  "when": "view == editlessPRs && viewItem =~ /^(ado|github)-pr-(backend|org|project|repo)$/"
  ```

## Non-Impact

This is **not a breaking change**. Existing context values don't need refactoring — they already follow this pattern. This decision documents the implicit convention for future development.

## References

- Issue #390 — Hierarchical filter implementation
- `src/work-items-tree.ts` lines 352, 368, 391, 395
- `src/prs-tree.ts` lines 315, 331, 349, 369
- `package.json` lines 515, 530 (menu contributions)

## Launch Helper Extraction Pattern

**Status:** Implemented  
**Date:** 2026-02-21  
**Context:** Issue #337 — Launch progress indicator  
**Author:** Morty (Extension Dev)

### Decision

Extracted duplicated terminal launch logic from launchFromWorkItem and launchFromPR into shared utilities in src/launch-utils.ts.

### Implementation

Created three exports:

1. **MAX_SESSION_NAME constant** — Value: 50. Single source of truth for name length limit.

2. **uildSessionName(rawName: string): string** — Pure function that handles truncation logic:
   - Returns raw name unchanged if ≤ MAX_SESSION_NAME
   - Truncates at last space before limit (smart word boundary)
   - Falls back to hard truncation at limit if no space exists
   - Appends ellipsis character (…) to truncated names

3. **launchAndLabel(terminalManager, labelManager, cfg, rawName): Terminal** — Orchestration function:
   - Calls uildSessionName() to process the raw name
   - Launches terminal via 	erminalManager.launchTerminal()
   - Sets label via labelManager.setLabel()
   - Returns the created terminal

### Rationale

- **DRY principle**: Eliminated 12 identical lines × 2 locations = 24 lines of duplication
- **Single responsibility**: uildSessionName() has one job, testable in isolation
- **Type safety**: Proper TypeScript types for all parameters
- **Maintainability**: Future changes to truncation logic only need to be made once
- **Testability**: 14 comprehensive test cases covering edge cases

### Usage Pattern

Both launchFromWorkItem and launchFromPR now:
1. Build the raw name with the appropriate prefix (# or PR #)
2. Call launchAndLabel(terminalManager, labelManager, cfg, rawName)

This pattern should be applied to any future commands that launch terminals with custom names.

### Testing

All 774 tests pass, including 14 new tests for the extracted utilities covering:
- Short names (no truncation)
- Long names (truncation at word boundary)
- Long names without spaces (hard truncation)
- Ellipsis character validation
- Real-world work item and PR name scenarios
- Integration with TerminalManager and SessionLabelManager

### Files Changed

- **Created:** src/launch-utils.ts (51 lines)
- **Created:** src/__tests__/launch-utils.test.ts (164 lines)
- **Modified:** src/extension.ts (reduced by 20 lines)

---

## Worktree Handoff Architecture (User Directive)

**Date:** 2026-02-22T19:14:56Z  
**By:** Casey Irvine (via Copilot)  
**Status:** Deferred to bradygaster/squad

### Decision

Worktree handoff (auto-creating a worktree when starting work and handing off squad state) should be a Squad CLI feature, NOT an EditLess feature. EditLess should follow squad's state, not own the worktree lifecycle.

### Rationale

- User request — captured for team memory
- EditLess role: Window/tab/terminal manager only
- Squad CLI role: Lifecycle management and state orchestration

### Action Items

1. File as a feature request on bradygaster/squad if it doesn't exist
2. EditLess will integrate Squad CLI worktree output when available

---

## 2026-02-22T18:43Z: User Directive — Default Copilot CLI Agent

**By:** Casey Irvine (via Copilot)  
**Status:** User request — captured for team memory

### Decision

EditLess should always show a default "Copilot CLI" agent in the tree, even with no squads/agents configured. This is the generic Copilot CLI agent (no `--agent` flag). New users should never see an empty tree — they can launch a session parented to the generic agent without knowing about squads.

### Rationale

- User request — new users need an immediate launch point
- Removes friction for first-run experience

---

## 2026-02-22: Default Copilot CLI Agent

**Author:** Morty (Extension Dev)  
**Date:** 2026-02-22  
**Issue:** #337  
**Status:** Implemented

### Decision

The EditLess tree always shows a built-in "Copilot CLI" entry at the top, even when no squads or agents are registered. This entry launches the generic Copilot CLI without a `--agent` flag. It cannot be hidden or deleted.

### Rationale

- New users should never see an empty sidebar — the default agent provides an immediate "launch" action.
- The old welcome state (Welcome to EditLess / Add squad / Discover agents) is replaced — the default agent IS the onboarding entry point.
- Uses `contextValue: 'default-agent'` to get the launch button but NOT delete/edit/hide context menu actions.

### Implementation

- `DEFAULT_COPILOT_CLI_ID = 'builtin:copilot-cli'` exported from `editless-tree.ts`
- Synthetic `AgentTeamConfig` created on-the-fly in `launchSession` handler (not persisted to registry)
- `launchCommand` set to `getCliCommand()` (just `copilot`) so no `--agent` flag is appended
- Terminal sessions tracked under the sentinel squad ID like any other agent

---

## 2026-02-23: Universe Auto-Detection from Casting Registry

**Author:** Morty (Extension Dev)  
**Date:** 2026-02-23  
**Issue:** #393  
**Status:** Implemented

### Decision

When `parseTeamMd()` returns `universe: 'unknown'` (no `**Universe:**` marker in team.md), discovery now falls back to reading `.squad/casting/registry.json` (or `.ai-team/casting/registry.json`) and extracting the `universe` field from the first active agent entry.

### Detection Priority

1. `**Universe:**` in team.md — explicit user override, highest priority
2. `.squad/casting/registry.json` universe field — automatic fallback
3. `'unknown'` — final fallback when neither source has a universe

### Architecture

- `parseTeamMd()` remains pure (text-only, no filesystem access)
- New `readUniverseFromRegistry(squadPath)` handles the file read
- Fallback logic lives at caller sites: `discoverAgentTeams()`, `autoRegisterWorkspaceSquads()`, `discoverAll()`
- Checks `.squad/` before `.ai-team/` (same priority order as `resolveTeamMd`)
- Only reads from active agents (`status: 'active'`)
- Errors handled gracefully — malformed/missing files silently fall through to 'unknown'

### Impact

All discovery paths (scan, auto-register, unified) now consistently resolve the universe. Squads with casting data no longer show "unknown" in the tree view.

---

## 2026-02-24: Inline Action Icons for Work Items & PRs

**Author:** Summer (Product Designer)  
**Date:** 2026-02-24  
**Status:** Proposed  
**Requested by:** Casey Irvine

### Decision

Replace `$(play)` with `$(add)` for session launch on work item and PR leaf nodes. Keep `$(link-external)` for "Open in Browser." Two inline icons per item, consistent across both views.

### Rationale

#### Why `$(add)` replaces `$(play)`

1. **Consistency with main tree.** The Agents view already uses `$(add)` for "Launch Session" on squad/agent nodes (`inline@0`). Work items and PRs perform the same action — creating a new terminal session. Same action → same icon.

2. **Casey's explicit ask.** _"There's maybe like a plus button that's like 'add a session.'"_ The `$(add)` icon directly maps to this mental model: you're _adding_ a session to your workspace, not _playing_ a recording.

3. **Semantic accuracy.** `$(play)` implies "run" or "resume" — a state transition on something that already exists. `$(add)` implies "create" — which is what actually happens. The user selects an agent from a QuickPick and a new terminal session is created. That's an "add" operation.

4. **No `$(play)` + `$(add)` dual icons.** Having both would raise the question "what's the difference?" The answer is nothing — they'd do the same thing. One icon, one meaning.

#### Why `$(link-external)` stays

`$(link-external)` is VS Code's established convention for "open external URL" (used in Settings UI, built-in Git, etc.). Users already understand it. The `$(link-external)` collision with "Open in Squad UI" on squad nodes is a non-issue — squad nodes live in the Agents tree, not the Work Items or PRs trees. A user never sees both meanings simultaneously.

#### Why only 2 inline icons

VS Code tree items get visually cluttered past 2-3 inline icons. Two icons keeps the layout clean and scannable. All supplementary actions (Go to Work Item, Go to PR) belong in the context menu where there's room for labels.

### Spec

#### Inline Icons — Work Item Leaf Nodes

Applies to `viewItem =~ /^(work-item|ado-work-item|ado-parent-item)$/`

| Position | Icon | Command | Tooltip |
|---|---|---|---|
| `inline@0` | `$(add)` | `editless.launchFromWorkItem` | Launch with Agent |
| `inline@1` | `$(link-external)` | `editless.openInBrowser` | Open in Browser |

#### Inline Icons — PR Leaf Nodes

Applies to `viewItem =~ /^(pull-request|ado-pull-request)$/`

| Position | Icon | Command | Tooltip |
|---|---|---|---|
| `inline@0` | `$(add)` | `editless.launchFromPR` | Launch with Agent |
| `inline@1` | `$(link-external)` | `editless.openInBrowser` | Open in Browser |

#### Visual Layout (left → right)

```
Bug #1234: Fix login timeout     [+] [↗]
PR #567: Add retry logic          [+] [↗]
```

`[+]` = `$(add)` — primary action, leftmost, closest to label  
`[↗]` = `$(link-external)` — secondary action, rightmost

#### Command Icon Changes

Update the command definition for `editless.launchFromWorkItem` and `editless.launchFromPR`:

| Command | Current Icon | New Icon |
|---|---|---|
| `editless.launchFromWorkItem` | `$(play)` | `$(add)` |
| `editless.launchFromPR` | `$(play)` | `$(add)` |

#### Position Changes

| Item | Current | New |
|---|---|---|
| Work item "Open in Browser" | `inline` (no position) | `inline@1` |
| Work item "Launch with Agent" | `inline@10` | `inline@0` |
| PR "Open in Browser" | `inline` (no position) | `inline@1` |
| PR "Launch with Agent" | `inline@10` | `inline@0` |

### Context Menu

The right-click menu complements the inline icons with labeled entries. Every inline action should also appear in the context menu (discoverability — users who don't recognize an icon can right-click to find the same action with a text label).

#### Work Item Context Menu

| Group | Command | Label |
|---|---|---|
| `work-item@1` | `editless.launchFromWorkItem` | Launch with Agent |
| `work-item@2` | `editless.openInBrowser` | Open in Browser |
| `work-item@3` | `editless.goToWorkItem` | Go to Work Item |

#### PR Context Menu

| Group | Command | Label |
|---|---|---|
| `pull-request@1` | `editless.launchFromPR` | Launch with Agent |
| `pull-request@2` | `editless.openInBrowser` | Open in Browser |
| `pull-request@3` | `editless.goToPRInBrowser` | Go to PR |

#### Context Menu vs Inline Decision

| Action | Inline? | Context Menu? | Why |
|---|---|---|---|
| Launch with Agent | ✅ | ✅ | Primary action — needs maximum discoverability |
| Open in Browser | ✅ | ✅ | Common action — icon is universally understood, but label helps |
| Go to Work Item / Go to PR | ❌ | ✅ | Tertiary action — would clutter inline; context menu is sufficient |

### Migration Notes

- The `editless.launchFromWorkItem` and `editless.launchFromPR` command definitions change their `icon` property from `$(play)` to `$(add)`.
- The `view/item/context` menu entries change their `group` positions as specified above.
- No new commands are needed. No command IDs change.
- The `$(play)` icon is fully removed from the work items and PR views.

### Consistency Matrix

| View | Primary Action | Icon | Secondary Action | Icon |
|---|---|---|---|---|
| Agents tree (squad/agent) | Launch Session | `$(add)` | — | — |
| Work Items tree (leaf) | Launch with Agent | `$(add)` | Open in Browser | `$(link-external)` |
| PRs tree (leaf) | Launch with Agent | `$(add)` | Open in Browser | `$(link-external)` |

All three views now use `$(add)` for "create a session." One icon vocabulary across the entire extension.


---

# v0.1.3 Triage Round 2: Issues #418 & #417

# Rick's v0.1.3 Triage: Issues #418 & #417

## Issue #418: "Feedback: Discover + Register flow is confusing not intuitive"
**Type:** UX/Bug | **Reporter:** Russ  
**Summary:** User didn't know what to do after discovering an agent/squad — wasn't clear he needed to register. The '+' button then becomes "new session" which is confusing.

### Code Investigation
- Discovered agents/squads appear in the "Discovered" category in `editless-tree.ts`
- They currently only have **view/open actions** (preview for .md files, open for others)
- No explicit "Register" button or action — users must infer they can right-click or drag-and-drop
- The '+' button on discovered items is contextValue-driven, but discovered items have no contextValue that maps to "register"
- The UX spec (Summer's design) handles "Squads first, then agents" display order but doesn't include registration affordance

### Assessment
- **Scope:** Medium-small — needs 2-3 new things:
  1. Add a "Register" context menu action for discovered squads/agents
  2. Wire it to the registry (auto-add to registry, similar to team.md watcher logic at line 174)
  3. Toast notification or tree refresh feedback
- **Risk:** Low — isolated to discovery flow, no impact on existing registration paths
- **User Impact:** High — blocks the happy path for new users discovering squads

### Recommendation: **INCLUDE in v0.1.3**
This is a core UX blocker for the primary user journey (discover → register → launch). It's high-impact feedback from real usage and should be v0.1.3 quality bar.

**Assign to:** Morty (Extension Dev)  
**Priority:** P1 (before release)  
**Notes:**
- Add context menu command `editless.registerDiscoveredSquad` and `editless.registerDiscoveredAgent`
- Both should call registry.addSquads() or registry.addAgents() 
- Trigger tree refresh + toast "Registered [Name]"
- Could also evaluate auto-register on double-click, but context menu is safer first pass

---

## Issue #417: "Work Item view in ADO needed close and re-open after configuring before work items showed up"
**Type:** Bug | **Reporter:** Russ  
**Summary:** After configuring ADO organization/project settings, work items didn't show up until the user closed and re-opened the window. Refresh button didn't work.

### Code Investigation
- ADO config is set via settings: `editless.ado.organization` and `editless.ado.project` (extension.ts:1404-1405)
- Configuration is initialized once in `initAdoIntegration()` (line 1398)
- ADO data is fetched once during startup (line 1459)
- **The problem:** There is NO `onDidChangeConfiguration` handler that watches `ado.organization` or `ado.project`
  - Only `refreshInterval` is watched (line 1362)
  - When user changes ADO settings, `setAdoConfig()` is never called again
  - The work items tree still has stale (or empty) ADO config
- File watcher for team.md triggers refresh (line 207), but no equivalent for settings changes
- The "Refresh" button likely just re-runs cached data, doesn't re-read config

### Root Cause
Extension pattern: Configuration changes → no re-initialization hook → stale state persists until window reload

### Assessment
- **Scope:** Small — add missing `onDidChangeConfiguration` handler watching `ado.organization` + `ado.project`
- **Risk:** Very low — straightforward event handler, just re-initializes ADO integration
- **User Impact:** High — affects anyone who wants to switch ADO projects or org without reloading
- **Is it just a refresh issue?** No. Refresh would re-fetch, but the core issue is config never gets re-read. Even if user manually triggers refresh, `setAdoConfig()` hasn't been called with new org/project.

### Recommendation: **INCLUDE in v0.1.3**
This is a quality-of-life blocker for setup UX. Users expect settings changes to take effect without window reload. Small fix, big UX impact.

**Assign to:** Morty (Extension Dev)  
**Priority:** P1 (before release)  
**Scope:** ~5 lines of code
- Add to `onDidChangeConfiguration` in `initAutoRefresh` (or create a new subscription in activate)
- Check `e.affectsConfiguration('editless.ado.organization') || e.affectsConfiguration('editless.ado.project')`
- Call `initAdoIntegration(context, workItemsProvider, prsProvider)` to re-fetch and update tree

**Alternative:** Wire it into `initGitHubIntegration` pattern too (currently no handler for repo config changes either — future bug?)

---

## v0.1.3 Scope Recommendation

**Current v0.1.3 (4 issues):**
- #420: Agent picker missing Copilot CLI (Jaguar, in progress)
- #419: Roster '+' button confusing (Morty, in progress)  
- #415: Resume session feature (Morty, sequenced, UX spec done)
- #399: Squad refresh too slow (Morty)

**Proposed additions:**
- **#418:** Discovered agent registration UX (Morty) — P1, ~3-4 hour estimate
- **#417:** ADO config change handler (Morty) — P1, ~1 hour estimate

**Morty's v0.1.3 workload:** Already owns #419, #415, #399. Adding #417 and #418 keeps him focused on core UX issues. Both are small/quick wins. Feasible for Monday release target.

---

## Copilot Capability Assessment

**#418 (Discover + Register flow):**  
🟢 **Good fit** — Clear spec: add context menu action, wire to registry, refresh tree. Existing patterns to follow. Copilot can work autonomously.

**#417 (ADO config change handler):**  
🟢 **Good fit** — Straightforward event handler addition. No ambiguity. Copilot can work autonomously.

Both are safe for auto-assignment to copilot if squad capacity is constrained. Morty can review PRs quickly since they're small/focused.

---

## Summary for Casey

**Bring in both.** They're both core UX issues that block the happy path (discover/register, then switch ADO projects). Small scope, high impact. Fit comfortably into v0.1.3 timeline with Morty. Release quality is solid once fixed.


---

# v0.1.3 PR Reviews — Rick's 3x Review (All 5 PRs)

# v0.1.3 PR Reviews — Rick's 3x Review

**Date:** 2026-02-24
**Reviewed by:** Rick (Lead)
**Requested by:** Casey Irvine ("3x review" — thorough code review)

---

## Summary

All 5 v0.1.3 draft PRs reviewed, approved, and marked ready for review. Code quality is solid across the board. One structural concern: PRs #423, #425, and #426 share overlapping changes and need sequential merge ordering.

---

## Verdicts

### PR #423 — Agent picker includes Copilot CLI + roster hides launch button
**✅ APPROVE** | Closes #420, #419 | Branch: `squad/420-agent-picker-copilot-cli`

- `getAllAgentsForPicker()` helper correctly prepends synthetic built-in agent to squad list
- All 3 pickers updated consistently (`launchSession`, `launchFromWorkItem`, `launchFromPR`)
- `roster-agent` contextValue prevents launch button on non-launchable roster agents
- 3 tests updated to verify new QuickPick behavior
- **Merge first** — other PRs depend on these extension.ts changes

### PR #424 — Re-init ADO integration when org/project settings change
**✅ APPROVE** | Closes #417 | Branch: `squad/417-ado-config-refresh`

- 9-line surgical fix using standard `onDidChangeConfiguration` API
- `initAdoIntegration()` is idempotent — safe for repeated calls
- No tests needed for this scope
- **Independent** — no merge conflicts with other PRs

### PR #425 — Clarify discover/register UX with distinct icons
**✅ APPROVE** | Closes #418 | Branch: `squad/418-discover-register-ux`

- Clean "one icon = one meaning" principle: `play`=launch, `compass`=discovered, `eye-closed`=hide
- Fixed silent button drop where `hideAgent` was missing an icon
- "Launch Session" → "New Session" title change
- **Merge after #423** — shares overlapping extension.ts/test changes

### PR #426 — Resume External Session command
**✅ APPROVE** | Closes #415 | Branch: `squad/415-resume-external-session`

- Comprehensive implementation following Summer's UX spec
- Session filtering excludes both active terminals and orphaned sessions
- CWD-matched sessions sorted to top, manual GUID fallback for power users
- Validation via existing `isSessionResumable()` pattern
- Stale session warning dialog with user choice
- Minor: no new tests for the resume command, but acceptable for UI orchestration
- **Merge after #425** — superset of #423 and #425 changes

### PR #427 — Speed up squad refresh after registry changes
**✅ APPROVE** | Closes #399 | Branch: `squad/399-squad-refresh-speed`

- Removes wasted `scanSquad()` call (result was discarded)
- Eliminates redundant disk read via callback parameter passthrough
- `setTimeout(0)` yields event loop so tree renders before watcher rebuild
- `scanDebounceMs` default: 500ms → 300ms
- **Independent** — no merge conflicts with other PRs

---

## Merge Order

Due to overlapping changes in extension.ts and editless-tree.ts:

1. **PR #424** (independent)
2. **PR #427** (independent)
3. **PR #423** (base for #425 and #426)
4. **PR #425** (builds on #423, needs rebase)
5. **PR #426** (builds on #425, needs rebase)

#424 and #427 can merge in any order. #423 → #425 → #426 must be sequential.

---

## Quality Observations

- **Code consistency:** All PRs follow existing patterns (QuickPick for user selection, `context.subscriptions.push()` for disposables, `buildCopilotCommand()` for CLI invocations)
- **Test discipline:** Bug fixes include test updates. New feature (#426) relies on existing tested components rather than adding redundant tests for UI orchestration — reasonable tradeoff
- **PR hygiene:** All PRs have clear bodies, correct `Closes #N` references, and "Working as {member}" attribution
- **Risk profile:** Low across all 5. No architectural changes, no new dependencies, no data model changes


---

# UX Spec: Discover → Register Flow Clarity

# UX Spec: Discover → Register Flow Clarity

**Issue:** #418 — "Feedback: Discover + Register flow is confusing not intuitive"
**Author:** Summer (Product Designer)
**Date:** 2026-02-25
**Status:** Proposed
**Depends on:** #419 (roster-agent contextValue fix — already merged)

---

## Problem

Russ's dogfooding feedback: "He didn't immediately know what to do with a discovered agent/squad and wasn't clear he needed to register. Plus then the '+' button becomes new session which is confusing."

### Root Causes

1. **`$(add)` icon overload.** The `+` button means "Launch Session" on registered agents AND "Add to Registry" on discovered agents. Same icon, completely different actions. Users can't tell what `+` does without trying it.

2. **Icon overlap across states.** Discovered agents use `$(hubot)` — the same icon as registered standalone agents. Discovered squads use `$(organization)` — the same icon as registered multi-agent squads. There's no visual signal that discovered items are in a different state.

3. **No visual call-to-action for registration.** Nothing about a discovered item's appearance says "you need to do something with this before you can use it." It looks the same as a registered item, just in a different section.

4. **Hide button is invisible.** `editless.hideAgent` has no icon defined, so its `group: "inline"` entries on discovered items are silently dropped by VS Code. Hide is only reachable via right-click — poor discoverability.

---

## Current State (What Exists Today)

| Item Type | contextValue | Icon | Inline Button(s) | Notes |
|---|---|---|---|---|
| Copilot CLI | `default-agent` | `$(terminal)` | `$(add)` Launch Session | |
| Registered squad (standalone) | `squad` | `$(hubot)` | `$(add)` Launch Session | ⚠️ Same icon as discovered agent |
| Registered squad (multi-agent) | `squad` | `$(organization)` | `$(add)` Launch Session | ⚠️ Same icon as discovered squad |
| Discovered agent | `discovered-agent` | `$(hubot)` | `$(add)` Register | ⚠️ Same icon+button as registered |
| Discovered squad | `discovered-squad` | `$(organization)` | `$(add)` Register | ⚠️ Same icon+button as registered |
| Roster agent | `roster-agent` | `$(person)` | (none) | ✅ Fixed by #419 |
| Active session | `terminal` | state-based | `$(close)` Close | ✅ Fine |
| Orphaned session | `orphanedSession` | `$(history)` | (none) | ✅ Fine |

**The `$(add)` icon appears on 5 different item types and means 2 different things.**

---

## Proposed State

### Design Principles
1. **One icon = one meaning.** `$(play)` always means "start a session." `$(add)` always means "register this."
2. **Visual category at a glance.** Each agent lifecycle state (registered, discovered, roster) gets a distinct icon.
3. **Explicit registration, obvious affordance.** Don't auto-register — keep it intentional. But make the action unmissable.

### Icon + Button Matrix

| Item Type | contextValue | Icon | Inline Button(s) | Context Menu |
|---|---|---|---|---|
| Copilot CLI | `default-agent` | `$(terminal)` | `$(play)` New Session | New Session |
| Registered squad (standalone) | `squad` | `$(hubot)` | `$(play)` New Session | New Session, Rename, Change Model, Settings, Squad UI, Hide |
| Registered squad (multi-agent) | `squad` | `$(organization)` | `$(play)` New Session | (same as standalone) |
| **Discovered agent** | `discovered-agent` | **`$(compass)`** | **`$(add)` Register** · `$(eye-closed)` Hide | Register, Hide |
| **Discovered squad** | `discovered-squad` | **`$(compass)`** | **`$(add)` Register** · `$(eye-closed)` Hide | Register, Hide |
| Roster agent | `roster-agent` | `$(person)` | (none) | (none) |
| Active session | `terminal` | state-based | `$(close)` Close | Close, Rename, Clear Label |
| Orphaned session | `orphanedSession` | `$(history)` | (none) | (click to resume) |

### Visual Summary

```
REGISTERED (ready to use)          DISCOVERED (needs registration)      ROSTER (informational)
──────────────────────────         ──────────────────────────           ──────────────
$(hubot) My Agent    [▶]          $(compass) Found Agent    [+][👁]    $(person) Rick
$(organization) Squad [▶]         $(compass) Found Squad    [+][👁]    $(person) Morty
$(terminal) CLI      [▶]
```

Three visual lanes. No overlap. At a glance you know what's what.

---

## Changes Required

### 1. package.json — Command Definitions

**Change `launchSession` icon from `$(add)` to `$(play)`:**
```jsonc
// BEFORE:
{ "command": "editless.launchSession", "title": "Launch Session", "icon": "$(add)" }
// AFTER:
{ "command": "editless.launchSession", "title": "New Session", "icon": "$(play)" }
```
> Rationale: `$(play)` is the universal "start/run" icon in VS Code (debug, test runner, tasks). "New Session" is clearer than "Launch Session" — it tells you what you get.

**Add icon to `hideAgent`:**
```jsonc
// BEFORE:
{ "command": "editless.hideAgent", "title": "Hide" }
// AFTER:
{ "command": "editless.hideAgent", "title": "Hide", "icon": "$(eye-closed)" }
```
> Rationale: Without an icon, the inline button entries for discovered items silently fail. `$(eye-closed)` is semantically correct and widely used in VS Code for visibility toggles.

### 2. package.json — Menu When-Clauses

No changes needed. The existing when-clauses are already correct:
- `launchSession` inline: `viewItem =~ /^squad|^agent|^default-agent$/` — won't match `discovered-agent` or `roster-agent` ✅
- `promoteDiscoveredAgent` inline: `viewItem == discovered-agent` / `viewItem == discovered-squad` ✅
- `hideAgent` inline: `viewItem == discovered-agent` / `viewItem == discovered-squad` ✅

### 3. src/editless-tree.ts — Icon Changes

**Discovered agents — change `hubot` → `compass`:**
```typescript
// buildDiscoveredAgentItem() and buildDiscoveredItemAgent()
// BEFORE:
item.iconPath = new vscode.ThemeIcon('hubot');
// AFTER:
item.iconPath = new vscode.ThemeIcon('compass');
```

**Discovered squads — change `organization` → `compass`:**
```typescript
// buildDiscoveredSquadItem()
// BEFORE:
item.iconPath = new vscode.ThemeIcon('organization');
// AFTER:
item.iconPath = new vscode.ThemeIcon('compass');
```

### 4. No New Commands Needed

All existing commands cover the required actions:
- `editless.launchSession` — start a session (registered agents)
- `editless.promoteDiscoveredAgent` — register a discovered item
- `editless.hideAgent` — hide a discovered item
- `editless.closeTerminal` — close a session

### 5. No contextValue Changes Needed

The current contextValues are well-structured:
- `squad` — registered squads (standalone + multi-agent)
- `default-agent` — Copilot CLI
- `discovered-agent` — found agents, not yet registered
- `discovered-squad` — found squads, not yet registered
- `roster-agent` — team roster members (informational only)
- `terminal` — active sessions
- `orphanedSession` — resumable sessions

These are correct and the when-clauses already depend on them properly.

---

## Design Decision: Explicit Registration (Not Auto-Register)

**Recommendation: Keep registration explicit. Do NOT auto-register on click or double-click.**

Reasons:
1. **Single-click already has a purpose** — it opens the agent's `.md` file for preview. This is valuable: users should be able to evaluate an agent before committing to register it.
2. **Auto-register pollutes the registry** — a curious click shouldn't permanently add an agent. Registration is a commitment ("I want to use this").
3. **The confusion was never about the number of clicks** — it was about not knowing WHAT to click. Changing `+` to mean only one thing (Register) on discovered items, while registered items get `▶` (New Session), solves this.
4. **The flow becomes self-documenting:**
   - See `$(compass)` icon → "this is something I found"
   - See `$(add)` button → "I can add it"
   - After registration → item moves from Discovered to main tree, now has `$(play)` → "I can use it"

---

## Impact Summary

| Change | File | Effort |
|--------|------|--------|
| `launchSession` icon: `$(add)` → `$(play)`, title: "Launch Session" → "New Session" | package.json | 1 line |
| `hideAgent` add icon: `$(eye-closed)` | package.json | 1 line |
| Discovered agent icon: `hubot` → `compass` (3 occurrences) | editless-tree.ts | 3 lines |
| Discovered squad icon: `organization` → `compass` (1 occurrence) | editless-tree.ts | 1 line |

**Total: 6 lines changed across 2 files.** No new commands, no new contextValues, no structural changes.

---

## Testing Checklist

- [ ] Registered squad shows `$(play)` inline button (not `$(add)`)
- [ ] Copilot CLI shows `$(play)` inline button
- [ ] Discovered agents show `$(compass)` icon + `$(add)` and `$(eye-closed)` inline buttons
- [ ] Discovered squads show `$(compass)` icon + `$(add)` and `$(eye-closed)` inline buttons
- [ ] Roster agents show `$(person)` icon with NO inline buttons
- [ ] Clicking `$(play)` on registered agent starts a new session
- [ ] Clicking `$(add)` on discovered agent registers it (moves to main tree)
- [ ] Clicking `$(eye-closed)` on discovered item hides it
- [ ] Right-click context menus are unchanged for registered squads
- [ ] Single-clicking a discovered agent still previews its file

---

## Config Refresh Pattern for Integration Re-initialization

**Date:** 2026-02-24  
**Author:** Rick (Lead)  
**Context:** PR #424 architecture review — config refresh handlers for ADO and GitHub integrations  
**Status:** ✅ APPROVED

The config refresh pattern established in PR #424 is the **canonical pattern** for integration re-initialization when VS Code settings change.

### Pattern Definition

```typescript
// In activate(), after initial integration setup:
context.subscriptions.push(
  vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('editless.integration.key')) {
      initIntegration(/* params */);
    }
  }),
);
```

### Key Principles

1. **Handlers live in `activate()` after init calls** — not inside the init functions (avoids circular dependencies)
2. **Separate listeners per integration scope** — don't combine unrelated config checks into one monolithic handler
3. **Call full init functions** — if the init function is idempotent (no resource leaks), reuse it instead of duplicating logic
4. **Idempotency requirement** — init functions must be safe to call multiple times (assignments only, no subscriptions/allocations)

### Architecture Rationale

**Why separate listeners?**
- Single Responsibility Principle — each listener owns one integration's config scope
- Avoids unnecessary config checks on every change event
- Negligible performance cost (VS Code fires event once regardless of listener count)

**Why call full init functions?**
- Avoids code duplication between activation and refresh paths
- Init functions already handle config reading, validation, provider updates, and data fetching
- Safe if init functions are idempotent (confirmed for `initAdoIntegration()` and `initGitHubIntegration()`)

**Why not place handlers inside init functions?**
- Creates circular dependency: init → register listener → call init → register listener...
- Violates VS Code extension lifecycle (subscriptions should be registered in `activate()`)

### Testing Requirements

Config refresh handlers must include:
- Test that handler fires when each monitored config key changes
- Test that handler does NOT fire for unrelated config keys
- Test that the expected provider methods are called (e.g., `setAdoConfig`, `setRepos`)

See `src/__tests__/config-refresh.test.ts` for reference implementation.

---

## Config Handler Debounce Pattern

**Date:** 2026-02-25  
**Author:** Morty (Extension Dev)  
**Context:** PR #424 review feedback from Unity and Meeseeks — race condition fix

**Decision:** `onDidChangeConfiguration` handlers that trigger expensive operations (API calls, data reloads) should use a simple `setTimeout`/`clearTimeout` debounce pattern with 500ms delay.

**Rationale:**
- Prevents concurrent API calls when users type config values character-by-character (e.g., ADO org name, GitHub repo list)
- Out-of-order completion can show stale data if not debounced
- No external dependencies needed — use native `setTimeout`/`clearTimeout`
- Each handler maintains its own timer variable for isolation

**Implementation Pattern:**
```typescript
let debounceTimer: NodeJS.Timeout | undefined;
context.subscriptions.push(
  vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('editless.some.setting')) {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        expensiveOperation();
      }, 500);
    }
  }),
);
```

**Test Pattern:**
- Use `vi.useFakeTimers()` + `vi.advanceTimersByTime(500)` in tests
- Verify debounce works: rapid changes → single call after delay
- All config handler tests must account for debounce delay

**Applied in:** extension.ts ADO/GitHub config handlers (PR #424)

---

## DebugMCP Integration Research

**Date:** 2026-02-25  
**Author:** Jaguar (Copilot SDK Expert)  
**Status:** Research Complete — Recommend as optional companion extension

### What is DebugMCP?

[microsoft/DebugMCP](https://github.com/microsoft/DebugMCP) is a VS Code extension (v1.0.7, beta) that exposes the VS Code Debug Adapter Protocol as an MCP server. Runs a local HTTP server (default port 3001) using `@modelcontextprotocol/sdk`.

**Marketplace:** `ozzafar.debugmcpextension`  
**Authors:** Oz Zafar, Ori Bar-Ilan (Microsoft). MIT licensed.  
**Transport:** StreamableHTTP (POST `/mcp` on localhost:3001). Stateless per-request.

### MCP Tools Exposed (14 tools)

Key tools for agent debugging:
- `start_debugging` — Launch a debug session for a file
- `step_over`, `step_into`, `step_out` — Step through execution
- `add_breakpoint`, `remove_breakpoint`, `list_breakpoints` — Manage breakpoints
- `get_variables_values` — Inspect variables at current execution point
- `evaluate_expression` — Evaluate expressions in debug context
- `continue_execution`, `restart_debugging` — Control execution

### Fit for EditLess

**How It Enhances EditLess Workflow:**
1. Copilot CLI agents get real debugging — set breakpoints, inspect variables, step through code via MCP
2. Test-driven debugging — debug specific failing tests via `start_debugging` with `testName`
3. Complements terminal management — debug session state visible in VS Code debug panel

**For users (zero EditLess code changes needed):**
1. User installs DebugMCP extension from Marketplace
2. DebugMCP auto-registers in VS Code's `mcp.json`
3. Copilot CLI picks it up via standard MCP config chain
4. Agent now has debugging tools available

**MCP config entry:**
```json
{
  "servers": {
    "debugmcp": {
      "type": "streamableHttp",
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

### Risks and Concerns

🟡 **Beta Status** — Explicitly marked beta, maintained by 2 Microsoft engineers. Known issues: session desync (#29), C# debugging incomplete (#12), no concurrent sessions (#25).

🟡 **Port Conflict Potential** — Default port 3001 hardcoded. Configurable via setting but agents need to know actual port.

🟡 **VS Code 1.104+ Requirement** — EditLess targets `^1.100.0`. DebugMCP requires `^1.104.0`. Not a conflict (separate extension), but users on older VS Code can't use it.

🟡 **Single Debug Session Limitation** — Only supports one debug session at a time.

🟢 **No Conflict with EditLess** — Purely additive. Doesn't modify terminal behavior or EditLess APIs. No shared state.

🟢 **Security** — Runs 100% locally, no external communication, no credentials needed.

### Recommendation

**Verdict: Recommend as optional companion extension. Backlog item, not v0.1.3.**

**Rationale:**
1. Zero code changes needed for basic integration
2. Beta quality means don't depend on it (session desync, single-session limit)
3. EditLess-specific UI integration is low priority
4. Documentation is the right first step

**Suggested Actions:**
- Add DebugMCP to recommended extensions in docs (Low priority, Backlog)
- Add `.copilot/mcp-config.json` example with DebugMCP (Low priority, Backlog)
- Detect DebugMCP and show indicator in EditLess UI (Low priority, Future post-v0.2)

**Not Recommended:**
- Adding DebugMCP as a dependency or bundling
- Building our own debugging MCP server
- Making EditLess code changes for v0.1.3 related to this


---

## Remove deprecated registry code from discovery.ts

**Date:** 2026-02-26  
**Author:** Rick (Architecture)  
**Status:** Implemented  
**Issue:** #399

**Decision:** Removed RegistryLike interface, promptAndAddSquads(), and utoRegisterWorkspaceSquads() from discovery.ts. These were marked @deprecated — no longer called from extension code but kept "for backward compatibility with existing tests."

**Rationale:** Dead code is dead code. The deprecation note preserved 100 lines of registry-pattern code and its test file (discovery-commands.test.ts, already deleted) purely out of caution. With the auto-discover refactor merged, there's no backward compatibility concern — no production code calls these functions. Keeping them increases maintenance burden and confuses future contributors about which pattern is canonical.

**Rule Going Forward:** When a function is deprecated as part of a refactor, remove it in the same PR. Don't defer cleanup to "later" — later never comes, and deprecated code accumulates. If tests exist solely for deprecated functions, remove those tests too.

**Applies To:** All future refactoring cycles. Remove deprecated code during refactor, not after.


---

# Command Module Pattern

**Date:** 2026-02-28
**Author:** Morty
**Status:** Implemented

## Decision

Command handlers in `extension.ts` are extracted into domain-specific modules
under `src/commands/`:

- `agent-commands.ts` — agent discovery, CRUD, model, launch, add
- `session-commands.ts` — terminal focus, close, rename, label
- `work-item-commands.ts` — work items, PRs, filters, ADO/GitHub

Each module exports `register(context, deps)` where `deps` is a typed
interface containing only the services that module needs (dependency injection,
no module-level singletons).

## Consequences

- `activate()` in `extension.ts` is now ~230 lines of pure wiring (was ~1300)
- New commands go in the appropriate module, not extension.ts
- Tests continue using the `activate()` → capture handlers pattern unchanged
- Mocks for `../unified-discovery` must use `importOriginal` to preserve
  real exports like `toAgentTeamConfig`

---

# CWD Resolution Expanded to Three Agent Types

**Decided by:** Morty  
**Date:** 2026-02-23  
**Issue:** #403 | **PR:** #412  

## Decision

`resolveTerminalCwd()` now resolves CWD for three agent types instead of one:

1. **Repo agents** (path inside a workspace folder, e.g. `.github/agents/`) → that workspace folder root
2. **Workspace-dir agents** (any path inside a workspace folder) → that workspace folder root
3. **Personal agents** (`~/.copilot/agents/`, outside workspace) → first workspace folder

**Priority:** workspace folder membership is checked first (covers repo + workspace-dir agents), then personal agent `.copilot/agents` regex fallback. This means repo agents whose path happens to contain `.copilot/agents` will be resolved by the workspace folder match (correct behavior) rather than the personal agent fallback.

## Rationale

The v0.1.2 implementation only handled personal agents, causing repo-defined agents and workspace-dir agents to launch terminals in their agent directory instead of the project root. This broke workflows where the agent needs access to workspace files.

## Impact

- `src/terminal-manager.ts` — `resolveTerminalCwd()` expanded
- Both call sites (`launchTerminal`, `relaunchSession`) unchanged — they already call `resolveTerminalCwd(config.path)`
- 7 new tests, 842 total passing

---

# Decision: Multi-line tail analysis for event detection

**Date:** 2026-02-23
**Author:** Morty
**Issue:** #402

## Context

The Copilot CLI emits tool calls in parallel. When `ask_user` is called alongside `report_intent`, the last event in `events.jsonl` could be `report_intent`'s `tool.execution_complete` — masking the open `ask_user` start. This broke the attention icon.

## Decision

Parse ALL lines from the 2KB tail chunk (not just the last line) in both `getLastEvent()` and `watchSession()`. Track open `ask_user` tool calls via a `Set<string>` of `toolCallId`s. Expose a computed `hasOpenAskUser` boolean on `SessionEvent`. `isAttentionEvent()` now checks this flag instead of the event type.

## Impact

- `SessionEvent` interface has two new optional fields: `toolCallId` and `hasOpenAskUser`
- The malformed JSON behavior changed: corrupt trailing lines are now skipped (resilient), and the last valid parsed line is used instead of silently dropping the event
- Any future code that needs to detect open tool calls can extend the same `Set` tracking pattern

---

# Decision: Official Copilot SDK Event Types

**Date:** 2026-02-23
**Author:** Morty
**Status:** Implemented
**Issue:** #402 / PR #414

## Context

We were using hand-rolled magic strings for Copilot CLI event types (`assistant.ask_user`, `user.ask`, `assistant.code_edit`, `tool.result`) that don't exist in the official `github/copilot-sdk` schema. This caused dead code paths and potential confusion about what events the CLI actually emits.

## Decision

1. Created `src/copilot-sdk-types.ts` as the single source of truth for event type strings, sourced from `github/copilot-sdk` v0.1.8 `session-events.schema.json`.
2. `CopilotEvents` const object provides named constants for the subset we use in state detection — avoids magic strings while keeping imports minimal.
3. `SessionEvent.type` remains `string` (not `CopilotEventType`) so unknown future events don't break parsing.
4. Removed non-official event types: `assistant.ask_user`, `user.ask`, `assistant.code_edit`, `tool.result`.

## Impact

- `isAttentionEvent()` only triggers on `tool.execution_start` with `toolName === 'ask_user'` (the official mechanism).
- `isWorkingEvent()` only references official schema types.
- Future event type additions should update `copilot-sdk-types.ts` first, then reference via `CopilotEvents`.

---

### Extract command modules from extension.ts

**Date:** 2026-02-26  
**Author:** Rick  
**Status:** Proposed  
**Trigger:** Modularity review of #399 refresh-speed refactor

## Context

`extension.ts` is 1273 lines and growing. The `activate()` function contains all command registration, event wiring, integration init, and helper utilities in a single scope. This makes it hard to test command handlers in isolation and creates merge conflicts when multiple features touch the same file.

## Decision

Extract command handlers into focused modules:

1. **`src/commands/agent-commands.ts`** — launch, rename, hide/show, change model, add agent/squad (~300 lines)
2. **`src/commands/work-item-commands.ts`** — work items filtering, level filters, launch from work item (~200 lines)
3. **`src/commands/pr-commands.ts`** — PR filtering, level filters, launch from PR (~200 lines)
4. **`src/commands/session-commands.ts`** — focus, rename, close, label, relaunch/dismiss orphans (~150 lines)

Each module exports a `register(context, deps)` function that takes the extension context and shared dependencies (agentSettings, treeProvider, terminalManager, etc.).

Additionally, extract `toAgentTeamConfig(disc: DiscoveredItem, settings: AgentSettings): AgentTeamConfig` into a shared utility — currently duplicated 5× across extension.ts and editless-tree.ts.

## Consequences

- `extension.ts` drops to ~300 lines (init + wiring only)
- Command handlers become independently testable
- Reduces merge conflicts on the most-edited file
- No runtime behavior change

---

# v0.1.3 Triage: Issues #420, #419, #415

**Date:** 2026-02-24  
**Triaged by:** Rick (Lead)  
**Status:** Assigned to squad members

---

## Summary

Triaged 3 untriaged v0.1.3 issues. All assigned to squad members. No issues suitable for autonomous @copilot work (1 needs SDK expertise, 2 are extension UI fixes with design nuance).

---

## Routing Decisions

### Issue #420: Copilot CLI missing from agent picker
- **Assigned to:** Jaguar (Copilot SDK Expert)
- **Type:** Bug
- **Capability:** 🟡 Needs review (SDK integration bug)
- **Reasoning:** Bug involves agent registration and picker logic. Requires Copilot SDK expertise to trace registration flow, agent filtering, and verify correct agent is being published to picker. Not a simple extension code fix — SDK understanding is critical.
- **Priority:** Medium
- **Labels:** `squad`, `squad:jaguar`

### Issue #419: Squad roster '+' button UX confusion
- **Assigned to:** Morty (Extension Dev)
- **Type:** Bug (UX)
- **Capability:** 🟢 Good fit (TreeView UI fix)
- **Reasoning:** Pure VS Code TreeView provider issue. Roster agents are non-launchable reference entries; launch button shouldn't render for them. Straightforward conditional UI logic in tree component. Well-defined scope, no design ambiguity.
- **Priority:** Medium
- **Labels:** `squad`, `squad:morty`

### Issue #415: Feature request — resume external session
- **Assigned to:** Morty (Extension Dev)
- **Type:** Feature
- **Capability:** 🟡 Needs review (medium feature, clear spec, sequenced)
- **Reasoning:** Feature is well-specified by Summer (full UX spec in issue comments). Touches terminal-manager.ts and requires new command + QuickPick UI. Medium complexity with clear acceptance criteria. **Critical sequencing:** Wait for PRs #410–#414 to merge (#412 and #414 both modify terminal-manager.ts; #414 adds 'attention' session state used by resume flow). Implementing on clean post-merge base avoids conflicts and reduces risk of rework.
- **Priority:** Medium (sequenced, not urgent until dependencies merge)
- **Labels:** `squad`, `squad:morty`

---

## @copilot Evaluation

No issues routed to `squad:copilot`. Reasoning:

- **#420:** Requires Copilot SDK expertise outside @copilot's general coding capability. Jaguar needed to verify SDK integration assumptions.
- **#419:** While 🟢 good fit for @copilot (straightforward UI fix), Morty owns all TreeView code and should maintain consistency in tree logic patterns. Keeping with squad member preferred.
- **#415:** Feature with sequencing dependency. Better handled by squad member who can coordinate with Morty's other v0.1.3 work and understand terminal-manager.ts context.

---

## Next Steps

1. Jaguar to pick up #420 — diagnose agent registration flow
2. Morty to pick up #419 (immediate) — roster button UX fix
3. Morty to track #415 sequencing — don't start until #410–#414 merged

---

# Resume External Session — UX Spec

**Author:** Summer (Product Designer)  
**Date:** 2026-02-24  
**Issue:** #415  
**Context:** User request from jnichols0 to resume Copilot CLI sessions started outside EditLess

---

## Problem

EditLess can only resume sessions it already knows about (via `PersistedTerminalInfo`). Sessions started in raw Copilot CLI outside the extension have no persisted metadata, so users can't resume them from the sidebar.

The Copilot CLI stores all sessions in `~/.copilot/session-state/{guid}/`, each with `workspace.yaml`, `events.jsonl`, and other metadata. These sessions are resumable via `copilot --resume {guid}`, but there's no UI to access them.

**User need:** "I started a session in a standalone terminal. I want to resume it from EditLess without typing the GUID manually."

---

## Design Goals

1. **Discoverable** — users can find the feature when they need it
2. **Searchable** — finding the right session among dozens should be fast
3. **Informative** — show enough context to pick the right session (summary, date, path)
4. **Lightweight** — this is a v0.1.3 quick win, not a full session browser
5. **Agent-scoped** — resume makes sense per agent, not globally

---

## 1. Entry Points

### Primary: Context menu on agent tree items

**Location:** Right-click on any agent (squad or default Copilot CLI) in the sidebar tree

**Menu item:**
```
Resume External Session...
```

**Rationale:**
- Contextual — you're picking an agent, then picking a session for that agent
- Consistent with existing "Launch Session" action placement
- Discoverable — right-click is the natural exploration path for power users

### Secondary: Command palette

**Command:** `EditLess: Resume External Session`

**Behavior:**
1. If a session terminal is currently focused → pre-select that agent's sessions
2. Otherwise → show agent picker first, then session picker

**Rationale:**
- Command palette is for keyboard-first users
- Still needs agent context before showing sessions

### Not included in v0.1.3:
- ❌ Inline tree button (would clutter toolbar)
- ❌ Global "Resume Any Session" command (loses agent context)
- ❌ Status bar entry point (not discoverable enough)

---

## 2. Picker Design

### Step 1: Session QuickPick

VS Code `QuickPick` with:

**Title:** `Resume Session — {agent-icon} {agent-name}`

**Placeholder:** `Search by summary, branch, or GUID...`

**Items:**

Each session is displayed as:

```
{summary-first-100-chars}
{relative-time} · {branch} · {cwd-basename}
```

**Example items:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ Resume Session — 🚀 Alpha Squad                                     │
├─────────────────────────────────────────────────────────────────────┤
│ ⏎ Search by summary, branch, or GUID...                            │
├─────────────────────────────────────────────────────────────────────┤
│ ● Fix login validation bug in auth module                          │
│   2 hours ago · squad/213-fix-login · editless                     │
├─────────────────────────────────────────────────────────────────────┤
│ ● Add documentation for session resume feature                     │
│   1 day ago · squad/415-resume-external · editless                 │
├─────────────────────────────────────────────────────────────────────┤
│ ● Implement hierarchical filter UX for work items                  │
│   3 days ago · squad/390-filter-hierarchy · editless               │
├─────────────────────────────────────────────────────────────────────┤
│ $(note) Paste GUID directly                                        │
│   Enter a session GUID manually                                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Item Structure

**Label (line 1):**
- Icon: `$(circle-filled)` for recent sessions (< 7 days), `$(circle-outline)` for older
- Summary text from `workspace.yaml` (truncated to 100 chars)

**Description (line 2):**
- Relative time (Last modified on `events.jsonl`): "2 hours ago", "3 days ago", "Jan 15"
- Branch name from `workspace.yaml` (or "—" if missing)
- CWD basename (not full path — too long)

**Detail (tooltip):**
```
Full path: C:\Users\cirvine\code\work\editless
Session ID: 00031334-f9b2-4f01-ae31-37d7231db0a0
Last activity: 2 hours ago
Branch: squad/213-fix-login
Status: resumable
```

**Last item (special):**
- Label: `$(note) Paste GUID directly`
- Description: `Enter a session GUID manually`
- Triggers: InputBox for manual GUID entry

### Sorting & Scoping — Show ALL sessions, not just CWD-matched

**IMPORTANT (Casey directive):** The picker MUST show ALL sessions from `~/.copilot/session-state/`, not only those matching the current agent's CWD. The whole point is resuming sessions started outside EditLess — these may come from any directory, any project, any context.

**Default sort order:**
1. CWD-matched sessions first (sessions whose `workspace.yaml` CWD matches the current workspace) — these are most likely what the user wants
2. Within each group, sorted by last modified descending (most recent first)
3. Non-matched sessions follow, also sorted by recency
4. Sessions updated within last 7 days get `$(circle-filled)` icon; older get `$(circle-outline)`

### Search/Filter Behavior

VS Code QuickPick provides built-in fuzzy search. Users can type:
- Summary keywords: "login", "documentation"
- Branch name: "squad/213", "main"
- GUID fragments: "00031334", "f9b2"
- CWD path: "editless", "tools-squad"

The QuickPick matches across all visible text (label + description).

### Empty State

**No sessions found for agent:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ Resume Session — 🚀 Alpha Squad                                     │
├─────────────────────────────────────────────────────────────────────┤
│ No external sessions found                                          │
│   No sessions in ~/.copilot/session-state matched this agent       │
├─────────────────────────────────────────────────────────────────────┤
│ $(note) Paste GUID directly                                        │
│   Enter a session GUID manually                                    │
└─────────────────────────────────────────────────────────────────────┘
```

**All sessions in state dir (no CWD filter):**

```
┌─────────────────────────────────────────────────────────────────────┐
│ Resume Session — $(copilot) Copilot CLI                            │
├─────────────────────────────────────────────────────────────────────┤
│ ⏎ Search by summary, branch, or GUID...                            │
├─────────────────────────────────────────────────────────────────────┤
│ ○ Session in different project                                     │
│   5 days ago · main · other-project                                │
├─────────────────────────────────────────────────────────────────────┤
│ ○ Another external session                                         │
│   1 week ago · feature/xyz · tools-squad                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Flow

### Happy Path: Resume via picker

1. User right-clicks agent "🚀 Alpha Squad" → **Resume External Session...**
2. EditLess scans `~/.copilot/session-state/` for sessions matching agent's `squadPath` (via CWD in `workspace.yaml`)
3. QuickPick opens showing matched sessions, sorted by last modified
4. User types "login" → QuickPick filters to sessions with "login" in summary
5. User presses Enter on "Fix login validation bug..."
6. EditLess validates session is resumable (checks `workspace.yaml` + `events.jsonl` exist)
7. New terminal launches with `copilot --agent squad --resume 00031334-f9b2-4f01-ae31-37d7231db0a0`
8. Terminal appears in agent's session list with name "🚀 Fix login validation bug"

### Alternative Path: Manual GUID entry

1. User right-clicks agent → **Resume External Session...**
2. QuickPick opens
3. User selects "$(note) Paste GUID directly"
4. InputBox appears: "Enter session GUID to resume"
5. User pastes `00031334-f9b2-4f01-ae31-37d7231db0a0`
6. EditLess validates session is resumable
7. Terminal launches with resume command

### Keyboard-First Path: Command palette

1. User presses Ctrl+Shift+P → types "resume"
2. Selects **EditLess: Resume External Session**
3. Agent picker appears (all squads + default CLI)
4. User picks "🚀 Alpha Squad"
5. Session QuickPick opens → same flow as above

---

## 4. Edge Cases

### No sessions found for agent

**Scenario:** Agent's `squadPath` has never been used in a Copilot CLI session

**Behavior:**
- QuickPick shows empty state (see design above)
- "Paste GUID directly" option still available
- User can manually enter any GUID from a different project

**Message:** No error toast. The empty picker is self-explanatory.

### Invalid GUID pasted

**Scenario:** User enters malformed GUID or non-existent session ID

**Validation:**
1. Check GUID format: `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`
2. Check session directory exists: `~/.copilot/session-state/{guid}/`
3. Run `SessionContextResolver.isSessionResumable(guid)`

**Error message (toast):**
```
Cannot resume session: Session {guid} not found or is not resumable. Check the GUID and try again.
```

### Session already active in EditLess

**Scenario:** User tries to resume a session that's already running in an EditLess-tracked terminal

**Detection:**
- Check `TerminalManager._terminals` for any entry with matching `agentSessionId`

**Behavior:**
- Don't show the session in the picker (pre-filter during scan)
- If manually entered, show warning toast:
  ```
  Session {guid} is already active. Use "Focus Session" to switch to it.
  ```
- Optionally: focus the existing terminal instead of showing error

### Session not resumable (missing files)

**Scenario:** Session directory exists but `workspace.yaml` or `events.jsonl` is missing

**Behavior:**
- Session appears in picker with warning icon: `$(warning) {summary}`
- Description includes: `not resumable`
- On selection, show error (same as existing relaunch validation):
  ```
  Cannot resume session: Session {guid} has no workspace.yaml — session state is missing or corrupted.
  ```

### Stale session (> 14 days old)

**Scenario:** Session exists but hasn't been touched in over 14 days

**Behavior:**
- Session appears in picker with stale icon: `$(archive) {summary}`
- Description includes: `{date} (stale)`
- On selection, show warning (same as existing relaunch):
  ```
  ⚠️ Session {guid} has not been updated in over 14 days. It may be outdated.
  ```
- Resume proceeds (non-blocking warning)

### No session-state directory

**Scenario:** `~/.copilot/session-state` doesn't exist (fresh Copilot CLI install)

**Behavior:**
- QuickPick shows empty state
- "Paste GUID directly" option available
- No error toast — user hasn't done anything wrong

---

## 5. Naming

### Command Names

| Command ID | Display Name | Menu Label |
|------------|--------------|------------|
| `editless.resumeExternalSession` | Resume External Session | Resume External Session... |

### QuickPick Text

| Element | Text |
|---------|------|
| Title | `Resume Session — {icon} {agent-name}` |
| Placeholder | `Search by summary, branch, or GUID...` |
| Empty state label | `No external sessions found` |
| Empty state description | `No sessions in ~/.copilot/session-state matched this agent` |
| Manual GUID item label | `$(note) Paste GUID directly` |
| Manual GUID item description | `Enter a session GUID manually` |

### InputBox Text (manual GUID)

| Element | Text |
|---------|------|
| Prompt | `Enter session GUID to resume` |
| Placeholder | `00000000-0000-0000-0000-000000000000` |
| Validation error | `Invalid GUID format` |

### Terminal Naming

**New terminal name:**
```
{agent-icon} {session-summary-first-50-chars}
```

Example: `🚀 Fix login validation bug in auth module`

**If summary is empty:** Use fallback `{agent-icon} Resumed Session`

---

## 6. Mockup

### Full QuickPick with Sessions

```
╔═════════════════════════════════════════════════════════════════════╗
║ Resume Session — 🚀 Alpha Squad                                     ║
╠═════════════════════════════════════════════════════════════════════╣
║ ⏎ Search by summary, branch, or GUID...                            ║
╠═════════════════════════════════════════════════════════════════════╣
║                                                                     ║
║ ● Fix login validation bug in auth module                          ║
║   2 hours ago · squad/213-fix-login · editless                     ║
║                                                                     ║
║ ● Add documentation for session resume feature                     ║
║   1 day ago · squad/415-resume-external · editless                 ║
║                                                                     ║
║ ● Implement hierarchical filter UX for work items                  ║
║   3 days ago · squad/390-filter-hierarchy · editless               ║
║                                                                     ║
║ ○ Review PR feedback and update tests                              ║
║   Jan 15 · main · editless                                         ║
║                                                                     ║
║ ⚠ Debug terminal state persistence issues                          ║
║   Jan 10 · bugfix/terminal-state · editless (not resumable)        ║
║                                                                     ║
║ ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――― ║
║                                                                     ║
║ $(note) Paste GUID directly                                        ║
║   Enter a session GUID manually                                    ║
║                                                                     ║
╚═════════════════════════════════════════════════════════════════════╝
```

### Search Filtered

```
╔═════════════════════════════════════════════════════════════════════╗
║ Resume Session — 🚀 Alpha Squad                                     ║
╠═════════════════════════════════════════════════════════════════════╣
║ login                                                               ║
╠═════════════════════════════════════════════════════════════════════╣
║                                                                     ║
║ ● Fix login validation bug in auth module                          ║
║   2 hours ago · squad/213-fix-login · editless                     ║
║                                                                     ║
╚═════════════════════════════════════════════════════════════════════╝
```

### Empty State

```
╔═════════════════════════════════════════════════════════════════════╗
║ Resume Session — 🚀 Alpha Squad                                     ║
╠═════════════════════════════════════════════════════════════════════╣
║ ⏎ Search by summary, branch, or GUID...                            ║
╠═════════════════════════════════════════════════════════════════════╣
║                                                                     ║
║ No external sessions found                                         ║
║   No sessions in ~/.copilot/session-state matched this agent       ║
║                                                                     ║
║ ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――― ║
║                                                                     ║
║ $(note) Paste GUID directly                                        ║
║   Enter a session GUID manually                                    ║
║                                                                     ║
╚═════════════════════════════════════════════════════════════════════╝
```

### Manual GUID InputBox

```
╔═════════════════════════════════════════════════════════════════════╗
║ Enter session GUID to resume                                       ║
╠═════════════════════════════════════════════════════════════════════╣
║ 00000000-0000-0000-0000-000000000000                                ║
╚═════════════════════════════════════════════════════════════════════╝
```

---

## Implementation Notes

### Session Discovery Logic

**Scan strategy:**

1. Read all directories in `~/.copilot/session-state/`
2. For each dir, read `workspace.yaml` → parse `cwd` field and `summary`
3. Normalize paths (lowercase, forward slashes, trim trailing slashes)
4. Check if `cwd` matches current workspace folder → mark as "local" (sort to top)
5. Filter out sessions already tracked by `TerminalManager` (check `agentSessionId`)
6. Read `events.jsonl` last modified time → sort: local-first, then by recency
7. ALL sessions are shown — non-matching CWDs are included (sorted lower, not excluded)

**Performance:**
- Only scan once per command invocation (not on picker keystroke)
- For projects with hundreds of sessions, consider caching in `SessionContextResolver._cwdIndex`
- Timeout: if scan takes > 2 seconds, show "Loading..." placeholder

### Resumability Check

Reuse existing `SessionContextResolver.isSessionResumable(guid)` logic:
- ✅ `workspace.yaml` exists and readable
- ✅ `events.jsonl` exists and readable
- ⚠️ Stale if last modified > 14 days ago

### Terminal Launch

Same flow as `relaunchSession()` in `TerminalManager`:

1. Build command: `{baseCmd} --resume {guid}`
2. Create terminal with env vars:
   - `EDITLESS_SESSION_ID={guid}`
   - `EDITLESS_SQUAD_ID={squadId}`
3. Register terminal in `_terminals` map
4. Start session watcher for activity tracking

**Terminal metadata:**
- `agentSessionId`: the resumed GUID
- `displayName`: from `workspace.yaml` summary (or fallback to "Resumed Session")
- `squadId`, `squadName`, `squadIcon`: from agent config
- `launchCommand`: for future relaunch
- `squadPath`: from agent config

---

## Out of Scope (Future Enhancements)

❌ **Rich session browser:** Timeline view, checkpoint history, file tree  
❌ **Cross-agent session resume:** Resume a Squad session as default CLI  
❌ **Session tags/favorites:** Bookmark frequently resumed sessions  
❌ **Auto-suggest recent sessions:** Show recent external sessions in agent tree  
❌ **Session archival:** Move old sessions to archive, hide from picker  
❌ **Multi-select resume:** Resume multiple sessions at once  
❌ **Session diff preview:** Show what changed since last checkpoint  

---

## Success Metrics (Post-Launch)

1. **Usage:** % of users who resume external sessions vs. only EditLess-launched sessions
2. **Discovery:** Search usage vs. manual GUID entry (should favor search)
3. **Error rate:** % of resume attempts that fail validation
4. **Time to resume:** Median time from right-click to session loaded

---

## Acceptance Criteria

✅ User can right-click agent → Resume External Session  
✅ QuickPick shows sessions from `~/.copilot/session-state/` matching agent's CWD  
✅ Search filters by summary, branch, GUID, and CWD  
✅ Manual GUID entry option available  
✅ Invalid/missing sessions show clear error messages  
✅ Stale sessions show warning but allow resume  
✅ Already-active sessions are filtered from picker  
✅ Resumed terminal appears in agent's session list with appropriate metadata  
✅ Command palette variant works (agent picker → session picker)  

---

## Design Rationale

### Why agent-scoped, not global?

**Rejected:** Global "Resume Any Session" command with all sessions from all projects

**Reasoning:**
- Sessions are tied to a project/CWD → resuming in the wrong context is confusing
- Agent-scoped matches existing mental model (agent = project context)
- Reduces picker clutter (filter sessions by relevance)

**Concession:** Manual GUID entry allows power users to resume any session if needed

### Why QuickPick, not tree view integration?

**Rejected:** Show external sessions as gray/orphaned items in agent tree

**Reasoning:**
- Tree is for active sessions — external sessions are ephemeral discovery
- Scanning `session-state` on every tree refresh is expensive
- External sessions may number in the hundreds (tree clutter)

**Concession:** If usage shows demand, Phase 2 could add "Recent External" tree section

### Why show stale/non-resumable sessions?

**Rejected:** Hide sessions that fail `isSessionResumable()`

**Reasoning:**
- Users may be debugging why a session won't resume (file missing)
- Showing with warning icon signals "something's wrong, but I can see it"
- Picker is searchable — if user searches for a GUID, they expect to find it

**Safety:** Non-resumable sessions show error on selection, not on picker render

---

## Related Decisions

- **#322: Session resume validation** — reuse validation logic for external sessions
- **#317: Unified discovery flow** — similar picker pattern (discovered items → action)
- **Hierarchical filter UX** — QuickPick with sections + search is proven pattern

---

**Next Steps:**

1. Morty: Implement `editless.resumeExternalSession` command
2. Morty: Add session scan logic using `SessionContextResolver._ensureIndex()`
3. Morty: Wire QuickPick with session items + manual GUID fallback
4. Summer: Review implementation UX against this spec
5. Casey: Test with real external sessions (dogfood with raw CLI)




---

### 2026-03-01: Branching strategy — v0.1.3 ships from main, then branch

**By:** Casey Irvine (via Copilot)
**What:** v0.1.3 releases from main (includes auto-discover refactor #427). After #439 merges and any docs PRs, tag v0.1.3 on main. THEN create release/v0.1.x from that tag for any future 0.1.x hotfixes. From that point, main is the v0.2 dev line.
**Why:** User decision — auto-discover refactor is fine to ship in v0.1.3. Branching happens AFTER the v0.1.3 tag, not before.

---

### 2026-03-01: Worktree settings inherit from parent, with overrides

**By:** Casey Irvine (via Copilot)
**What:** Worktree agent settings should inherit from the parent agent's settings by default, but be individually overridable. E.g., if the parent has model=opus, the worktree agent gets model=opus unless explicitly changed. This is a layered settings model: parent defaults → worktree overrides.
**Why:** User directive — avoids having to re-configure every worktree copy. Makes the common case (same settings) effortless while still allowing per-worktree customization.


---

### 2026-03-01: Worktree Agent/Squad Discovery — Architecture Proposal

**Date:** 2026-03-01  
**Author:** Rick (Lead)  
**Status:** Proposed  
**Issue Context:** #422 (worktree support), #348 (branch names), Casey's "discovery dimension" insight

## Problem

EditLess discovery is flat. `discoverAll()` scans workspace folders and `~/.copilot/agents/` for agents and squads, returns a flat `DiscoveredItem[]`. No relationship between items.

When a user has git worktrees (e.g., `editless/` on `main`, `editless-v01/` on `release/v0.1.x`), those worktrees contain the *same squad* operating on different branches. Today they show as unrelated entries — or worse, only the one in the workspace shows up. Casey wants: discover a squad → automatically find its worktrees → show them as children.

## Architecture

### 1. Worktree Detection — New Module: `src/worktree-discovery.ts`

Single responsibility: given a repo path, return its worktrees.

```typescript
export interface WorktreeInfo {
  /** Absolute path to the worktree root */
  path: string;
  /** Git branch checked out in this worktree */
  branch: string;
  /** Whether this is the main worktree (bare checkout) */
  isMain: boolean;
  /** Whether this worktree has a .squad/ or .ai-team/ dir */
  hasSquadConfig: boolean;
}

/**
 * Run `git worktree list --porcelain` in the given repo and parse output.
 * Returns empty array if not a git repo or no worktrees.
 */
export async function discoverWorktrees(repoPath: string): Promise<WorktreeInfo[]>;

/**
 * Check if a path is inside a git repo (has .git file or directory).
 */
export function isGitRepo(dirPath: string): boolean;
```

**Why porcelain?** `git worktree list --porcelain` outputs machine-parseable format:
```
worktree /home/user/editless
HEAD abc123
branch refs/heads/main

worktree /home/user/editless-v01
HEAD def456
branch refs/heads/release/v0.1.x
```

No regex gymnastics. No locale issues. Fast (~5ms on local repos).

**Why async?** `git worktree list` shells out via `child_process.execFile`. Discovery runs on activation and refresh — we don't want to block the extension host. Use `execFile` with a reasonable timeout (5s).

### 2. Data Model — Extend `DiscoveredItem`

Add optional worktree metadata to the existing type. No new wrapper type — keeps the flat array contract intact while enabling the tree to group.

```typescript
export interface DiscoveredItem {
  id: string;
  name: string;
  type: 'agent' | 'squad';
  source: 'workspace' | 'copilot-dir';
  path: string;
  description?: string;
  universe?: string;

  // --- NEW: Worktree fields ---
  /** Git branch checked out at this item's path (if in a git repo) */
  branch?: string;
  /** ID of the parent item this is a worktree of (undefined = not a worktree child) */
  parentId?: string;
  /** If true, this is the main worktree (the original clone) */
  isMainWorktree?: boolean;
}
```

**Why extend, not wrap?** The entire pipeline (`discoverAll()` → `setDiscoveredItems()` → `getRootItems()` → `getChildren()`) operates on `DiscoveredItem[]`. A new wrapper type would require a parallel pipeline. The optional fields add zero overhead for non-worktree items and keep all existing code working unchanged.

**ID scheme for worktree children:** `{parentId}:wt:{branch-kebab}`. Example: `editless:wt:release-v0-1-x`. This ensures uniqueness and makes parent lookup trivial.

**Settings inheritance:** Per Casey's directive (`.squad/decisions/inbox/copilot-directive-worktree-settings-inheritance.md`), worktree agents inherit parent settings. `AgentSettingsManager.get(worktreeId)` falls back to `get(parentId)` if no override exists. This is a small change to `AgentSettingsManager.get()`:

```typescript
get(id: string): AgentSettings | undefined {
  const direct = this._cache.agents[id];
  if (direct) return direct;
  // Worktree fallback: if id contains ':wt:', try parent
  const wtIndex = id.indexOf(':wt:');
  if (wtIndex !== -1) {
    const parentId = id.substring(0, wtIndex);
    return this._cache.agents[parentId];
  }
  return undefined;
}
```

### 3. Discovery Integration — Post-Discovery Enrichment Phase

**NOT** integrated into the existing scan. Separate phase after `discoverAll()` returns.

```
discoverAll()          → flat DiscoveredItem[] (unchanged)
  ↓
enrichWithWorktrees()  → same array, with worktree children appended + branch/parentId populated
  ↓
setDiscoveredItems()   → tree provider renders parent-child
```

New function in `unified-discovery.ts`:

```typescript
/**
 * Post-process discovered items: for each squad/agent in a git repo,
 * find its worktrees and add them as child items.
 * Items already in the workspace (discovered independently) get their
 * branch populated but are NOT duplicated as children.
 */
export async function enrichWithWorktrees(
  items: DiscoveredItem[],
): Promise<DiscoveredItem[]>;
```

**Why post-discovery?**
1. `discoverAll()` is synchronous today. Worktree detection requires `execFile` (async). Changing `discoverAll()` to async would cascade through the entire activation path. Post-enrichment isolates the async boundary.
2. Separation of concerns: filesystem scanning vs. git metadata are different operations.
3. Testability: `enrichWithWorktrees()` can be tested independently with mocked `discoverWorktrees()`.

**Dedup logic:** If a worktree path is *already* a workspace folder (and thus already discovered), don't create a duplicate — just populate its `branch` and `parentId` on the existing item. Only create new `DiscoveredItem` entries for worktrees outside the workspace.

**Performance:** `git worktree list --porcelain` runs once per unique git repo root (not per item). Multiple squads in the same repo share one call. Cache results by repo root within a single enrichment pass.

### 4. Tree Integration — Parent-Child Rendering

Changes to `EditlessTreeProvider`:

**`getRootItems()`**: Filter out items where `parentId` is set. These are children, not roots.

```typescript
// In getRootItems():
const roots = this._discoveredItems.filter(i => !i.parentId && !this.agentSettings.isHidden(i.id));
```

**`getChildren(element)`**: When expanding a squad/agent that has worktree children, return them.

```typescript
// New case in getChildren():
if ((element.type === 'squad' || element.type === 'squad-hidden') && element.squadId) {
  const worktreeChildren = this._discoveredItems
    .filter(i => i.parentId === element.squadId);
  // ... existing squad children (terminals, roster) ...
  // Append worktree items as a "Worktrees" category
}
```

**Display:** Worktree children show as:
```
🔷 EditLess Squad          main · 2 sessions
  ├── 🌿 release/v0.1.x    1 session
  ├── 🌿 squad/442-feature  no sessions
  ├── Session 1
  ├── Session 2
  └── Roster (5)
```

New tree item type: `'worktree'` added to `TreeItemType`. Icon: `git-branch` theme icon (🌿 in emoji fallback). Description shows branch name + session count.

### 5. File Watching — `.git/worktrees/` Directory

Git stores worktree metadata in `.git/worktrees/`. A new worktree created via `git worktree add` creates a subdirectory there. Watching this directory detects worktree creation/deletion.

```typescript
// In extension.ts, after squad watcher setup:
for (const folder of (vscode.workspace.workspaceFolders ?? [])) {
  const gitWorktreesDir = path.join(folder.uri.fsPath, '.git', 'worktrees');
  if (fs.existsSync(gitWorktreesDir)) {
    const pattern = new vscode.RelativePattern(
      vscode.Uri.file(gitWorktreesDir), '*'
    );
    const wtWatcher = vscode.workspace.createFileSystemWatcher(pattern);
    wtWatcher.onDidCreate(() => debouncedRefreshDiscovery());
    wtWatcher.onDidDelete(() => debouncedRefreshDiscovery());
    context.subscriptions.push(wtWatcher);
  }
}
```

**Edge case:** The workspace folder might itself be a worktree (not the main checkout). In that case, `.git` is a file (not a directory) pointing to the main repo's `.git/worktrees/{name}`. Need to resolve the main `.git` directory first:

```typescript
function resolveGitDir(dirPath: string): string | null {
  const dotGit = path.join(dirPath, '.git');
  if (!fs.existsSync(dotGit)) return null;
  const stat = fs.statSync(dotGit);
  if (stat.isDirectory()) return dotGit;
  // .git is a file → read gitdir pointer
  const content = fs.readFileSync(dotGit, 'utf-8').trim();
  const match = content.match(/^gitdir:\s*(.+)$/);
  if (match) {
    const resolved = path.resolve(dirPath, match[1]);
    // Go up from .git/worktrees/{name} to .git/
    return path.resolve(resolved, '..', '..');
  }
  return null;
}
```

### 6. File Change Map

| File | Change | Size |
|------|--------|------|
| `src/worktree-discovery.ts` | **NEW** — `discoverWorktrees()`, `isGitRepo()`, `resolveGitDir()`, porcelain parser | ~120 LOC |
| `src/unified-discovery.ts` | Add `enrichWithWorktrees()`, extend `DiscoveredItem` with `branch`/`parentId`/`isMainWorktree` | ~60 LOC |
| `src/editless-tree.ts` | Filter roots by `!parentId`, add worktree children rendering, new `'worktree'` TreeItemType | ~40 LOC |
| `src/agent-settings.ts` | Parent fallback in `get()` for `:wt:` IDs | ~8 LOC |
| `src/extension.ts` | Call `enrichWithWorktrees()` after `discoverAll()`, add `.git/worktrees/` watcher | ~25 LOC |
| `src/types.ts` | No changes (worktree fields live on `DiscoveredItem`, not `AgentTeamConfig`) | 0 |
| Tests | `worktree-discovery.test.ts` (new), updates to `unified-discovery.test.ts`, `editless-tree.test.ts`, `agent-settings.test.ts` | ~200 LOC |

**Total:** ~250 LOC production, ~200 LOC tests. Small, focused.

### 7. Scope and Issue Recommendations

**New issue. Do not expand #422.**

\#422 is about "clone to worktree" — an *action* that creates a worktree from the EditLess UI. This proposal is about *discovery* — detecting existing worktrees automatically. They're related but orthogonal:
- Discovery works without #422 (user creates worktrees via CLI or the git-worktree skill)
- \#422 works without discovery (action creates worktree, user manually adds to workspace)
- Combined: #422 creates worktree → discovery picks it up automatically

**Recommended issue structure:**
1. **New issue: "Auto-discover git worktrees for agents/squads"** — this architecture. Core discovery + tree rendering.
2. **#422 stays as-is** — "Clone to worktree" action. Can reference the new issue as "see also."
3. **#348 (branch names in terminal labels)** — complementary but independent. Branch info from worktree discovery could *feed* #348, but #348 solves a different problem (showing branch in terminal title). No blocking dependency.

### 8. Dependency Analysis — v0.2 Execution Order

**Does NOT change the v0.2 execution order.**

- **#394 (scanner refactor):** Worktree discovery doesn't touch `scanner.ts`. Independent.
- **#395 (terminal manager refactor):** Worktree discovery doesn't change terminal management. Independent.
- **#399 (auto-discover refactor):** Already merged. This proposal builds on the post-#399 architecture (`discoverAll()`, `DiscoveredItem`, `AgentSettingsManager`). Correct dependency direction.

**Recommended sequencing:**
1. #394, #395 land first (as planned) — they clean up the codebase
2. Worktree discovery lands after — it's a new feature, not a refactor
3. #422 (clone to worktree) can land before or after — no dependency

**Why after Phase 1 refactors?** Not a hard dependency, but landing this on a clean codebase reduces merge conflicts. The tree provider changes in this proposal touch `getRootItems()` and `getChildren()` — same areas #394/#395 may refactor.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| `git worktree list` not available (git < 2.5) | `discoverWorktrees()` returns `[]` on error. Graceful degradation. |
| Worktree path is on a network drive (slow) | Timeout on `execFile` (5s). Cache results. Skip if previous call timed out. |
| Repo has 50+ worktrees (unlikely but possible) | Cap at 20 worktree children in tree view. Show "N more…" item. |
| `enrichWithWorktrees()` makes activation async | It already is — `extension.ts` activation uses `setTimeout` for deferred work. Run enrichment in the deferred phase. |

## Two-Sentence Summary

Worktree discovery is a post-discovery enrichment phase: `discoverAll()` (unchanged, sync) → `enrichWithWorktrees()` (new, async) → tree provider groups parents with worktree children. New module `worktree-discovery.ts` (~120 LOC) owns git interaction; existing files get ~100 LOC of surgical changes to support `parentId`/`branch` fields and parent-child rendering.

## Open Questions

1. Should worktree children be auto-expanded or collapsed by default?
2. Should we show worktrees for standalone agents (not just squads)?
3. If a worktree has different agents than the parent (e.g., squad member was added on a branch), how do we reconcile?


---

# v0.1.3 Release Docs — Workflow-First Documentation

**Date:** 2026-03-01  
**Author:** Summer  
**Status:** Completed

## Context

Casey requested v0.1.3 release docs prep with focus on "prepare to share more broadly." This is the first release where EditLess will be shared beyond the internal dogfooding audience — new users will discover it for the first time.

## Decision

Restructured documentation to be **workflow-first, not feature-first**. 

### README.md Features Section

**Before:** Technical feature list
- "Agent tree view" — what it has
- "Terminal integration" — what it does
- "Auto-detection" — how it works

**After:** Workflow story
- "Launch sessions from work" — what YOU do
- "Sessions grouped by agent" — what YOU see
- "Rename sessions" — what YOU control
- "Resume sessions" — what YOU can do next
- "Attention state" — what YOU know

**Why:** New users don't care what the extension "has" — they care what they can DO with it. The workflow story answers "How do I work with this?" instead of "What features does it have?"

### CHANGELOG.md v0.1.3

Added narrative intro paragraph with personality:
> "The auto-discovery release. We've eliminated the agent registry entirely — no more manual registration, no more stale configs. Just drop your agent files in your workspace and they appear, ready to work."

**Why:** Matches the tone of 0.1.1 and 0.1.2. The changelog tells a story about the release, not just a bulleted list. Each release has a theme and personality — 0.1.0 was "it works," 0.1.1 was "it works when you use it all day," 0.1.3 is "it works without making you think about it."

### SETTINGS.md — Agent Registry → Agent Settings

Replaced 100+ lines of `agent-registry.json` schema documentation (obsolete as of #427) with:
- **Agent Settings** section explaining auto-discovery
- How agent-settings.json works (user preferences)
- Migration notes from v0.1.2

**Why:** The registry is gone. Documenting a file that no longer exists is confusing. New users need to know how auto-discovery works, not how to hand-edit a JSON file.

## Impact

Documentation now tells a **user story** instead of a feature spec. First-time users will understand:
1. What they can accomplish (README features)
2. What changed and why (CHANGELOG narrative)
3. How to configure what they need (SETTINGS auto-discovery model)

## Key Learnings

- **Docs are product.** The README is the first impression — it needs to tell a story, not just list features.
- **Write for the person who's never seen this before.** Casey's audience (Microsoft engineers) are smart, but they're also busy. Make it scannable and actionable.
- **Migration notes matter.** Breaking changes need clear migration paths. "Auto-migrated on first activation, old file left for cleanup" gives users confidence.
- **Personality in changelogs.** The narrative intro paragraph makes the changelog readable and memorable. It's not just a compliance doc — it's part of the product voice.


---

### 2026-03-01: Worktree Agent Hierarchy in the EditLess Tree View

**Date:** 2026-03-01  
**Author:** Summer (Product Designer)  
**Status:** Proposed  
**Issue Context:** Worktree discovery & hierarchy UX for EditLess sidebar

---

## Problem

Casey uses git worktrees as his primary development pattern. When a repo contains a `.squad/` directory (or agents), each worktree is a full copy of that agent/squad — with its own sessions, its own state, and potentially its own configuration overrides. Today, EditLess shows agents in a flat list discovered from workspace folders. If Casey has worktrees open as workspace folders, they'd appear as separate, disconnected squads with the same name — confusing and noisy.

**Core user need:** "I want to see all my worktree copies of a squad grouped together, know which branch each one is on, and launch sessions against the right one — without thinking about it."

---

## Recommendation: Nested Under Parent (Option A)

After evaluating all options, **nested hierarchy** is the right call. Here's why:

1. **Mental model match.** Casey already thinks of worktrees as "copies of the same repo on different branches." Nesting mirrors that mental model — one squad, multiple workspaces.
2. **Noise reduction.** Flat-with-annotation would triple the top-level items for a repo with 2 worktrees. The sidebar gets cluttered fast.
3. **Consistent with VS Code patterns.** Source Control already nests repositories. Explorer nests folders. EditLess should follow the platform's information architecture.
4. **Supports the settings inheritance decision.** The existing directive (worktree settings inherit from parent) implies a parent→child relationship. The tree should reflect that.

---

## Tree Design

### Primary Scenario: Main checkout + 2 worktrees, all in workspace

```
🤖 Copilot CLI                          Generic Copilot agent
🔷 EditLess (main)                      squad · 2 worktrees
  ├─ 🌿 feat/auth                       worktree · 1 session
  │    └─ 🟢 Session 1                  3m ago
  ├─ 🌿 fix/crash                       worktree
  │    └─ 💤 No active sessions         Click + to launch
  ├─ 🚀 Session 2                       5m ago
  ├─ 🕐 Session 3 (resumable)           previous session — resume
  └─ 👥 Roster (6)
```

**Key design choices:**

| Element | Treatment | Rationale |
|---------|-----------|-----------|
| Parent squad | `🔷 Name (branch)` | Same as today, branch in parens |
| Worktree nodes | `🌿 branch-name` | Leaf icon = branch. Distinct from `🔷` squad or `🚀` session |
| Worktree description | `worktree · N sessions` | Mirrors squad description pattern |
| Session under worktree | Same `🚀`/`🟢`/`💤` icons | Reuse existing session state icons |
| Roster | Only on parent | Roster is the same across worktrees (same `.squad/team.md`) |
| Orphaned sessions | Under their respective worktree or parent | Sessions are CWD-scoped, so they naturally belong where they ran |

### Icon Legend

| Icon | ThemeIcon | Meaning |
|------|-----------|---------|
| 🌿 | `$(git-branch)` | Worktree (branch checkout) |
| 🔷 | `$(organization)` | Squad (parent, existing) |
| 🤖 | `$(hubot)` | Standalone agent (existing) |
| 🚀 | `$(loading~spin)` | Active session (existing) |
| 💤 | `$(circle-outline)` | Inactive session (existing) |
| 🕐 | `$(history)` | Resumable orphan (existing) |

The `$(git-branch)` ThemeIcon is already in VS Code's icon set and instantly communicates "this is a branch." No custom assets needed.

---

## Naming & Labeling Conventions

### Tree item labels

| Scenario | Label | Description |
|----------|-------|-------------|
| Parent (main checkout) | `🔷 EditLess (main)` | Name + branch in parens |
| Parent (no worktrees) | `🔷 EditLess` | No branch annotation needed (same as today) |
| Worktree node | `🌿 feat/auth` | Branch name only — squad name is redundant (it's nested) |
| Worktree (detached HEAD) | `🌿 abc1234` | Short SHA when no branch |

### Description text (grey, right-aligned)

| Item | Description |
|------|-------------|
| Parent with worktrees | `squad · 2 worktrees` |
| Parent without worktrees | `squad` (same as today) |
| Worktree with sessions | `worktree · 1 session` |
| Worktree without sessions | `worktree` |
| Standalone agent with worktrees | `2 worktrees` |

### Tooltip (on hover)

Parent tooltip adds a "Worktrees" section:

```markdown
**🔷 EditLess**
Path: `C:\Users\cirvine\code\work\editless`
Universe: rick-and-morty
Branch: main

**Worktrees:**
- feat/auth → `C:\Users\cirvine\code\work\editless-feat-auth`
- fix/crash → `C:\Users\cirvine\code\work\editless-fix-crash`
```

Worktree tooltip:

```markdown
**🌿 feat/auth**
Path: `C:\Users\cirvine\code\work\editless-feat-auth`
Parent: EditLess (main)
Branch: feat/auth
```

---

## Interaction Design

### Click behavior

| Target | Action |
|--------|--------|
| Parent squad | Expand/collapse (same as today) |
| Worktree node | Expand/collapse to show sessions |
| Session under worktree | Focus terminal (same as today) |

### Context menu (right-click)

**On worktree node (`🌿 feat/auth`):**

| Action | Command | Group |
|--------|---------|-------|
| ▶️ Launch Session | `editless.launchSession` | `inline@0` |
| Resume Session… | `editless.resumeSession` | `session@1` |
| Open Folder in Workspace | `editless.openWorktreeFolder` | `worktree@1` |
| Copy Path | `editless.copyWorktreePath` | `worktree@2` |
| Remove from Tree | `editless.hideWorktree` | `worktree@3` |

**Not on worktree node:** Rename, Change Model, Squad Settings — these are parent-level actions (settings inheritance means you configure the parent). If a user needs per-worktree overrides, they use the parent's "Go to Squad Settings" and add worktree-specific overrides there.

**On parent squad with worktrees — additions to existing menu:**

| Action | Command | Group |
|--------|---------|-------|
| Discover Worktrees | `editless.discoverWorktrees` | `squad@6` |

This is a manual refresh for worktree discovery — useful if the user creates a new worktree while EditLess is running.

### Expand/collapse defaults

| Item | Default State | Rationale |
|------|--------------|-----------|
| Parent squad | **Expanded** | Same as today when it has sessions |
| Worktree with active sessions | **Expanded** | Active work should be visible |
| Worktree with no sessions | **Collapsed** | Don't waste vertical space on empty worktrees |
| Worktree with only orphaned sessions | **Collapsed** | Not urgent; expand when needed |
| Roster | **Collapsed** | Same as today |

---

## Discovery Logic

### How worktrees are found

1. **On discovery refresh** (startup + manual refresh + file watcher): For each discovered squad, run `git worktree list --porcelain` from the squad's path.
2. **Parse output** to get each worktree's path and branch.
3. **Filter:** Only include worktrees whose path either:
   - Is in the current VS Code workspace, OR
   - Exists on disk (for repos where the user may not have added all worktrees to workspace)
4. **Match to parent:** Worktrees share the same git repository (same `.git` or `.git` file pointing to shared objects). Use the common git dir to link worktree → parent.

### Discovery setting

```jsonc
// settings.json
{
  // Whether to auto-discover worktrees for squad repos
  "editless.discovery.worktrees": true,  // default: true

  // Whether to show worktrees that aren't in the current workspace
  "editless.discovery.worktreesOutsideWorkspace": false  // default: false
}
```

When `worktreesOutsideWorkspace` is `true`, EditLess shows all worktrees on disk (useful for Casey's workflow where he may not add every worktree to the workspace). When `false`, only workspace-folder worktrees appear.

---

## Edge Cases

### 1. Main checkout absent, worktree present

**Scenario:** User has `~/code/editless-feat-auth` (worktree) in their workspace but NOT `~/code/editless` (main checkout).

**Design:** The worktree promotes itself to a top-level item, but shows the parent relationship:

```
🔷 EditLess (feat/auth)                 squad · worktree of main
  ├─ 🚀 Session 1                       3m ago
  └─ 👥 Roster (6)
```

- Label uses the squad name (not the branch name) because it's at the top level now.
- Description says `worktree of main` so the user knows this isn't the primary checkout.
- Tooltip includes the main checkout path even though it's not in the workspace.
- If the main checkout is later added to the workspace, the worktree re-nests under it automatically.

### 2. Multiple worktrees, only some in workspace

```
🔷 EditLess (main)                      squad · 1 worktree
  ├─ 🌿 feat/auth                       worktree · 1 session
  │    └─ 🚀 Session 1                  3m ago
  ├─ 🚀 Session 2                       5m ago
  └─ 👥 Roster (6)
```

Only the `feat/auth` worktree is in the workspace, so only it appears. `fix/crash` exists on disk but isn't shown (unless `worktreesOutsideWorkspace` is enabled, in which case it shows dimmed):

```
🔷 EditLess (main)                      squad · 2 worktrees
  ├─ 🌿 feat/auth                       worktree · 1 session
  │    └─ 🚀 Session 1                  3m ago
  ├─ 🌿 fix/crash                       worktree (not in workspace)
  ├─ 🚀 Session 2                       5m ago
  └─ 👥 Roster (6)
```

The "not in workspace" worktree uses `disabledForeground` color and its context menu offers "Open Folder in Workspace" as the primary action.

### 3. Personal agents AND squad agents in worktrees

Standalone agents (`.agent.md` files) and squads (`.squad/` directories) are discovered independently. If a worktree contains both:

```
🔷 My Squad (main)                      squad · 1 worktree
  ├─ 🌿 feat/auth                       worktree
  └─ 👥 Roster (6)
🤖 code-reviewer                        workspace
```

The standalone agent (`code-reviewer.agent.md`) is NOT nested under the squad — it lives at the top level as it does today. Only squad/agent items that share the **same git repository** and the **same `.squad/` directory** are grouped.

### 4. Worktree and main on the same branch (bare repo pattern)

If the main checkout is a bare repo (no working tree) and all work happens in worktrees:

```
🔷 EditLess                             squad · 3 worktrees
  ├─ 🌿 main                            worktree · 2 sessions
  │    ├─ 🚀 Session 1                  3m ago
  │    └─ 🚀 Session 2                  10m ago
  ├─ 🌿 feat/auth                       worktree
  └─ 🌿 fix/crash                       worktree · 1 session
       └─ 🚀 Session 3                  1m ago
```

The bare repo root has no branch label (no `(main)` suffix). All branches are worktrees.

### 5. Worktree removed from disk

If a previously-discovered worktree no longer exists:
- Remove it from the tree silently on next refresh.
- If it had orphaned sessions, those sessions move to the parent squad's orphaned sessions list.

### 6. Same squad discovered from both main and worktree workspace folders

Dedup by git repository identity (shared `.git` objects directory). The first-discovered path (typically the main checkout) becomes the parent. The worktree is nested under it. The `discoverAll()` function already deduplicates by ID — we extend this to detect worktree relationships before dedup.

---

## Data Model Changes

### New tree item type

Add `'worktree'` to `TreeItemType`:

```typescript
export type TreeItemType = 'squad' | 'squad-hidden' | 'category' | 'agent' 
  | 'terminal' | 'orphanedSession' | 'default-agent' | 'worktree';
```

### New fields on DiscoveredItem

```typescript
export interface DiscoveredItem {
  // ... existing fields ...

  /** If this item is a worktree, the branch name */
  worktreeBranch?: string;
  /** If this item is a worktree, the parent item's ID */
  worktreeParentId?: string;
  /** If this item has worktrees, their IDs */
  worktreeChildIds?: string[];
}
```

### Context value for menus

Worktree nodes get `contextValue = 'worktree'` so package.json `when` clauses can target them:

```json
{
  "command": "editless.launchSession",
  "when": "view == editlessTree && viewItem == worktree",
  "group": "inline@0"
}
```

---

## Implementation Priority

This is a UX proposal — implementation is Morty's domain. Suggested phasing:

1. **Phase 1 — Discovery:** `git worktree list --porcelain` integration in `unified-discovery.ts`. Detect worktree relationships. Enrich `DiscoveredItem` with worktree metadata.
2. **Phase 2 — Tree rendering:** New `getWorktreeChildren()` in `editless-tree.ts`. `$(git-branch)` icon. Collapse behavior.
3. **Phase 3 — Context menus:** `package.json` contributions for worktree actions. "Open Folder in Workspace" command.
4. **Phase 4 — Settings:** `worktrees` and `worktreesOutsideWorkspace` discovery settings. Settings inheritance (already decided, see `copilot-directive-worktree-settings-inheritance.md`).

---

## Two-Sentence Summary

Worktree copies of a squad nest under their parent with a `$(git-branch)` icon and branch name, keeping the sidebar clean while making every worktree launchable. When the main checkout is absent, the worktree promotes itself to top level with a "worktree of {branch}" annotation so the user always knows what they're looking at.

