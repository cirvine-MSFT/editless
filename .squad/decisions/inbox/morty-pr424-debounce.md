# Config Handler Debounce Pattern

**Context:** PR #424 review feedback from Unity and Meeseeks

**Decision:** `onDidChangeConfiguration` handlers that trigger expensive operations (API calls, data reloads) should use a simple `setTimeout`/`clearTimeout` debounce pattern with 500ms delay.

**Rationale:**
- Prevents concurrent API calls when users type config values character-by-character (e.g., ADO org name, GitHub repo list)
- Out-of-order completion can show stale data if not debounced
- No external dependencies needed — use native `setTimeout`/`clearTimeout`
- Each handler maintains its own timer variable for isolation

**Implementation Pattern:**
```typescript
let debounceTimer: NodeJS.Timeout | undefined;
context.subscriptions.push(
  vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('editless.some.setting')) {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        expensiveOperation();
      }, 500);
    }
  }),
);
```

**Test Pattern:**
- Use `vi.useFakeTimers()` + `vi.advanceTimersByTime(500)` in tests
- Verify debounce works: rapid changes → single call after delay
- All config handler tests must account for debounce delay

**Applied in:** extension.ts ADO/GitHub config handlers (PR #424)

**Author:** Morty (2026-02-22)
