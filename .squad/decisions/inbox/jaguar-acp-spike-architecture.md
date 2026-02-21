# ACP Spike Architecture Decision

**Date:** 2026-02-22  
**Author:** Jaguar (Copilot SDK Expert)  
**Status:** Implemented  
**Related:** Issue #370 (ACP spike)

---

## Context

EditLess needs programmatic control over Copilot CLI for the ACP integration spike. The spike validates that ACP can replace terminal+events.jsonl integration with a structured JSON-RPC protocol.

## Decision

Built a three-layer ACP protocol foundation:

### 1. Type Layer (`src/acp/types.ts`)
Complete TypeScript interfaces for ACP protocol v1:
- JSON-RPC base types (Request, Response, Notification, Error)
- All client→agent methods: `initialize`, `session/new`, `session/load`, `session/prompt`, `session/cancel`
- All agent→client session updates: `agent_message_chunk`, `agent_thought_chunk`, `tool_call`, `tool_call_update`, `plan`, `user_message_chunk`, `available_commands_update`, `current_mode_update`
- All agent→client request methods: `session/request_permission`, `fs/read_text_file`, `fs/write_text_file`, `terminal/*`
- Discriminated unions for type-safe update handling

### 2. Client Layer (`src/acp/client.ts`)
Core JSON-RPC engine:
- Spawns `copilot --acp --stdio` using `buildCopilotCommand({ extraArgs: ['--acp', '--stdio'] })`
- NDJSON parsing with line-buffered stream handling (safety for partial reads)
- Bidirectional JSON-RPC: tracks pending client→agent requests by ID, handles incoming agent→client requests
- EventEmitter pattern (`vscode.EventEmitter`) for streaming updates: message_chunk, thought_chunk, tool_call, tool_call_update, plan, stopped, error
- Handler interface (`AcpRequestHandler`) for agent→client requests — decouples protocol from VS Code APIs
- Proper lifecycle: initialize() → createSession(cwd) → prompt(sessionId, text) → dispose()
- Cleanup on dispose: kills child process, rejects pending promises, disposes emitters

### 3. Handler Layer (`src/acp/handlers.ts`)
Spike implementation of `AcpRequestHandler`:
- Auto-approves all permission requests (spike only)
- Reads files from disk via Node `fs/promises` for `fs/read_text_file`
- Throws stub errors for `fs/write_text_file` and `terminal/*` (out of spike scope)
- Logs all requests to VS Code output channel for visibility during testing

## Architecture Insights

**Reverse request pattern:** ACP is bidirectional. The Copilot agent makes JSON-RPC requests TO the client (fs/read, terminal/create, permission requests). These arrive with an `id` field — client MUST send a JSON-RPC response. This is fundamentally different from terminal mode (one-way, agent owns I/O).

**Implication:** EditLess becomes the UI owner in ACP mode. The handler interface is the abstraction point for VS Code integration (file system, terminal, permission dialogs).

**Why handler interface?** Decouples protocol from VS Code. Tests can mock handlers. Future handlers can implement write/terminal capabilities without touching client.ts.

## Patterns Used

- **NDJSON streaming:** Buffer accumulation with `split('\n')`, parse each complete line separately (safety against partial JSON)
- **Map-based request tracking:** `pendingRequests: Map<id, {resolve, reject}>` — promises resolved when responses arrive
- **Type guards:** `isValidJsonRpc(msg): msg is Record<string, unknown>` for safe type narrowing
- **VS Code EventEmitter:** Not Node EventEmitter — integrates with VS Code extension host, proper disposal
- **Command builder integration:** Uses existing `buildCopilotCommand()` from `copilot-cli-builder.ts` for consistency

## What's NOT in Spike Scope

- Write file operations (handler throws error)
- Terminal operations (handler throws error)
- Permission UI (handler auto-approves)
- Session resume UI (`session/load` is implemented in client, no UI)
- Model/mode switching (protocol supports it, no UI)
- Plan visualization (events fire, no rendering)
- Tool call UI (events fire, no rendering)

## Next Steps (Post-Spike)

If spike proves ACP viable:
1. Build UI layer: webview panel rendering agent_message_chunk, tool calls, plans
2. Implement real permission handler: VS Code dialogs for user approval
3. Implement terminal handler: route terminal/* to VS Code integrated terminal
4. Implement write handler: VS Code workspace edit API + user confirmation
5. Add session resume UI: list sessions from protocol, not filesystem
6. Add model/mode switcher: UI controls for runtime switching

If spike proves ACP NOT viable:
- Fall back to terminal+events.jsonl+--resume (Option A)
- ACP remains a future option when protocol stabilizes

## Files Created

- `src/acp/types.ts` (272 lines) — Protocol type definitions
- `src/acp/client.ts` (342 lines) — JSON-RPC client engine
- `src/acp/handlers.ts` (89 lines) — Spike handler implementation

---

**Confidence:** High — Protocol testing validated all message types, client compiles cleanly, architecture matches ACP spec patterns from Zed/JetBrains implementations.
