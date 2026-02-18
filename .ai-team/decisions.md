

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
