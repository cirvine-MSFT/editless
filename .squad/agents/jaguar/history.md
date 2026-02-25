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

## Deep Dive: Copilot CLI v0.0.414 Integration Research (2026-02-21)

Researched three questions about Copilot CLI integration for EditLess terminal management:

**1. Session ID Visibility:**
- CLI no longer displays session ID visibly in terminal output (confirmed: banner is cosmetic only)
- Session ID IS reliably written to `~/.copilot/session-state/{uuid}/workspace.yaml` (field: `id:`) and `events.jsonl` (first event: `session.start` → `data.sessionId`)
- `--resume <uuid>` accepts a pre-generated UUID to START a new session with a known ID — EditLess can generate UUID before launch and pass it
- Session state dir: `workspace.yaml`, `events.jsonl`, `checkpoints/index.md`, `rewind-snapshots/index.json`, `files/`
- `update_terminal_title` config (default: true) puts agent intent in terminal title bar — possible signal source
- `XDG_STATE_HOME` env var overrides session-state location (default: `~/.copilot`)

**2. CLI Command Line Flags (v0.0.414, full inventory):**
- **IDE-relevant:** `--acp` (Agent Client Protocol server mode), `--no-alt-screen`, `--no-color`, `--screen-reader`, `--banner` (control startup banner), `--stream on|off`
- **Agent/model:** `--agent <agent>`, `--model <model>`, `--autopilot`, `--max-autopilot-continues <n>`
- **Session:** `--resume [sessionId]`, `--continue` (resume latest), `--config-dir <dir>`, `--log-dir <dir>`, `--log-level <level>`
- **Permissions:** `--allow-all`, `--allow-all-tools`, `--allow-all-paths`, `--allow-all-urls`, `--allow-tool [tools]`, `--deny-tool [tools]`, `--allow-url [urls]`, `--deny-url [urls]`, `--yolo` (alias for --allow-all)
- **MCP:** `--additional-mcp-config <json>`, `--disable-builtin-mcps`, `--disable-mcp-server <name>`, `--add-github-mcp-tool`, `--add-github-mcp-toolset`, `--enable-all-github-mcp-tools`
- **Output/scripting:** `-p <text>` (non-interactive prompt), `-s/--silent` (agent response only), `-i <prompt>` (interactive + auto-execute), `--share [path]`, `--share-gist`, `--no-ask-user` (autonomous mode)
- **Paths:** `--add-dir <dir>`, `--allow-all-paths`, `--disallow-temp-dir`
- **Tools:** `--available-tools [tools]`, `--excluded-tools [tools]`, `--disable-parallel-tools-execution`
- **Other:** `--experimental`, `--no-custom-instructions`, `--plain-diff`, `--bash-env on|off`
- ❌ NO `--ide` flag. NO `--json` machine-readable output mode. NO `--session-id` output flag.
- ✅ `--acp` (Agent Client Protocol) is the structured integration path — runs as a server, likely JSON-RPC

**3. Status Detection:**
- `events.jsonl` is the primary real-time signal: `session.start` → `user.message` → `assistant.turn_start` → `assistant.message` → `tool.execution_start/complete` → `assistant.turn_end`
- State machine: idle (after `assistant.turn_end` or `session.start`) → working (after `assistant.turn_start`) → waiting (after `user.message` prompt or tool needing confirmation)
- `update_terminal_title` config updates terminal title with current intent (parseable via VS Code terminal title APIs)
- `-s/--silent` + `-p` mode: exit code signals success/failure for non-interactive use
- `--acp` mode likely provides structured status via protocol — needs further investigation
- NO explicit machine-readable status stream in interactive mode beyond events.jsonl file watching

**Key findings for EditLess integration:**
1. Pre-generate session UUID and pass via `--resume <uuid>` to know session ID before launch
2. Watch `events.jsonl` with file watcher for real-time state detection
3. `--acp` flag is the future-proof structured integration (Agent Client Protocol)
4. `--additional-mcp-config` allows injecting EditLess as an MCP server at launch time
5. `--no-alt-screen --no-color --stream off` for maximum parsability in pseudo-terminal scenarios
6. Env vars: `COPILOT_MODEL`, `COPILOT_ALLOW_ALL`, `COPILOT_CUSTOM_INSTRUCTIONS_DIRS`, `XDG_STATE_HOME`

