# Plan: Restore Terminal Layout When Closing Editor Tabs (#40)

> Linked issue: [#40](https://github.com/cirvine-MSFT/editless/issues/40)

## Problem

EditLess is a terminal-first experience. Users work in full-screen terminal (panel maximized), then click a tree item to peek at a file (plan, agent, decision). VS Code opens an editor tab, shrinking the terminal to half-screen. When the editor is closed, the terminal stays small — the user has to manually restore it every time.

## Approach

Track editor opens triggered by EditLess, and restore terminal layout when those editors close. Two configurable dimensions: (1) what triggers the restore (EditLess-opened files only vs any-editor-close-when-empty), (2) what the restore does (maximize panel vs restore previous size). A new `src/layout-manager.ts` module handles all tracking and restoration.

## Decisions

- **D1:** Auto-restore is **on by default** — matches EditLess's terminal-first philosophy.
- **D2:** Two trigger modes (configurable):
  - `"editless"` (default) — only restore when the last EditLess-opened editor closes
  - `"all"` — restore whenever all visible editors close (editor area becomes empty)
- **D3:** Two restore modes (configurable):
  - `"maximize"` (default) — maximize the terminal panel to full height
  - `"previous"` — restore panel to whatever size it was before the editor opened
- **D4:** VS Code has no API to query panel size directly. For "previous" mode, we capture panel state before opening the editor by checking `workbench.panel.maximized` context key (available via `vscode.commands.executeCommand('getContext', ...)`) or tracking our own maximize/restore state.
- **D5:** Preview mode for EditLess-opened files — use `{ preview: true, preserveFocus: false }` so VS Code treats them as transient peeks that auto-replace each other.

## Tasks

### T1: Layout Manager module
**Files:** `src/layout-manager.ts` (new)

Create `LayoutManager` class:
- `_editlessOpenedEditors: Set<string>` — tracks URIs of files opened by EditLess
- `_panelWasMaximized: boolean` — captures panel state before the first editor open
- `trackOpen(uri: vscode.Uri): void` — records that EditLess opened this file, captures panel state if this is the first tracked open
- `handleEditorClose(): void` — called when visible editors change, checks trigger condition, restores layout if met
- `dispose(): void` — cleanup listeners

Panel state capture (for "previous" mode):
```typescript
// Before opening the first editor, snapshot panel state
const wasMaximized = await vscode.commands.executeCommand('getContext', 'workbench.panel.maximized');
```
If `getContext` isn't available (older VS Code), fall back to a heuristic: assume the panel was maximized if the terminal was the active/focused view when `trackOpen()` was first called. This covers the primary EditLess workflow (terminal-first → peek file → close → restore).

Restore logic:
```typescript
if (restoreMode === 'maximize') {
  await vscode.commands.executeCommand('workbench.action.maximizePanel');
} else if (restoreMode === 'previous' && this._panelWasMaximized) {
  await vscode.commands.executeCommand('workbench.action.maximizePanel');
}
// If previous mode and panel wasn't maximized, do nothing — it's already at the right size
```

### T2: Hook EditLess tree item opens
**Files:** `src/extension.ts`, `src/editless-tree.ts`

Every place EditLess opens a file (tree item click, "Go to" commands), call `layoutManager.trackOpen(uri)` before `vscode.window.showTextDocument(uri, { preview: true })`.

Identify all open points:
- Tree item click handler (decisions, activity, roster items that open files)
- `editless.openFile` or similar commands
- Any `vscode.window.showTextDocument` calls in extension.ts

### T3: Editor close detection + restore trigger
**Files:** `src/layout-manager.ts`, `src/extension.ts`

Register `vscode.window.onDidChangeVisibleTextEditors` listener in LayoutManager:

**Trigger mode `"editless"`:**
1. When visible editors change, check if any EditLess-tracked URIs are still open
2. Remove closed URIs from `_editlessOpenedEditors`
3. When set becomes empty → trigger restore

**Trigger mode `"all"`:**
1. When visible editors change, check if `visibleTextEditors.length === 0`
2. If empty → trigger restore

Edge case: user opens their own editor THEN an EditLess editor. When EditLess editor closes, don't restore (user's editor is still open). The "editless" mode handles this naturally — it only cares about its own tracked files.

### T4: Settings
**Files:** `package.json`

```jsonc
"editless.layout.autoRestore": {
  "type": "boolean",
  "default": true,
  "description": "Automatically restore terminal layout when editor tabs opened by EditLess are closed."
},
"editless.layout.restoreTrigger": {
  "type": "string",
  "enum": ["editless", "all"],
  "default": "editless",
  "description": "When to restore: 'editless' restores when all EditLess-opened editors close. 'all' restores when all editors close (editor area empty)."
},
"editless.layout.restoreMode": {
  "type": "string",
  "enum": ["maximize", "previous"],
  "default": "maximize",
  "description": "How to restore: 'maximize' maximizes the terminal panel. 'previous' restores to the size before the editor opened."
}
```

### T5: Tests
**Files:** `src/__tests__/layout-manager.test.ts` (new)

- **Track/restore cycle:**
  - Track open → close last tracked editor → restore fires
  - Track open → close non-tracked editor → no restore
  - Track multiple opens → close one → no restore; close last → restore fires
- **Trigger modes:**
  - "editless" mode: only tracked URIs trigger restore
  - "all" mode: any empty editor area triggers restore
- **Restore modes:**
  - "maximize": calls `workbench.action.maximizePanel`
  - "previous" + panel was maximized: calls maximize
  - "previous" + panel was not maximized: no-op
- **Setting disabled:**
  - `autoRestore: false` → no tracking, no restore
- **Edge cases:**
  - User opens their own editor + EditLess editor → only EditLess close matters (editless mode)
  - Multiple EditLess editors open → restore only when ALL close

## Out of Scope

- Terminal split/group persistence (VS Code API doesn't support this)
- Saving/restoring exact pixel dimensions of the panel (no API)
- Restoring editor area layout (tab arrangement, split editors)
