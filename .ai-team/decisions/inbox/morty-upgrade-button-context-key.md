### 2026-02-16: Use context keys for menu visibility based on dynamic state

**By:** Morty

**What:** Gate menu items on VS Code context keys when visibility depends on runtime state that can't be expressed through `viewItem` checks. For the "Upgrade All Squads" button, we use `editless.squadUpgradeAvailable` set via `vscode.commands.executeCommand('setContext', ...)` in `checkSquadUpgradesOnStartup()`.

**Why:** VS Code's TreeView API doesn't support dynamic menu visibility based on tree contents — you can only use `view == <viewId>` (always visible) or `viewItem == <contextValue>` (per-item inline buttons). When a menu action should appear based on aggregate state (e.g., "any squad upgradeable"), a context key is the only option. This pattern should be used for other view-level actions that depend on computed state.
