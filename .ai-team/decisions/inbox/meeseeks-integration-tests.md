# Decision: Extension must export a test API for integration tests

**By:** Meeseeks (Tester), issue #53
**Date:** 2025-07-19
**Status:** Pending review

## What

The persistence integration tests (`src/__integration__/persistence.test.ts`) require the extension to export an API object from `activate()`. Currently `activate()` returns `void`.

The required contract:

```typescript
// extension.ts
export function activate(context: vscode.ExtensionContext): EditlessApi {
  // ... existing activation code ...
  return {
    terminalManager,
    context,
  };
}
```

The integration tests import this as:

```typescript
interface EditlessTestApi {
  terminalManager: {
    launchTerminal(config: AgentTeamConfig, customName?: string): vscode.Terminal;
    getAllTerminals(): Array<{ terminal: vscode.Terminal; info: Record<string, unknown> }>;
  };
  context: vscode.ExtensionContext;
}
```

## Why

Integration tests need to:
1. Call `terminalManager.launchTerminal()` directly with test configs (the `editless.launchSession` command requires squads in the registry and shows UI pickers — not suitable for automated tests)
2. Read `context.workspaceState.get('editless.terminalSessions')` to verify persistence actually wrote to the real VS Code storage API
3. Clear `workspaceState` between tests to prevent state leakage

Without these exports, the only alternative is testing indirectly via commands — but `launchSession` requires interactive QuickPick input and registry entries, making it unreliable for CI.

## Impact

- `activate()` return type changes from `void` to `EditlessApi`
- `deactivate()` is unaffected
- No runtime behavior changes — the export is additive
- Morty (Extension Dev) should implement this as part of #53 task wiring

## Alternatives Considered

1. **Test via commands only:** `editless.launchSession` requires a registered squad and interactive picker — not viable for headless CI.
2. **Expose a test-only command:** Could register `editless._test.getWorkspaceState` — but that pollutes the command namespace and still doesn't give direct TerminalManager access.
3. **Export only in test builds:** Adds build complexity for marginal benefit — the API is safe to export unconditionally since extensions can already access each other's exports.
