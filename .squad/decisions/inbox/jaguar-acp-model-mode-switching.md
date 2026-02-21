# Decision: ACP Model/Mode Switching — Log Only for Now

**Author:** Jaguar (Copilot SDK Expert)  
**Date:** 2026-02-23  
**Context:** ACP Spike M5, branch `squad/370-acp-spike`

## Problem

`session/new` returns available models and modes, and we've wired dropdowns in the webview panel. But ACP has no dedicated `session/changeModel` or `session/changeMode` method. How do we handle user selection changes?

## Options Considered

1. **Send as prompt prefix** (e.g. `/model gpt-5.2`): Copilot CLI supports slash commands in interactive mode, but unclear if they work via ACP `session/prompt`.
2. **Dedicated ACP method**: Doesn't exist yet. Could appear in a future protocol version.
3. **Log and defer**: Wire the UI, log selection changes, implement actual switching later once we discover the ACP mechanism.

## Decision

**Option 3: Log and defer.** Model/mode dropdown changes are logged to the EditLess output channel. No protocol calls are made. This unblocks the UI work without risking broken behavior.

## Rationale

- The ACP protocol is pre-1.0 (`@agentclientprotocol/sdk` v0.14.x). New methods may appear.
- The `current_mode_update` notification proves the *server* can push mode changes, suggesting a client→server path will follow.
- Spike code should surface data, not guess at protocols.

## Next Steps

- Investigate whether `/model` and `/mode` slash commands work via `session/prompt` text.
- Watch ACP SDK releases for `session/changeModel` or similar.
- Once mechanism is known, wire dropdown `change` events → actual protocol calls.
