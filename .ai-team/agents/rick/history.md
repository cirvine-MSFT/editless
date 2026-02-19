# Project Context

- **Owner:** Casey Irvine (cirvine@microsoft.com)
- **Project:** EditLess — a VS Code extension for managing AI agents, terminal sessions, and work items. The "editorless IDE" panel.
- **Stack:** TypeScript, VS Code Extension API, esbuild, vitest
- **Created:** 2026-02-15
- **Repo:** cirvine-MSFT/editless (private)
- **Prototype:** Ported from tools-squad/extension. Redactor module removed. Rebranded from "Squad Dashboard" to "EditLess."
- **Target:** Internal Microsoft distribution by Monday 2026-02-16 via GitHub Releases (VSIX)
- **User:** Casey is new to GitHub workflows (experienced with ADO). Explain GitHub concepts clearly.

## Learnings

### 2026-02-17: v0.1 Retrospective — Speed vs. Quality Tradeoffs
Completed comprehensive retrospective analysis of v0.1 release cycle (103 closed issues, 96 merged PRs, 275+ commits in 3 days). **Key patterns identified:**

**Duplicate work:** PR#207 and PR#210 are literally the same fix merged twice (deduplicate squads in registry). Issues #11/#52 (toast re-appearing), #12/#54 (sessions not surviving reload) are duplicates. This represents pure waste from coordination gaps in parallel work.

