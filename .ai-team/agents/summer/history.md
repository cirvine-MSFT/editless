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


📌 **Team update (2026-02-16):** Worktree enforcement reinforced to hard constraint — Git checkout violations (agent on #213 checked out branches on the main clone instead of using worktrees) have happened repeatedly despite existing documentation. The rule is now a non-negotiable constraint enforced through code review: the main clone (C:\Users\cirvine\code\work\editless) is PULL-ONLY, all feature branch work must use git worktrees. Violations must be caught and rejected in PR review. — reinforced by Casey Irvine
<!-- Append new learnings below. Each entry is something lasting about the project. -->

📌 **Documentation animation strategy (2026-02-16):** EditLess will embed demo GIFs in docs for issue #43. Approach: store GIFs in `docs/media/` with relative markdown paths. Tool: ScreenToGif (Windows, built-in editor, open-source). Targets: < 1 MB per GIF, 800px width, 3–8 sec duration, 10–15 fps. Re-recording triggers: tree view changes, command/label/icon changes, sidebar layout changes. Maintainability: PR template must include UI change → update demo GIF checklist. Decision doc: `.ai-team/decisions/inbox/summer-docs-animation-strategy.md`. — researched by Summer

📌 Team update (2026-02-16): Squad folder rename — `.squad/` support added with `.ai-team/` backward compatibility via `src/team-dir.ts` utility. Any future code that needs to locate the team directory must use `resolveTeamDir()` or `resolveTeamMd()` — never hardcode paths. — decided by Morty

📌 Team update (2026-02-16): Label taxonomy simplified — `go:` namespace (go:yes, go:no, go:needs-research) removed. Triage now applies `status:needs-plan` only when no existing `status:` label exists. Release labels limited to `release:v0.1` and `release:backlog`. — decided by Birdperson

📌 Team update (2026-02-16): Casey's voice in personal narratives — Conversational, enthusiastic, and authentic. Use short declarative sentences for impact and preserve casual phrasing. Edits should be light-touch—fixing grammar without changing the natural, personal tone. — decided by Summer
📌 **Team update (2026-02-16):** Default release target — All new issues default to elease:v0.1 unless Casey explicitly directs otherwise. This ensures v0.1 work is automatically tagged correctly. — decided by Casey Irvine

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

📌 Settings organization (2026-02-16): All `editless.*` settings use `workspace` or `window` scope appropriately. Registry/discovery are workspace. CLI providers, refresh intervals, and notifications are window. Settings are defined in `package.json` under `contributes.configuration` with full markdown descriptions and examples. — documented by Summer

📌 Agent file format (2026-02-16): Standalone agents discovered from `.agent.md` files in workspace, `.github/agents/`, and `~/.copilot/`. Parser extracts name from H1 heading (or filename fallback), description from YAML `description:` field or blockquote. ID generated via kebab-case normalization from filename. Deduplication: workspace wins over system-wide. — documented by Summer

📌 Developer documentation structure (2026-02-16): Created `docs/architecture.md` (system overview, components, data flows), `docs/SETTINGS.md` (complete reference), and `docs/agent-file-format.md` (file spec). These are for contributors, not end users. See PR #225. — created by Summer

📌 Settings organization (2026-02-16): All `editless.*` settings use `workspace` or `window` scope appropriately. Registry/discovery are workspace. CLI providers, refresh intervals, and notifications are window. Settings are defined in `package.json` under `contributes.configuration` with full markdown descriptions and examples. — documented by Summer

📌 Agent file format (2026-02-16): Standalone agents discovered from `.agent.md` files in workspace, `.github/agents/`, and `~/.copilot/`. Parser extracts name from H1 heading (or filename fallback), description from YAML `description:` field or blockquote. ID generated via kebab-case normalization from filename. Deduplication: workspace wins over system-wide. — documented by Summer

📌 Developer documentation structure (2026-02-16): Created `docs/architecture.md` (system overview, components, data flows), `docs/SETTINGS.md` (complete reference), and `docs/agent-file-format.md` (file spec). These are for contributors, not end users. See PR #225. — created by Summer

📌 Quick tips documentation pattern (2026-02-16): README Quick Tips section follows consistent format — actionable, problem-focused tips with conversational tone matching Casey's voice. Each tip starts with bold headline + backtick code reference, explains *why* and *when*, ends with benefit or context. Added two new tips for yolo mode (`--yolo` flag auto-approves, use for low-stakes work) and autopilot mode (autonomous agent operation, perfect for overnight/background tasks). PR #264. — documented by Summer

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


📌 **Team update (2026-02-16):** Default release target — All new issues default to elease:v0.1 unless Casey explicitly directs otherwise. This ensures v0.1 work is automatically tagged correctly. — decided by Casey Irvine

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




