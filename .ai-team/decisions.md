# Decisions

> Canonical decision log for the EditLess project. All agents read this before starting work.


### 2026-02-15: Product name — EditLess
**By:** Casey Irvine (user directive)
**What:** The product is called "EditLess" throughout. Rebranding from prototype name "Squad Dashboard".
**Why:** User directive — this is a polished product, not a prototype.


### 2026-02-15: Remove redactor module
**By:** Casey Irvine (user directive)
**What:** The redactor module from the prototype must be removed before first commit.
**Why:** User directive — feature not needed for EditLess.


### 2026-02-15: Distribution — GitHub Releases (private)
**By:** Casey Irvine (user directive)
**What:** Distribute VSIX via GitHub Releases on cirvine-MSFT/editless (private repo). VS Code Marketplace later when ready to go public.
**Why:** Internal Microsoft distribution only for now. Private repo restricts access to invited collaborators.


### 2026-02-15: Universe override — Rick and Morty
**By:** Casey Irvine (user directive)
**What:** Team cast from Rick and Morty (user override of default allowlist).
**Why:** User preference.


### 2026-02-15: Tasks feature — Issues + Labels MVP
**By:** Casey Irvine (user directive)
**What:** EditLess tasks feature builds on GitHub Issues + Labels. No Projects API integration for MVP. Smart dependency parsing (reading issue bodies for "depends on #N" patterns) is a future enhancement, not MVP.
**Why:** Issues + Labels is the universal GitHub primitive — 90% of users have it. Projects adds complexity without enough MVP value. Dependency parsing is a differentiator to explore later.


### 2026-02-15: Domain terminology — agents (generic) with squads (specific)
**By:** Casey Irvine (user directive)
**What:** EditLess uses "agent" as the generic term. "Squad" refers specifically to teams created by the Squad CLI (bradygaster/squad). The extension supports agents generically, with enhanced features for squads. User-facing text should say "agent" or "team" where possible, not "squad" — unless specifically referring to the Squad product.
**Why:** EditLess is broader than Squad. It's an agent management tool. Squads are one type of agent team it supports.


### 2026-02-15: Agent taxonomy — squads are a labeled type of agent
**By:** Casey Irvine (user directive)
**What:** In EditLess, "agent" is the base concept. A "squad" is a specific type of agent that gets labeled as such (because it was created by the Squad CLI and has .ai-team/ structure). Squad-labeled agents get enhanced features (roster view, decisions, activity). Non-squad agents get basic management. This is a UX concern to be designed later — not part of the initial port.
**Why:** EditLess supports multiple agent types. Squads are special, not the default. Taxonomy details deferred to UX design phase.


### 2026-02-15: CLI provider architecture — hybrid profile + presence detection
**By:** Casey Irvine (user directive)
**What:** EditLess uses a provider model for CLI backends. Known CLIs (copilot, agency, claude) get built-in profiles with version checking and update support. Custom/unknown CLIs get presence-only detection (exit code check) — they work for terminal management but don't get version/update features. Setting: `editless.cli.provider` with values `copilot` (default), `agency`, `claude`, or `custom`. The `agency-updater.ts` module generalizes into a CLI provider system. This makes EditLess tool-agnostic and public-friendly while giving first-party tools a polished experience.
**Why:** EditLess should work with any CLI that launches agents. Hardcoding agency limits the audience. Provider profiles give known tools a great experience without requiring users to configure regex patterns for version parsing. Custom CLIs still get the core value (terminal and session management).


### 2026-02-15: Progressive feature detection — features light up based on environment
**By:** Casey Irvine (user directive)
**What:** EditLess uses progressive detection to light up features based on what's installed in the user's environment. Nothing shows unless it's relevant:
- **Agency detected** (`agency --version` succeeds): Auto-add agency CLI profile. Show update button, version info. First-party Microsoft experience lights up automatically — no config needed.
- **Copilot CLI detected**: Auto-add copilot profile. Default for public users.
- **Squads detected** (`.ai-team/` directories found): Show squad-specific features — upgrade button (`npx github:bradygaster/squad upgrade`), roster view, decisions, activity. These features are hidden if user has no squads.
- **No tools detected**: Basic terminal management only. Extension still works.
The squad upgrader (`squad-upgrader.ts`) follows this same principle — it becomes a squad-specific feature module that only registers commands/UI when squads are present. The extension is progressive: starts minimal, adds UI as it discovers tools and agent teams.
**Why:** Makes EditLess work for everyone out of the box. Microsoft users get the full experience automatically (agency auto-detected). Public users get copilot + terminal management. Nobody sees features for tools they don't have. Agency being visible in the extension is acceptable — it's just a CLI name with an update command.


### 2026-02-15: Coding style — readable functions over comments, why-comments only
**By:** Casey Irvine (user directive)
**What:** Code should be self-documenting through well-named functions, not verbose comments. Comments are reserved for "why" explanations — when a feature wasn't available, a workaround was needed, something wasn't working as expected, or a non-obvious decision was made. No "what" comments that just describe what the code does. Wrap logic in readable functions instead.
**Why:** User preference. Code clarity comes from structure, not narration. Why-comments capture institutional knowledge that can't be expressed in code.


### 2026-02-15: Tented terms must not be hardcoded in source
**By:** Casey Irvine (user directive)
**What:** The TENTED_TERMS array in discovery.ts must not contain hardcoded sensitive terms (openai, coeus, or any internal project names). Make tented terms configurable via user settings (`editless.tented.terms`, default: empty array). Test fixtures must use generic placeholder names, not real internal project names. Scan all ported code for "openai" and "coeus" before committing.
**Why:** This repo may go public. Hardcoded tented terms and internal project names in test data would leak confidential information.


