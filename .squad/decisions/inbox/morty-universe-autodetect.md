# Universe Auto-Detection from Casting Registry

**Author:** Morty  
**Date:** 2026-02-23  
**Issue:** #393

## Decision

When `parseTeamMd()` returns `universe: 'unknown'` (no `**Universe:**` marker in team.md), discovery now falls back to reading `.squad/casting/registry.json` (or `.ai-team/casting/registry.json`) and extracting the `universe` field from the first active agent entry.

## Detection Priority

1. `**Universe:**` in team.md — explicit user override, highest priority
2. `.squad/casting/registry.json` universe field — automatic fallback
3. `'unknown'` — final fallback when neither source has a universe

## Architecture

- `parseTeamMd()` remains pure (text-only, no filesystem access)
- New `readUniverseFromRegistry(squadPath)` handles the file read
- Fallback logic lives at caller sites: `discoverAgentTeams()`, `autoRegisterWorkspaceSquads()`, `discoverAll()`
- Checks `.squad/` before `.ai-team/` (same priority order as `resolveTeamMd`)
- Only reads from active agents (`status: 'active'`)
- Errors handled gracefully — malformed/missing files silently fall through to 'unknown'

## Impact

All discovery paths (scan, auto-register, unified) now consistently resolve the universe. Squads with casting data no longer show "unknown" in the tree view.
