# ACP Deep Dive: Definitive Analysis for EditLess

**Date:** 2026-02-22
**Author:** Jaguar (Copilot SDK Expert)
**Requested by:** Casey Irvine
**Status:** Research complete

---

## 1. What IS ACP Exactly?

The **Agent Client Protocol (ACP)** is an open standard that standardizes communication between code editors/IDEs (clients) and AI coding agents (servers). It's the LSP equivalent for AI agents — any ACP-compliant client can talk to any ACP-compliant agent, and vice versa.

**Key facts:**
- Protocol: **JSON-RPC 2.0** over **NDJSON** (newline-delimited JSON)
- Transport: **stdio** (recommended for IDE integration) or **TCP** (for remote/networked)
- Created by: Zed Industries, with adoption by GitHub, JetBrains, Gemini CLI, and others
- Copilot CLI support: **Public preview** since January 28, 2026
- SDK: `@agentclientprotocol/sdk` (TypeScript), current version ~0.14.x
- Spec version: Protocol version `1` (integer, not semver)

**This is NOT a GitHub-proprietary thing.** It's an industry standard. Copilot CLI implements the ACP *server* role — meaning clients speak TO it, not the other way around.

## 2. How Does --acp Change the CLI's Behavior?

**Verified by live testing** with `copilot.exe --acp --stdio` on Copilot CLI v0.0.414:

### What changes:
- **No terminal UI.** No banner, no prompt, no scrolling chat, no color output. The process is completely headless.
- **stdin/stdout become a JSON-RPC channel.** You send JSON-RPC requests in, you get JSON-RPC responses and notifications out.
- **It's a server, not a client.** YOUR code drives the conversation — sending prompts, handling permissions, managing sessions.
- **Streaming responses.** Agent output arrives as `session/update` notifications with `agent_message_chunk` updates.

### Actual protocol exchange (captured live):

**Initialize handshake:**
```json
→ {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{}}}

← {"jsonrpc":"2.0","id":1,"result":{
     "protocolVersion":1,
     "agentCapabilities":{
       "loadSession":true,
       "promptCapabilities":{"image":true,"audio":false,"embeddedContext":true},
       "sessionCapabilities":{"list":{}}
     },
     "agentInfo":{"name":"Copilot","title":"Copilot","version":"0.0.414"},
     "authMethods":[{"id":"copilot-login","name":"Log in with Copilot CLI",...}]
   }}
```

**Create session:**
```json
→ {"jsonrpc":"2.0","id":2,"method":"session/new","params":{"cwd":"C:\\Users\\cirvine\\code\\work\\editless","mcpServers":[]}}

← {"jsonrpc":"2.0","id":2,"result":{
     "sessionId":"532b5696-ca7a-4a8e-9e32-af92bbf19321",
     "models":{"availableModels":[...17 models...],"currentModelId":"claude-sonnet-4.6"},
     "modes":{"availableModes":[
       {"id":".../session-modes#agent","name":"Agent"},
       {"id":".../session-modes#plan","name":"Plan"},
       {"id":".../session-modes#autopilot","name":"Autopilot"}
     ],"currentModeId":".../session-modes#agent"}
   }}
```

**Send prompt + receive streamed response:**
```json
→ {"jsonrpc":"2.0","id":3,"method":"session/prompt","params":{
     "sessionId":"532b5696-...","prompt":[{"type":"text","text":"Say hello in 5 words"}]
   }}

← {"jsonrpc":"2.0","method":"session/update","params":{
     "sessionId":"532b5696-...","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"Hello there"}}}}
← {"jsonrpc":"2.0","method":"session/update","params":{...,"text":","}}
← {"jsonrpc":"2.0","method":"session/update","params":{...,"text":" how"}}
← {"jsonrpc":"2.0","method":"session/update","params":{...,"text":" are"}}
← {"jsonrpc":"2.0","method":"session/update","params":{...,"text":" you?"}}
← {"jsonrpc":"2.0","id":3,"result":{"stopReason":"end_turn"}}
```

## 3. Is ACP Meant to Replace Terminal Usage, or Complement It?

**ACP replaces the terminal UI entirely.** It's designed for:

