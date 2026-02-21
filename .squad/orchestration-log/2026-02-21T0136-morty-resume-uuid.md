# Orchestration Log: Morty — Terminal Resume UUID Implementation
**Date:** 2026-02-21T01:36Z  
**Agent:** Morty (claude-sonnet-4.5)  
**Mode:** Background  
**Issues:** #323, #324, #326

---

## Session Summary

Morty implemented the Terminal UUID Pre-generation Pattern for EditLess, enabling deterministic session tracking and stable terminal focus. This eliminates race conditions in session discovery and fixes focus reliability issues.

### Work Completed

#### 1. UUID Pre-generation (#323, #326)
- Pre-generate `crypto.randomUUID()` before terminal launch
- Assign UUID to `info.agentSessionId` in terminal info object
- Pass UUID to `buildCopilotCommand()` via `--resume` flag
- Eliminates orphan detection race condition

#### 2. Terminal Options Standardization (#323)
- All managed terminals now use:
  - `isTransient: true` — prevents zombie terminals on reload
  - `iconPath: new vscode.ThemeIcon('terminal')`
  - Custom env vars: `EDITLESS_TERMINAL_ID`, `EDITLESS_SQUAD_ID`, `EDITLESS_SQUAD_NAME`

#### 3. Events.jsonl File Watching (#324)
- Implemented `SessionContextResolver.watchSession(sessionId, callback)`
  - Uses `fs.watch()` with 100ms debouncing
  - Tail-reads last JSON line on file change
  - Auto-retries if file doesn't exist yet (1s interval)
  - Returns VS Code-compatible Disposable for cleanup

- Implemented `watchSessionDir()` for workspace.yaml detection

#### 4. Stable Terminal Focus (#324)
- Extended `focusTerminal()` overload to accept `terminal: vscode.Terminal | string`
  - String ID lookups find terminal from `_terminals` map by `info.id`
  - Validates terminal exists in `vscode.window.terminals` before showing
  - Uses `terminal.show(false)` for explicit focus

### Files Modified

- `src/terminal-manager.ts` — launchTerminal(), relaunchSession(), focusTerminal()
- `src/session-context.ts` — watchSession(), watchSessionDir(), SessionContextResolver

### Key Design Decisions

1. **Backward Compatibility:** Kept `detectSessionIds()` for legacy terminals (pre-pre-gen era). New terminals bypass detection entirely.
2. **Deterministic IDs:** UUID pre-generation known at launch time, eliminating filesystem timing dependencies.
3. **Debounced File Watching:** 100ms debounce balances responsiveness with file system event coalescing.

### Outcome

✅ All terminal-related issues resolved. Terminal tracking is now deterministic and reliable.

---

## Related Decisions

- `.squad/decisions/inbox/morty-resume-uuid.md` — merged to decisions.md

## Next Steps

- Meeseeks test coverage validation
- Coordinator fixup/integration review
- Phase 2 terminal integration session log completion
