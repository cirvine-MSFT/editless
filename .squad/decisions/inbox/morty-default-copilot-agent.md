# Default Copilot CLI Agent

**Date:** 2026-02-22
**Author:** Morty (Extension Dev)
**Issue:** #337

## Decision

The EditLess tree always shows a built-in "Copilot CLI" entry at the top, even when no squads or agents are registered. This entry launches the generic Copilot CLI without a `--agent` flag. It cannot be hidden or deleted.

## Rationale

- New users should never see an empty sidebar — the default agent provides an immediate "launch" action.
- The old welcome state (Welcome to EditLess / Add squad / Discover agents) is replaced — the default agent IS the onboarding entry point.
- Uses `contextValue: 'default-agent'` to get the launch button but NOT delete/edit/hide context menu actions.

## Implementation

- `DEFAULT_COPILOT_CLI_ID = 'builtin:copilot-cli'` exported from `editless-tree.ts`
- Synthetic `AgentTeamConfig` created on-the-fly in `launchSession` handler (not persisted to registry)
- `launchCommand` set to `getCliCommand()` (just `copilot`) so no `--agent` flag is appended
- Terminal sessions tracked under the sentinel squad ID like any other agent