### 2026-02-15: Remove tented feature entirely
**By:** Casey Irvine (user directive)
**What:** The entire "tented" concept is removed from EditLess. No tented terms, no tented detection, no tented guards, no tented field on config types. Remove `TENTED_TERMS`, `isTentedSquadPath()`, the `tented: boolean` field from the config type, and all conditional branches that check `config.tented`. Remove all associated test cases and fixtures. This includes stripping all references to "openai" and "coeus" from the codebase.
**Why:** Tented feature was Microsoft-internal. Hardcoded sensitive terms and internal project names cannot ship in a potentially public repo. The feature itself has no value outside Microsoft's context.


### 2026-02-15: Branch naming convention — `cirvine/{feature}`
**By:** Casey Irvine (user directive)
**What:** Feature branches use `cirvine/{feature-name}` (alias/feature). No `users/` prefix on this project. Example: `cirvine/cli-provider`, `cirvine/task-view`. Worktrees go in `editless.wt/{branch-name}/`.
**Why:** Simpler convention for a solo-dev project. The `users/` prefix adds noise when there's one contributor.


### 2026-02-15: Command category pattern — clean context menus with discoverability
**By:** Casey Irvine (user request), Morty (implementation pattern)
**What:** Commands use `"category": "EditLess"` instead of "EditLess: " title prefix. VS Code displays `Category: Title` in the command palette (preserving discoverability) but shows only the title in context menus (clean UX). All commands should follow this pattern: set `"category": "EditLess"` on the command and keep the title clean and action-focused.
**Why:** Context menus are already extension-scoped — the prefix adds noise. Using the `category` field is a VS Code API convention that gives both discoverability and brevity.


### 2026-02-15: Squad CLI commands — init vs upgrade
**By:** Casey Irvine (via Copilot)
**What:** Squad uses `squad init` for initial install (no `.ai-team/` exists yet) and `squad upgrade` for upgrading an existing squad. EditLess must be mindful of whether a squad has been initted or not and use the correct command.
**Why:** User request — captured for team memory


### 2026-02-15: Table agency install feature
**By:** Casey Irvine (via Copilot)
**What:** Do NOT offer to install Agency if it's not detected. Checking the Agency endpoint or exposing where Agency is available would leak first-party Microsoft information into this repo. Agency install/detection is out of scope for the internals release. Squad install (via npx) is fine to offer.
**Why:** User request — too much first-party Microsoft info to put into a public-facing repo


### 2026-02-15: Orphan TTL uses rebootCount, not wall-clock time
**By:** Morty (Extension Dev), issue #53
**Date:** 2025-07-19
**What:** Orphan eviction uses a `rebootCount` integer (incremented each reconciliation cycle) rather than a wall-clock TTL timestamp. Entries are auto-cleaned after `rebootCount >= 2` — meaning they survived two full reload cycles without matching a live terminal.
**Why:** Wall-clock TTL is unreliable for VS Code extensions because the extension host sleeps between reloads. A 24-hour TTL could evict a legitimate session that was simply part of a weekend break, while a short TTL could fire during a single long reload cycle. Counting reload cycles is deterministic and maps directly to the intent: "this terminal didn't come back after two chances."
**Impact:** `PersistedTerminalInfo` gains `lastSeenAt` (timestamp, for future diagnostics) and `rebootCount` (integer, for eviction logic). Existing persisted data without these fields is safely handled via nullish coalescing defaults. The `MAX_REBOOT_COUNT` constant (2) is a static on `TerminalManager` — easy to make configurable later if needed.


### 2025-07-18: Label taxonomy — namespaced `prefix:value` scheme
**By:** Casey Irvine (planning session), Squad Coordinator
**What:** All labels use `prefix:value` syntax within 6 namespaced categories: `type:` (bug, feature, spike, chore, docs, epic), `priority:` (p0, p1, p2), `status:` (needs-plan, planned, in-progress, review), `squad:` (agent assignment), `release:` (version targeting), `go:` (decision gate). Labels are mutually exclusive within their namespace. Only standalone label is `duplicate`. Old GitHub defaults and duplicates (bug, enhancement, docs, etc.) are deleted.
**Why:** Eliminates duplication (41→30 labels), makes agent parsing unambiguous, and ensures consistent tagging across the team. Agents can reliably parse `prefix:` syntax for routing and workflow automation.


