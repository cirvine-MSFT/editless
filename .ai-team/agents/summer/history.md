# Project Context

- **Owner:** Casey Irvine (cirvine@microsoft.com)
- **Project:** EditLess — a VS Code extension for managing AI agents, terminal sessions, and work items. The "editorless IDE" panel.
- **Stack:** TypeScript, VS Code Extension API, esbuild, vitest
- **Created:** 2026-02-15
- **Repo:** cirvine-MSFT/editless (private)
- **Prototype:** Ported from tools-squad/extension. Redactor module removed. Rebranded from "Squad Dashboard" to "EditLess."
- **Target:** Internal Microsoft distribution by Monday 2026-02-16 via GitHub Releases (VSIX)
- **Taglines:** "Leave the editor for your mind" · "Plan, delegate, and review your AI team's work"

## Learnings


- **Owner:** Casey Irvine (cirvine@microsoft.com)
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

- **Owner:** Casey Irvine (cirvine@microsoft.com)
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

- **Owner:** Casey Irvine (cirvine@microsoft.com)
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

