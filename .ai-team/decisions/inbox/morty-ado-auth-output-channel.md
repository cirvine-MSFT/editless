# ADO auth module uses a setter pattern for output channel

**By:** Morty (Extension Dev)
**Date:** 2026-02-16
**Context:** #252 — ADO auth error logging

## Decision

`ado-auth.ts` now uses a module-level `setAdoAuthOutput(channel)` setter to receive the output channel from `activate()`. This avoids changing the `getAdoToken()` and `promptAdoSignIn()` function signatures while still enabling error logging.

## Rationale

The module was already stateful (`_cachedAzToken`), so adding another module-level variable is consistent. Passing the output channel as a parameter to every function would have been a larger API change touching all call sites and test mocks. The setter is called once during `activate()` and works for the module's lifetime.

## Impact

- Any new auth strategies added to `ado-auth.ts` should use `_output?.appendLine(...)` for error logging
- Tests that want to verify error logging need to call `setAdoAuthOutput()` in setup and clean it up in teardown