1. **IDE integrations** — Zed, JetBrains, VS Code extensions that want to embed Copilot without showing a terminal
2. **Custom frontends** — Build your own Copilot UI (webview, Electron app, CLI reimplementation)
3. **CI/CD pipelines** — Programmatic agent control in automated workflows
4. **Multi-agent systems** — Agent-to-agent coordination via a standard protocol

**It is NOT for extensions that wrap the CLI in a terminal.** ACP assumes your client IS the UI. The Copilot process produces no human-visible output in ACP mode.

## 4. Can You Use ACP AND Still Show a Terminal?

**No.** This was confirmed both by protocol analysis and web research:

- **Single process:** `--acp` disables the interactive terminal. stdout IS the protocol channel. There's no sideband.
- **Two processes:** You could run `copilot` (terminal mode) and `copilot --acp` separately, but they're independent. Different sessions, no shared state.
- **Build your own terminal:** An ACP client CAN render `agent_message_chunk` updates to look like a terminal. In fact, the protocol includes `terminal/create` capability where the AGENT asks the CLIENT to run shell commands — the client provides the terminal, not the agent.

### Key insight for EditLess:
ACP flips the architecture. Today EditLess wraps Copilot's terminal (Copilot owns the UI, EditLess observes). With ACP, EditLess would OWN the UI and drive Copilot as a headless subprocess.

## 5. What Does the ACP Protocol Actually Look Like?

See Section 2 for live captures. Summary of the protocol surface:

### Messages the CLIENT sends (EditLess → Copilot):
| Method | Purpose |
|--------|---------|
| `initialize` | Handshake, negotiate capabilities |
| `session/new` | Create a new conversation session |
| `session/load` | Resume a previous session (Copilot supports this!) |
| `session/prompt` | Send user message |
| `session/cancel` | Cancel current operation |

### Notifications the AGENT sends (Copilot → EditLess):
| Update Type | Purpose |
|-------------|---------|
| `agent_message_chunk` | Streaming text response |
| `agent_thought_chunk` | Internal reasoning (transparency) |
| `tool_call` | New tool invocation starting |
| `tool_call_update` | Progress/completion of tool |
| `plan` | Multi-step execution plan |
| `user_message_chunk` | Replay of history during session load |
| `available_commands_update` | Slash command discovery |
| `current_mode_update` | Mode changes (agent/plan/autopilot) |

### Methods the AGENT calls on the CLIENT (Copilot asks EditLess):
| Method | Purpose |
|--------|---------|
| `session/request_permission` | Ask user to approve tool execution |
| `fs/read_text_file` | Read a file from workspace |
| `fs/write_text_file` | Write a file to workspace |
| `terminal/create` | Run a shell command |
| `terminal/output` | Get terminal output |
| `terminal/wait_for_exit` | Wait for command completion |
| `terminal/kill` | Kill a running command |
| `terminal/release` | Release terminal resources |

### Client capabilities you declare during init:
```json
{
  "clientCapabilities": {
    "fs": { "readTextFile": true, "writeTextFile": true },
    "terminal": true
  }
}
```

## 6. Is ACP Stable or Experimental?

**Mixed:**
- The **ACP protocol spec** itself is approaching stability (protocol version 1, broad industry adoption, Zed + JetBrains + GitHub + Gemini)
- **Copilot CLI's ACP support** is explicitly **public preview** (announced Jan 28, 2026): "subject to change"
- The **TypeScript SDK** is at v0.14.x — pre-1.0, actively evolving
- The protocol uses integer versioning (`1`) for major versions, with new capabilities added as non-breaking extensions

**Assessment:** The protocol design is solid and won't change fundamentally. But Copilot-specific behaviors, available capabilities, and SDK APIs may shift. Building on it now is viable for experimentation; building a production dependency on it needs careful version pinning.

## 7. Three Realistic Options for EditLess

### Option A: Regular Terminal + events.jsonl + --resume (Current Plan)
**Architecture:** EditLess spawns `copilot --resume <uuid>` in a VS Code terminal. User sees native Copilot UI. EditLess watches `~/.copilot/session-state/{uuid}/events.jsonl` for state.

