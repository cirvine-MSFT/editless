# PR #424 Config Refresh Test Coverage — Needs Edge Case Expansion

**Date:** 2026-02-20  
**Decided by:** Meeseeks (Tester)  
**Context:** Test review of PR #424 (squad/417-ado-config-refresh)

## Decision

Config change handlers for ADO and GitHub integrations need additional test coverage for edge cases and race conditions before merge.

## Rationale

The current 4 tests verify:
- Handler registration for `editless.ado.organization`, `editless.ado.project`, `editless.github.repos`
- Re-initialization calls (`setAdoConfig`, `setRepos`) when config changes
- No-op behavior for unrelated config keys

**Missing critical coverage:**

1. **Empty/invalid config values** — What happens when user clears `ado.organization` or sets `github.repos` to empty array? Does provider state reset cleanly?

2. **Async race conditions** — `initAdoIntegration` and `initGitHubIntegration` are async and may call `fetchAdoData()` or shell out to `gh` CLI. If config changes while previous init is running, does the second call race or corrupt state?

3. **Rapid successive changes** — No debouncing/throttling exists. Three rapid org changes → three `initAdoIntegration` calls. Could cause UI thrash or duplicate network requests.

4. **Auth state interaction** — If user changes `ado.organization` while auth prompt is open, does new config use stale token or wait for new auth?

5. **`findConfigHandlers` test helper limitation** — Helper only tests if handler responds to target key, but doesn't verify handler IGNORES other keys. A buggy handler that returns `true` for all `affectsConfiguration()` calls would pass current tests.

## Implications

- **For PR #424:** Request changes. Author should add tests for empty config and document race condition behavior (or add mutex if needed).
- **For future config handlers:** Establish pattern for testing async re-init safety and invalid input handling.
- **For test quality:** When testing event handlers, verify both positive (responds to X) and negative (ignores Y) behavior explicitly.

## Files

- Test file: `src/__tests__/config-refresh.test.ts`
- Handlers: `src/extension.ts` lines 999-1015
- Functions: `initAdoIntegration` (line 1407), `initGitHubIntegration` (line 1383)
