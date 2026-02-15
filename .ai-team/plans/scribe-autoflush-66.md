# Plan: Scribe Auto-Flush Decisions Inbox (#66)

> Linked issue: [#66](https://github.com/cirvine-MSFT/editless/issues/66)

## Problem

Decisions inbox files pile up when Scribe fails silently or isn't spawned after agent batches. Users see unmerged inbox items and don't know what to do. The inbox leaks implementation details and, more importantly, new agent sessions start with stale `decisions.md` — missing context from previous work.

## Approach

Add a "Flush Inbox" action accessible from three places: (1) per-squad inline `📥` button (only visible when inbox has items), (2) global toolbar `📥` button (visible when any squad has items), (3) command palette. Each spawns an ephemeral Scribe session (LLM-powered) to merge inbox → decisions.md. Auto-flush before session launch is setting-controlled (default on). Scribe invocation uses the squad's existing launch command but is configurable for token optimization.

## Decisions

- **D1:** Full Scribe spawn (LLM-powered) — not mechanical append. Scribe handles dedup, consolidation, and cross-agent propagation per its charter.
- **D2:** Manual command (`editless.flushDecisionsInbox`) always available. Auto-flush on session launch controlled by `editless.autoFlushOnSessionLaunch` setting (default: `true`, users can disable).
- **D3:** Scribe invocation defaults to the squad's existing launch command, but an `editless.scribeCommand` setting allows users to override with a lighter/cheaper model. Add a note in setting description that this is a good place to optimize token usage.
- **D4:** No-op silently when inbox is empty — no empty sessions, no empty commits.
- **D5:** Scribe session is ephemeral — fire-and-forget terminal. Closes or remains for user inspection after task completes (follow existing terminal behavior).
- **D6:** Flush buttons auto-hide when inbox is empty — no extra setting needed to gate the UI. Buttons only appear when there are items to flush.

## UX Specification

### Per-squad inline button
```
🚀 MySquad · ready · 📥 3    [↑ upgrade] [📥 flush]
```
- Inline icon `$(inbox)` on the squad row, group `inline@2` (after upgrade at `inline@1`)
- **Only visible** when that squad has inbox items: `when: viewItem == squad-has-inbox`
- Click → `editless.flushSquadInbox` — flushes THAT squad's inbox only
- Conditional visibility via `TreeItem.contextValue`: set to `squad-has-inbox` when `inboxCount > 0`, otherwise `squad`

**Important:** Changing contextValue means existing inline/context menu entries for squads (e.g., `editless.upgradeSquad` with `when: viewItem == squad`) must be updated to `when: viewItem == squad || viewItem == squad-has-inbox` so they continue working for both states.

### Global toolbar button
```
[📥 flush all] [🔄 refresh] [+ add] [📁 add squad] [↑ upgrade all]
```
- Icon `$(inbox)` in `view/title` navigation group
- **Only visible** when any squad has inbox items: `when: editless.anySquadHasInbox`
- Click → `editless.flushDecisionsInbox` — flushes ALL squads with pending inbox items
- Context key `editless.anySquadHasInbox` updated whenever tree refreshes

### Per-squad context menu
- Right-click squad → "Flush Decisions Inbox" (always visible in context menu, shows "already empty" if no items)

### Command palette
- "EditLess: Flush Decisions Inbox" — if multiple squads, shows QuickPick (or "All")

## Tasks

### T1: Context keys + inbox state tracking
**Files:** `src/editless-tree.ts`, `src/extension.ts`

- During tree refresh / squad scan, compute inbox count per squad
- Set `editless.anySquadHasInbox` context key (boolean) — true if any squad's inboxCount > 0
- Use contextValue `squad-has-inbox` vs `squad` per tree item based on that squad's inbox count
- This enables conditional visibility for both the inline button and global toolbar button
- **Must update** existing `when` clauses for squad actions (upgradeSquad, renameSquad, etc.) to match `viewItem == squad || viewItem == squad-has-inbox`

### T2: Flush commands + package.json menus
**Files:** `src/extension.ts`, `package.json`

Register two commands:
- `editless.flushDecisionsInbox` — global flush (all squads with items, or QuickPick)
- `editless.flushSquadInbox` — per-squad flush (receives tree item as argument)

Global flush with multiple squads: spawn Scribe terminals **sequentially** (one at a time) to avoid flooding with parallel terminals and token usage. Show progress notification: "Flushing inbox for {name}... (1/N)"

Both commands:
1. Check inbox for files → if empty, show "Inbox is already empty" and return
2. Spawn Scribe session (see T4 for invocation)

Add to `package.json`:
- Commands: both commands with title "Flush Decisions Inbox" / "Flush Squad Inbox", category "EditLess"
- `view/title`: `editless.flushDecisionsInbox` with `$(inbox)`, `when: editless.anySquadHasInbox`, navigation group
- `view/item/context`: `editless.flushSquadInbox` with `$(inbox)`, `when: viewItem == squad-has-inbox`, group `inline@2`
- `view/item/context`: `editless.flushSquadInbox` in right-click menu for all squads (`when: viewItem == squad || viewItem == squad-has-inbox` — command handler shows "empty" if no items)

### T3: Auto-flush setting + session launch hook
**Files:** `src/extension.ts`, `package.json`

Add setting:
```jsonc
"editless.autoFlushOnSessionLaunch": {
  "type": "boolean",
  "default": true,
  "description": "Automatically flush the decisions inbox before launching a new session. Spawns an ephemeral Scribe to merge pending decisions into decisions.md. Disable to save tokens."
}
```

Hook into session launch flow:
- Before creating a new agent/squad terminal session, check the setting
- If enabled, check if the relevant squad's inbox has files
- If non-empty → spawn Scribe, await completion, then proceed with the original session launch
- If empty → proceed immediately

Auto-flush **blocks** the session launch (awaits Scribe completion). The whole point is fresh context in decisions.md before the new agent reads it. Scribe tasks are fast (small files, lightweight model).

**Completion detection:** Watch the inbox directory — when all files in `.ai-team/decisions/inbox/` are deleted (Scribe's merge step removes them), the flush is complete. Use a `vscode.FileSystemWatcher` on the inbox dir with a timeout (e.g., 60s max). If the inbox empties → proceed. If timeout → proceed anyway with a warning toast ("Scribe may still be running"). For manual flush (T2), the terminal is fire-and-forget — no completion tracking needed.

### T4: Scribe invocation
**Files:** `src/scribe.ts` (new), `src/extension.ts`

Create `src/scribe.ts` with:
- `spawnScribe(squadConfig, task: string): Promise<vscode.Terminal>` — creates an ephemeral terminal
- Uses `editless.scribeCommand` setting if configured, otherwise falls back to the squad's `launchCommand`
- Terminal name: `"Scribe: {squad-name}"`
- Sends a task prompt that tells Scribe to flush the inbox per its charter

Add setting:
```jsonc
"editless.scribeCommand": {
  "type": "string",
  "default": "",
  "description": "Override the command used to invoke Scribe for inbox flushing and session logging. Leave empty to use the squad's default launch command. Tip: configure a lighter model here (e.g., claude-haiku) to optimize token usage for background tasks."
}
```

The Scribe terminal receives a task prompt like:
> "You are Scribe. Read your charter at `.ai-team/agents/scribe/charter.md`. Flush the decisions inbox: merge all files from `.ai-team/decisions/inbox/` into `decisions.md`, deduplicate, propagate cross-agent updates, and commit. Then exit."

### T5: Tests
**Files:** `src/__tests__/scribe.test.ts` (new), updates to existing test files

- **Context key tests:**
  - Squad with inbox items → contextValue is `squad-has-inbox`
  - Squad with empty inbox → contextValue is `squad`
  - `editless.anySquadHasInbox` set true/false based on aggregate state
- **Flush command tests:**
  - No squads → shows "no squads" message
  - One squad with empty inbox → shows "already empty" message
  - One squad with inbox files → spawns Scribe terminal
  - Multiple squads → shows QuickPick
  - Per-squad flush → only flushes the selected squad
- **Auto-flush tests:**
  - Setting enabled + non-empty inbox → Scribe spawned before session
  - Setting enabled + empty inbox → no Scribe, session proceeds
  - Setting disabled → no Scribe regardless of inbox state
- **Scribe invocation tests:**
  - Default: uses squad's launch command
  - Custom `scribeCommand` setting: uses override
  - Terminal created with correct name and cwd

## Out of Scope

- Mechanical (non-LLM) fallback for inbox merge — may revisit if token cost is a concern
- Scribe session logging (the full "log the session" part of Scribe's charter) — this issue is just inbox flush
- Per-squad auto-flush toggle — global setting is sufficient for MVP
