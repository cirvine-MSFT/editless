# Decision: Unified Discovery Flow — Agents & Squads

**Date:** 2026-02-21
**Author:** Morty (Extension Dev)
**For:** Issues #317 (refresh discovery) and #318 (add from existing)

## Decision

Agent and squad discovery are now unified into a single tree section and code path.

## What Changed

1. **New module: `src/unified-discovery.ts`** — exports `DiscoveredItem` interface and `discoverAll()` function that scans workspace folders for both `.agent.md` files AND `.squad/team.md` directories in one pass, plus `~/.copilot/agents/` for personal agent library. Returns items minus already-registered.

2. **Unified "Discovered" tree section** — replaces the old "Discovered Agents" header. Shows both agents (🤖 hubot icon) and squads (🔷 organization icon) with a count badge ("3 new"). Squads sort first, then agents.

3. **No more toast notifications** — `checkDiscoveryOnStartup()` with its modal toast + QuickPick flow is removed from extension activation. Discovered items appear passively in the tree.

4. **Single refresh path** — `refreshDiscovery()` in extension.ts re-runs both `discoverAllAgents()` and `discoverAll()` in one go. Used by the refresh command, workspace folder changes, and post-promote cleanup.

5. **Promote handles both types** — `editless.promoteDiscoveredAgent` command now checks unified `discoveredItems` first (handles both agents and squads), then falls back to legacy `discoveredAgents`.

6. **Deprecated settings** — `editless.discoveryDir` and `editless.discovery.scanPaths` marked deprecated in package.json descriptions. Not removed yet for backward compat.

## Why

Casey directed: "I want the unified flow NOW to simplify the code." Two completely separate discovery flows (agents: silent sidebar, squads: toast+QuickPick) created confusion and code duplication. Summer's UX spec (in decisions.md) defined the target state.

## Impact

- Tree view shows unified section instead of flat discovered agents list
- `discovered-squad` is a new TreeItemType with context menu actions
- `CategoryKind` expanded: `'roster' | 'discovered' | 'hidden'`
- The old `promptAndAddSquads()` and `registerDiscoveryCommand()` still exist in `discovery.ts` for the manual `editless.discoverSquads` command