### 2025-07-18: Plan→Execute→Review workflow with label lifecycle
**By:** Casey Irvine (planning session), Squad Coordinator
**What:** Issues follow: `status:needs-plan` → `status:planned` → `status:in-progress` → close (via PR merge). Complex PRs get `status:review` for human gate. Planning session owns `needs-plan → planned` transitions. Coding session owns `planned → in-progress → close`. Agent reviewer can flag `status:review` when human attention needed. Plans are linked files (not issue comments). No `done` label — closing the issue IS done. `release:backlog` takes precedence over `status:planned` (don't pick up backlog items).
**Why:** Gives agents a clear, automatable workflow. The human gate (`status:review`) keeps Casey in the loop for complex decisions without creating bottlenecks on routine work.


### 2025-07-18: Cross-platform label compatibility (GitHub ↔ ADO)
**By:** Casey Irvine (planning session), Squad Coordinator
**What:** `status:`, `squad:`, and `go:` labels are portable across GitHub and ADO (colons allowed in ADO tags). `type:` and `priority:` are GitHub-only — ADO handles these natively via Work Item Type and Priority field. Users should use the portable labels identically on both platforms for a consistent experience.
**Why:** EditLess supports both GitHub and ADO. A consistent labeling story means users don't have to learn two systems. Portable labels enable cross-platform workflow automation.


### 2025-07-18: Area labels for lightweight issue grouping (GitHub-only)
**By:** Casey Irvine (planning session), Squad Coordinator
**What:** `area:{theme}` labels group related issues by topic without implying parent-child hierarchy. Color: `#0969DA` (blue). NOT mutually exclusive — issues can have multiple `area:` labels. Created ad-hoc as clusters emerge, deleted when the cluster is resolved. Not enforced in `squad-label-enforce.yml` (no exclusivity) or `sync-squad-labels.yml` (not a fixed set). **GitHub-only** — ADO has native grouping concepts that should be used instead.
**Why:** `type:epic` implies parent-child hierarchy which doesn't fit ad-hoc clusters. `area:` is lightweight, widely understood (Kubernetes, VS Code use similar patterns), and lets agents and humans see at a glance which issues are related.


### 2025-07-18: ⛔ CRITICAL — Git worktrees required — NEVER checkout a branch in the main clone
**By:** Casey Irvine (user directive, reinforced 2026-02-16)
**What:** **ABSOLUTE RULE — NO EXCEPTIONS.** The main clone (`C:\Users\cirvine\code\work\editless`) stays on `master` at ALL times. `git checkout <any-branch>` in the main clone is FORBIDDEN. All feature branch work MUST use git worktrees (`git worktree add ../editless-wt-{name} squad/{branch}`). `.ai-team/` changes that need to be committed go on master locally, then get PR'd from a separate worktree if needed. The main clone is pull-only — you fetch and pull, never push or checkout branches from it.
**Why:** Multiple concurrent sessions share the main clone. Checking out a branch there breaks every other session. This has been violated repeatedly despite being documented — agents keep checking out branches on the main clone instead of using worktrees. This directive must be treated as a hard constraint, not a suggestion. Any agent that runs `git checkout <branch>` in the main clone directory is violating a critical user directive.
**Reinforced 2026-02-16:** Agent spawned for #213 violated this rule by checking out a branch directly on the main clone, breaking Casey's working state. This pattern has repeated multiple times. Casey is escalating this from documentation to a hard constraint enforced through code reviews.


### 2026-02-15: Generalized provider update infrastructure
**By:** Morty (Extension Dev), issue #14
**What:** CLI update checking is now driven by optional fields on `CliProvider` (`updateCommand`, `upToDatePattern`, `updateRunCommand`). To add update support for a new CLI provider, populate these fields in `KNOWN_PROFILES` — no new code paths needed. The startup loop (`checkProviderUpdatesOnStartup`) iterates all detected providers with `updateCommand` set, and cache keys are scoped per-provider.
**Why:** Avoids duplicating update logic per CLI. When we discover how `copilot` or `claude` check for updates, we just add the fields to their profile entries.


### 2026-02-15: EditLess brand taglines and tone
**By:** Casey Irvine (via Copilot)
**What:** Approved taglines for docs, marketing, and README: "Leave the editor for your mind." / "Microsoft Teams is the IDE of the future." / "Give yourself a promotion, manage your teams of AI agents." / "Join the editorless software development revolution." / "Edit less, effortless." Previously captured: "Plan, delegate, and review your AI team's work."
**Why:** User request — establishing the voice and tone for EditLess branding and documentation.


### 2026-02-15: Dictation input — expect Handy transcription artifacts
**By:** Casey Irvine (via Copilot)
**What:** Casey dictates using Handy, which sometimes produces repeated words or misspellings. Don't second-guess — ask if something is unclear.
**Why:** User request — captured for team memory.


### 2026-02-15: Multi-repo workflow philosophy — don't open repos, open a workspace
**By:** Casey Irvine (via Copilot)
**What:** The EditLess philosophy is: don't open VS Code in a repo. Open it in a central folder and work across multiple repos simultaneously. Think in terms of working with agents, not in terms of an editor tied to one repo. This should be a core part of the documentation and philosophy sections.
**Why:** User directive — this is a fundamental EditLess workflow pattern that changes how people think about their dev environment.


### 2026-02-15: Acknowledge rapid tooling evolution in docs
**By:** Casey Irvine (via Copilot)
**What:** Documentation should acknowledge that AI dev tools are changing rapidly and EditLess may need to evolve quickly. Be honest with users that this space moves fast.
**Why:** User request — sets expectations and builds trust with users.


### 2026-02-15: Recommend Squad as the starting point for new vibe coders
**By:** Casey Irvine (via Copilot)
**What:** Documentation should recommend Squad as the entry point for people new to vibe coding or feeling overwhelmed by the agent landscape. Squad makes it easy and fun. This goes in the recommendations/philosophy docs — if you're new, start with Squad.
**Why:** User directive — many people reaching out are intimidated by the agent landscape. Squad lowers the barrier.


### 2025-07-18: Git safety — no rebases, no amend commits
**By:** Casey Irvine (user directive)
**What:** Never use `git rebase` or `git commit --amend`. Use merge commits (`git merge`) for integrating branches. If a mistake is made, fix it with a new commit on top — don't rewrite history. Fast-forward merges are fine (they don't rewrite anything). These rules apply to all agents and sessions.
**Why:** Rebases are destructive and create conflict headaches across concurrent sessions. Amend commits cause push failures when branches are already upstream. With multiple sessions working in parallel, history rewriting is too risky.


