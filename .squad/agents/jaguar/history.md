# Project Context

- **Owner:** Casey Irvine
- **Project:** EditLess — a VS Code extension for managing AI agents, terminal sessions, and work items. The "editorless IDE" panel.
- **Stack:** TypeScript, VS Code Extension API, esbuild, vitest
- **Created:** 2026-02-15
- **Repo:** cirvine-MSFT/editless (private)

## Learnings

- EditLess is a VS Code extension that manages AI agents, terminal sessions, and work items. It surfaces Squad team state in the editor sidebar.
- The extension uses progressive feature detection — features light up based on what's installed (agency CLI, copilot CLI, .ai-team/ directories). Copilot integration should follow this pattern.
- `src/cli-provider.ts` handles CLI detection (including Copilot CLI). Extend this for new Copilot surface discovery.
- `src/session-context.ts` uses `events.jsonl` as the primary signal for Copilot session state detection.
- `src/terminal-manager.ts` manages terminal sessions including Copilot agent sessions, with state detection via event parsing.
- The @copilot coding agent is already on the team roster as a member. Jaguar's role is building the *integration features* — not managing the coding agent.
- The main clone (`C:\Users\cirvine\code\work\editless`) is PULL-ONLY. All feature work uses git worktrees.
- **Copilot API Surface (2026-02):** Three stable APIs available for EditLess integration: Chat Participant API (stable since v1.93), Language Model API (stable since v1.90), Language Model Tool API (stable since v1.95). All safe to build on with `@types/vscode ^1.100.0`.
- **Tool Registration Constraint:** Language Model Tools MUST be declared in `package.json` under `contributes.languageModelTools` AND registered in code via `vscode.lm.registerTool()`. Declaration-only = visible but broken. Code-only = invisible to Copilot. No dynamic registration exists.
- **Chat Participant Pattern:** Declare in `contributes.chatParticipants` with id/name/description, implement via `vscode.chat.createChatParticipant(id, handler)`. Handler receives (request, context, stream, token). Requires Copilot Chat extension to be active.
- **Copilot Session State Directory:** `~/.copilot/session-state/{sessionId}/` contains `workspace.yaml`, `events.jsonl`, and `plan.md`. EditLess reads all three. The `events.jsonl` format includes typed events: session.start, user.message, assistant.turn_start, assistant.turn_end, tool.execution_start, tool.execution_complete.
- **Copilot Config Hierarchy:** `.github/copilot-instructions.md` (repo-wide), `.github/instructions/*.instructions.md` (path-scoped with applyTo/excludeAgent frontmatter), `.github/agents/*.agent.md` (custom agents), `.copilot/mcp-config.json` (MCP servers), `AGENTS.md` (root-level).
- **EditLess-Copilot Gap:** EditLess is purely passive (reads Copilot state). No Chat Participant, no LM Tools, no LM API usage, no MCP server. Phase 1 integration = register LM Tools + Chat Participant using stable APIs.
- **Squad ↔ Copilot Overlap:** Squad charters (`.ai-team/agents/{name}/charter.md`) and Copilot custom agents (`.github/agents/*.agent.md`) are different formats but translatable. Skills in `.ai-team/skills/` use the same `SKILL.md` format as Copilot skills. Branch conventions bridged via copilot-instructions.md.
- **Agent Discovery Sources:** `agent-discovery.ts` scans two locations: workspace folders (`.github/agents/` + root) and Copilot dir (`~/.copilot/agents/` + `~/.copilot/`). Deduplicates by ID, workspace wins.
- **Copilot Terminal Integration Research (2026-02-15):** Analyzed 10 integration opportunities for EditLess terminal management. High-value Phase 1 features: TerminalOptions.env for squad context injection, CLI flag builder for dynamic launch commands, terminal.exitStatus tracking for crash detection, onDidEndTerminalShellExecution for exit codes, registerTerminalLinkProvider for clickable PR/issue/file links. Shell Integration APIs stable as of VS Code 1.93+. Copilot CLI session-state structure: workspace.yaml + events.jsonl + checkpoints/index.md. CLI supports --resume, --agent, --allow-all, --model, --add-dir flags but NO --session-id or --json. VS Code Copilot extension has internal ICopilotCLITerminalIntegration service but no public API for third-party extensions.

📌 **Team update (2026-02-19):** Terminal Integration audit merged — Research findings synthesized into unified plan. Jaguar's API surface analysis and stable/proposed API categorization was critical for distinguishing which patterns to build on (TerminalOptions, shell integration) vs defer (pseudoterminals). Key confidence points: sendText race fix, env var injection for session metadata, shell execution APIs. Synthesis document filed in decisions.md. — decided by Rick

📌 **Team update (2026-02-21):** Pseudoterminal spike completed — Full prototype implemented with 30 passing tests and comprehensive spike documentation. Skill extraction performed for future integration planning. Branch: squad/321-pseudoterminal-spike. Ready for team sync on integration roadmap. — completed by Jaguar

📌 **Team update (2026-02-19):** Terminal integration research session complete — 4-phase architecture plan and 27-item priority matrix. Session log at .ai-team/log/2026-02-19-terminal-integration-research.md. — documented by Scribe

## Deep Dive: Session Rename & Resume (2026-02-19)

Researched three questions about Copilot CLI session management for EditLess integration:

**Session Rename:**
- ❌ Cannot safely write to `workspace.yaml` while CLI is running (risk of corruption)
- ✅ CLI supports `/rename` interactive command (but unreliable via sendText)
- ❌ No pre-launch naming flags (`--session-name` does not exist)
- 🎯 Recommended: Display both names (EditLess + Copilot summary) in UI

**Session Resume:**
- ✅ `--resume [sessionId]` is reliable and first-class CLI feature
- ✅ Resumes: conversation history, file context, cwd, checkpoints
- ✅ Alternative flags: `--continue` (resume latest), `--allow-all-tools`, `--model`
- ✅ Can detect resumability via file system checks (`workspace.yaml` + `events.jsonl`)
- ❌ VS Code Copilot extension has NO public API for CLI session resume
- 🎯 Fix for #277: Replace `sendText()` with `TerminalOptions` + `executeCommand`

**"Resume in EditLess" Button:**
- ❌ Cannot add button to native Copilot Chat history sidebar (no extension point)
- 🟡 Chat Participant (`@editless /resume`) possible but limited to chat input
- 🟡 Language Model Tool possible but LLM-driven (not UI button)
- ✅ Custom "Copilot Sessions" tree view is BEST option (full control, best UX)
- 🎯 Recommended: Create custom view that reads `~/.copilot/session-state/`

**Key architectural insight:** Copilot Chat sessions (in VS Code panel) and Copilot CLI sessions (in terminal) are DIFFERENT session types stored in DIFFERENT locations. No cross-surface resume exists.

Full findings: `.ai-team/decisions/inbox/jaguar-session-rename-resume.md`


📌 Team update (2026-02-19): Session rename & resume architectural decisions finalized. Key decisions: (1) Display dual names (EditLess + Copilot summary), (2) Fix #277 with TerminalOptions, (3) Create custom Copilot Sessions tree view, (4) No write-access to workspace.yaml. — decided by Casey Irvine