| Aspect | Rating |
|--------|--------|
| Implementation cost | Low — already partially built |
| User experience | Native Copilot terminal (proven UX) |
| Structured data | Limited to events.jsonl file watching |
| Permission handling | Copilot handles it natively in terminal |
| Session resume | ✅ `--resume <uuid>` works |
| Tool call visibility | events.jsonl has tool events |
| Real-time streaming | events.jsonl is append-only, file-watch latency |
| Stability | ✅ Stable, production-ready |
| Risk | Very low |

**Verdict:** Ship this. It works, it's stable, users get the real Copilot experience.

### Option B: Full ACP Client (No Terminal, EditLess Owns the UI)
**Architecture:** EditLess spawns `copilot --acp --stdio` as a headless subprocess. EditLess renders ALL output in a custom webview/panel. EditLess implements fs/terminal capabilities.

| Aspect | Rating |
|--------|--------|
| Implementation cost | **Very high** — build full Copilot UI from scratch |
| User experience | Custom (could be better OR worse than native) |
| Structured data | ✅ Perfect — every event is typed JSON-RPC |
| Permission handling | EditLess must build permission UI |
| Session resume | ✅ `session/load` protocol method |
| Tool call visibility | ✅ Real-time, typed, with diffs and terminals |
| Real-time streaming | ✅ Sub-millisecond, true streaming |
| Stability | ⚠️ Public preview, SDK pre-1.0 |
| Risk | High — large surface area, breaking changes possible |

**Verdict:** This is the "build a Copilot IDE panel from scratch" option. Enormous effort. You'd need to implement: text rendering, diff display, permission dialogs, terminal embedding, markdown rendering, tool call UI, session management, error handling. For EditLess, this is premature — you'd be rebuilding what Copilot's native terminal already provides.

### Option C: Hybrid (ACP Sideband + Terminal Display)
**Architecture:** Run two Copilot instances — one in terminal for user UX, one in ACP mode for structured data.

| Aspect | Rating |
|--------|--------|
| Implementation cost | Medium-high — two processes, state sync challenges |
| User experience | Native terminal + structured sideband |
| Structured data | ✅ From ACP instance |
| Risk | **Fatal flaw: two independent sessions** |

**Verdict:** ❌ This doesn't work as conceived. The two instances would have separate sessions, separate conversations, separate tool executions. You'd burn double API quota for no benefit. There's no way to "mirror" one to the other.

## Recommendation

**Phase 1 (now): Option A.** Terminal + events.jsonl + --resume. This is the right call. Ship it.

**Phase 2 (future, when ACP stabilizes):** Consider Option B ONLY if EditLess evolves into a full IDE panel that wants to own the Copilot UX completely — like Zed or JetBrains do. This would be a major architectural pivot, not an incremental improvement.

**What ACP gives us that events.jsonl doesn't (for future reference):**
1. Typed tool call content (diffs with old/new text, terminal output)
2. Permission request interception (EditLess could auto-approve or customize)
3. Plan visibility (step-by-step agent planning)
4. Mode switching (agent/plan/autopilot)
5. Model selection at runtime
6. Session load with full history replay
7. MCP server injection at session creation time

**What we'd lose by switching to ACP:**
1. The native Copilot terminal UX (we'd have to rebuild it)
2. Stability (public preview vs. proven terminal mode)
3. User familiarity (terminal is what people know)

---

## Sources

- GitHub Docs: https://docs.github.com/en/copilot/reference/acp-server
- ACP Spec: https://agentclientprotocol.com/protocol/overview
- ACP Initialization: https://agentclientprotocol.com/protocol/initialization
- ACP Terminals: https://agentclientprotocol.com/protocol/terminals
- ACP Prompt Turn: https://agentclientprotocol.com/protocol/prompt-turn
- GitHub Blog: https://github.blog/changelog/2026-01-28-acp-support-in-copilot-cli-is-now-in-public-preview/
- TypeScript SDK: https://github.com/agentclientprotocol/typescript-sdk
- Live testing: Copilot CLI v0.0.414 on Windows, 2026-02-22