### 2026-02-15: PR workflow — CI gates before merge, no more direct-to-master
**By:** Casey Irvine (user directive)
**What:** Stop merging feature branches directly to master. New flow:
1. Agent pushes to feature branch (unchanged)
2. Open a **ready-for-review PR** (not draft) with `gh pr create`
3. **If no human review needed:** Add `--auto --squash` flag so PR auto-merges when CI passes. If CI fails, fix and push — auto-merge will trigger again.
4. **If human review needed** (🟡 flagged, design-sensitive, or uncertain): Create PR without `--auto`, tag as needs-review, and notify Casey. Do NOT merge until Casey approves.
5. After merge, continue with build/package/install as before.
**Why:** We now have real CI gates (lint, build, test, integration). Direct merges bypass them. This ensures every change passes gates before hitting master. Draft PRs aren't needed — it's just Casey, so the draft→publish step adds no value. The `--auto` flag makes routine work zero-friction while still gated.
**Supersedes:** The "all PRs start as drafts" convention is retired for this project.


### 2026-02-16: NEVER merge PRs with failing CI — use --auto --squash
**By:** Casey Irvine (user directive)
**What:** Agents MUST ensure CI checks pass before merging any PR. Branch protection is now configured on the public repo with required status checks (`Lint, Build & Test`, `VS Code Integration Tests`, `scan`). Rules:
1. **Always use `gh pr merge {number} --auto --squash`** after creating a PR. The `--auto` flag waits for required checks to pass before merging.
2. **If CI fails, fix it first.** Push fixes to the branch — `--auto` will re-evaluate and merge when checks go green.
3. **Never bypass failing checks.** No exceptions. If checks are flaky, fix the flakiness — don't merge around it.
**Why:** 4 of the last 10 merged PRs (when repo was private) had failing CI. Branch protection with required status checks now enforces this at the platform level. The `--auto` flag is the correct mechanism.
**Supersedes:** The procedural `gh pr checks --watch` workaround from earlier today (no longer needed — branch protection handles it).


### 2026-02-16: TreeDataProvider must implement getParent() when using reveal()
**By:** Morty (Extension Dev), issue #95
**What:** `EditlessTreeProvider` stores a `parent` reference on `EditlessTreeItem`, set during child construction. `getParent(element)` returns `element.parent`. Any code path that constructs tree items for use with `reveal()` (like `findTerminalItem`) must also set the parent reference.
**Why:** VS Code's `TreeView.reveal()` requires `getParent()` to walk from the target item back to the root. Without it, the extension host throws. This is a VS Code API contract — not optional when `reveal()` is used.


### 2026-02-16: Multi-signal terminal reconciliation
**By:** Morty (Extension Dev), issue #84
**What:** Terminal reconciliation now uses a 4-stage matching strategy instead of exact `terminal.name` comparison:
1. Exact match on `terminalName` (the last-known name)
2. Exact match on `originalName` (the name from `createTerminal()`, never mutates)
3. Exact match on `displayName` (the user-facing label)
4. Contains match — `terminal.name.includes(originalName)` or `terminalName.includes(terminal.name)`

Stages run globally across all persisted entries — higher-confidence matches claim terminals before fuzzy matches get a chance. A `Set<vscode.Terminal>` tracks claimed terminals to prevent double-assignment.

**Why:** `terminal.name` is mutable — CLI processes can rename it via escape sequences, and VS Code may restore with a different name after reload. The old exact-match strategy created false orphans and silently dropped entries when names collided. The staged approach maximizes reconnection success while preserving correctness (exact matches always win over fuzzy ones).

**Impact:** `PersistedTerminalInfo` gains optional `originalName` field (backward-compatible — defaults to `displayName` when missing). `TerminalInfo` gains required `originalName: string`. `reconnectSession()` is a new public method on `TerminalManager` — searches live terminals before creating duplicates. `relaunchSession()` now tries reconnect first, only creates a new terminal if no match found.


### 2026-02-16: Session State Detection Implementation
**By:** Morty (Extension Dev), issue #50
**What:** Implemented rich session state detection for terminal sessions using VS Code shell integration APIs. Sessions now show granular state: `active`, `idle`, `stale`, `needs-attention`, or `orphaned`.

**How:**
1. Shell Integration: Subscribed to `onDidStartTerminalShellExecution` and `onDidEndTerminalShellExecution` events to track when commands are running
2. Activity Tracking: Maintain `_shellExecutionActive` and `_lastActivityAt` maps per terminal
3. State Computation: `getSessionState()` method determines state based on execution active, recent activity (<5 min), activity 5-60 min, activity >60 min, inbox items + not active, or no live terminal
4. Tree View: Icons and descriptions update based on state via `getStateIcon()` and `getStateDescription()` helpers

