# Project Context

- **Owner:** Casey Irvine
- **Project:** EditLess — a VS Code extension for managing AI agents, terminal sessions, and work items. The "editorless IDE" panel.
- **Stack:** TypeScript, VS Code Extension API, esbuild, vitest
- **Created:** 2026-02-15
- **Repo:** cirvine-MSFT/editless (private)
- **Prototype:** Ported from tools-squad/extension. Redactor module removed. Rebranded from "Squad Dashboard" to "EditLess."
- **Target:** Internal Microsoft distribution by Monday 2026-02-16 via GitHub Releases (VSIX)
- **Taglines:** "Leave the editor for your mind" · "Plan, delegate, and review your AI team's work"

## Learnings

📌 **Hierarchical filter UX pivot (2026-02-23):** Casey rejected the flat QuickPick approach to filter UX. His feedback: "Instead of a flat QuickPick, I want hierarchical tree view grouping (ADO/GitHub → Org → Project/Repo), filters on tree view elements, and per-level scoping." Key insight: **tree-native interactions trump modal dialogs** in VS Code. Users expect to right-click or see inline icons on tree items, not pick from a global dropdown. The revised proposal (Variant D: Hybrid) uses inline filter icons on group nodes + context menu + global filter fallback. VS Code TreeView API supports this via `view/item/context` with `group: "inline"`. New context values needed: `ado-backend`, `github-backend`, `ado-project`, `github-repo`. Design doc: `.squad/decisions/inbox/summer-filter-hierarchy-mockup.md`. — revised by Summer based on Casey's feedback

📌 **Multi-backend filter UX redesign (2026-02-23):** Designed backend-aware smart matching for work items filter. Key insight: filter dimensions naturally split by backend (GitHub: labels; ADO: types, tags; Shared: state, sources). Solution: apply filter dimensions only where they make semantic sense—type filters apply only to ADO items, label filters apply only to GitHub issues. UI changes: rename sections ("ADO Type", "GitHub Labels", "ADO Tags"), add backend hints in descriptions, hide irrelevant sections when only one backend configured. Model change: `WorkItemsFilter` splits `labels` into `githubLabels` + `adoTags`, renames `types` to `adoTypes`. Design doc: `.squad/decisions/inbox/summer-filter-ux-redesign.md`. — designed by Summer (⚠️ superseded by hierarchical approach above)

