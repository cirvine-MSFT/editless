# Project Context

- **Owner:** Casey Irvine (cirvine@microsoft.com)
- **Project:** EditLess — a VS Code extension for managing AI agents, terminal sessions, and work items. The "editorless IDE" panel.
- **Stack:** TypeScript, VS Code Extension API, esbuild, vitest
- **Created:** 2026-02-15
- **Repo:** cirvine-MSFT/editless (private)
- **Prototype:** Ported from tools-squad/extension. Redactor module removed. Rebranded from "Squad Dashboard" to "EditLess."
- **Target:** Internal Microsoft distribution by Monday 2026-02-16 via GitHub Releases (VSIX)

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

📌 **Team update (2026-02-15):** Command category pattern standardized — all commands use `"category": "EditLess"` instead of title prefix to clean context menus while preserving command palette discoverability. This is now a team decision. — decided by Casey Irvine

- **Command category pattern:** Use `"category": "EditLess"` on commands instead of prefixing titles with "EditLess: ". VS Code shows the category in the command palette but omits it in context menus — clean context menus without losing discoverability.
- **F2 rename from terminal:** Clicking a tree terminal item intentionally focuses the terminal (`terminal.show()`). A second F2 keybinding with `"when": "terminalFocus"` covers the rename flow after focus moves. The `renameSession` handler falls back to `vscode.window.activeTerminal` when no arg is provided so the keybinding resolves the right terminal without a QuickPick.
- **Startup checks must be non-blocking:** `checkAgencyOnStartup` was using `execSync` which blocks the entire extension activation. Replaced with async `exec` callback. Any startup probe that shells out must use async execution to avoid freezing the activation path.
- **Cache user-facing prompts in globalState:** Toasts that fire on reload (like the agency update prompt) need dedup logic. Use `context.globalState` with a version+timestamp cache keyed by feature name. 24-hour cooldown prevents nagging while still re-checking after a reasonable interval or when the installed version changes.
- **User-facing text vs internal code:** When renaming user-facing strings (e.g. "squads" → "agents"), only touch string literals shown to users — status bar text, QuickPick placeholders, toast messages, and `package.json` view names. Leave internal variable names, function names, file names, and test fixture data unchanged. Squad-specific features (squad-upgrader) that reference the Squad CLI product keep "squad" in their messages.
- **Provider update infrastructure is generalized:** Update checking in `cli-provider.ts` is driven by optional `updateCommand`, `upToDatePattern`, and `updateRunCommand` fields on `CliProvider`. To add update support for a new CLI, just populate those fields in `KNOWN_PROFILES` — no new functions needed. Cache keys are per-provider (`editless.${name}UpdatePrompt`). The old `checkAgencyOnStartup` still exists as a deprecated alias for `checkProviderUpdatesOnStartup`.
- **Terminal session persistence pattern:** `TerminalManager` persists terminal-to-squad mappings in `workspaceState` (key: `editless.terminalSessions`) and reconciles with live `vscode.window.terminals` on reload by matching `terminal.name`. The `TerminalInfo` interface stays unchanged — a separate `PersistedTerminalInfo` serializes `Date` → ISO string and adds `terminalName` for reconciliation. `_persist()` is called after every mutation (launch, close). `reconcile()` runs once after tree provider setup during activation.
- **Notification settings pattern:** Notifications use a master toggle (`notifications.enabled`) plus per-category booleans (`notifications.inbox`, `notifications.updates`). The shared `isNotificationEnabled(category)` helper in `notifications.ts` checks both — master off kills all, otherwise defers to the category setting. New notification categories follow this same pattern: add a setting, pass the category key to the helper.
- **Agent discovery (#2 + #18):** Added `src/agent-discovery.ts` — scans workspace `.github/agents/*.agent.md` and root-level `*.agent.md` files on activation, surfaces them in the tree view as read-only "Discovered Agents" section.
- **Add Agent / Add Squad buttons (#13):** Added `editless.addAgent` (creates `.github/agents/{name}.agent.md` template, re-runs discovery) and `editless.addSquad` (folder picker → `git init` + `npx squad init` in a terminal) as header actions on the Agents pane.