**Technical Decisions:**
- Idle threshold: 5 minutes (IDLE_THRESHOLD_MS)
- Stale threshold: 60 minutes (STALE_THRESHOLD_MS)
- Needs-attention overrides idle/stale but NOT active (don't interrupt actively working agents)
- Icon mapping: active→debug-start, needs-attention→warning, orphaned→debug-disconnect, idle/stale→terminal
- Helper functions exported for tree view use and testability

**Why:** Users need to know at a glance which sessions are actively working, which are idle, and which need attention. Shell integration events provide reliable, low-overhead detection without polling. The 5-minute and 60-minute thresholds match typical workflow patterns (quick tasks vs. long-running builds).

**Impact:** Requires VS Code 1.93+ (released 18 months ago, 85-95% adoption). Updated `engines.vscode` in package.json from `^1.100.0` to `^1.93.0`.


### 2026-02-16: CI/CD pipeline structure
**By:** Birdperson (DevOps), issue #82
**What:** Three GitHub Actions workflows handle the full CI/CD lifecycle:
- **`ci.yml`** — Lint, build, test on every push/PR to main/master. Single job, <5 min target.
- **`release.yml`** — Full quality gate + VSIX packaging + GitHub Release. Triggered by `v*.*.*` tags or manual `workflow_dispatch`. Pre-release detection for alpha/beta/rc tags.
- **`integration.yml`** — VS Code integration tests (`xvfb-run`) in a separate workflow. Runs on push/PR but does not block main CI.

Key choices:
- Node 22 LTS across all workflows (upgraded from 20)
- `npm ci` everywhere — deterministic installs from lockfile
- Version from `package.json` — single source of truth. Tags should match but package.json wins.
- `workflow_dispatch` on release — allows manual releases using package.json version + commit SHA as release name
- `softprops/action-gh-release@v2` for GitHub Releases — creates tags on manual dispatch
- Integration tests are a separate workflow, not a separate job in CI. They need `xvfb-run` and are slower — keeping them decoupled means CI stays fast and integration flakes don't block merges.

**Why:** Batch-c scaffolded the workflows but was missing: lint/test gates in release, workflow_dispatch, pre-release support, main branch triggers, and explanatory comments. Casey is learning GitHub Actions (experienced with ADO) — comments explain non-obvious concepts like `npm ci` vs `npm install`, `xvfb-run`, and `GITHUB_OUTPUT`. Separate integration workflow avoids the "flaky integration test blocks all PRs" problem while still running on every push.


### 2026-02-16: Extension must export a test API for integration tests
**By:** Meeseeks (Tester), issue #53
**What:** The persistence integration tests (`src/__integration__/persistence.test.ts`) require the extension to export an API object from `activate()`. Currently `activate()` returns `void`.

The required contract:
```typescript
export function activate(context: vscode.ExtensionContext): EditlessApi {
  // ... existing activation code ...
  return {
    terminalManager,
    context,
  };
}
```

The integration tests import this as:
```typescript
interface EditlessTestApi {
  terminalManager: {
    launchTerminal(config: AgentTeamConfig, customName?: string): vscode.Terminal;
    getAllTerminals(): Array<{ terminal: vscode.Terminal; info: Record<string, unknown> }>;
  };
  context: vscode.ExtensionContext;
}
```

**Why:** Integration tests need to:
1. Call `terminalManager.launchTerminal()` directly with test configs (the `editless.launchSession` command requires squads in the registry and shows UI pickers — not suitable for automated tests)
2. Read `context.workspaceState.get('editless.terminalSessions')` to verify persistence actually wrote to the real VS Code storage API
3. Clear `workspaceState` between tests to prevent state leakage

Without these exports, the only alternative is testing indirectly via commands — but `launchSession` requires interactive QuickPick input and registry entries, making it unreliable for CI.

**Impact:** `activate()` return type changes from `void` to `EditlessApi`. `deactivate()` is unaffected. No runtime behavior changes — the export is additive.


### 2026-02-16: Pre-Release Go-Live Audit
**By:** Rick (Lead), issue #87
**Date:** 2026-02-16
**Status:** One blocker, go-live conditional on fix

**Executive Summary:** EditLess is ready for go-live with one blocking issue. The extension is well-structured, settings are clean and follow conventions, sensitive terms have been properly removed, and feature detection is properly implemented.

**🔴 BLOCKER: Enum Values for `cli.provider` Are Incomplete**

The enum includes `"custom"` in package.json but `KNOWN_PROFILES` in cli-provider.ts does not define a custom profile. When a user sets `editless.cli.provider` to `"custom"`, the code looks for a provider with `name === "custom"` which won't exist. The fallback logic silently drops to "first detected provider" — confusing UX when the user explicitly set a preference.

**Fix:** Add a `custom` profile to `KNOWN_PROFILES` with no version/update commands, honoring the decisions.md intent: "Custom CLIs get presence-only detection... they work for terminal management but don't get version/update features."

**Recommendations:**
- Fix the `custom` provider enum/profile mismatch (30 seconds)
- Merge & release for go-live
- Document settings in README as a follow-up improvement (not blocking)

**Additional Findings:**
- ✅ All settings follow `editless.{category}.{setting}` naming pattern
- ✅ All defaults are sensible, no internal URLs or sensitive values
- ✅ No orphaned settings
- ✅ No hardcoded sensitive terms — clean codebase
- ✅ Test fixtures use generic names only
- ✅ Feature flags implement progressive detection correctly
- ✅ Notification master + category toggles implemented correctly
- ⚠️ Settings exist but not documented in README (post-launch improvement)


### 2026-02-16: Pre-Release Code Quality Review
**By:** Rick (Lead), issue #87
**Date:** 2026-02-16
**Scope:** Full codebase review — all source files in `src/`, `src/__tests__/`, `package.json`, config files

**Executive Summary:** EditLess is well-structured for an MVP. The architecture is clean — modules are focused, dependency graph flows one direction (extension → managers → providers), types are shared through a single types.ts file, and test coverage is solid (200 tests passing across 11 test suites). Three critical items must be fixed before go-live: blocking calls in the activation path, missing custom provider profile, and missing extension API for integration tests.

**🔴 MUST FIX Before Go-Live:**

1. **`execSync` blocks extension activation path** (issue #107)
   - File: `src/cli-provider.ts:34`, called from `src/extension.ts:38`
   - `probeCliVersion()` uses `execSync` with 5-second timeout for each of 3 CLI providers
   - Worst case: 15 seconds blocking the extension host thread → "Extension host unresponsive" dialog
   - Fix: Replace with async `execFile` + `promisify`. Run `probeAllProviders()` after activation returns

2. **Missing `custom` provider profile in KNOWN_PROFILES** (issue #109)
   - File: `src/cli-provider.ts:16-27`
   - `package.json` declares `"custom"` as valid enum value, but no profile defined
   - When user selects "custom", code silently falls back to first detected provider
   - Fix: Add `{ name: 'custom', command: '', versionCommand: '' }` to KNOWN_PROFILES

3. **`activate()` doesn't return API for integration tests** (issue #110)


### 2026-02-16: Work Items Tree — Ternary Plan Status
**Date:** 2026-02-16
**By:** Morty (Extension Dev)
**Issue:** #139

## Context

`buildIssueItem()` used a binary check: either an issue "has plan" or it doesn't. The match list (`has plan`, `has-plan`, `plan`, `planned`) didn't include `status:planned`, so issues with that GitHub label showed the wrong "needs plan" indicator.

## Decision

Replaced binary planned/not-planned with **ternary** status:

| Status | Labels matched | Indicator | Description prefix |
|--------|---------------|-----------|-------------------|
| Planned | `status:planned`, `has-plan`, `has plan`, `plan`, `planned` | 📋 | `✓ planned` |
| Needs plan | `status:needs-plan`, `needs-plan`, `needs plan` | ❓ | `needs plan` |
| Neutral | (none of the above) | — | (labels only) |

`hasPlan` takes precedence — if both `status:planned` and `status:needs-plan` are present, the item shows as planned.

## Impact

- `src/work-items-tree.ts` — `buildIssueItem()` method
- New test file: `src/__tests__/work-items-tree.test.ts`


### 2026-02-16: Squad folder rename backward compatibility
**Date:** 2026-02-16
**By:** Morty (Extension Dev)
**Issue:** #93

## What

Added `src/team-dir.ts` with `resolveTeamDir()` and `resolveTeamMd()` utilities that check `.squad/` first, then `.ai-team/` as fallback. Updated all hardcoded `.ai-team` references in discovery, scanner, squad-upgrader, and watcher to use these utilities.

## Why

The Squad CLI (bradygaster/squad) is renaming `.ai-team/` to `.squad/`. EditLess must support both folder names for backward compatibility. `.squad/` takes precedence when both exist.

## Impact

- All team members: Any future code that needs to locate the team directory must use `resolveTeamDir()` or `resolveTeamMd()` from `src/team-dir.ts` — never hardcode `.ai-team` or `.squad`.
- Error messages now say `.squad/ (or .ai-team/)` for clarity.


### 2026-02-17: Session persistence — launchCommand stored in PersistedTerminalInfo
**By:** Morty (coding agent)
**Issue:** #94
**What:** `launchCommand` is persisted alongside terminal metadata in `workspaceState`, rather than looked up from the squad config at relaunch time.
**Why:** The squad config may not exist at relaunch (registry changed, squad removed, repo not yet loaded). Storing the command at launch time makes relaunch self-contained and removes the dependency on registry availability during crash recovery.

**Resume convention:** When `agentSessionId` is set, relaunch appends `--resume <sessionId>` to the persisted launch command. This is a convention that upstream CLIs (Copilot, Agency) can adopt. If a CLI uses a different resume flag, the convention can be overridden by storing a custom resume command pattern in the future.
   - File: `src/extension.ts:32`
   - `activate()` returns `void` but decisions.md requires `{ terminalManager, context }`
   - Integration tests depend on this export
   - Fix: Return the API object (non-breaking, additive export)

**🟡 SHOULD FIX:**

- Vitest picks up compiled integration test JS files (issue #112) — Add `'out/**'` to exclude
- Private field access via bracket notation (issue #114) — Add public getter to `TerminalManager`
- Event listener leaks in EditlessTreeProvider (issue #116) — Implement `Disposable`, track subscriptions
- Dead prototype types in types.ts (issue #117) — Remove unused types
- Unused `promptRenameSession` export (issue #119) — Remove dead function

**Security / Sensitive Content Scan ✅**
- ✅ No hardcoded "openai" or "coeus" references
- ✅ No Microsoft-internal URLs
- ✅ No hardcoded tokens/keys
- ✅ Generic test fixture names only

**Architecture Assessment ✅**
- ✅ Module focus: One concern per module
- ✅ No circular dependencies
- ✅ Correct dependency direction: extension → managers → providers → types
- ✅ TypeScript strict mode enabled
- ⚠️ TreeProvider has disposable leaks (see #116)

**Verdict:** Conditional go-live. Fix the 3 🔴 items and this ships clean. The `execSync` blocker is most critical — it's the only user-visible hang risk.


### 2026-02-16: Test Coverage Audit — Pre-Release Go-Live
**By:** Meeseeks (Tester), issue #89
**Date:** 2026-02-17
**Status:** Audit complete, gaps filed

**Executive Summary:** 200 unit tests pass across 11 test files. 2 integration test files (6 tests) exist but require VS Code host — they fail in vitest (expected). No skipped or commented-out tests. Test quality is high: descriptive names, appropriate mocks, good use of `vi.hoisted()` patterns.

**Coverage Matrix:** 7/19 source modules have good coverage, 5 have partial, 7 have none. Untested modules include critical user-facing code: `editless-tree.ts`, `registry.ts`, `session-labels.ts`.

**Command Coverage:** 32 commands registered. Zero have handler execution tests. Commands with high logical complexity untested:
- `editless.renameSession` (3 code paths, label + tab rename)
- `editless.addAgent` (file creation, custom command, validation)
- `editless.addSquad` (npx check, init vs upgrade)

**P0 Gaps (Could cause user-visible bugs):**
1. `editless-tree.ts` (issue #104) — Broken tree view (primary UI)
2. `registry.ts` (issue #105) — Squads fail to load/persist
3. `session-labels.ts` (issue #106) — Session labels lost on reload
4. `extension.ts` commands (issue #108) — Command handlers crash/misbehave

**P1 Gaps (Maintainability risk):**
- `squad-upgrader.ts` (issue #111) — Brittle frontmatter parsing
- `status-bar.ts` (issue #113) — Incorrect rendering
- `watcher.ts` (issue #115) — Debounce/dispose lifecycle bugs
- `prs-tree.ts` (issue #118) — PR state derivation incorrect
- `github-client.ts` (issue #120) — JSON parse errors silently wrong

**Test Quality Strengths:**
- ✅ Descriptive test names follow `should {behavior}` convention
- ✅ Appropriate mocks: VS Code API mocked, internal logic tested directly
- ✅ Good use of `vi.hoisted()` for mock function references
- ✅ No skipped or commented-out tests
- ✅ Edge cases covered in well-tested modules (terminal-manager: 56 tests!)

**Recommendations:**
1. Before go-live: P0 #104 (editless-tree) highest risk — entire UI
2. Week 1 post-launch: Close remaining P0s (#105, #106, #108)
3. Week 2: P1 issues (#111, #113, #115, #118, #120)
4. Ongoing: Add `c8` coverage reporting to CI pipeline
5. Quick fix: Add `'out/integration/**'` to vitest `exclude` to silence integration test failures


### 2026-02-17: Remove custom commands feature for v0.1
**By:** Morty (Extension Dev), requested by Casey Irvine
**Date:** 2026-02-17
**Issue:** #131

**What:** Removed `editless.customCommands` setting, `editless.runCustomCommand` command, context menu entry, and all related tests from v0.1. The `custom` CLI provider enum description was updated to no longer reference custom commands.

**Why:** Feature wasn't working reliably and was ambitious for v0.1. UX needs to be sorted before it comes back (#100 remains the north star).

**Impact:** Anyone referencing `editless.customCommands` in their settings.json will see it ignored. No migration needed — the setting was array-defaulting-to-empty, so existing installs degrade silently.

**What stays:** `editless.agentCreationCommand` is a separate feature and was preserved.



### 2025-07-24: Filter inbox count to .md files only
**By:** Morty (Extension Dev)

The `scanSquad` function in `src/scanner.ts` counts all files in the `decisions/inbox/` directory as inbox items, including `.gitkeep` files (which preserve empty directories in git but aren't decision content). The inbox count filter now requires files to end with `.md` in addition to being regular files, ensuring only actual decision documents are counted.

**Why:** `.gitkeep` is a git convention, not content. Counting it inflates the inbox badge in the status bar and tree view, which is misleading. Filtering to `.md` is consistent with how the codebase treats decision files.


### 2026-02-16: v0.1 Release Triage & Scope Lock
**By:** Rick (Lead)
**Date:** 2026-02-16

Final pre-release triage of all 25 open issues. Deadline: Monday evening (~16 hours).

**P0 — LOCKED (must ship):** 7 items ready or in progress
1. **#148** (Session labels off by one) — NEW BUG, assigned to Morty. After dev reload, tree session labels map to wrong terminals (off by one). Likely edge case in terminal-manager.ts reconciliation.
2. **#139** (Work Items tree icon bug) — Planned, ready
3. **#94** (Session persistence across crashes) — Morty + Birdperson
4. **#93** (.squad/.ai-team rename) — Breaking change, planned
5. **#66** (Scribe auto-flush inbox) — Planned
6. **#58** (ADO config for Work Items/PRs) — Planned
7. **#53** (Session persistence test matrix) — Test coverage, planned

**P1 — EXECUTE (important):** 8 items should ship if capacity allows
- #132 (Work Items filtering), #125 (Unified Add flow), #103 (Auto-detect has-plan), #101 (Generic CLI Provider), #96 (Re-evaluate Agency), #49 (Squad inbox education), #48 (Multi-repo docs), #47 (Squad entry docs)
- **Note:** #96 and #101 flagged for scope review — architectural dependency may require design decision

**P2 — BACKLOG (post-v0.1):** 5 items cut
- #36 (Squad UX education), #37 (EditLess philosophy), #38 (Squad UI integration — explicitly marked "future work" in issue), #42 (Marketplace publishing — internal process), #43 (GIFs/demos)

**Also already on backlog (no change):** #35, #45, #46, #56, #76, #78, #100

**Scope lock:** No new v0.1 items after 2026-02-16 15:00 UTC. Automatically P2/backlog.

**Why:** All P0 items assigned and labeled. Squad can execute immediately. P1 items are important but not blocking. Docs/marketplace work can follow in patch/v0.2. #38 honors the issue author's explicit "future work" intent.

### 2026-02-16: Remove go:* labels and simplify label taxonomy
**By:** Birdperson (DevOps), directed by Casey Irvine
**Date:** 2026-02-16

**What:** Removed the entire `go:` label namespace (`go:yes`, `go:no`, `go:needs-research`). Release labels now limited to `release:v0.1` and `release:backlog`. Triage applies `status:needs-plan` only when no existing `status:` label exists — preserving any status already set.

**Why:** The go/no-go gate added friction without value. The `status:` labels already capture workflow state (`needs-plan` → `planned` → `in-progress`). Fewer labels, cleaner triage. Aligns with user directive to simplify the label scheme and fix triage overwrite behavior.

**Agents should know:**
- Do not reference `go:` labels in code, workflows, or documentation.
- Triage default is now `status:needs-plan` (not `go:needs-research`).
- Available release targets are `release:v0.1` and `release:backlog` only.

### 2026-02-16: Story Review — Writing Style Decision
**Date:** 2026-02-16
**By:** Summer (Documentation Agent)

**Decision:** Casey's story uses a personal, conversational voice with short declarative sentences for emphasis and authenticity. Future edits to personal narratives should be light-touch: fix clear grammatical errors but preserve the casual, enthusiastic tone.

**Rationale:** The story reads naturally because it mirrors how Casey thinks and speaks—rapid-fire observations, rhetorical questions ("Repos? Editors?"), and casual phrasing throughout. Aggressive rewriting would strip the authenticity that makes the narrative compelling.

**Edits applied to docs/story.md:**
- "dove" → "dived" (standard English past tense)
- "would take me weeks before" → "would have taken me weeks before" (past perfect, for tense consistency)
- Removed double space (formatting fix)

**Voice principles:**
- Short, punchy sentences for emphasis ✓
- Conversational tone, not corporate ✓
- Authentic personal narrative preserved ✓
- Grammar corrected where it breaks readability or is factually wrong ✓


### 2026-02-16: Session State — `waiting-on-input` Misclassification (Design Issue)
**By:** Morty (Extension Dev)
**Type:** Design Issue Investigation
**Severity:** P2 — cosmetic but misleading UX
**Filed:** Investigation session 2026-02-16

**Problem:**
Terminal sessions display `waiting-on-input` (bell-dot icon, "waiting on input" description) when they are actually idle. This happens for **every session** within 5 minutes of any command finishing.

**Root Cause:**
`getSessionState()` in `src/terminal-manager.ts:336-365` uses a heuristic that conflates "recent activity" with "waiting for user input." The logic:
1. `_shellExecutionActive = true` → `working` ✅
2. No `_lastActivityAt` → `idle` ✅
3. `_lastActivityAt` within 5 min → **`waiting-on-input`** ← wrong default
4. `_lastActivityAt` 5–60 min → `idle`
5. `_lastActivityAt` > 60 min → `stale`

The `_lastActivityAt` timestamp is set by both `onDidStartTerminalShellExecution` (line 83) and `onDidEndTerminalShellExecution` (line 88). When a command completes normally, `_shellExecutionActive` becomes `false` and `_lastActivityAt` becomes `Date.now()` — which satisfies the "within 5 min" condition, returning `waiting-on-input` for up to 5 minutes after every command.

**Why It's a Design Issue (Not a Bug):**
The VS Code shell integration API (`onDidEndTerminalShellExecution`) signals that a command finished — it does **not** signal whether the process is now waiting for user input or sitting at an idle prompt. Both scenarios produce identical signals:
- `_shellExecutionActive = false`
- `_lastActivityAt = recent`

There is no positive signal for "the agent is asking a question." The heuristic assumes recent activity without execution means input is needed, but it actually just means a command recently finished.

**Additional Trigger: Persistence Restore**
On reconcile (line 449), `_lastActivityAt` is restored from `persisted.lastActivityAt ?? persisted.lastSeenAt`. Since `lastSeenAt` is always `Date.now()` at persist time (line 500), a session that was persisted within the periodic 30s interval and then restored will show `waiting-on-input` until the 5-minute window expires.

**Recommended Fix:**
**Default to `idle` after execution ends; only show `waiting-on-input` when a positive signal exists.**

Options (pick one):
1. **Invert the default:** Change line 358 from `'waiting-on-input'` to `'idle'`. Then introduce a separate `_waitingOnInput` signal set by scanner/session-context when the agent is genuinely asking a question.
2. **Terminal output parsing:** Extend the scanner to detect prompt patterns (e.g., `? `, `(y/n)`, `Press Enter`) in recent terminal output and only then return `waiting-on-input`.
3. **Reduce the window:** Shrink `IDLE_THRESHOLD_MS` to 10–30 seconds. This is a band-aid — it shrinks the false-positive window but doesn't eliminate it.

Option 1 is the cleanest. The tests at lines 939-956 would need updating — they currently assert `waiting-on-input` immediately after execution ends.

**Files Involved:**
- `src/terminal-manager.ts:336-365` — `getSessionState()` logic
- `src/terminal-manager.ts:81-90` — shell execution event handlers
- `src/terminal-manager.ts:447-449` — reconcile `_lastActivityAt` restore
- `src/__tests__/terminal-manager.test.ts:939-956` — test that codifies the current (wrong) behavior
- `src/editless-tree.ts:278-294` — tree items that display the state

**Status:** Filed as issue #226 for Casey to triage.