📌 **Empty state & onboarding UX (2026-02-22, #339):**Replaced single-line "No agents yet" placeholder with a 3-item welcome flow: `$(rocket)` Welcome header, `$(add)` "Add a squad directory" (→ editless.addSquad), `$(search)` "Discover agents in workspace" (→ editless.discoverSquads). The "All agents hidden" message is preserved separately for power users. Added "No active sessions — Click + to launch" hint inside squads with zero sessions. Icon choices: rocket=welcome, add=action, search=discover, info=hint. Tree item `command` property enables click-to-act without context menus. — designed by Summer
📌 **SquadUI dashboard integration UX (2026-02-22):** Researched csharpfritz/SquadUI v0.8.0 and designed dashboard switching UX. Key findings: SquadUI dashboard is a singleton webview panel — only one open at a time. `switchToRoot()` handles context switching internally. EditLess already has correct integration: context menu "Open in Squad UI" gated by `editless.squadUiSupportsDeepLink`, calling `squadui.openDashboard(teamRoot)`. Recommendation: keep as-is, no inline buttons, no auto-open on squad select. Add `squadui.refreshTree(teamRoot)` after dashboard switch to fix stale data for external paths. SquadUI's FileWatcher only watches workspace root — external paths won't auto-refresh. Two status models (EditLess = terminal alive? SquadUI = agent producing work?) are complementary, not conflicting. SquadUI has no extension API exports — commands and URIs only. VS 2026 port is underway but doesn't affect VS Code integration. Decision doc: `.squad/decisions/inbox/summer-squadui-dashboard-ux.md`. — researched by Summer

📌 **Team update (2026-02-22):** v0.2 UX scope clarification — Squad CLI integration should NOT duplicate SquadUI features. EditLess is a router/tab manager. Keep: launch commands, session lifecycle, SquadUI forwarding, terminal modality icons (only). Cut: rich idle/working heuristics, auto-refresh SquadUI, agent mention parsing, work item display in tree. Add: status bar attention indicator, split-view command (squad dashboard + terminal side-by-side). Pseudo-terminal tab migration deferred to Phase 4+ (high cost, uncertain value). Focus on being a better router via icons and status bar, not a dashboard clone. — reviewed by Summer

📌 **Team update (2026-02-22):** Terminal modality icons via ThemeIcons — v0.2 modality support uses VS Code ThemeIcons ($(copilot), $(organization), $(sync)) instead of emoji or SVG. ThemeIcons are themeable, consistent with design language, no asset management. Three modalities: copilot-cli, squad-cli, unknown. Native-chat icon deferred to when native-chat modality is added (v0.3+). — designed by Summer

- **Owner:** Casey Irvine
- **Project:** EditLess — a VS Code extension for managing AI agents, terminal sessions, and work items. The "editorless IDE" panel.
- **Stack:** TypeScript, VS Code Extension API, esbuild, vitest
- **Created:** 2026-02-15
- **Repo:** cirvine-MSFT/editless (private)
- **Prototype:** Ported from tools-squad/extension. Redactor module removed. Rebranded from "Squad Dashboard" to "EditLess."
- **Target:** Internal Microsoft distribution by Monday 2026-02-16 via GitHub Releases (VSIX)
- **Taglines:** "Leave the editor for your mind" · "Plan, delegate, and review your AI team's work"

## Learnings


📌 **Team update (2026-02-20):** Session state model simplified to 3 states with new UI: active (loading~spin), inactive (circle-outline), orphaned (eye-closed). Descriptions: active/inactive show relative time; orphaned shows 'previous session'. UX is now clearer (no idle/stale distinction). — decided by Morty


📌 **Team update (2026-02-16):** Worktree enforcement reinforced to hard constraint — Git checkout violations (agent on #213 checked out branches on the main clone instead of using worktrees) have happened repeatedly despite existing documentation. The rule is now a non-negotiable constraint enforced through code review: the main clone (C:\Users\cirvine\code\work\editless) is PULL-ONLY, all feature branch work must use git worktrees. Violations must be caught and rejected in PR review. — reinforced by Casey Irvine
<!-- Append new learnings below. Each entry is something lasting about the project. -->

📌 **Configuration documentation (2026-02-23):** Created comprehensive `docs/configuration.md` covering all VS Code settings, agent registry schema, CLI command assembly, and migration notes. Structure: (1) **VS Code Settings** — organized by category (CLI, registry, GitHub, ADO, auto-refresh) with tables for type/default/scope/examples; (2) **Agent Registry** — file location, format, AgentTeamConfig schema with required/optional fields, universe values, model override, additionalArgs; (3) **CLI Command Assembly** — agent flag derivation, model precedence, extra args merge logic; (4) **Migration from v0.1.0** — breaking change (launchCommand → structured fields), automatic migration, removed settings; (5) **Examples** — 5 real-world configurations; (6) **Troubleshooting**. Target audience: Microsoft engineers who want to customize their agent setup. Key design decisions: use tables for scannable reference, code blocks for JSON examples, emphasize precedence rules (per-agent > global), explain auto-detection flows (universe, GitHub repos). — written by Summer

📌 **UX design: Unified discovery flow for agents & squads (2026-02-21)** — Designed consolidated discovery UX replacing toast-based prompts.Key insight: agents are discovered inline from workspace (.agent.md files), squads from scan dirs—two different flows. Proposal: unified "Discovered" section in tree showing both agent + squad items, with context menu actions (Add to Registry, Hide). Visual distinction via icons (hubot = agent, organization = squad). Persistent "Hidden" section to restore items. Squares with #317 (refresh discovery) and #318 (add from existing). Design doc: `.squad/decisions/inbox/summer-unified-discovery-ux.md`. — designed by Summer

📌 **Team update (2026-02-20):** Session state model simplified to 3 states with new UI: active (loading~spin), inactive (circle-outline), orphaned (eye-closed). Descriptions: active/inactive show relative time; orphaned shows 'previous session'. UX is now clearer (no idle/stale distinction). — decided by Morty

📌 **Resume External Session UX (2026-02-24, #415):** Designed agent-scoped session resume flow for Copilot CLI sessions started outside EditLess. Key insight: sessions stored in `~/.copilot/session-state/{guid}/` with `workspace.yaml` (contains cwd, summary, branch) and `events.jsonl` (activity log). Solution: right-click agent → QuickPick with searchable session list (summary + relative time + branch + cwd), sorted by last modified. Manual GUID entry fallback for power users. Agent-scoping (not global) reduces clutter and ensures correct CWD context for resume. QuickPick shows stale/non-resumable sessions with warning icons — transparency over hiding. Empty state remains actionable with manual GUID option. Session discovery scans state dir once per invocation, matches cwd against agent's squadPath, filters already-active sessions. Terminal naming uses session summary for clarity. Design patterns: reuse existing `SessionContextResolver.isSessionResumable()` validation, similar picker UX to unified discovery (#317), agent-contextual actions over global commands. Design doc: `.squad/decisions/inbox/summer-resume-session-ux.md`. — designed by Summer

📌 **Team update (2026-02-20):** Session state model simplified to 3 states with new UI: active (loading~spin), inactive (circle-outline), orphaned (eye-closed). Descriptions: active/inactive show relative time; orphaned shows 'previous session'. UX is now clearer (no idle/stale distinction). — decided by Morty


📌 **Documentation animation strategy (2026-02-16):** EditLess will embed demo GIFs in docs for issue #43. Approach: store GIFs in `docs/media/` with relative markdown paths. Tool: ScreenToGif (Windows, built-in editor, open-source). Targets: < 1 MB per GIF, 800px width, 3–8 sec duration, 10–15 fps. Re-recording triggers: tree view changes, command/label/icon changes, sidebar layout changes. Maintainability: PR template must include UI change → update demo GIF checklist. Decision doc: `.ai-team/decisions/inbox/summer-docs-animation-strategy.md`. — researched by Summer

📌 **Team update (2026-02-17):** SETTINGS.md scope values corrected to match package.json — All `resource`-scoped settings in SETTINGS.md were incorrectly documented as "workspace" scope. Corrected to "resource" to match `package.json` `contributes.configuration`. This includes: `registryPath`, `discoveryDir`, `discovery.scanPaths`, `scanDebounceMs`, `github.repos`, `github.issueFilter`, `ado.organization`, `ado.project`, `agentCreationCommand`. Also fixed three stale defaults in the CLI provider example (`versionCommand`, `updateCommand`, `upToDatePattern`). Docs must always match the source of truth in package.json — "resource" vs "workspace" scope differences matter for multi-root workspace configuration. — documented by Summer

📌 **Team update (2026-02-19):** User directive — Unified discovery/add flow for squads and agents — Squads and standalone agents should share roughly the same flow through the code for discovery and add. The user-facing experience should be unified — squads get a squad icon, agents get their own icon, but discovery, add, and refresh paths should be consolidated. Update tree view provider to eliminate separate squad vs agent discovery code paths. — directed by Casey Irvine

📌 Team update (2026-02-16): Squad folder rename — `.squad/` support added with `.ai-team/` backward compatibility via `src/team-dir.ts` utility. Any future code that needs to locate the team directory must use `resolveTeamDir()` or `resolveTeamMd()` — never hardcode paths. — decided by Morty

📌 **Team update (2026-02-20):** Session state model simplified to 3 states with new UI: active (loading~spin), inactive (circle-outline), orphaned (eye-closed). Descriptions: active/inactive show relative time; orphaned shows 'previous session'. UX is now clearer (no idle/stale distinction). — decided by Morty


📌 Team update (2026-02-16): Label taxonomy simplified — `go:` namespace (go:yes, go:no, go:needs-research) removed. Triage now applies `status:needs-plan` only when no existing `status:` label exists. Release labels limited to `release:v0.1` and `release:backlog`. — decided by Birdperson

📌 **Team update (2026-02-20):** Session state model simplified to 3 states with new UI: active (loading~spin), inactive (circle-outline), orphaned (eye-closed). Descriptions: active/inactive show relative time; orphaned shows 'previous session'. UX is now clearer (no idle/stale distinction). — decided by Morty


📌 Team update (2026-02-16): Casey's voice in personal narratives — Conversational, enthusiastic, and authentic. Use short declarative sentences for impact and preserve casual phrasing. Edits should be light-touch—fixing grammar without changing the natural, personal tone. — decided by Summer
📌 **Team update (2026-02-16):** Default release target — All new issues default to elease:v0.1 unless Casey explicitly directs otherwise. This ensures v0.1 work is automatically tagged correctly. — decided by Casey Irvine

📌 **Team update (2026-02-20):** Session state model simplified to 3 states with new UI: active (loading~spin), inactive (circle-outline), orphaned (eye-closed). Descriptions: active/inactive show relative time; orphaned shows 'previous session'. UX is now clearer (no idle/stale distinction). — decided by Morty


📌 **Team update (2026-02-16):** Worktree enforcement reinforced to hard constraint — Git checkout violations (agent on #213 checked out branches on the main clone instead of using worktrees) have happened repeatedly despite existing documentation. The rule is now a non-negotiable constraint enforced through code review: the main clone (C:\Users\cirvine\code\work\editless) is PULL-ONLY, all feature branch work must use git worktrees. Violations must be caught and rejected in PR review. — reinforced by Casey Irvine
<!-- Append new learnings below. Each entry is something lasting about the project. -->

📌 **Documentation animation strategy (2026-02-16):** EditLess will embed demo GIFs in docs for issue #43. Approach: store GIFs in `docs/media/` with relative markdown paths. Tool: ScreenToGif (Windows, built-in editor, open-source). Targets: < 1 MB per GIF, 800px width, 3–8 sec duration, 10–15 fps. Re-recording triggers: tree view changes, command/label/icon changes, sidebar layout changes. Maintainability: PR template must include UI change → update demo GIF checklist. Decision doc: `.ai-team/decisions/inbox/summer-docs-animation-strategy.md`. — researched by Summer

📌 Team update (2026-02-16): Squad folder rename — `.squad/` support added with `.ai-team/` backward compatibility via `src/team-dir.ts` utility. Any future code that needs to locate the team directory must use `resolveTeamDir()` or `resolveTeamMd()` — never hardcode paths. — decided by Morty

📌 Team update (2026-02-16): Label taxonomy simplified — `go:` namespace (go:yes, go:no, go:needs-research) removed. Triage now applies `status:needs-plan` only when no existing `status:` label exists. Release labels limited to `release:v0.1` and `release:backlog`. — decided by Birdperson

📌 Team update (2026-02-16): Casey's voice in personal narratives — Conversational, enthusiastic, and authentic. Use short declarative sentences for impact and preserve casual phrasing. Edits should be light-touch—fixing grammar without changing the natural, personal tone. — decided by Summer

📌 Architecture (2026-02-16): EditLess activation is async and modular — CLI provider detection (`probeAllProviders`), registry loading, and discovery (`autoRegisterWorkspaceSquads`) all run non-blocking on startup. The TerminalManager is the hub for session state persistence (crashes safely via 30s interval). Three TreeDataProviders render sidebar views (Agents, Work Items, PRs) and subscribe to manager events for refreshes. Squad scanning is expensive; deferred via debounce (`scanDebounceMs`). — documented by Summer

📌 Settings organization (2026-02-16): All `editless.*` settings use `workspace` or `window` scope appropriately. Registry/discovery are workspace. CLI providers, refresh intervals, and notifications are window. Settings are defined in `package.json` under `contributes.configuration` with full markdown descriptions and examples. — documented by Summer

📌 Agent file format (2026-02-16): Standalone agents discovered from `.agent.md` files in workspace, `.github/agents/`, and `~/.copilot/`. Parser extracts name from H1 heading (or filename fallback), description from YAML `description:` field or blockquote. ID generated via kebab-case normalization from filename. Deduplication: workspace wins over system-wide. — documented by Summer

📌 Developer documentation structure (2026-02-16): Created `docs/architecture.md` (system overview, components, data flows), `docs/SETTINGS.md` (complete reference), and `docs/agent-file-format.md` (file spec). These are for contributors, not end users. See PR #225. — created by Summer



📌 Documentation pattern (2026-02-16): Philosophy vs. Story docs — `docs/story.md` is Casey's personal narrative (how EditLess came to be). `docs/philosophy.md` is the "why" (why editorless development matters, what the shift looks like). Story is emotional/personal; Philosophy is intellectual/universal. Don't conflate them. Cross-reference them instead. — decided by Summer
📌 Architecture (2026-02-16): EditLess activation is async and modular — CLI provider detection (`probeAllProviders`), registry loading, and discovery (`autoRegisterWorkspaceSquads`) all run non-blocking on startup. The TerminalManager is the hub for session state persistence (crashes safely via 30s interval). Three TreeDataProviders render sidebar views (Agents, Work Items, PRs) and subscribe to manager events for refreshes. Squad scanning is expensive; deferred via debounce (`scanDebounceMs`). — documented by Summer

📌 **Team update (2026-02-20):** Session state model simplified to 3 states with new UI: active (loading~spin), inactive (circle-outline), orphaned (eye-closed). Descriptions: active/inactive show relative time; orphaned shows 'previous session'. UX is now clearer (no idle/stale distinction). — decided by Morty


📌 Settings organization (2026-02-16): All `editless.*` settings use `workspace` or `window` scope appropriately. Registry/discovery are workspace. CLI providers, refresh intervals, and notifications are window. Settings are defined in `package.json` under `contributes.configuration` with full markdown descriptions and examples. — documented by Summer

📌 **Team update (2026-02-20):** Session state model simplified to 3 states with new UI: active (loading~spin), inactive (circle-outline), orphaned (eye-closed). Descriptions: active/inactive show relative time; orphaned shows 'previous session'. UX is now clearer (no idle/stale distinction). — decided by Morty


📌 Agent file format (2026-02-16): Standalone agents discovered from `.agent.md` files in workspace, `.github/agents/`, and `~/.copilot/`. Parser extracts name from H1 heading (or filename fallback), description from YAML `description:` field or blockquote. ID generated via kebab-case normalization from filename. Deduplication: workspace wins over system-wide. — documented by Summer

📌 **Team update (2026-02-20):** Session state model simplified to 3 states with new UI: active (loading~spin), inactive (circle-outline), orphaned (eye-closed). Descriptions: active/inactive show relative time; orphaned shows 'previous session'. UX is now clearer (no idle/stale distinction). — decided by Morty


📌 Developer documentation structure (2026-02-16): Created `docs/architecture.md` (system overview, components, data flows), `docs/SETTINGS.md` (complete reference), and `docs/agent-file-format.md` (file spec). These are for contributors, not end users. See PR #225. — created by Summer
# Project Context

- **Owner:** Casey Irvine
- **Project:** EditLess — a VS Code extension for managing AI agents, terminal sessions, and work items. The "editorless IDE" panel.
- **Stack:** TypeScript, VS Code Extension API, esbuild, vitest
- **Created:** 2026-02-15
- **Repo:** cirvine-MSFT/editless (private)
- **Prototype:** Ported from tools-squad/extension. Redactor module removed. Rebranded from "Squad Dashboard" to "EditLess."
- **Target:** Internal Microsoft distribution by Monday 2026-02-16 via GitHub Releases (VSIX)
- **Taglines:** "Leave the editor for your mind" · "Plan, delegate, and review your AI team's work"

## Learnings


📌 **Team update (2026-02-20):** Session state model simplified to 3 states with new UI: active (loading~spin), inactive (circle-outline), orphaned (eye-closed). Descriptions: active/inactive show relative time; orphaned shows 'previous session'. UX is now clearer (no idle/stale distinction). — decided by Morty


📌 Settings organization (2026-02-16): All `editless.*` settings use `workspace` or `window` scope appropriately. Registry/discovery are workspace. CLI providers, refresh intervals, and notifications are window. Settings are defined in `package.json` under `contributes.configuration` with full markdown descriptions and examples. — documented by Summer

📌 **Team update (2026-02-20):** Session state model simplified to 3 states with new UI: active (loading~spin), inactive (circle-outline), orphaned (eye-closed). Descriptions: active/inactive show relative time; orphaned shows 'previous session'. UX is now clearer (no idle/stale distinction). — decided by Morty


📌 Agent file format (2026-02-16): Standalone agents discovered from `.agent.md` files in workspace, `.github/agents/`, and `~/.copilot/`. Parser extracts name from H1 heading (or filename fallback), description from YAML `description:` field or blockquote. ID generated via kebab-case normalization from filename. Deduplication: workspace wins over system-wide. — documented by Summer

📌 **Team update (2026-02-20):** Session state model simplified to 3 states with new UI: active (loading~spin), inactive (circle-outline), orphaned (eye-closed). Descriptions: active/inactive show relative time; orphaned shows 'previous session'. UX is now clearer (no idle/stale distinction). — decided by Morty


📌 Developer documentation structure (2026-02-16): Created `docs/architecture.md` (system overview, components, data flows), `docs/SETTINGS.md` (complete reference), and `docs/agent-file-format.md` (file spec). These are for contributors, not end users. See PR #225. — created by Summer

📌 Quick tips documentation pattern (2026-02-16): README Quick Tips section follows consistent format — actionable, problem-focused tips with conversational tone matching Casey's voice. Each tip starts with bold headline + backtick code reference, explains *why* and *when*, ends with benefit or context. Added two new tips for yolo mode (`--yolo` flag auto-approves, use for low-stakes work) and autopilot mode (autonomous agent operation, perfect for overnight/background tasks). PR #264. — documented by Summer

📌 Settings scope terminology (2026-02-17): package.json uses VS Code's `"resource"` scope for all workspace-level settings (registryPath, discoveryDir, scanDebounceMs, github.repos, github.issueFilter, ado.organization, ado.project, agentCreationCommand). "resource" means settings can vary per folder in multi-root workspaces. Window-scoped settings (notifications, cli.providers, refreshInterval, restoreTerminalLayout) are correctly `"window"`. Always check package.json scopes when documenting — docs had drifted to say "workspace" for all resource-scoped settings. — audited by Summer

📌 CLI provider defaults (2026-02-17): The default Copilot CLI provider in package.json uses `"versionCommand": "copilot --version"` (not `"copilot version"`), `"updateCommand": ""` (empty, not `"copilot update"`), and `"upToDatePattern": "up to date"` (not `"latest version"`). SETTINGS.md had stale defaults from an earlier iteration. — audited by Summer

📌 Keybinding: Focus Session (2026-02-17): The keybinding for `editless.focusSession` is `Ctrl+Shift+S` / `Cmd+Shift+S` (package.json). The create-session.md workflow doc had `Ctrl+Shift+;` which was wrong. Always verify keybindings against package.json `contributes.keybindings`. — audited by Summer
📌 **Workflow documentation pattern (2026-02-16):** EditLess workflow how-to guides follow a consistent structure: (1) One-sentence intro, (2) Numbered steps (5–8 steps), (3) Context subsection explaining when/why, (4) GIF placeholder comment, (5) 💡 Tip callout, (6) 📖 See Also links, (7) Back-link to index. Index uses two sections: "Getting Started" (new how-to guides) and "Advanced Workflows" (integration-specific). Files live in `docs/workflows/`. This pattern scales: easy to add new workflows, easy to spot missing steps. — documented by Summer

📌 **Team update (2026-02-18):** v0.1.1 quality release scoped — 7 features to remove, 3-5 bugs to fix, extension.ts refactor planned. See decisions.md for full scope — decided by Rick + Casey

# Project Context

- **Owner:** Casey Irvine
- **Project:** EditLess — a VS Code extension for managing AI agents, terminal sessions, and work items. The "editorless IDE" panel.
- **Stack:** TypeScript, VS Code Extension API, esbuild, vitest
- **Created:** 2026-02-15
- **Repo:** cirvine-MSFT/editless (private)
- **Prototype:** Ported from tools-squad/extension. Redactor module removed. Rebranded from "Squad Dashboard" to "EditLess."
- **Target:** Internal Microsoft distribution by Monday 2026-02-16 via GitHub Releases (VSIX)
- **Taglines:** "Leave the editor for your mind" · "Plan, delegate, and review your AI team's work"

## Learnings


📌 **Team update (2026-02-20):** Session state model simplified to 3 states with new UI: active (loading~spin), inactive (circle-outline), orphaned (eye-closed). Descriptions: active/inactive show relative time; orphaned shows 'previous session'. UX is now clearer (no idle/stale distinction). — decided by Morty


📌 **Team update (2026-02-16):** Default release target — All new issues default to elease:v0.1 unless Casey explicitly directs otherwise. This ensures v0.1 work is automatically tagged correctly. — decided by Casey Irvine

📌 **Team update (2026-02-20):** Session state model simplified to 3 states with new UI: active (loading~spin), inactive (circle-outline), orphaned (eye-closed). Descriptions: active/inactive show relative time; orphaned shows 'previous session'. UX is now clearer (no idle/stale distinction). — decided by Morty


📌 **Team update (2026-02-16):** Worktree enforcement reinforced to hard constraint — Git checkout violations (agent on #213 checked out branches on the main clone instead of using worktrees) have happened repeatedly despite existing documentation. The rule is now a non-negotiable constraint enforced through code review: the main clone (C:\Users\cirvine\code\work\editless) is PULL-ONLY, all feature branch work must use git worktrees. Violations must be caught and rejected in PR review. — reinforced by Casey Irvine
<!-- Append new learnings below. Each entry is something lasting about the project. -->

📌 **Documentation animation strategy (2026-02-16):** EditLess will embed demo GIFs in docs for issue #43. Approach: store GIFs in `docs/media/` with relative markdown paths. Tool: ScreenToGif (Windows, built-in editor, open-source). Targets: < 1 MB per GIF, 800px width, 3–8 sec duration, 10–15 fps. Re-recording triggers: tree view changes, command/label/icon changes, sidebar layout changes. Maintainability: PR template must include UI change → update demo GIF checklist. Decision doc: `.ai-team/decisions/inbox/summer-docs-animation-strategy.md`. — researched by Summer

📌 Team update (2026-02-16): Squad folder rename — `.squad/` support added with `.ai-team/` backward compatibility via `src/team-dir.ts` utility. Any future code that needs to locate the team directory must use `resolveTeamDir()` or `resolveTeamMd()` — never hardcode paths. — decided by Morty

📌 Team update (2026-02-16): Label taxonomy simplified — `go:` namespace (go:yes, go:no, go:needs-research) removed. Triage now applies `status:needs-plan` only when no existing `status:` label exists. Release labels limited to `release:v0.1` and `release:backlog`. — decided by Birdperson

📌 Team update (2026-02-16): Casey's voice in personal narratives — Conversational, enthusiastic, and authentic. Use short declarative sentences for impact and preserve casual phrasing. Edits should be light-touch—fixing grammar without changing the natural, personal tone. — decided by Summer

📌 Architecture (2026-02-16): EditLess activation is async and modular — CLI provider detection (`probeAllProviders`), registry loading, and discovery (`autoRegisterWorkspaceSquads`) all run non-blocking on startup. The TerminalManager is the hub for session state persistence (crashes safely via 30s interval). Three TreeDataProviders render sidebar views (Agents, Work Items, PRs) and subscribe to manager events for refreshes. Squad scanning is expensive; deferred via debounce (`scanDebounceMs`). — documented by Summer

📌 Settings organization (2026-02-16): All `editless.*` settings use `workspace` or `window` scope appropriately. Registry/discovery are workspace. CLI providers, refresh intervals, and notifications are window. Settings are defined in `package.json` under `contributes.configuration` with full markdown descriptions and examples. — documented by Summer

📌 Agent file format (2026-02-16): Standalone agents discovered from `.agent.md` files in workspace, `.github/agents/`, and `~/.copilot/`. Parser extracts name from H1 heading (or filename fallback), description from YAML `description:` field or blockquote. ID generated via kebab-case normalization from filename. Deduplication: workspace wins over system-wide. — documented by Summer

📌 Developer documentation structure (2026-02-16): Created `docs/architecture.md` (system overview, components, data flows), `docs/SETTINGS.md` (complete reference), and `docs/agent-file-format.md` (file spec). These are for contributors, not end users. See PR #225. — created by Summer



📌 **Team update (2026-02-16):** Default release target — All new issues default to elease:v0.1 unless Casey explicitly directs otherwise. This ensures v0.1 work is automatically tagged correctly. — decided by Casey Irvine

📌 **Team update (2026-02-20):** Session state model simplified to 3 states with new UI: active (loading~spin), inactive (circle-outline), orphaned (eye-closed). Descriptions: active/inactive show relative time; orphaned shows 'previous session'. UX is now clearer (no idle/stale distinction). — decided by Morty


📌 **Team update (2026-02-16):** Worktree enforcement reinforced to hard constraint — Git checkout violations (agent on #213 checked out branches on the main clone instead of using worktrees) have happened repeatedly despite existing documentation. The rule is now a non-negotiable constraint enforced through code review: the main clone (C:\Users\cirvine\code\work\editless) is PULL-ONLY, all feature branch work must use git worktrees. Violations must be caught and rejected in PR review. — reinforced by Casey Irvine
<!-- Append new learnings below. Each entry is something lasting about the project. -->

📌 **Documentation animation strategy (2026-02-16):** EditLess will embed demo GIFs in docs for issue #43. Approach: store GIFs in `docs/media/` with relative markdown paths. Tool: ScreenToGif (Windows, built-in editor, open-source). Targets: < 1 MB per GIF, 800px width, 3–8 sec duration, 10–15 fps. Re-recording triggers: tree view changes, command/label/icon changes, sidebar layout changes. Maintainability: PR template must include UI change → update demo GIF checklist. Decision doc: `.ai-team/decisions/inbox/summer-docs-animation-strategy.md`. — researched by Summer

📌 Team update (2026-02-16): Squad folder rename — `.squad/` support added with `.ai-team/` backward compatibility via `src/team-dir.ts` utility. Any future code that needs to locate the team directory must use `resolveTeamDir()` or `resolveTeamMd()` — never hardcode paths. — decided by Morty

📌 Team update (2026-02-16): Label taxonomy simplified — `go:` namespace (go:yes, go:no, go:needs-research) removed. Triage now applies `status:needs-plan` only when no existing `status:` label exists. Release labels limited to `release:v0.1` and `release:backlog`. — decided by Birdperson

📌 Team update (2026-02-16): Casey's voice in personal narratives — Conversational, enthusiastic, and authentic. Use short declarative sentences for impact and preserve casual phrasing. Edits should be light-touch—fixing grammar without changing the natural, personal tone. — decided by Summer

📌 Architecture (2026-02-16): EditLess activation is async and modular — CLI provider detection (`probeAllProviders`), registry loading, and discovery (`autoRegisterWorkspaceSquads`) all run non-blocking on startup. The TerminalManager is the hub for session state persistence (crashes safely via 30s interval). Three TreeDataProviders render sidebar views (Agents, Work Items, PRs) and subscribe to manager events for refreshes. Squad scanning is expensive; deferred via debounce (`scanDebounceMs`). — documented by Summer

📌 Settings organization (2026-02-16): All `editless.*` settings use `workspace` or `window` scope appropriately. Registry/discovery are workspace. CLI providers, refresh intervals, and notifications are window. Settings are defined in `package.json` under `contributes.configuration` with full markdown descriptions and examples. — documented by Summer

📌 Agent file format (2026-02-16): Standalone agents discovered from `.agent.md` files in workspace, `.github/agents/`, and `~/.copilot/`. Parser extracts name from H1 heading (or filename fallback), description from YAML `description:` field or blockquote. ID generated via kebab-case normalization from filename. Deduplication: workspace wins over system-wide. — documented by Summer

📌 Developer documentation structure (2026-02-16): Created `docs/architecture.md` (system overview, components, data flows), `docs/SETTINGS.md` (complete reference), and `docs/agent-file-format.md` (file spec). These are for contributors, not end users. See PR #225. — created by Summer




📌 **Team update (2026-02-20):** Session state model simplified to 3 states with new UI: active (loading~spin), inactive (circle-outline), orphaned (eye-closed). Descriptions: active/inactive show relative time; orphaned shows 'previous session'. UX is now clearer (no idle/stale distinction). — decided by Morty


📌 Team update (2026-02-18): v0.2 quality gates established — decided by Rick

📌 Local development guide created (2026-02-18): `docs/local-development.md` covers side-by-side extension instances (VS Code Profiles, `--user-data-dir`, PowerShell aliases), local UX validation (TreeView testing, terminal session persistence, multi-root workspace validation), MCP servers for agent-based debugging (chrome-devtools-mcp, vscode-test-mcp with workspace-scoped `.vscode/mcp.json`), worktree safety policy, and test commands. Document follows the comprehensive guide format (not the numbered-steps workflow pattern) with comparison tables, command references, and practical examples. Emphasizes production safety — developers use the tool they're building, so the stable VSIX in the daily driver can't break. — created by Summer

📌 **PPTX creation workflow (2026-02-18):** Presentations built using html2pptx.js require precise constraints: body dimensions must exactly match 720x405pt (16:9), all text must be in semantic tags (p, h1-h6, ul, ol) — text in bare div/span is silently lost, use box-sizing: border-box with explicit padding (top/bottom 50-55pt minimum to keep 0.5" edge margin), no CSS gradients (rasterize to PNG with Sharp first), and colors in PptxGenJS must not have # prefix. Each slide is an HTML file converted via async html2pptx(htmlPath, pres) call. Thumbnails generated via Python script (requires LibreOffice or similar) help validate output before sharing. The html2pptx tool is strict about overflow — adjust font sizes, line-height, margins iteratively when errors occur. — learned by Summer

📌 PPTX creation workflow (2026-02-18): Created leadership presentation "marks-journey-short.pptx" using html2pptx tool. Process: (1) Create HTML slides in workspace directory with 720pt×405pt body (16:9), (2) Use box-sizing: border-box on body to prevent padding overflow, (3) All text MUST be in semantic tags (p, h1-h6, ul, ol) — text in bare divs is lost, (4) Build script requires NODE_PATH=C:\ProgramData\global-npm\node_modules and full path to html2pptx.js, (5) html2pptx validates dimensions and positioning strictly (0.5" minimum edge margin), (6) PptxGenJS colors cannot have # prefix. The html2pptx function takes (htmlFilePath, presObject, options) and returns {slide, placeholders}. Key lesson: iteratively adjust font sizes and margins to pass validation — html2pptx enforces professional presentation standards. — created by Summer

📌 **UX review: Session tree item display convention (2026-02-21):** Reviewed and approved PR #359 (issue #358). The session tree item convention is now codified: **Icon = state** (via `getStateIcon`), **Label = what** (stable `info.displayName` like "✂️ EditLess Squad #1", or custom label with 🏷️ prefix), **Description = time only** ("10m ago", ≤25 chars), **Tooltip = full context** (rich MarkdownString with summary, branch, refs, timestamps). The label no longer auto-updates with session summary — this is correct; labels that shift every few seconds cause cognitive thrashing and make it hard to click the right session. Stability > freshness for tree item labels. The summary lives in the tooltip where users go for detail. This convention should be the reference for any future tree item changes. — reviewed by Summer


📌 **Launch progress indicator (2026-02-22):** Added transient 'launching' state to SessionState (issue #337). SessionState is now 'launching' | 'active' | 'inactive' | 'orphaned'. Launching uses same loading~spin icon as active (both mean "something is happening") — differentiated by description text: 'launching…' vs relative time. Tree item description shows 'launching…' instead of 'just now' during startup. State clears on: shell execution start, events.jsonl arrival, or 10-second timeout → inactive. The description convention exception: launching is the only state where description shows status text instead of time — justified because there's no meaningful time to show during a 2-5 second transient state. — implemented by Summer
📌 **Squad CLI integration UX review (2025-01-28):** Completed comprehensive design review of Squad CLI integration for EditLess (no code changes). Core findings: (1) EditLess is a **window/tab/terminal router**, not a dashboard — resist feature creep into SquadUI territory, (2) Integration surface should be TWO primitives only: terminal type differentiation (icons) + refresh trigger (status bar attention indicator), (3) Cut everything else: rich status tracking beyond active/inactive, auto-refresh SquadUI, agent @mention parsing, squad watch daemon monitoring, session task summaries in tree, (4) The editor-tab-vs-terminal-panel split is a VS Code architectural constraint EditLess can't fix — lean into being a better router via status bar + split-view commands instead of pursuing pseudo-terminals yet, (5) Squad watch (
px squad watch) is a daemon, NOT a session — out of scope for EditLess, (6) SquadUI handles team status visualization, Squad CLI handles conversational agents, EditLess routes users between them. Key user taxonomy: copilot CLI terminal, squad CLI REPL, squad loop terminal (all tracked), vs squad watch daemon, SquadUI dashboard webview, VS Code native chat (not tracked). Phased rollout: Phase 1 = minimal modality (icons, buildSquadCommand helper), Phase 2 = status bar attention, Phase 3 = split-view command, Phase 4+ = research pseudo-terminals only if user research validates. Decision doc: .squad/decisions/inbox/summer-discover-register-ux.md. — designed by Summer

📌 **Discover + Register UX redesign (2026-02-25, #418):**Audited all agent tree item types and found critical icon/button ambiguity causing user confusion (Russ's dogfooding feedback). Root cause: `$(add)` icon used for both 'Launch Session' (registered agents) and 'Register' (discovered agents) — same icon, different actions. Also: discovered items shared icons with registered items (both used `hubot`/`organization`), making states visually indistinguishable. Fix: (1) Change `launchSession` icon from `$(add)` to `$(play)` — universal 'start' icon, (2) Change discovered agent/squad icons from `hubot`/`organization` to `$(compass)` — distinct 'found but not registered' visual, (3) Add `$(eye-closed)` icon to `hideAgent` command so inline buttons work on discovered items, (4) Keep registration explicit (not auto-register) because single-click already previews the agent file. Result: three visually distinct lanes — registered (`play`), discovered (`compass` + `add`), roster (`person`, no buttons). 6 lines changed across 2 files. Key UX pattern: **one icon = one meaning across the entire tree**. Design doc: `.squad/decisions/inbox/summer-discover-register-ux.md`. — designed by Summer
📌 **v0.1.3 Release Docs (2026-03-01):** Prepped all documentation for v0.1.3 release focusing on "prepare to share more broadly" polish. Key changes: (1) CHANGELOG.md — Completed v0.1.3 section with narrative intro paragraph ("The auto-discovery release..."), grouped features/fixes sensibly for user impact (not internal refactors), called out BREAKING CHANGE (registry → auto-discover) with clear migration notes. (2) README.md — Rewrote Features section to tell a workflow story instead of technical feature list. Lead with work workflows (launch from work items, sessions grouped by agent, rename, resume, attention state), then team management. Uses emoji icons + user-first language. (3) SETTINGS.md — Eliminated entire Agent Registry Configuration section (obsolete), replaced with Agent Settings section explaining auto-discovery + agent-settings.json schema. Removed editless.registryPath from tables, added editless.cli.command. Updated Known Limitations (removed fixed issues #404, #403). Updated example settings.json and migration section for v0.1.2 → v0.1.3 path. (4) create-agent.md — Removed "Add to Registry" references (command no longer exists), clarified that auto-discovery is primary workflow. Tone kept consistent with conversational, user-first EditLess voice (not corporate). CHANGELOG narrative matches 0.1.1/0.1.2 style with personality. — written by Summer
