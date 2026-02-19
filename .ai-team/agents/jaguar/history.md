# Project Context

- **Owner:** Casey Irvine (cirvine@microsoft.com)
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
