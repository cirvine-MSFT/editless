# Context Menu Commands: Suppress in Command Palette

**Date:** 2026-02-16  
**Decided by:** Morty  
**Context:** #265 — Context menu improvements for work items and PRs

## Decision

All context menu commands that require tree item context (e.g., `editless.goToWorkItem`, `editless.launchFromPR`) should be suppressed in the command palette via `"when": "false"` in `menus.commandPalette`.

## Rationale

1. **Context-dependent commands are confusing in command palette:** Commands like "Go to Work Item" or "Launch from PR" require a tree item argument to function. When invoked from the command palette without context, they silently no-op (no error, no feedback).

2. **Command palette is for user-initiated actions:** Users expect commands in the palette to do something immediately. Context menu commands are designed for right-click workflows on specific tree items.

3. **Reduces palette clutter:** EditLess now has 40+ commands. Hiding context-only commands keeps the palette focused on actions users can actually invoke directly.

## Pattern

```json
{
  "menus": {
    "view/item/context": [
      { "command": "editless.goToWorkItem", "when": "viewItem == work-item", "group": "work-item@2" }
    ],
    "commandPalette": [
      { "command": "editless.goToWorkItem", "when": "false" }
    ]
  }
}
```

## Existing Usage

This pattern was already established for:
- `editless.focusTerminal`
- `editless.closeTerminal`
- `editless.renameSquad`
- `editless.openInBrowser`
- `editless.launchFromWorkItem`
- `editless.goToPR`

Extended to new commands in #265:
- `editless.goToWorkItem`
- `editless.launchFromPR`
- `editless.goToPRInBrowser`

## When to Apply

- Command signature includes a tree item parameter (e.g., `WorkItemsTreeItem`, `PRsTreeItem`, `EditlessTreeItem`)
- Command handler returns early if the item argument is undefined
- Command is only meaningful in the context of a specific tree item selection

## When NOT to Apply

- Commands that work from any context (e.g., `editless.refresh`, `editless.launchSession`)
- Commands that prompt for input when context is missing (e.g., `editless.renameSession` shows a QuickPick if no terminal is selected)
- Commands designed for keybindings or automation
