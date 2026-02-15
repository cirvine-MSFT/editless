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
