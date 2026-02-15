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

### 2025-07-18: Git worktrees required — never switch branches in the main working directory
**By:** Casey Irvine (user directive)
**What:** All feature branch work MUST use git worktrees. The main working directory (`editless/`) stays on `master` at all times. Create a worktree for each feature branch (e.g., `git worktree add ../editless-wt-batch-c squad/batch-c`), do all work there, push, merge back to master from the main directory, then clean up the worktree. Never run `git checkout <branch>` in the main directory.
**Why:** Multiple concurrent sessions (planning, coding, coordinator) share the same repo directory. Switching branches in the main directory disrupts all other sessions. Worktrees give each branch an isolated directory so sessions don't interfere with each other.

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
