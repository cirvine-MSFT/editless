# Project Context

- **Owner:** Casey Irvine
- **Project:** EditLess — a VS Code extension for managing AI agents, terminal sessions, and work items. The "editorless IDE" panel.
- **Stack:** TypeScript, VS Code Extension API, esbuild, vitest
- **Created:** 2026-02-15
- **Repo:** cirvine-MSFT/editless (private)
- **Target:** Internal Microsoft distribution by Monday 2026-02-16 via GitHub Releases (VSIX)

## Project Learnings (from import)

- EditLess uses progressive feature detection — features light up based on what's installed (agency CLI, copilot CLI, .ai-team/ directories). The integration layer must follow this pattern: detect → connect → surface. Never show UI for services that aren't available.
- GitHub client exists at `src/github-client.ts` with `fetchLinkedPRs` for PR linking. Extend this for new GitHub API surface.
- ADO integration is planned (#58, #34, #56) — will need a parallel `ado-client.ts` with similar patterns.
- Cross-platform abstraction: GitHub and ADO work items should share a common interface so the UI layer (Morty's domain) consumes a unified data shape.
- Dynamic agent discovery (#75) scans `.github/agents/*.agent.md` and root-level `*.agent.md`. The scanning infrastructure lives in `src/agent-discovery.ts`.

## Learnings


📌 **Team update (2026-02-20):** CLI provider abstraction removed, inlined as direct settings (editless.cli.command/launchCommand/createCommand). Consumers now read settings directly instead of through provider resolution. — decided by Morty


📌 **Team update (2026-02-16):** Documentation animation strategy — EditLess uses optimized GIFs stored in docs/media/ directory. Primary tool: ScreenToGif (Windows). Files must be <1 MB, max 800px width, 3–8 seconds duration. File naming is descriptive kebab-case (e.g., planning-feature.gif). Re-recording triggers documented: UI structure changes, command/shortcut changes, label changes, layout changes. Team reviews animations on code review checklist. — decided by Summer

📌 **Team update (2026-02-20):** CLI provider abstraction removed, inlined as direct settings (editless.cli.command/launchCommand/createCommand). Consumers now read settings directly instead of through provider resolution. — decided by Morty


📌 **Team update (2026-02-16):** Default release target — All new issues default to elease:v0.1 unless Casey explicitly directs otherwise. This ensures v0.1 work is automatically tagged correctly. — decided by Casey Irvine

📌 **Team update (2026-02-20):** CLI provider abstraction removed, inlined as direct settings (editless.cli.command/launchCommand/createCommand). Consumers now read settings directly instead of through provider resolution. — decided by Morty


📌 **Team update (2026-02-16):** Worktree enforcement reinforced to hard constraint — Git checkout violations (agent on #213 checked out branches on the main clone instead of using worktrees) have happened repeatedly despite existing documentation. The rule is now a non-negotiable constraint enforced through code review: the main clone (C:\Users\cirvine\code\work\editless) is PULL-ONLY, all feature branch work must use git worktrees. Violations must be caught and rejected in PR review. — reinforced by Casey Irvine
<!-- Append new learnings below. Each entry is something lasting about the project. -->

📌 Team update (2026-02-16): Squad folder rename — `.squad/` support added with `.ai-team/` backward compatibility via `src/team-dir.ts` utility. Any future code that needs to locate the team directory must use `resolveTeamDir()` or `resolveTeamMd()` — never hardcode paths. — decided by Morty

📌 Team update (2026-02-16): Label taxonomy simplified — `go:` namespace (go:yes, go:no, go:needs-research) removed. Triage now applies `status:needs-plan` only when no existing `status:` label exists. Release labels limited to `release:v0.1` and `release:backlog`. When integrating ADO labels, these same status and release categories apply. — decided by Birdperson


- EditLess uses progressive feature detection — features light up based on what's installed (agency CLI, copilot CLI, .ai-team/ directories). The integration layer must follow this pattern: detect → connect → surface. Never show UI for services that aren't available.
- GitHub client exists at `src/github-client.ts` with `fetchLinkedPRs` for PR linking. Extend this for new GitHub API surface.
- ADO integration is planned (#58, #34, #56) — will need a parallel `ado-client.ts` with similar patterns.
- Cross-platform abstraction: GitHub and ADO work items should share a common interface so the UI layer (Morty's domain) consumes a unified data shape.
- Dynamic agent discovery (#75) scans `.github/agents/*.agent.md` and root-level `*.agent.md`. The scanning infrastructure lives in `src/agent-discovery.ts`.

## Learnings

📌 **Team update (2026-02-20):** CLI provider abstraction removed, inlined as direct settings (editless.cli.command/launchCommand/createCommand). Consumers now read settings directly instead of through provider resolution. — decided by Morty


📌 **Team update (2026-02-16):** Default release target — All new issues default to elease:v0.1 unless Casey explicitly directs otherwise. This ensures v0.1 work is automatically tagged correctly. — decided by Casey Irvine

📌 **Team update (2026-02-20):** CLI provider abstraction removed, inlined as direct settings (editless.cli.command/launchCommand/createCommand). Consumers now read settings directly instead of through provider resolution. — decided by Morty


📌 **Team update (2026-02-16):** Worktree enforcement reinforced to hard constraint — Git checkout violations (agent on #213 checked out branches on the main clone instead of using worktrees) have happened repeatedly despite existing documentation. The rule is now a non-negotiable constraint enforced through code review: the main clone (C:\Users\cirvine\code\work\editless) is PULL-ONLY, all feature branch work must use git worktrees. Violations must be caught and rejected in PR review. — reinforced by Casey Irvine
<!-- Append new learnings below. Each entry is something lasting about the project. -->

📌 Team update (2026-02-16): Squad folder rename — `.squad/` support added with `.ai-team/` backward compatibility via `src/team-dir.ts` utility. Any future code that needs to locate the team directory must use `resolveTeamDir()` or `resolveTeamMd()` — never hardcode paths. — decided by Morty

📌 Team update (2026-02-16): Label taxonomy simplified — `go:` namespace (go:yes, go:no, go:needs-research) removed. Triage now applies `status:needs-plan` only when no existing `status:` label exists. Release labels limited to `release:v0.1` and `release:backlog`. When integrating ADO labels, these same status and release categories apply. — decided by Birdperson



📌 **Team update (2026-02-20):** CLI provider abstraction removed, inlined as direct settings (editless.cli.command/launchCommand/createCommand). Consumers now read settings directly instead of through provider resolution. — decided by Morty


📌 Team update (2026-02-18): v0.2 quality gates established — decided by Rick

- SquadUI's `extension.ts` had 14 hardcoded `workspaceRoot` / `workspaceFolders[0]` references across commands (viewSkill, openLogEntry, removeSkill, finishAllocationIfReady, onTerminalClose, fileWatcher). When adding a deep-link API (`switchToRoot()`), these must all be migrated to `currentRoot` — the workspace variable should only be used for initialization. Command-registration functions like `registerAddSkillCommand` and `registerRemoveMemberCommand` need a `getCurrentRoot` callback parameter to break their direct workspace dependency. The pattern: `getCurrentRoot?.() ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath` provides backward compatibility while enabling external root switching.


📌 **Team update (2026-02-20):** CLI provider abstraction removed, inlined as direct settings (editless.cli.command/launchCommand/createCommand). Consumers now read settings directly instead of through provider resolution. — decided by Morty


📌 **Team update (2026-02-19):** Squad↔Copilot API integration — Research completed on API surface and integration patterns. Copilot APIs now support Chat Participants, Language Model Tools, and LM API for inference. Key constraint: tools must be both declared in package.json AND registered in code. MCP overlap identified with Squad's own MCP discovery logic. See decisions.md for phased integration plan (Tier 1: Language Model Tools and Chat Participant via stable APIs). — documented by Scribe

📌 **SquadUI integration surface analysis (2026-02-20):** EditLess × SquadUI complementary positioning clarified. EditLess is terminal-session centric; SquadUI is team-information centric. SquadUI v0.7.3 exposes 11+ commands (initSquad, addMember, removeMember, viewCharter, openDashboard, refreshTree, upgradeSquad, checkForUpdates, etc.) but no public API exports or context key pub/sub. Cross-extension communication patterns available: (1) one-way command bridge (executeCommand) ✅, (2) URI handlers (future, requires both to implement), (3) shared context keys (future, requires SquadUI v0.8+), (4) extension API exports (possible, not urgent). Root sync strategy: start with lazy sync (openDashboard), add globalState writes for squad.currentRoot, later request SquadUI setCurrentRoot() command. Tier 1 integration (4h effort): viewCharter, refreshTree, root-aware dashboard. Deferred to v0.2: URI handlers, API exports, embedding API. — analyzed by Unity

📌 **Review fix pass (2026-02-21):** Fixed 3 issues from 3× review on squad/337-launch-progress-indicator: (1) Missing `UnifiedState` type import in work-items-tree.test.ts — exported from `work-items-tree.ts`, tests must import it explicitly. (2) `lastIndexOf(' ', MAX_SESSION_NAME)` returns -1 when no space exists in the first 50 chars, causing `slice(0, -1)` to silently return almost the full string. Fix: fallback to `MAX_SESSION_NAME` when spaceIdx <= 0. Pattern applies to both `launchFromWorkItem` and `launchFromPR`. (3) `launchFromPR` was missing terminal label assignment — must capture the return value from `launchTerminal()` and call `labelManager.setLabel()` to match `launchFromWorkItem`. — fixed by Unity

📌 **PR #417 config-refresh integration review (2026-02-25):** Reviewed squad/417-ado-config-refresh for integration correctness. **REQUEST CHANGES** — critical race condition: config change handlers (`extension.ts:1001, 1010`) have **no debouncing**. Rapid config changes (user typing org name) trigger N concurrent `initAdoIntegration` calls → N overlapping API fetches → non-deterministic UI updates. Each call creates a new `fetchAdoData` closure that races to populate providers. Required fix: 500ms debounce on `onDidChangeConfiguration` handlers. Secondary issue: stale closure leak when multiple `fetchAdoData` closures complete out-of-order. Minor asymmetry noted: GitHub handler is lazy (no eager fetch), ADO is eager (fetches in `initAdoIntegration`). PAT handling is correct (re-reads from SecretStorage). API clients are stateless (no cleanup needed). Test coverage exists but doesn't catch races (mocks are synchronous). Key pattern learned: **integration re-init handlers must debounce config changes** — VS Code fires `onDidChangeConfiguration` on every keystroke in settings UI. — reviewed by Unity