**Features shipped then removed:** Custom Commands (#16) went through full build-ship-remove cycle: implemented in PR#24, discovered broken (#130 — config key mismatch), completely removed in PR#131 (P0), reimagined for backlog (#100). F2 keybinding added then removed twice (PR#233, PR#260). These represent wasted implementation effort that should have been caught in design or code review.

**Repeated fixes to same problem:** Session state touched in 4 PRs (PR#137, PR#173, PR#200, PR#236) yet #279 says it's still broken. Tree ID collisions fixed 3 times (PR#207, PR#210, PR#235). Filter logic fixed twice (PR#186, PR#214). Philosophy doc rewritten twice (PR#192, PR#221). README polished 3 times (PR#203, PR#205, PR#271). **Pattern:** Treating symptoms instead of root cause, unclear vision early on.

**P0s open post-release:** #277 (Resume Session rework) and #278 (Add Agent rework) both labeled `release:v0.1` + `priority:p0` but still open after ship. If flows were broken enough to need rework immediately after release, they should have blocked v0.1.

**Post-release quality gaps:** 20+ issues (#277-#300) filed immediately after v0.1 representing UX validation failures: session status icons don't represent state (#279), clicking sessions doesn't switch terminal (#298), adding squad feels buggy (#283), 5s cold start (#300), squad update detection broken (#288), decisions view not updating (#287).

**Test quality vs. quantity:** 200+ tests but #247 identifies pervasive antipatterns: ~25+ mock-call assertions without result validation, 16 tautological tests, 18+ shallow smoke tests, ~40 instances of fragile mock coupling, missing edge case coverage. High line coverage provides false confidence — suite checks that code runs but doesn't validate correct behavior.

**Root cause:** Speed prioritized over validation. Aggressive parallel execution (96 PRs in 3 days) without sync points led to duplicate work, insufficient code review, and UX validation gaps.

**What went well:** Shipped functional extension with deep GitHub/ADO integration, robust session persistence, working CI/CD pipeline, comprehensive docs. Architectural wins: CLI Provider system (PR#165), session persistence design (PR#55, PR#157), .squad folder migration (PR#154).

**Recommendations for v0.2:** (1) Rethink session state model — stop iterating on implementation, fix the abstraction. (2) Tighten code review — check for duplicates, end-to-end functionality, config consistency, test quality. (3) Gate releases on P0s — enforce `release:vX.Y` + `priority:p0` must be closed before ship. (4) Manual core workflow validation — don't rely on unit tests alone. (5) Coordination for parallel work — daily check-ins, assign issues before starting, PR titles must reference issue numbers. (6) Reduce god objects (#246) — break down extension.ts (943 lines), editless-tree.ts (453 lines), terminal-manager.ts (496 lines). (7) Improve test signal (#247) — rewrite tests to validate behavior, not mock calls.

**Key learning:** v0.1 shipped functional but rough. The technical foundation is solid. v0.2 should focus on refinement and quality over speed. The right architecture decisions were made; execution needs better validation gates.

**Decision record:** Created `.ai-team/decisions/inbox/rick-v01-retro.md` documenting quality gates for future releases: P0 issue gate, core workflow validation checklist, code review standards, release label discipline, coordination for parallel work.

📌 **Team update (2026-02-16):** Documentation animation strategy — EditLess uses optimized GIFs stored in docs/media/ directory. Primary tool: ScreenToGif (Windows). Files must be <1 MB, max 800px width, 3–8 seconds duration. File naming is descriptive kebab-case (e.g., planning-feature.gif). Re-recording triggers documented: UI structure changes, command/shortcut changes, label changes, layout changes. Team reviews animations on code review checklist. — decided by Summer

📌 **Team update (2026-02-16):** Default release target — All new issues default to elease:v0.1 unless Casey explicitly directs otherwise. This ensures v0.1 work is automatically tagged correctly. — decided by Casey Irvine

📌 **Team update (2026-02-16):** Worktree enforcement reinforced to hard constraint — Git checkout violations (agent on #213 checked out branches on the main clone instead of using worktrees) have happened repeatedly despite existing documentation. The rule is now a non-negotiable constraint enforced through code review: the main clone (C:\Users\cirvine\code\work\editless) is PULL-ONLY, all feature branch work must use git worktrees. Violations must be caught and rejected in PR review. — reinforced by Casey Irvine

📌 **Team update (2026-02-16):** Use context keys for menu visibility based on dynamic state — Gate menu items on VS Code context keys when visibility depends on runtime state that can't be expressed through `viewItem` checks. For the "Upgrade All Squads" button, use `editless.squadUpgradeAvailable` context key set via `vscode.commands.executeCommand('setContext', ...)` in `checkSquadUpgradesOnStartup()`. This pattern applies to all view-level actions depending on aggregate state (e.g., "any squad upgradeable"). — decided by Morty

📌 **Team update (2026-02-16):** All bug fixes must include regression tests AND UX tests — Bug fixes require both regression test coverage (prevents recurrence) and UX tests (validates user experience). For upgrade scenarios, create tests that either check current state or force an earlier version to validate upgrade paths. Copilot CLI version detection with default settings must be thoroughly tested. — decided by Casey Irvine

📌 **Team update (2026-02-16):** Meeseeks writes regression tests for every bug Casey discovers — When Casey discovers a bug during usage, Meeseeks should write regression tests for that specific scenario BEFORE Morty fixes it. Tests-first approach for all user-discovered bugs ensures proper coverage and clear verification criteria when the fix lands. — decided by Casey Irvine
📌 **Team update (2026-02-16):** Worktree enforcement reinforced to hard constraint — Git checkout violations (agent on #213 checked out branches on the main clone instead of using worktrees) have happened repeatedly despite existing documentation. The rule is now a non-negotiable constraint enforced through code review: the main clone (C:\Users\cirvine\code\work\editless) is PULL-ONLY, all feature branch work must use git worktrees. Violations must be caught and rejected in PR review. — reinforced by Casey Irvine
### 2026-02-19: Git redaction system design review — pre-commit hook + local patterns
Designed and approved the git redaction system for blocking sensitive patterns from commits. Key decisions: (1) **pre-commit hook is the right mechanism** — not clean/smudge filters (too complex) or pre-push (too late). Sanitizes content before it enters git history. (2) **Local pattern storage is secure** — `.ai-team/redacted.json` stays in `.gitignore`, patterns never committed, per-developer config prevents accidental leaks. (3) **Replacement format:** Use `[REDACTED: alias]` (concise, grep-friendly) instead of verbose format pointing to config. (4) **Binary file handling:** Skip via extension check. (5) **US phone regex:** `\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})` covers all common formats (dashes, dots, spaces, parens). (6) **Edge cases:** Merge commits and rebases work automatically (hook runs on all commits); no size threshold needed initially. Design approved for implementation. Decision record: `.ai-team/decisions/inbox/rick-redaction-design.md`.
<!-- Append new learnings below. Each entry is something lasting about the project. -->
Pre-release audit (issue #87) found EditLess is production-ready except for one critical blocker: `cli.provider` enum includes `"custom"` but KNOWN_PROFILES in cli-provider.ts does not define a custom profile. When user sets the setting to "custom", resolution fails silently and falls back to auto-detection, confusing UX. Fix: add `{ name: 'custom', command: '', versionCommand: '' }` to KNOWN_PROFILES so custom provider registers with no version/update capabilities (matches decision: custom CLIs get presence-only detection). Secondary findings: settings all follow naming conventions and have sensible defaults, no sensitive terms found (internal project names completely removed per decisions), test fixtures use generic names, feature detection is progressive and correct, notification toggles work properly. Documentation gap: README doesn't explain available settings yet (non-blocking, can be post-release patch).

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-02-16: Full codebase quality review — 3 blockers, 5 cleanup items
Pre-release code quality review of entire codebase (19 source files, 12 test suites, 200 tests). Three blockers found: (1) `execSync` in `probeCliVersion()` blocks the extension host activation for up to 15 seconds — must be made async. (2) The `custom` provider profile is STILL missing from `KNOWN_PROFILES` — was flagged in #87 audit but never patched. (3) `activate()` returns void instead of the test API object required by decisions.md. Five cleanup items: vitest picking up compiled integration test JS files (add `out/**` to exclude), private field access via bracket notation in editless-tree.ts, event listener leaks in EditlessTreeProvider (no Disposable implementation), dead prototype types (DashboardState, WebSocketMessage, LaunchRequest, TerminalSession never imported), and unused `promptRenameSession` export. Security scan clean — no internal project name references, no hardcoded URLs or tokens, test fixtures use generic names. Architecture is solid: clean dependency graph, no circular deps, strict TypeScript, all commands properly wired in package.json.

📌 Team update (2026-02-16): Squad folder rename — `.squad/` support added with `.ai-team/` backward compatibility via `src/team-dir.ts` utility. Any future code that needs to locate the team directory must use `resolveTeamDir()` or `resolveTeamMd()` — never hardcode paths. — decided by Morty

### 2026-02-15: Vitest mock type signature pattern
Vitest `vi.fn()` does NOT use the `vi.fn<[args], return>` type syntax. Use `.mockResolvedValue()` or `.mockReturnValue()` to set the return type. Example: `vi.fn().mockResolvedValue(undefined as T)` for async mocks. This tripped up the cli-provider tests — the `<[string, ...string[]], Promise<string | undefined>>` syntax is invalid and causes TypeScript errors.

### 2026-02-15: PR #14 generalized CLI update infrastructure — approved
Reviewed Morty's refactor of agency-specific update logic into provider-generic infrastructure. The abstraction is solid and scales cleanly. Three optional fields on CliProvider (`updateCommand`, `upToDatePattern`, `updateRunCommand`) control per-provider update support. Cache keys are per-provider using `editless.{providerName}UpdatePrompt`. The interface is clean and doesn't force providers to have update capabilities — providers without `updateCommand` are silently skipped. Tests cover multi-provider scenarios, cache isolation, and backward compat. `checkAgencyOnStartup` deprecated but still exported — that's the right balance for a recent API. All existing tests pass. The loop in `checkProviderUpdatesOnStartup` handles concurrent checks safely (async exec callbacks don't block). **Approved.** This will scale to copilot/claude when we learn their update mechanisms.

### 2026-02-16: PR #12 session persistence — approved with observations
Reviewed terminal session persistence implementation. Solves the Developer Window reload bug where terminals survived but disappeared from sidebar. Implementation uses workspaceState for persistence and name-based reconciliation on activation. **Decision: APPROVED.** Code is clean, tests are comprehensive (11 passing tests covering edge cases), and the design tradeoffs are reasonable for this use case. Name-based matching is pragmatic — VS Code doesn't provide terminal IDs across reloads, and name collisions are unlikely in practice (terminals are named with timestamp + squad icon). Serialization on every terminal change could theoretically cause perf issues with hundreds of terminals, but that's not a realistic scenario for this extension. The reconcile/persist pattern correctly handles orphaned entries (cleaned on reconcile), counter restoration (prevents index collisions), and onDidCloseTerminal race conditions (separate Map mutations from persistence). TypeScript is strict and clean. One minor edge case: if a user manually renames a terminal, reconciliation will fail silently for that terminal — acceptable tradeoff since manual rename is rare and explicitly breaks the contract. This is good engineering: solves the real problem, tests the edges, doesn't over-engineer hypotheticals.

### 2026-02-16: v0.1 release triage — P0/P1 locked, 5 items cut to post-release
Final triage session before Monday v0.1 deadline. Analyzed all 25 open issues and produced prioritized action plan. **Key decisions:** (1) **#148 (session labels off-by-one)** — new critical bug filed by Casey, assigned to Morty for investigation. Likely edge case in terminal-manager.ts reconciliation logic introduced by PR #12. Labeled as P0/must-fix. (2) **#38 (Squad UI integration)** — issue body explicitly says "future work — not blocking first release." Removed from v0.1, moved to backlog. (3) **#36, #37, #43 (docs polish)** — deferred to post-v0.1. README and workflow docs are complete enough; GIFs/high-level narrative can ship as post-release patch. (4) **#42 (marketplace publishing)** — deferred to post-release patch. Marketplace work is an internal process, not part of extension code. (5) **#96, #101 (Agency/CLI provider refactor)** — both P1 but need scope review. #101 is architectural (generic provider system) and likely blocks #96 (Agency settings re-eval). May need to defer one or both if Morty+Birdperson are at capacity. **Locked P0/P1 for v0.1:** 7 P0 (builtins, session persistence, work item UX), 8 P1 (documentation, filtering, auto-detection). All have clear acceptance criteria or assigned squad members. Squad can execute to this list with confidence.

### 2026-02-16: Tech debt umbrella issues created — #246 (modularity), #247 (test quality)
Created two GitHub umbrella issues to track architectural cleanup and test quality work outside v0.1 release scope. **#246: Reduce coupling and split god objects** — Targets extension.ts (943 lines, 23 imports, 11+ managers), editless-tree.ts (453 lines, 9 module coupling), terminal-manager.ts (496 lines, 3 mixed concerns), work-items-tree.ts (443 lines, GitHub+ADO coupling), and scanner.ts (337 lines, facade work). Success criteria: all modules <300 lines, max 8 imports per module, clear single-concern design, circular dep check passes. **#247: Fix LLM-generated test antipatterns** — Addresses mock-call assertions without result validation (~25+ instances), tautological tests (16 in work-items-tree), shallow smoke tests (18+), fragile mock coupling (~40 in extension-commands), missing edge case coverage (scanner, status-bar, terminal-manager), and misleading test names (4+). Success criteria: all tests verify mocks AND actual behavior, no tautological tests, edge case coverage, accurate test names, public-API-based construction. Both issues tagged `type:chore` and `release:backlog`. These are non-urgent architectural improvements that can be tackled post-v0.1 as team capacity allows. Modularity work will improve maintainability and reduce future refactor friction; test quality work will increase signal-to-noise and confidence in the suite.

### 2026-02-17: Phase 2 addAgent feature issue created — #249
Created GitHub issue #249 to implement Phase 2 of the addAgent work from #125. This issue adds local/repo mode prompting to the `editless.addAgent` command. Dependency on #101 (`createCommand` in cli-provider.ts) is resolved. Assigned to Morty (implementation) and Meeseeks (tests) with labels `type:feature`, `release:backlog`, and `squad:morty`.

### 2026-02-17: PR #273 squad init fallback logic — changes requested
Reviewed PR #273 fixing squad initialization visibility and GH CLI compatibility. **GH CLI Fix Approved:** Retry logic for `autoMergeRequest` is correct and safe. **Squad Init Fix Rejected:** The fallback to `resolveTeamDir` correctly registers incomplete squads, BUT introduces a regression where these "unknown" squads never update to their correct state once `team.md` is created. `autoRegisterWorkspaceSquads` skips already-registered paths, preserving the placeholder state indefinitely. Requested changes to `discovery.ts` to detect this state (existing entry is `unknown` + `team.md` now exists) and trigger a registry update. This ensures squads transition from "initializing" to "ready" automatically.

### 2026-02-17: Agent-registry promotion feature issue created — #250
Created GitHub issue #250 to implement promotion of discovered agents and squads to the agent-registry. This resolves the "bridge gap" between the discovery system (passive display) and the registry (no context menu actions). Issue includes design decision needed: extend `AgentTeamConfig` to support standalone agents (option a) or wrap them in minimal squad containers (option b). Assigned to Rick (design decision), Morty (implementation), and Meeseeks (tests) with labels `type:feature` and `release:backlog`.

### 2026-02-17: Recent feature changes scan for docs team
Documented recent codebase changes (last 30 commits) for Summer (docs) to identify stale documentation:

**New features that changed:**
1. **PR Filtering** (#270) — Added `editless.filterPRs` and `editless.clearPRsFilter` commands. PRsTreeProvider now supports filtering by repo, labels, and status. Uses `editless.prsFiltered` context key for UI visibility. Replaces simple "Show/hide PRs" with sophisticated multi-criteria filtering.
2. **Sticky Terminal Names** (#268) — Terminal names launched from work items are now persistent — session.ts stores launch metadata and restores on reload.
3. **Agent Discovery Improvements** (#263, #257) — New discovery commands: `editless.promoteDiscoveredAgent`, `editless.hideAgent`, `editless.showHiddenAgents`, `editless.showAllAgents`. PR filter pattern documented in decisions.md as reusable template for future filters.
4. **PR Filter Test Coverage** (#270) — New test suites: prs-tree.test.ts (146+ new tests), extension-commands.test.ts (80+ new tests for filter commands).

**Key changes to settings (package.json):**
- Two new commands added to PR filter toolbar: `editless.filterPRs` (navigation@2), `editless.clearPRsFilter` (navigation@3, conditional).
- Four new commands for agent discovery/hiding: `hideAgent`, `showHiddenAgents`, `showAllAgents`, `promoteDiscoveredAgent`.
- No NEW settings added to `editless.*` configuration section; filtering state managed via context keys.

**Things that likely need docs updates:**
- README: PR filtering feature and sticky names not yet documented (workflow guides exist in docs/workflows/ but high-level feature descriptions missing).
- PR pane has new toolbar buttons — screenshots/GIFs may need re-recording.
- Settings reference page should mention that PR/work item filters use context keys, not persistent settings.
- Agent discovery UI changed significantly — sidebar now shows discovered agents with hide/promote actions.



📌 **Team update (2026-02-16):** Default release target — All new issues default to elease:v0.1 unless Casey explicitly directs otherwise. This ensures v0.1 work is automatically tagged correctly. — decided by Casey Irvine

📌 **Team update (2026-02-16):** Worktree enforcement reinforced to hard constraint — Git checkout violations (agent on #213 checked out branches on the main clone instead of using worktrees) have happened repeatedly despite existing documentation. The rule is now a non-negotiable constraint enforced through code review: the main clone (C:\Users\cirvine\code\work\editless) is PULL-ONLY, all feature branch work must use git worktrees. Violations must be caught and rejected in PR review. — reinforced by Casey Irvine
### 2026-02-16: Go-live audit findings — one critical enum mismatch
Pre-release audit (issue #87) found EditLess is production-ready except for one critical blocker: `cli.provider` enum includes `"custom"` but KNOWN_PROFILES in cli-provider.ts does not define a custom profile. When user sets the setting to "custom", resolution fails silently and falls back to auto-detection, confusing UX. Fix: add `{ name: 'custom', command: '', versionCommand: '' }` to KNOWN_PROFILES so custom provider registers with no version/update capabilities (matches decision: custom CLIs get presence-only detection). Secondary findings: settings all follow naming conventions and have sensible defaults, no sensitive terms found (internal project names completely removed per decisions), test fixtures use generic names, feature detection is progressive and correct, notification toggles work properly. Documentation gap: README doesn't explain available settings yet (non-blocking, can be post-release patch).

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-02-16: Full codebase quality review — 3 blockers, 5 cleanup items
Pre-release code quality review of entire codebase (19 source files, 12 test suites, 200 tests). Three blockers found: (1) `execSync` in `probeCliVersion()` blocks the extension host activation for up to 15 seconds — must be made async. (2) The `custom` provider profile is STILL missing from `KNOWN_PROFILES` — was flagged in #87 audit but never patched. (3) `activate()` returns void instead of the test API object required by decisions.md. Five cleanup items: vitest picking up compiled integration test JS files (add `out/**` to exclude), private field access via bracket notation in editless-tree.ts, event listener leaks in EditlessTreeProvider (no Disposable implementation), dead prototype types (DashboardState, WebSocketMessage, LaunchRequest, TerminalSession never imported), and unused `promptRenameSession` export. Security scan clean — no internal project name references, no hardcoded URLs or tokens, test fixtures use generic names. Architecture is solid: clean dependency graph, no circular deps, strict TypeScript, all commands properly wired in package.json.

📌 Team update (2026-02-16): Squad folder rename — `.squad/` support added with `.ai-team/` backward compatibility via `src/team-dir.ts` utility. Any future code that needs to locate the team directory must use `resolveTeamDir()` or `resolveTeamMd()` — never hardcode paths. — decided by Morty

### 2026-02-15: Vitest mock type signature pattern
Vitest `vi.fn()` does NOT use the `vi.fn<[args], return>` type syntax. Use `.mockResolvedValue()` or `.mockReturnValue()` to set the return type. Example: `vi.fn().mockResolvedValue(undefined as T)` for async mocks. This tripped up the cli-provider tests — the `<[string, ...string[]], Promise<string | undefined>>` syntax is invalid and causes TypeScript errors.

### 2026-02-15: PR #14 generalized CLI update infrastructure — approved
Reviewed Morty's refactor of agency-specific update logic into provider-generic infrastructure. The abstraction is solid and scales cleanly. Three optional fields on CliProvider (`updateCommand`, `upToDatePattern`, `updateRunCommand`) control per-provider update support. Cache keys are per-provider using `editless.{providerName}UpdatePrompt`. The interface is clean and doesn't force providers to have update capabilities — providers without `updateCommand` are silently skipped. Tests cover multi-provider scenarios, cache isolation, and backward compat. `checkAgencyOnStartup` deprecated but still exported — that's the right balance for a recent API. All existing tests pass. The loop in `checkProviderUpdatesOnStartup` handles concurrent checks safely (async exec callbacks don't block). **Approved.** This will scale to copilot/claude when we learn their update mechanisms.

### 2026-02-16: PR #12 session persistence — approved with observations
Reviewed terminal session persistence implementation. Solves the Developer Window reload bug where terminals survived but disappeared from sidebar. Implementation uses workspaceState for persistence and name-based reconciliation on activation. **Decision: APPROVED.** Code is clean, tests are comprehensive (11 passing tests covering edge cases), and the design tradeoffs are reasonable for this use case. Name-based matching is pragmatic — VS Code doesn't provide terminal IDs across reloads, and name collisions are unlikely in practice (terminals are named with timestamp + squad icon). Serialization on every terminal change could theoretically cause perf issues with hundreds of terminals, but that's not a realistic scenario for this extension. The reconcile/persist pattern correctly handles orphaned entries (cleaned on reconcile), counter restoration (prevents index collisions), and onDidCloseTerminal race conditions (separate Map mutations from persistence). TypeScript is strict and clean. One minor edge case: if a user manually renames a terminal, reconciliation will fail silently for that terminal — acceptable tradeoff since manual rename is rare and explicitly breaks the contract. This is good engineering: solves the real problem, tests the edges, doesn't over-engineer hypotheticals.

### 2026-02-16: v0.1 release triage — P0/P1 locked, 5 items cut to post-release
Final triage session before Monday v0.1 deadline. Analyzed all 25 open issues and produced prioritized action plan. **Key decisions:** (1) **#148 (session labels off-by-one)** — new critical bug filed by Casey, assigned to Morty for investigation. Likely edge case in terminal-manager.ts reconciliation logic introduced by PR #12. Labeled as P0/must-fix. (2) **#38 (Squad UI integration)** — issue body explicitly says "future work — not blocking first release." Removed from v0.1, moved to backlog. (3) **#36, #37, #43 (docs polish)** — deferred to post-v0.1. README and workflow docs are complete enough; GIFs/high-level narrative can ship as post-release patch. (4) **#42 (marketplace publishing)** — deferred to post-release patch. Marketplace work is an internal process, not part of extension code. (5) **#96, #101 (Agency/CLI provider refactor)** — both P1 but need scope review. #101 is architectural (generic provider system) and likely blocks #96 (Agency settings re-eval). May need to defer one or both if Morty+Birdperson are at capacity. **Locked P0/P1 for v0.1:** 7 P0 (builtins, session persistence, work item UX), 8 P1 (documentation, filtering, auto-detection). All have clear acceptance criteria or assigned squad members. Squad can execute to this list with confidence.



📌 Team update (2026-02-18): v0.2 quality gates established — decided by Rick

### 2026-02-18: v0.1.1 Quality Release Scope — Full Codebase Audit

**Codebase coupling findings:**
- `extension.ts` (1310 lines) is the god object — it's the only file that wires everything together. Every feature removal requires touching it. The activation function is ~1150 lines of sequential command registrations. This is the #1 refactor target.
- Removed features are surprisingly well-isolated. `inbox-flusher.ts`, `terminal-layout.ts`, `squad-ui-integration.ts`, and `notifications.ts` each have ZERO inbound dependencies outside of `extension.ts` wiring. This is good architecture — the god object pattern actually helped containment.
- `squad-upgrader.ts` has a dual-purpose problem: it mixes upgrade infrastructure (removable) with utility functions (`checkNpxAvailable`, `isSquadInitialized`) needed by `addSquad`. These must be extracted before deletion.
- `editless-tree.ts` imports from `squad-upgrader.ts` for version tooltip display and has upgrade badge rendering. It also renders orphaned sessions from `terminal-manager.ts`. Both are low-coupling touchpoints.
- `cli-provider.ts` has a clean internal boundary: detection/resolution (lines 1-124) vs update checking (lines 126-238). The update half can be deleted with no impact on the detection half.
- `terminal-manager.ts` mixes three concerns: (1) terminal launch/tracking, (2) session state detection, (3) orphan management/reconciliation. The orphan code builds on reconciliation which must stay for session label survival across reloads.

**Key observations about removable features:**
- 7 features identified for removal, totaling ~550 lines of production code and 5 test files
- The notification system (`notifications.ts`) only has two consumers: inbox toast and update prompt gating. Both are being removed, so the entire module goes.
- The `--resume` flag in `relaunchSession()` is the broken bit from #277, but the broader orphan management UI (tree items, dismiss, relaunch-all) should go too — it's UX complexity for a feature that doesn't work.
- `TerminalLayoutManager` auto-maximize is a "clever" feature that Casey finds annoying. 53 lines of event listener logic for a feature nobody asked for.
- Squad UI integration is dead code — the SquadUI extension isn't widely installed and the deep-link API (#293) was never built.

**Module boundaries identified for refactoring:**
- `extension.ts` → split into `extension.ts` (activation wiring, ~150 lines) + `commands/` folder (3-4 files, organized by domain: agent, session, work-item, browser)
- `initGitHubIntegration` and `initAdoIntegration` should move to `integration/` subfolder
- `initAutoRefresh` is already a named function — just move it to its own file
- After removals: 20 source files (down from 25), each with a single clear concern
- The `CliProvider` interface should drop `updateCommand`, `updateRunCommand`, `upToDatePattern` fields after removing update logic

### 2026-02-19: Design review for #303 squad update removal — key decisions

**Context:** Pre-implementation review with Morty (Extension Dev) and Meeseeks (Tester) for removing squad update detection and persistent upgrade indicator.

**Critical architectural decision:** Keep `squad-upgrader.ts` file but gut upgrade detection code, leaving only shared utilities (`checkNpxAvailable`, `promptInstallNode`, `isSquadInitialized`, `getLocalSquadVersion`). Original plan proposed extracting to new `squad-utils.ts`, but Meeseeks flagged that all test mocks would need updating. Keeping the file name avoids test churn while achieving the same outcome (dead upgrade code removed).

**UX decision for addSquad behavior:** When `addSquad` detects a squad is already initialized, silently skip terminal creation AND remove the "Squad upgrade started" toast. Proceed directly to discovery/registration flow. Cleaner UX — don't notify users about a no-op.

**Blocking issue caught in review:** Original plan missed package.json cleanup. Commands `editless.upgradeSquad` and `editless.upgradeAllSquads` must be removed from package.json (command definitions, menu entries, context checks) or users will see broken commands in Command Palette. This is mandatory for the removal.

**Test strategy:** Delete upgrade test blocks from `squad-upgrader.test.ts`, delete entire "EditlessTreeProvider — upgrade indicator" describe block (lines 737-797) from `tree-providers.test.ts`, update `addSquad` tests in `extension-commands.test.ts` for silent skip behavior. Keep utility tests (`checkNpxAvailable`, `isSquadInitialized`, `getLocalSquadVersion`). Update mocks by removing upgrade-related function mocks, keeping utility mocks.

**Implementation order:** (1) squad-upgrader.ts cleanup, (2) extension.ts + editless-tree.ts + package.json in parallel, (3) test updates, (4) CHANGELOG update, (5) verify with lint/test/build.

Files involved: `src/squad-upgrader.ts`, `src/extension.ts`, `src/editless-tree.ts`, `package.json`, test files. Module count stays the same (no new files created).