## Deep Dive: Pseudoterminal + --resume + events.jsonl + --acp Analysis (2026-02-21)

Analyzed Casey's question: "Can pseudoterminal coexist with --resume, events.jsonl, and --acp?" from CLI integration perspective.

**1. Pseudoterminal + --resume + events.jsonl:**
- ✅ **YES, fully compatible. No conflicts.**
- `--resume <uuid>` just controls session dir naming; doesn't interact with process lifecycle
- PTY handles process; CLI writes to filesystem; EditLess watches filesystem
- Pre-generated UUID eliminates fragile regex parsing (validates Morty's concern)
- Robust combination: EditLess controls process, knows session ID, gets rich state from events.jsonl

**2. Pseudoterminal + --acp:**
- ❌ **NO, mutually exclusive.**
- `--acp` (Agent Client Protocol) switches CLI into JSON-RPC server mode, not interactive mode
- PTY needs interactive stdout/stderr; ACP replaces stdout/stderr with protocol messages
- Can't do both: `copilot --acp --resume` is invalid (different I/O models)
- Forces choice: Either PTY (user sees terminal), or ACP (structured protocol, invisible to user)

**3. Regular terminal hide/show UX with pseudoterminal:**
- ✅ **Pseudoterminal gives real advantage here.**
- Current behavior (regular terminal): Close tab → process dies (SIGTERM standard behavior)
- Pseudoterminal behavior: Close UI → EditLess can keep process running
- Means: Reopen terminal → reconnect to existing process, not relaunch
- BUT: EditLess uses `isTransient` terminals (2026-02-19 decision), which may or may not survive OS signals

**4. What CLI team actually wants (inferred from design):**
- ✅ Use `--resume <uuid>` for session control
- ✅ Watch `~/.copilot/session-state/` filesystem for state
- ✅ Use `--acp` for deep machine-to-machine integration (if needed)
- ❌ Don't parse terminal output (not a contract)
- ❌ No `--ide` or `--json` flags exist (CLI chose filesystem + protocol, not terminal hacks)
- **Signal**: Two preferred paths (Terminal + Filesystem, or ACP Protocol), not three

**Verdict on "best of both worlds":**
- PTY + --resume + events.jsonl: Works, but adds complexity vs regular terminal
- ACP: Actually IS the "best of both worlds" — structured data (like PTY promises) + programmatic control (better than PTY)
- Recommendation: Phase 1 keep current (works), Phase 3 consider ACP (designed for extensions), Phase 2 pseudoterminal is optional

**Full analysis**: `.squad/decisions/inbox/jaguar-pty-acp-analysis.md`

## Deep Dive: ACP (Agent Client Protocol) Definitive Analysis (2026-02-22)

Thorough investigation of ACP for EditLess integration, including live protocol testing against Copilot CLI v0.0.414.

**What ACP IS:**
- Open standard for editor↔agent communication (JSON-RPC 2.0 over NDJSON/stdio or TCP)
- Copilot CLI implements the ACP *server* role — clients drive it programmatically
- `--acp --stdio` makes CLI completely headless: no terminal UI, stdout IS the protocol channel
- Public preview in Copilot CLI since Jan 28, 2026; protocol spec approaching stability (version 1)
- TypeScript SDK: `@agentclientprotocol/sdk` v0.14.x (pre-1.0)

**Live protocol testing confirmed:**
- Initialize → session/new → session/prompt flow works end-to-end
- Streaming `agent_message_chunk` updates arrive in real-time
- Session creation returns available models, modes (agent/plan/autopilot)
- `loadSession` capability = true (session resume supported via protocol)
- Copilot reports: image support true, audio false, embeddedContext true

**Key architectural finding: ACP and terminal mode are mutually exclusive.**
- Single process: `--acp` replaces terminal UI entirely. No sideband possible.
- Two processes: Independent sessions, no shared state, double API quota. Not viable.
- ACP flips architecture: EditLess would OWN the UI, drive Copilot as headless subprocess
- Client must implement: `session/request_permission`, `fs/*`, `terminal/*` methods

**ACP protocol surface (client capabilities):**
- `fs.readTextFile`, `fs.writeTextFile` — agent reads/writes files through client
- `terminal` — agent asks client to run shell commands (create/output/wait/kill/release)
- Rich session updates: agent_message_chunk, tool_call, tool_call_update (with diffs), plan, mode changes

**Decision for EditLess:**
- Phase 1: Stay with Option A (terminal + events.jsonl + --resume). Stable, proven, ships now.
- Phase 2 (future): ACP only makes sense if EditLess pivots to owning the full Copilot UI panel (like Zed/JetBrains). Major architectural shift, not incremental.
- Option C (hybrid/sideband) confirmed non-viable: two processes = two independent sessions.

**Full analysis**: `.squad/decisions/inbox/jaguar-acp-deep-dive.md`

## ACP Spike M5 — Agent flag, UI dropdowns, message queue (2026-02-23)

Implemented four features on branch `squad/370-acp-spike`:

**1. Agent selection via --agent flag:**
- `AcpClient.initialize()` now accepts `options?: { agent?: string }` and passes it to `buildCopilotCommand({ acp: true, agent })`. The builder already supported both flags — this wires it through the ACP client so ACP sessions can use custom agents.

**2. Model/mode dropdowns in webview panel:**
- Added toolbar between status bar and conversation with `<select>` dropdowns for model and mode, plus a read-only agent name display.
- Panel accepts `setModels` (from `SessionNewResult.models`) and `setModes` (from `SessionNewResult.modes`) messages to populate dropdowns.
- Panel emits `changeModel` and `changeMode` messages to extension.
- `updateMode` message from extension updates the mode dropdown when `current_mode_update` notification arrives.

**3. Message queue in webview:**
- Users can type and send messages while agent is responding. Messages are queued in an array.
- Queued messages appear in chat with 55% opacity and "⏳ queued" badge.
- `promptStarted`/`promptFinished` messages from extension control queue flow. Queue drains sequentially after each prompt completes.

**4. Extension.ts wiring:**
- After `session/new`, sends `setModels` and `setModes` to panel with the returned models/modes data.
- `changeModel`/`changeMode` from panel are logged to output channel (ACP doesn't yet have a dedicated method — may need prompt prefix or dedicated request).
- `onModeUpdate` event added to `AcpClient` for `current_mode_update` session notifications, wired through to panel's `updateMode`.
- `onStopped` now also sends `endAssistantMessage` and `promptFinished` to properly close the message and drain the queue.

**Key decisions:**
- Model/mode switching is *logged only* for now — ACP protocol doesn't expose a dedicated method for runtime model/mode changes. Likely needs `session/prompt` with a prefix or a future protocol addition.
- Message queue lives entirely in the webview JS; extension just signals `promptStarted`/`promptFinished`.

## Fix: relaunchSession early return on non-resumable session (2026-02)

- `relaunchSession()` was missing a `return` after `showErrorMessage` when `isSessionResumable()` returned `resumable: false`. This caused terminal creation and `--resume <id>` to proceed, resulting in both an error toast and a broken terminal.
- Fix: Added `return undefined` after the error message, changed return type to `vscode.Terminal | undefined`, and added `.filter()` in `relaunchAllOrphans()` to handle the new undefined possibility.
- Lesson: Always guard control flow after validation error paths — showing an error message is not the same as aborting the operation.
- **Arg dedup design rationale (PR #411):** Only `--model` and `--agent` are deduped in `buildLaunchCommandForConfig` because they have structured config equivalents (`config.model`, `config.id`/`config.universe`). Other flags like `--yolo` only exist in `additionalArgs` so there's no dual-source conflict. Global + agent-level `additionalArgs` concatenation is expected user behavior, not a bug. Tests cover both `--flag value` and `--flag=value` syntax for all deduped flags.
- **loadSquads readability refactor (PR #413):** Extracted two private helpers from `loadSquads()` — `migrateLegacyLaunchCommand(squad)` and `redetectUnknownUniverse(squad)` — each returning a boolean indicating if the registry needs persisting. Renamed `needsPersist` to `registryDirty` since it tracks in-memory divergence from disk caused by both migration paths, not just universe re-detection. Pure refactor, no behavioral changes, all 864 tests pass.
- **Registry schema mismatch fix (#401, PR #413):** `readUniverseFromRegistry()` only checked `data.agents` (per-agent Record with `{status, universe}`), but real-world `casting/registry.json` files can have a top-level `"universe"` field with a `"members"` array instead of `"agents"`. Fix: check `data.universe` at top level first, fall back to per-agent iteration. Two schemas coexist: casting registry (top-level universe + members array) and editless internal (agents Record). Always handle both when reading registry files.

