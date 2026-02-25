# Project Context

- **Owner:** Casey Irvine
- **Project:** EditLess — a VS Code extension for managing AI agents, terminal sessions, and work items. The "editorless IDE" panel.
- **Stack:** TypeScript, VS Code Extension API, esbuild, vitest
- **Created:** 2026-02-15
- **Repo:** cirvine-MSFT/editless (private)
- **Prototype:** Ported from tools-squad/extension. Redactor module removed. Rebranded from "Squad Dashboard" to "EditLess."
- **Target:** Internal Microsoft distribution by Monday 2026-02-16 via GitHub Releases (VSIX)
- **User:** Casey is new to GitHub workflows (experienced with ADO). Explain GitHub concepts clearly.

## Learnings

### 2026-02-22: v0.1.1 Release Planning — Viability Fixes & Scope Prioritization

Analyzed 9 issues across 3 domains to define v0.1.1 as a **viability release**. EditLess shipped in v0.1 functionally but with UX gaps and performance issues that made it unreliable for terminal sessions and work item management.

**Key planning decisions:**

1. **Terminal session performance (#331) is P1:** Session resolution was 100ms per poll, causing observable UI lag. CWD-indexed cache reduces to <5ms — a 20x improvement that's critical for "feels responsive" perception.

2. **Orphan session UX is a narrative:** Issues #327, #337, #338 tell one story: "Your sessions are safe and recoverable." Orphan matching false positives (#327) destroy trust. Launch progress indicator (#337) shows something is happening. Better UX copy (#338) explains what "orphaned" means. These should land together in same PR for narrative cohesion.

3. **Empty state onboarding (#339) prevents cliff:** New users saw "All agents hidden — use Show Hidden to restore" — wrong message for first-time experience. Welcome state is low-effort, high-impact UX fix. Unblocks adoption.

4. **Work items fixes (#280, #291, #292) are quality gates:** v0.1 shipped with flat work item list, no PR filtering, broken hierarchy. These are "credibility" fixes — not viability-critical but important for users to trust the feature set.

5. **No hard blockers:** All 9 issues can run in parallel (3 devs: Morty terminal-session+work-items, Summer terminal-ux). Estimated 2–3 days elapsed time with ~13–15 dev hours.

6. **Risk profile:** Low risk on constants (#328) and empty state (#339). Medium risk on performance (#331, #327) and UX timing (#337). Tree structure change (#291) needs careful testing for regressions.

**Release narrative:** "v0.1.1 makes EditLess reliable and usable. Terminal sessions are 20x faster, orphan recovery is trustworthy, work items are discoverable."

**Decision record:** Created `.squad/decisions/inbox/rick-v011-release-plan.md` with full execution plan, dependency graph, agent assignments, testing strategy, and rollout communication.

---

### 2026-02-17: v0.1 Retrospective — Speed vs. Quality Tradeoffs
Completed comprehensive retrospective analysis of v0.1 release cycle (103 closed issues, 96 merged PRs, 275+ commits in 3 days). **Key patterns identified:**

**Duplicate work:** PR#207 and PR#210 are literally the same fix merged twice (deduplicate squads in registry). Issues #11/#52 (toast re-appearing), #12/#54 (sessions not surviving reload) are duplicates. This represents pure waste from coordination gaps in parallel work.

**Features shipped then removed:** Custom Commands (#16) went through full build-ship-remove cycle: implemented in PR#24, discovered broken (#130 — config key mismatch), completely removed in PR#131 (P0), reimagined for backlog (#100). F2 keybinding added then removed twice (PR#233, PR#260). These represent wasted implementation effort that should have been caught in design or code review.

**Repeated fixes to same problem:** Session state touched in 4 PRs (PR#137, PR#173, PR#200, PR#236) yet #279 says it's still broken. Tree ID collisions fixed 3 times (PR#207, PR#210, PR#235). Filter logic fixed twice (PR#186, PR#214). Philosophy doc rewritten twice (PR#192, PR#221). README polished 3 times (PR#203, PR#205, PR#271). **Pattern:** Treating symptoms instead of root cause, unclear vision early on.

**P0s open post-release:** #277 (Resume Session rework) and #278 (Add Agent rework) both labeled `release:v0.1` + `priority:p0` but still open after ship. If flows were broken enough to need rework immediately after release, they should have blocked v0.1.

**Post-release quality gaps:** 20+ issues (#277-#300) filed immediately after v0.1 representing UX validation failures: session status icons don't represent state (#279), clicking sessions doesn't switch terminal (#298), adding squad feels buggy (#283), 5s cold start (#300), squad update detection broken (#288), decisions view not updating (#287).

**Lessons for v0.2:** (1) Tight definition of "done" during development — better to cut features early than ship broken ones and fix in patch. (2) Code review should catch duplicate work — add coordination point before merging parallel PRs to same module. (3) Architecture decisions must be final before parallel work — session state was rearchitected 4 times; should have been locked down in week 1. (4) UX validation should happen in v0.1 scope, not discovered in hotfixes. (5) Roadmap clarity prevents wasted effort on features that get removed (Custom Commands, F2 keybinding).

---

### 2026-02-22: v0.1.1 Release Planning — Viability Fixes & Scope Prioritization
Analyzed 9 issues across 3 domains to define v0.1.1 as a **viability release**. EditLess shipped in v0.1 functionally but with UX gaps and performance issues that made it unreliable for terminal sessions and work item management.

**Key planning decisions:**

1. **Terminal session performance (#331) is P1:** Session resolution was 100ms per poll, causing observable UI lag. CWD-indexed cache reduces to <5ms — a 20x improvement that's critical for "feels responsive" perception.

2. **Orphan session UX is a narrative:** Issues #327, #337, #338 tell one story: "Your sessions are safe and recoverable." Orphan matching false positives (#327) destroy trust. Launch progress indicator (#337) shows something is happening. Better UX copy (#338) explains what "orphaned" means. These should land together in same PR for narrative cohesion.

3. **Empty state onboarding (#339) prevents cliff:** New users saw "All agents hidden — use Show Hidden to restore" — wrong message for first-time experience. Welcome state is low-effort, high-impact UX fix. Unblocks adoption.

4. **Work items fixes (#280, #291, #292) are quality gates:** v0.1 shipped with flat work item list, no PR filtering, broken hierarchy. These are "credibility" fixes — not viability-critical but important for users to trust the feature set.

5. **No hard blockers:** All 9 issues can run in parallel (3 devs: Morty terminal-session+work-items, Summer terminal-ux). Estimated 2–3 days elapsed time with ~13–15 dev hours.

6. **Risk profile:** Low risk on constants (#328) and empty state (#339). Medium risk on performance (#331, #327) and UX timing (#337). Tree structure change (#291) needs careful testing for regressions.

**Release narrative:** "v0.1.1 makes EditLess reliable and usable. Terminal sessions are 20x faster, orphan recovery is trustworthy, work items are discoverable."

**Decision record:** Created `.squad/decisions/inbox/rick-v011-release-plan.md` with full execution plan, dependency graph, agent assignments, testing strategy, and rollout communication.

---

### 2026-02-22: v0.2 Scope & v0.1.1 Planning — Squad Integration Refocus

Reviewed all directives from Casey, Morty, and Summer. Consolidated planning for v0.1.1 (viability release, 2–3 days) and v0.2 (Squad CLI first-class support, 1–2 weeks).

**Key scope decisions:**

1. **v0.1.1 (Viability):** Terminal session performance (CWD cache), orphan UX, launch indicator, empty state, work items fixes. Estimated 5–7 issues, 2–3 day sprint. Leads to solid foundation for v0.2.

2. **v0.2 (Session Manager for CLI):** Focus on user-facing interactive sessions (copilot-cli, squad CLI REPL, squad CLI loop). Daemon/SDK/native-chat deferred to v0.3+.

**v0.2 Scope Changes:**
- **Squad modality support (3 types):** copilot-cli, squad-cli, unknown. Remove squad-sdk, native-chat (deferred). ThemeIcons only ($(copilot), $(organization), $(sync)).
- **Session attention tracking (3 states):** working, idle, needs-decision via shell execution events, not heuristics. Start simple; iterate.
- **Squad CLI command builder:** Parallel to existing copilot-cli builder. Support `squad`, `squad loop`, `squad init`, `squad upgrade`, `squad add`. Remove watch daemon (not a session).
- **Registry ↔ Workspace hybrid:** Registry source of truth, workspace derived view. Phase 1: removeSquad commands, stale detection, autoAddToWorkspace setting. Phase 2: bidirectional reconciliation. No forced multi-root workspaces.
- **EditLess as router, not SquadUI-lite:** Keep launch commands, session lifecycle, SquadUI forwarding, modality icons. Cut: rich heuristics, auto-refresh SquadUI, work item display in tree. Add: status bar attention indicator, split-view command, Squad CLI builder.

**Affected Issues:** #373 (squad CLI builder), #374 (modality type system), #375 (launch commands), #376 (attention tracking), #377 (modality icons). #388 (registry/workspace sync). All already in backlog; scope refined, not new work.

**Dependencies:** No blockers. v0.1.1 can run in parallel with v0.2 planning. Recommend v0.1.1 ship → week break/stabilization → v0.2 start.

---

**Test quality vs. quantity:** 200+ tests but #247 identifies pervasive antipatterns: ~25+ mock-call assertions without result validation, 16 tautological tests, 18+ shallow smoke tests, ~40 instances of fragile mock coupling, missing edge case coverage. High line coverage provides false confidence — suite checks that code runs but doesn't validate correct behavior.

**Root cause:** Speed prioritized over validation. Aggressive parallel execution (96 PRs in 3 days) without sync points led to duplicate work, insufficient code review, and UX validation gaps.

**What went well:** Shipped functional extension with deep GitHub/ADO integration, robust session persistence, working CI/CD pipeline, comprehensive docs. Architectural wins: CLI Provider system (PR#165), session persistence design (PR#55, PR#157), .squad folder migration (PR#154).

**Recommendations for v0.2:** (1) Rethink session state model — stop iterating on implementation, fix the abstraction. (2) Tighten code review — check for duplicates, end-to-end functionality, config consistency, test quality. (3) Gate releases on P0s — enforce `release:vX.Y` + `priority:p0` must be closed before ship. (4) Manual core workflow validation — don't rely on unit tests alone. (5) Coordination for parallel work — daily check-ins, assign issues before starting, PR titles must reference issue numbers. (6) Reduce god objects (#246) — break down extension.ts (943 lines), editless-tree.ts (453 lines), terminal-manager.ts (496 lines). (7) Improve test signal (#247) — rewrite tests to validate behavior, not mock calls.

**Key learning:** v0.1 shipped functional but rough. The technical foundation is solid. v0.2 should focus on refinement and quality over speed. The right architecture decisions were made; execution needs better validation gates.

**Decision record:** Created `.ai-team/decisions/inbox/rick-v01-retro.md` documenting quality gates for future releases: P0 issue gate, core workflow validation checklist, code review standards, release label discipline, coordination for parallel work.

📌 **Team update (2026-02-16):** Documentation animation strategy — EditLess uses optimized GIFs stored in docs/media/ directory. Primary tool: ScreenToGif (Windows). Files must be <1 MB, max 800px width, 3–8 seconds duration. File naming is descriptive kebab-case (e.g., planning-feature.gif). Re-recording triggers documented: UI structure changes, command/shortcut changes, label changes, layout changes. Team reviews animations on code review checklist. — decided by Summer

📌 **Team update (2026-02-21):** Strategic unified discovery decision made — Rick assessed PR #364 (refresh discovery fix) against Casey's unified discovery directive. Recommendation: Merge PR #364 NOW (surgical v0.1.1 patch), defer broader unified architecture to v0.2. Decision doc filed: `.squad/decisions/inbox/rick-unified-discovery.md`. Key rationale: PR #364 is small, testable, no side effects. Broader refactor (consolidate discovery/add code paths, remove discovery dirs config) is architectural work for v0.2. Separation maintains release momentum while planning architecture refactor. — decided by Rick

📌 **Team update (2026-02-16):** Default release target — All new issues default to elease:v0.1 unless Casey explicitly directs otherwise. This ensures v0.1 work is automatically tagged correctly. — decided by Casey Irvine

📌 **Team update (2026-02-16):** Worktree enforcement reinforced to hard constraint — Git checkout violations (agent on #213 checked out branches on the main clone instead of using worktrees) have happened repeatedly despite existing documentation. The rule is now a non-negotiable constraint enforced through code review: the main clone (C:\Users\cirvine\code\work\editless) is PULL-ONLY, all feature branch work must use git worktrees. Violations must be caught and rejected in PR review. — reinforced by Casey Irvine

📌 **Team update (2026-02-16):** Use context keys for menu visibility based on dynamic state — Gate menu items on VS Code context keys when visibility depends on runtime state that can't be expressed through `viewItem` checks. For the "Upgrade All Squads" button, use `editless.squadUpgradeAvailable` context key set via `vscode.commands.executeCommand('setContext', ...)` in `checkSquadUpgradesOnStartup()`. This pattern applies to all view-level actions depending on aggregate state (e.g., "any squad upgradeable"). — decided by Morty

📌 **Team update (2026-02-16):** All bug fixes must include regression tests AND UX tests — Bug fixes require both regression test coverage (prevents recurrence) and UX tests (validates user experience). For upgrade scenarios, create tests that either check current state or force an earlier version to validate upgrade paths. Copilot CLI version detection with default settings must be thoroughly tested. — decided by Casey Irvine

📌 **Team update (2026-02-16):** Meeseeks writes regression tests for every bug Casey discovers — When Casey discovers a bug during usage, Meeseeks should write regression tests for that specific scenario BEFORE Morty fixes it. Tests-first approach for all user-discovered bugs ensures proper coverage and clear verification criteria when the fix lands. — decided by Casey Irvine
📌 **Team update (2026-02-16):** Worktree enforcement reinforced to hard constraint — Git checkout violations (agent on #213 checked out branches on the main clone instead of using worktrees) have happened repeatedly despite existing documentation. The rule is now a non-negotiable constraint enforced through code review: the main clone (C:\Users\cirvine\code\work\editless) is PULL-ONLY, all feature branch work must use git worktrees. Violations must be caught and rejected in PR review. — reinforced by Casey Irvine
### 2026-02-19: Git redaction system design review — pre-commit hook + local patterns
Designed and approved the git redaction system for blocking sensitive patterns from commits. Key decisions: (1) **pre-commit hook is the right mechanism** — not clean/smudge filters (too complex) or pre-push (too late). Sanitizes content before it enters git history. (2) **Local pattern storage is secure** — `.ai-team/redacted.json` stays in `.gitignore`, patterns never committed, per-developer config prevents accidental leaks. (3) **Replacement format:** Use `[REDACTED: alias]` (concise, grep-friendly) instead of verbose format pointing to config. (4) **Binary file handling:** Skip via extension check. (5) **US phone regex:** `\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})` covers all common formats (dashes, dots, spaces, parens). (6) **Edge cases:** Merge commits and rebases work automatically (hook runs on all commits); no size threshold needed initially. Design approved for implementation. Decision record: `.ai-team/decisions/inbox/rick-redaction-design.md`.

### 2026-02-20: Terminal integration synthesis — 4-phase architecture plan
Synthesized research from Jaguar (Copilot SDK), Morty (code audit), and Squanchy (squad platform) into a unified terminal integration architecture. **Key findings:**

1. **Two P0 race conditions confirmed:** (a) `sendText()` called after `show()` — commands can execute before shell CWD is set. Fix: reorder. (b) Session ID detection uses `resolveAll()` which returns only the latest session per CWD — when two terminals share a CWD, both claim the same session. Fix: `resolveAllSessions()` with timestamp-proximity matching.

2. **VS Code APIs we're ignoring:** `isTransient` (prevents zombie terminals on reload), `iconPath`/`color` (visual distinction), `env` (inject `EDITLESS_TERMINAL_ID` for 100% accurate reconciliation), `terminal.state.isInteractedWith` (user activity signal), `onDidEndTerminalShellExecution` exit codes (crash detection). All stable APIs since VS Code 1.93.

3. **Session scan performance:** Current `resolveAll()` reads every directory in `~/.copilot/session-state/` (100+ sessions × 2 file reads = ~100ms) every 30 seconds. Fix: CWD index cache (100ms → 5ms).

4. **Squad mental model:** One terminal = one coordinator session. Sub-agents (Rick, Morty, etc.) are invisible subprocesses spawned via the `task` tool. EditLess should never show N terminals for N agents. The `decisions/inbox/` directory is the real-time heartbeat — files appear when agents work, disappear when Scribe merges.

5. **Phase plan:** Phase 1 (v0.1.1) = P0 fixes + TerminalOptions + constant tuning. Phase 2 (v0.2.0) = CWD index + exit tracking + link provider + CLI builder. Phase 3 (v0.2.x) = rich naming from workspace.yaml + inbox badges + orchestration tooltips. Phase 4 (v0.3.0+) = dashboard webview + Agent Mode tracking + multi-agent progress.

6. **Three decisions for Casey:** (a) Use `isTransient: true`? (recommended yes), (b) Invest in pseudoterminals? (recommended no — too much cost for marginal gain), (c) Track Agent Mode sessions? (recommended defer to Phase 4).

Decision record: `.ai-team/decisions/inbox/rick-terminal-integration-synthesis.md`.
### 2026-02-20: PR #364 assessment — unified discovery architecture decision
Reviewed PR #364 (refresh button squad discovery) and Casey's broader feedback on discovery flows. **Finding:** Current code has two completely separate discovery paths (agents vs squads) with different UI patterns (sidebar for agents, toast+picker for squads). PR #364 is a correct tactical fix (adds squad discovery to refresh command) but doesn't address Casey's vision of a unified flow. **Decision:** Approve and merge PR #364 now (v0.1.1 bug fix). Promote #318 (unify discovery/add flows) to v0.2 architecture work. Recommend deprecating `editless.discovery.scanPaths` config and shifting to workspace-folder-based discovery only (aligns with workspace integration). Created decision record `.squad/decisions/inbox/rick-unified-discovery.md` with scope, rationale, and timeline.

### 2026-02-22: Squad ecosystem v0.2 scope narrowed — watch daemon removed, native-chat deferred

Updated 5 GitHub issues (#373, #374, #375, #376, #377) per Casey's scope directive. Changes represent **architecture clarification**: EditLess is a terminal session manager, not a process daemon launcher.

**Key scope changes:**

1. **Issue #373 (Squad CLI builder):** Removed `squad watch` from subcommand interface. Watch is a background daemon, not a terminal session — it should NOT be launched from EditLess. Keeps: `squad`, `squad loop`, `squad init`, `squad upgrade`, `squad add`. Updated `SquadCommandOptions` interface accordingly.

2. **Issue #374 (modality type system):** Narrowed modality types from 5 to 3: `'copilot-cli' | 'squad-cli' | 'unknown'`. Removed `squad-sdk` and `native-chat` from v0.2 scope. Added "Future Modalities" section clarifying: `native-chat` is deferred, not cut — Casey directive is users should be able to work in CLI or native chat interchangeably. Simplified detection logic to check launchCommand only (no SDK markers, no env var detection).

3. **Issue #375 (launch commands):** Removed `editless.launchSquadWatch` command entirely. Kept `editless.launchSquad` (REPL) and `editless.launchSquadLoop`. Reduced from 3 commands to 2.

4. **Issue #376 (attention state tracking):** **Complete rewrite.** Old body proposed complex heuristics (output pattern matching, timeout-based idle detection). New body implements Casey's core directive: "The user needs to know when something is working, when it's idle, or when it needs a decision." Three-state model (`working | idle | needs-decision`) using ONLY existing VS Code shell execution events (`_shellExecutionActive`). Includes status bar indicator, tree view icons, auto-dismiss on interaction. Explicitly calls out: "Do NOT add complex heuristics. Start with shell execution events only. The detection may be imperfect initially. That's OK — ship it, iterate."

5. **Issue #377 (modality icons):** Removed `squad-sdk` and `native-chat` icon references. Settled on ThemeIcons (`$(codicon-name)`) over emoji — themeable, consistent with VS Code design language. Icons: `copilot-cli` → `$(copilot)` or `$(github)`, `squad-cli` (REPL) → `$(organization)`, `squad-cli` (loop) → `$(sync)`.

**Architecture clarity:** EditLess is a **session manager**, not a process daemon launcher. Terminals = user-facing interactive sessions. Background daemons (watch, background jobs) are out of scope. This is consistent with v0.1 vision: "The editorless IDE panel" — focus on user interaction, not infrastructure.

**Why this matters:** v0.2 spec was creeping into infrastructure concerns (daemon management, SDK integration, chat UI). These are valuable but belong in v0.3+. v0.2 focus is: "Users can run Squad CLI sessions side-by-side with Copilot CLI and know at a glance what needs their attention."

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

### 2026-02-22: Architecture review — hierarchical filter system (commits 873c8fe→98ebb34)
Reviewed the hierarchical filter architecture for Work Items and PRs trees introduced in issue #390. Four commits restructured flat filters into cascading backend→org→project/repo→items hierarchy with per-level inline filtering. **APPROVED WITH NOTES.** Core architecture is sound and consistent. The LevelFilter abstraction is clean, the cascading principle is correctly implemented, and context value naming follows clear conventions. The backend collapse logic (auto-hide hierarchy when single backend or single repo) delivers good UX. Global filter trim (sources-only) correctly delegates detailed filtering (states/labels/types) to per-level nodes.

**Issues identified:**

🟡 **Code duplication — moderate extraction opportunity:** WorkItemsTreeProvider and PRsTreeProvider share identical patterns for level filter management (_levelFilters Map, get/set/clear/clearAll methods line-for-line identical), matchesLabelFilter logic (prefix grouping + AND/OR), and hierarchy construction patterns (_getGitHubOwnerNodes, _getAdoOrgNodes structure). Recommend extracting shared logic to a base class or utility module in v0.2. Not a blocking issue — duplication is localized and stable.

🟡 **Context value collision risk — low:** Work items use `ado-backend`, `github-backend`; PRs use `ado-pr-backend`, `github-pr-backend`. The `-pr-` infix prevents collisions in package.json when clauses. Pattern is safe but creates coupling: if another tree needs backend nodes, the naming convention must be explicitly documented. Consider a context value naming convention doc in .squad/decisions.

🟡 **LevelFilter vs PRLevelFilter divergence:** WorkItemsTreeProvider uses LevelFilter with types/tags/labels/states/selectedChildren. PRsTreeProvider uses PRLevelFilter with statuses/labels/selectedChildren. Difference: "states" vs "statuses" (semantically identical), "types" and "tags" absent from PRLevelFilter. The asymmetry is correct (ADO work items have types/tags; PRs don't) but could cause confusion. Recommend documenting the semantic equivalence of states/statuses in code comments or unifying to a single term.

🟢 **ADO single-org-single-project assumption is future-proof:** Code reads org/project from config as single strings and stores in _adoOrg/_adoProject private fields. The hierarchy always shows exactly one org and one project node. This is NOT a constraint — to support multi-org/multi-project, you'd just change setAdoConfig to accept arrays and expand _getAdoOrgNodes/_getAdoProjectNodes to loop. The data model is ready for the change. Current UX assumption (single org/project) matches user config reality.

🟢 **Filter cascade correctness verified:** getAvailableOptions correctly returns direct children at each level (backend→owners/orgs, org→repos/projects, repo/project→labels/states/types). Cascade logic in getChildren applies parent filter first (applyRuntimeFilter) then per-level filter. Milestone grouping preserves filter state correctly via repoFilter lookup. No edge cases found where filters produce empty results unexpectedly (all nodes show item counts in descriptions).

🟢 **Command duplication is acceptable:** filterLevel/clearLevelFilter vs filterPRLevel/clearPRLevelFilter are duplicated but context-bound (different tree views, different item types, different filter interfaces). Sharing would require generic typing and lose clarity. Current approach is pragmatic.

**Decision:** No blocking issues. Code duplication and naming can be addressed in v0.2 modularity refactor (issue #246 already tracks god object splitting). The architecture scales cleanly and the implementation is correct.
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

### 2026-02-21: Pseudoterminal spike analysis — DO NOT SHIP, use events.jsonl instead
Analyzed spike #321 pseudoterminal module and Casey's question: "Can we use pseudoterminal for UX benefits AND events.jsonl + --resume for state detection?" **Finding: No. They solve orthogonal problems, and combining them creates net negative value.**

**Key analysis:**
1. **events.jsonl is the authoritative source of truth.** File watching gives real-time state (idle/working/tool-running) without parsing terminal output. It's structured, version-stable, doesn't break on CLI output changes.
2. **Pseudoterminal I/O parsing duplicates this work.** The spike implements state detection patterns (lines 9-240) that redundantly solve what `events.jsonl` already solves. Fragile: depends on CLI output format staying stable forever.
3. **Session resumption (--resume) is already solved** pre-launch via UUID generation. No need for post-hoc session ID detection from terminal output.
4. **Hide/show behavior is NOT pseudoterminal-specific.** EditLess TerminalManager already implements orphan reconnection (terminal-manager.ts lines 185-216). Works with regular terminals. Pseudoterminal adds zero UX value here.
5. **Pseudoterminal loses shell features:** No tab completion, history, aliases, shell integration. Cost is real, benefit is zero.
6. **Pseudoterminal is a dead-end when --acp ships.** ACP (structured machine-to-machine protocol) is the future. Pseudoterminal skills don't transfer; resources spent here are wasted when ACP client is built.
7. **Cost/benefit is terrible:** 16-hour spike cost vs zero benefits (everything provided is suboptimal vs alternatives or already solved).

**Recommendation (Casey approval pending):** Delete copilot-pseudoterminal.ts (284 lines of good code, but unnecessary). Build instead: (1) Regular terminal + events.jsonl + --resume infrastructure. (2) events.jsonl file watcher for real-time state (low cost, high value). (3) Archive spike with decision rationale. (4) Plan ACP client as v0.3 work.

**Decision record:** `.squad/decisions/inbox/rick-pseudoterminal-decision.md`
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

📌 **Team update (2026-02-19):** Feature removal checklist expanded — PR #320 (remove terminal-layout) established that feature removals must include documentation cleanup. Expanded checklist: (1) source file, (2) test file, (3) extension wiring, (4) test mocks, (5) settings in package.json, (6) all doc references (docs/architecture.md, SETTINGS.md, local-development.md, etc.), (7) CHANGELOG. This pattern prevents recurring gaps seen in #303 (squad upgrade removal). — decided by Rick


📌 **Team update (2026-02-19):** Squad↔Copilot integration research — Squanchy completed comprehensive Squad framework analysis (14 ranked integration points, phased rollout plan). Jaguar completed Copilot SDK analysis (7 integration scenarios, stable APIs). Both flagged overlap areas for cross-review. See decisions.md for full details. Key insight for architectural planning: EditLess watcher already fires on .ai-team/ changes; work is in reacting differently to different file paths. — documented by Scribe

### 2026-02-19: PR #320 Review — Remove terminal layout restore (#309)
Reviewed Morty's feature removal PR. Code removal was surgical and complete — source, test, extension wiring, test mocks, package.json setting all properly cleaned. CI green. However, **7 dangling documentation references** found across `docs/architecture.md` (3), `docs/SETTINGS.md` (3), and `docs/local-development.md` (1). Also `CHANGELOG.md` still lists the feature. Rejected with specific line-by-line fix list.

- **Pattern confirmed:** Feature removals consistently miss docs cleanup. Same gap as #303. Created decision record (`rick-pr320-review.md`) to formalize docs as a required step in the feature-removal checklist.
- **Minor code hygiene:** Removal left a double blank line in `extension.ts` (lines 1149-1150). Not a blocker but worth cleaning.
- **Observation:** The `TerminalLayoutManager` was well-isolated (zero inbound deps outside extension.ts wiring) — good architecture that made removal trivial. The pattern of self-contained auxiliary modules continues to pay dividends.

📌 **Team update (2026-02-19):** Terminal integration research session complete — 4-phase architecture plan and 27-item priority matrix. Session log at .ai-team/log/2026-02-19-terminal-integration-research.md. — documented by Scribe


📌 Team update (2026-02-19): Session rename & resume architectural decisions finalized. Key decisions: (1) Display dual names (EditLess + Copilot summary), (2) Fix #277 with TerminalOptions, (3) Create custom Copilot Sessions tree view, (4) No write-access to workspace.yaml. — decided by Casey Irvine

### 2026-02-20: v0.1.1 Removal Batch 2 — Architecture Review
Reviewed and merged 4 removal PRs (#352, #353, #354, #355) from the v0.1.1 cleanup batch. All PRs targeted removal of v0.1 features identified as broken or unnecessary in the retrospective.

- **PR #352 (custom commands):** Clean surgical removal. ✅
- **PR #353 (plan detection):** Good removal but left 3 dead imports (fs, path, TEAM_DIR_NAMES) in work-items-tree.ts. ⚠️
- **PR #354 (session state):** Best PR of the batch. Replaced broken 5-state model with honest active/inactive/orphaned. The old model was unreliable (4 PRs in v0.1 couldn't fix it). New model maps to what we can actually observe (shell execution API). ✅
- **PR #355 (CLI provider):** Good removal of YAGNI abstraction, but introduced getLaunchCommand() duplication across 3 files. Needed rebase after earlier merges caused conflicts. ⚠️

**Key architectural learning:** When removing abstractions, the replacement pattern matters as much as the removal. PR #355 replaced one abstraction with 3 copies of the same helper — that's a DRY debt that needs a follow-up extraction to cli-settings.ts.

**Process learning:** Merge order matters for removal batches targeting the same base. PRs #352 and #353 merged cleanly. #354 merged cleanly. #355 conflicted on terminal-manager.test.ts because both #354 and #355 modified the import line differently. Resolved by taking the union of both changes (no cli-provider mock AND no stateFromEvent import).

Decision record: `.ai-team/decisions/inbox/rick-removal-batch2-review.md`

### 2026-02-20: PR #359 session tree description cleanup — approved and merged
Reviewed PR #359 (Closes #358) — +2/-32 lines in editless-tree.ts. Three changes: (1) Label uses stable `info.displayName` instead of auto-updating `sessionCtx.summary`. (2) Description simplified to just `relative` (creation-relative time). (3) Deleted `_buildTerminalDescription` (30-line method, sole call site confirmed via grep). Tooltip still preserves full context (summary, branch, refs, timestamps). `getStateDescription` import still used by `_buildTerminalTooltip`. All 576 tests pass, lint clean. Aligns with UX convention: Icon=state, Label=what, Description=time only, Tooltip=full context. Simple/confident — squash merged, issue #358 auto-closed.

📌 **Removal Batch 2 architecture review (2026-02-20):** Reviewed and merged 4 consecutive cleanup PRs (#352–#355). Identified 3 follow-up items: (1) Extract getLaunchCommand() to shared cli-settings.ts module (currently duplicated in discovery.ts, extension.ts, terminal-manager.ts), (2) Clean dead imports in work-items-tree.ts (fs, path, TEAM_DIR_NAMES after plan detection removal), (3) Consider enabling noUnusedLocals in tsconfig. Architectural observation: Merge order matters for batches — all 4 PRs based on same SHA, caused conflicts when merged sequentially. Future batches should rebase proactively or merge in dependency order.

### 2026-02-21: Phase 2 terminal integration architecture review — REQUEST CHANGES
Reviewed `terminal-manager.ts` and `session-context.ts` for Phase 2 terminal integration (pre-generated UUID, TerminalOptions, focusTerminal overload, watchSession/watchSessionDir, session watcher wiring).

**Verdict: REQUEST CHANGES** — one required fix, two advisories.

**Required fix:** `relaunchSession` (terminal-manager.ts:306-308) shows error via `showErrorMessage` when `isSessionResumable` returns `resumable: false`, but **does not return early** — execution continues, creating a terminal and sending the doomed `--resume` command. Users see contradictory signals: error toast + terminal launching. Must early-return or guard terminal creation.

**Advisory 1 — Missing `dispose()` on SessionContextResolver:** Class owns `_fileWatchers` and `_watcherPending` maps but has no bulk cleanup method. TerminalManager.dispose() handles its own watchers via `_sessionWatchers`, but orphaned retry timers from `setupWatch()` could fire post-deactivation. Recommend adding a `dispose()` method to SessionContextResolver.

**Advisory 2 — Unbounded retry in `setupWatch()`:** session-context.ts:218-222 and 278-283 retry every 1s forever if file/dir doesn't exist. Each watcher's Disposable cleans up on dispose, so no leak, but wasteful if session never materializes. Recommend max retry count (~30).

**What's solid:** Module boundary is clean (session-context.ts has zero vscode imports, uses own Disposable interface). Watcher lifecycle in TerminalManager is thorough — onDidCloseTerminal cleans per-terminal, dispose() cleans all. Pre-generated UUID eliminates session-detection race condition. Debounced fs.watch with tail reading is efficient. focusTerminal string-overload validates liveness correctly. `watchSessionDir` is unused in production code (forward-looking for Phase 3) — acceptable as speculative API.

**Decision:** Filed `.squad/decisions/inbox/rick-phase2-review.md` documenting the relaunchSession guard requirement.
## Learnings

### 2026-02-23: v0.1.1 Code Review — Performance & Reliability Wins

Reviewed PR #385 (v0.1.1 release candidate). **Verdict: APPROVED.**

**Key validation:**
1.  **Performance:** CWD-indexed session cache (`SessionContextResolver`) eliminates O(N) file reads per poll. `parseSimpleYaml` is a smart optimization for metadata.
2.  **Reliability:** Orphan matching strategy is now deterministic (Index → Exact → Emoji-stripped). Removed risky substring fallback that caused false positives.
3.  **UX:** Launch progress indicator (`launching` state) bridges the gap between terminal creation and first event.
4.  **Quality:** 654 tests passing. New tests cover race conditions and edge cases.

**Advisory:**
-   `SessionContextResolver` watcher retry loop is still unbounded (intentional for now, but monitor for CPU usage in v0.2).
-   Work items ADO integration is clean but assumes flat list first, then hierarchy. Large ADO queries might need pagination in future.

**Decision:** Merging PR #385 for v0.1.1 release.

### 2026-02-23: v0.1.1 Follow-up Review — Discovery & Work Item Filters

**Task:** Review changes on branch v0.1.1 (e4bf49b..HEAD).

1.  **Discovery dedup fix:** ✅ APPROVED. Correctly filters `squad.agent.md` when it's part of a discovered squad structure. Tests cover both the exclusion and the standalone case.
2.  **#387 Unified work items filter & Harmonization:** ✅ APPROVED. Unifying the filter UI is a good UX improvement. Mapping "Bug" -> `type:bug` is a sensible default for GitHub. "Labels" vs "Tags" harmonization reduces cognitive load for users switching between providers.
3.  **#386 Refresh Tree after Dashboard Open:** ✅ APPROVED WITH NOTES. The fix addresses the stale tree issue. **Note:** `squadui.refreshTree` is a tactical fix. Ideally, the SquadUI extension should broadcast a change event that EditLess listens to, rather than EditLess imperatively refreshing it. Acceptable for now.

**Decision:** Filed `.squad/decisions/inbox/rick-unified-work-item-types.md`.

### 2026-02-23: Review Cycle 2 Summary

**Reviewed 3 changes — all APPROVED:**
1. Discovery dedup fix
2. #387 Unified work items filter & Harmonization
3. #386 SquadUI Refresh Tree after Dashboard Open

**Decision filed:** Unified Work Item Types (`.squad/decisions/inbox/rick-unified-work-item-types.md`) — merged into `.squad/decisions.md`.

**Meeseeks test audit:** 682 → 700 tests (+18 new tests), 52 new assertions across 3 files: `squad-ui-integration`, `work-items-tree`, `unified-discovery`.

### 2026-02-22: Squad Ecosystem Integration Roadmap — Multi-Modality Architecture Plan

Created comprehensive GitHub milestone "Squad Ecosystem Integration" with 12 issues spanning three phases: Foundation (NOW), Copilot SDK Integration (research), and Advanced Coordination (BLOCKED on Brady).

**Context:** Casey wants EditLess to be the universal terminal orchestration layer for all Squad modalities — CLI agents, Squad SDK sessions, and native chat side-by-side. Current EditLess treats all terminals homogeneously with no modality awareness. Squad ecosystem consists of four components: @github/copilot-sdk (production), @bradygaster/squad-sdk (STUB), @bradygaster/squad-cli (STUB), csharpfritz/SquadUI (production).

**Phase 1 — Foundation (NOW, v0.2.0):** 5 issues for core multi-modality support using existing APIs. Key work: (1) Session modality type system — extend TerminalInfo with modalityType: 'copilot-cli' | 'squad-cli' | 'squad-sdk' | 'native-chat', (2) Squad CLI command builder — buildSquadCommand() for `squad`, `squad loop`, `squad watch`, (3) Launch Squad CLI terminals — commands for squad workflows from UI, (4) Terminal attention state — needsAttention flag derived from shell execution + activity timing, (5) Modality-aware icons — different visual indicators per session type. All routed to Morty (extension dev) except icons (Summer for UX design).

**Phase 2 — Copilot SDK Integration (NOW, research):** 3 issues exploring @github/copilot-sdk foundation. (6) Copilot SDK research spike — install SDK, explore JSON-RPC API, assess EditLess use cases, (7) SDK session discovery prototype — can EditLess discover/attach to SDK-managed sessions?, (8) SDK vs CLI architecture decision — should EditLess migrate to SDK, stay CLI-only, or hybrid? Routed to Jaguar (Copilot SDK expert) for research, Rick for final decision.

**Phase 3 — Advanced Coordination (BLOCKED on Brady):** 4 issues requiring Squad SDK/CLI real implementations. (9) Squad SDK terminal integration — integrate SquadClient for persistent sessions, (10) Event bus monitoring — subscribe to agent:task-complete, agent:error for attention routing, (11) HookPipeline integration — surface governance violations (PII, file-write guards), (12) Ralph monitor integration — display work loop state from RalphMonitor. All tagged `release:backlog` and routed to Morty.

**Routing logic:** Issues #1-4 (core terminal work) → Morty, #5 (visual design) → Summer, #6-7 (SDK research) → Jaguar, #8 (architecture decision) → Rick, #9-12 (blocked SDK features) → Morty + release:backlog.

**Key decisions:** (1) Modality type system is the foundation — all other work depends on it. (2) Squad CLI integration can ship NOW with existing APIs (no Brady dependency). (3) SDK exploration starts in parallel (research spike) to derisk while waiting. (4) Blocked features clearly separated in backlog to avoid premature work.

**Casey education:** Explained GitHub milestone concept (grouping related issues for a release goal), issue labeling strategy (type, squad member, release, area), and dependency management (MUST/SHOULD complete first). Created decision document at `.squad/decisions/inbox/rick-squad-integration-roadmap.md` with full context, rationale, and success metrics.

**Release plan:** Phase 1 (v0.2.0) delivers immediate value — users can launch squad CLI workflows, see modality-specific icons, understand which terminals need attention. Phase 2 informs long-term architecture. Phase 3 waits for Brady but is pre-planned for fast integration when unblocked.

**Milestone created:** GitHub milestone #2 "Squad Ecosystem Integration" with 12 issues (8 NOW work, 4 backlog). All issues have clear problem statements, acceptance criteria, file lists, size estimates, and WHY explanations per Casey's preference for context-rich issues.

---

### 2026-02-23: Settings & Registry Edge Cases — Pre-Documentation Audit

Comprehensive edge case analysis of VS Code settings and agent-registry.json interactions.

**15 edge cases identified:**
- 2 critical: changeModel regex surgery on launchCommand; no onDidChangeConfiguration for CLI settings
- 7 medium: launchCommand baked at registration (#401 related); config.path overloading (#403 related); changeModel silent no-op; registry write-read race; file watcher race; TYPED_FLAGS missing --model (#404 confirmed); changeModel String.replace first-occurrence bug
- 6 low: empty registry handling (robust), migration edge cases, legacy flag stripping, --resume outside builder, tree disk reads

Existing issues confirmed: #403, #404. New issues needed: 2 critical, 5 medium.
Decision document: .squad/decisions/inbox/rick-settings-edge-cases.md

---

### 2026-02-24: v0.1.3 PR Reviews — 3x Code Review of 5 Draft PRs

Performed thorough code review of all 5 v0.1.3 draft PRs (#423, #424, #425, #426, #427) at Casey's request. All approved.

**Review patterns observed:**

1. **Branch overlap pattern:** PRs #423, #425, and #426 share overlapping changes to extension.ts, editless-tree.ts, and tests. They appear branched from the same integration point. This creates a merge ordering dependency: #423 → #425 → #426. Future v0.1.x work should either use stacked PRs explicitly or avoid branching from shared points.

2. **Synthetic agent pattern:** The built-in Copilot CLI agent (`builtin:copilot-cli`) is a synthetic entity that lives outside the registry. Any new picker or selection flow must use `getAllAgentsForPicker()` (introduced in #423) to include it. This is now a project convention — registry-only queries will miss the built-in agent.

3. **Config watcher pattern:** PR #424 establishes the pattern for re-initializing integrations when VS Code settings change: `onDidChangeConfiguration` + `affectsConfiguration()` + call existing init function. If new config keys are added for other integrations, follow this same pattern.

4. **setTimeout(0) for UI-first rendering:** PR #427 uses `setTimeout(() => ..., 0)` to yield the event loop after triggering tree refresh, ensuring VS Code renders the update before synchronous watcher rebuild blocks. Good pattern for any "refresh then rebuild" sequence.

5. **Test coverage tradeoff:** Bug fix PRs included test updates. The new feature PR (#426 resume session) did not add tests for the command handler — acceptable for UI orchestration flows that compose existing tested components. Would not accept this for data transforms or algorithms.

Decision document: .squad/decisions/inbox/rick-v013-pr-reviews.md