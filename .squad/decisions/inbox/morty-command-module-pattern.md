# Command Module Pattern

**Date:** 2026-02-28
**Author:** Morty
**Status:** Implemented

## Decision

Command handlers in `extension.ts` are extracted into domain-specific modules
under `src/commands/`:

- `agent-commands.ts` — agent discovery, CRUD, model, launch, add
- `session-commands.ts` — terminal focus, close, rename, label
- `work-item-commands.ts` — work items, PRs, filters, ADO/GitHub

Each module exports `register(context, deps)` where `deps` is a typed
interface containing only the services that module needs (dependency injection,
no module-level singletons).

## Consequences

- `activate()` in `extension.ts` is now ~230 lines of pure wiring (was ~1300)
- New commands go in the appropriate module, not extension.ts
- Tests continue using the `activate()` → capture handlers pattern unchanged
- Mocks for `../unified-discovery` must use `importOriginal` to preserve
  real exports like `toAgentTeamConfig`
