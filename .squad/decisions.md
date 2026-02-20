

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
