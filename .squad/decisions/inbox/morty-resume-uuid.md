# Terminal UUID Pre-generation Pattern

**Date:** 2026-02-21  
**Author:** Morty  
**Status:** Implemented  
**Issues:** #323, #324, #326

## Decision

Terminals now pre-generate Copilot CLI session UUIDs before launching, eliminating the need for post-launch orphan detection and fixing focus stability issues.

## Implementation

### 1. UUID Pre-generation (#323, #326)

**Pattern:**
```typescript
const uuid = crypto.randomUUID();
info.agentSessionId = uuid;
const launchCmd = buildCopilotCommand({ agent, resume: uuid });
terminal.sendText(launchCmd);
```

**Benefits:**
- No race conditions waiting for session directories to appear
- Immediate session tracking from terminal creation
- Deterministic session ID known before CLI starts

### 2. Terminal Options (#323)

All managed terminals now use:
```typescript
{
  isTransient: true,           // Prevents zombie terminals on reload
  iconPath: new vscode.ThemeIcon('terminal'),
  env: {
    EDITLESS_TERMINAL_ID: id,  // Terminal tracking ID
    EDITLESS_SQUAD_ID: config.id,
    EDITLESS_SQUAD_NAME: config.name,
  }
}
```

### 3. Events.jsonl File Watching (#324)

Added `SessionContextResolver.watchSession(sessionId, callback)`:
- Uses `fs.watch()` with 100ms debouncing
- Tail-reads last line on change, parses as JSON
- Auto-retries if file doesn't exist yet (1s interval)
- Returns VS Code-compatible Disposable
- Updates `_lastActivityAt` on each event

Also added `watchSessionDir()` for workspace.yaml detection.

### 4. Stable Terminal Focus (#324)

`focusTerminal()` now accepts `terminal: vscode.Terminal | string`:
- String ID lookups find terminal from `_terminals` map by `info.id`
- Validates terminal exists in `vscode.window.terminals` before showing
- Uses `terminal.show(false)` (preserveFocus=false) for explicit focus

## Backward Compatibility

Kept `detectSessionIds()` for terminals created before this change (orphan recovery). New terminals bypass detection entirely.

## Related Files

- `src/terminal-manager.ts` — launchTerminal(), relaunchSession(), focusTerminal()
- `src/session-context.ts` — watchSession(), watchSessionDir()
- `src/copilot-cli-builder.ts` — buildCopilotCommand()
