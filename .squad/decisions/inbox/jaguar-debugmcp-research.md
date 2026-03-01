# DebugMCP Integration Research

**Date:** 2026-02-25
**Author:** Jaguar (Copilot SDK Expert)
**Status:** Research Complete — Recommendation for Casey

---

## What is DebugMCP?

[microsoft/DebugMCP](https://github.com/microsoft/DebugMCP) is a VS Code extension (v1.0.7, beta) that exposes the VS Code Debug Adapter Protocol as an MCP server. It runs a local HTTP server (default port 3001) using `@modelcontextprotocol/sdk` with StreamableHTTP transport, allowing any MCP-connected AI agent to programmatically debug code.

**Authors:** Oz Zafar, Ori Bar-Ilan (Microsoft). MIT licensed.
**Marketplace:** `ozzafar.debugmcpextension`
**VS Code requirement:** `^1.104.0`
**Transport:** StreamableHTTP (POST `/mcp` on localhost:3001). Stateless per-request. Recently migrated from SSE (Feb 2026).

---

## MCP Tools Exposed (14 tools)

| Tool | Description |
|------|-------------|
| `get_debug_instructions` | Returns a debugging guide/best practices document (workaround for clients that don't support MCP resources) |
| `start_debugging` | Launch a debug session for a file. Params: `fileFullPath`, `workingDirectory`, `testName?`, `configurationName?` |
| `stop_debugging` | Terminate the current debug session |
| `step_over` | Execute current line, skip into function calls |
| `step_into` | Step into the current function call |
| `step_out` | Step out of the current function |
| `continue_execution` | Resume until next breakpoint or program end |
| `restart_debugging` | Restart the current debug session |
| `add_breakpoint` | Set breakpoint by file path + line content (smart matching) |
| `remove_breakpoint` | Remove breakpoint by file path + line number |
| `clear_all_breakpoints` | Remove all breakpoints |
| `list_breakpoints` | List all active breakpoints |
| `get_variables_values` | Inspect variables at current execution point (scope: local/global/all) |
| `evaluate_expression` | Evaluate an expression in debug context |

**MCP Resources:** One resource (`debugmcp://docs/debug_instructions`) with the debugging guide. The `get_debug_instructions` tool duplicates this for clients like Copilot that don't support MCP resources.

---

## How It Works Internally

1. Extension activates on VS Code startup (`onStartupFinished`)
2. Spins up an Express HTTP server on port 3001 (configurable)
3. Each POST to `/mcp` creates a fresh `StreamableHTTPServerTransport` (stateless)
4. Tools delegate to `DebuggingHandler` → `DebuggingExecutor` → VS Code Debug API (`vscode.debug.*`)
5. `ConfigurationManager` reads/creates `launch.json` configs per language
6. Supports Python, JS/TS, Java, C#, C/C++, Go, Rust, PHP, Ruby
7. Auto-configures itself for Copilot, Cline, Cursor, Roo, and Windsurf on install

---

## Fit for EditLess

### How It Enhances EditLess Workflow

EditLess manages Copilot CLI agent sessions in terminals. When an agent encounters a bug during a coding task, it currently can only read error output and reason about it. With DebugMCP available as an MCP server:

1. **Copilot CLI agents get real debugging**: The agent could set breakpoints, start a debug session, inspect variables, and step through code — all via MCP tool calls. This turns "guess and retry" into actual root-cause analysis.
2. **Test-driven debugging**: When a test fails, the agent can `start_debugging` with `testName` to debug the specific failing test rather than re-running the whole suite.
3. **Complements terminal management**: EditLess already tracks terminal sessions and their state. A debug session started by the agent would be visible in VS Code's debug panel, and EditLess could potentially surface debug session state in its own UI.

### Integration Approach

**For users (zero EditLess code changes needed):**
1. User installs DebugMCP extension from Marketplace
2. DebugMCP auto-registers in VS Code's `mcp.json` (or user adds it)
3. Copilot CLI picks it up via `--additional-mcp-config` or the standard MCP config chain
4. Agent now has debugging tools available

**MCP config entry (what gets added):**
```json
{
  "servers": {
    "debugmcp": {
      "type": "streamableHttp",
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

**Optional EditLess integration (future):**
- Detect DebugMCP extension presence via `vscode.extensions.getExtension('ozzafar.debugmcpextension')`
- Show "Debug available" indicator in session panel when extension is active
- Surface active debug sessions in the EditLess sidebar (read from `vscode.debug.activeDebugSession`)
- Add a "Debug this file" quick action that invokes `start_debugging` via the MCP server

### How Copilot CLI Agents Would Use It

The Copilot CLI already supports MCP servers via `--additional-mcp-config` flag and `.copilot/mcp-config.json`. If DebugMCP is configured:
- Agent sees `start_debugging`, `add_breakpoint`, `get_variables_values`, etc. in its tool list
- Agent can autonomously debug failing tests or unexpected behavior
- Works with the `--allow-tool debugmcp:*` flag pattern for permission control

---

## Risks and Concerns

### 🟡 Beta Status
- Explicitly marked "beta" in the README. Maintained by 2 Microsoft engineers.
- Open issues include: session desync during long operations (#29), C# debugging not fully working (#12), no concurrent debug session support (#25).
- Active development: 10 commits in Feb 2026, recently migrated from SSE to StreamableHTTP.

### 🟡 Port Conflict Potential
- Default port 3001 is hardcoded as default. If another service uses 3001, it fails silently.
- Configurable via `debugmcp.serverPort` setting, but agents need to know the actual port.

### 🟡 VS Code 1.104+ Requirement
- EditLess currently targets `^1.100.0`. DebugMCP requires `^1.104.0`. Not a conflict (it's a separate extension), but users on older VS Code can't use it.

### 🟢 No Conflict with EditLess
- DebugMCP is purely additive — it doesn't modify terminal behavior, Copilot config, or any APIs EditLess uses.
- Runs as a separate extension with its own activation. No shared state.
- StreamableHTTP transport is stateless per-request, so no session management conflicts.

### 🟡 Single Debug Session Limitation
- Only supports one debug session at a time. If EditLess has multiple agent terminals and one triggers debugging, others can't debug concurrently.

### 🟢 Security
- Runs 100% locally, no external communication, no credentials needed.

---

## Recommendation

**Verdict: Recommend as optional/recommended companion extension. Backlog item, not v0.1.3.**

### Rationale

1. **Zero code changes needed for basic integration.** Users install DebugMCP, it auto-configures, Copilot CLI agents gain debugging tools. EditLess doesn't need to change anything.

2. **Beta quality means we shouldn't depend on it.** The session desync issues (#29) and single-session limitation (#25) mean agents may hit edge cases during debugging. We should recommend it, not require it.

3. **EditLess-specific integration is low priority.** Detecting DebugMCP and showing debug state in EditLess UI would be nice, but it's a feature that benefits a subset of users. The core EditLess value prop (session management, work items) doesn't depend on it.

4. **Documentation is the right first step.** Add a "Recommended Extensions" section to EditLess docs mentioning DebugMCP as a companion for agent-driven debugging.

### Suggested Actions

| Action | Priority | Milestone |
|--------|----------|-----------|
| Add DebugMCP to recommended extensions in docs | Low | Backlog |
| Add `.copilot/mcp-config.json` example with DebugMCP config | Low | Backlog |
| Detect DebugMCP and show indicator in EditLess UI | Low | Future (post-v0.2) |
| File upstream issue requesting stdio transport option (for tighter integration) | Optional | Backlog |

### Not Recommended

- Adding DebugMCP as a dependency or bundling it
- Building our own debugging MCP server (DebugMCP already does this well)
- Making any EditLess code changes for v0.1.3 related to this
