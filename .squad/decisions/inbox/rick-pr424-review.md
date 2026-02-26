# Decision: Config Refresh Pattern for Integration Re-initialization

**Date:** 2026-02-24  
**Author:** Rick  
**Context:** PR #424 architecture review — config refresh handlers for ADO and GitHub integrations

## Decision

The config refresh pattern established in PR #424 is the **canonical pattern** for integration re-initialization when VS Code settings change.

### Pattern Definition

```typescript
// In activate(), after initial integration setup:
context.subscriptions.push(
  vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('editless.integration.key')) {
      initIntegration(/* params */);
    }
  }),
);
```

### Key Principles

1. **Handlers live in `activate()` after init calls** — not inside the init functions (avoids circular dependencies)
2. **Separate listeners per integration scope** — don't combine unrelated config checks into one monolithic handler
3. **Call full init functions** — if the init function is idempotent (no resource leaks), reuse it instead of duplicating logic
4. **Idempotency requirement** — init functions must be safe to call multiple times (assignments only, no subscriptions/allocations)

### Architecture Rationale

**Why separate listeners?**
- Single Responsibility Principle — each listener owns one integration's config scope
- Avoids unnecessary config checks on every change event
- Negligible performance cost (VS Code fires event once regardless of listener count)

**Why call full init functions?**
- Avoids code duplication between activation and refresh paths
- Init functions already handle config reading, validation, provider updates, and data fetching
- Safe if init functions are idempotent (confirmed for `initAdoIntegration()` and `initGitHubIntegration()`)

**Why not place handlers inside init functions?**
- Creates circular dependency: init → register listener → call init → register listener...
- Violates VS Code extension lifecycle (subscriptions should be registered in `activate()`)

## Examples in Codebase

- **PR #424 (new):** ADO and GitHub integration config refresh (lines 999-1015)
- **Existing:** `refreshInterval` config watcher (line 1370)

## Anti-Patterns to Avoid

❌ **Combining unrelated integrations into one listener:**
```typescript
// Don't do this — checks irrelevant configs on every change
vscode.workspace.onDidChangeConfiguration(e => {
  if (e.affectsConfiguration('editless.ado.organization')) { /* ... */ }
  if (e.affectsConfiguration('editless.github.repos')) { /* ... */ }
  if (e.affectsConfiguration('editless.someOtherThing')) { /* ... */ }
});
```

❌ **Registering listeners inside init functions:**
```typescript
async function initAdoIntegration() {
  // Don't do this — creates circular dependency and multiple subscriptions
  vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('editless.ado.organization')) {
      initAdoIntegration(); // ← calls itself, leaks listeners
    }
  });
}
```

❌ **Duplicating init logic in the handler:**
```typescript
// Don't do this — duplicates config reading and validation
vscode.workspace.onDidChangeConfiguration(e => {
  if (e.affectsConfiguration('editless.ado.organization')) {
    const config = vscode.workspace.getConfiguration('editless');
    const org = config.get<string>('ado.organization');
    // ... duplicate all the init logic ...
  }
});
```

## When to Use This Pattern

✅ **Use when:**
- An integration needs to re-initialize when VS Code settings change
- The init function is idempotent (no event subscriptions, resource allocations, or state accumulation)
- The config scope is clearly defined (one or a few related keys)

❌ **Don't use when:**
- Init function creates event subscriptions or allocates resources (fix the init function first)
- Config change requires partial update (create a dedicated setter method instead)
- Change requires complex migration or state preservation (implement a migration handler)

## Testing Requirements

Config refresh handlers must include:
- Test that handler fires when each monitored config key changes
- Test that handler does NOT fire for unrelated config keys
- Test that the expected provider methods are called (e.g., `setAdoConfig`, `setRepos`)

See `src/__tests__/config-refresh.test.ts` for reference implementation.

## Status

✅ **Approved** — Pattern is validated and ready for use in future integrations.
