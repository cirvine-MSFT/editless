# Inline Action Icons for Work Items & PRs

**Date:** 2026-02-24
**Author:** Summer (Product Designer)
**Status:** Proposed
**Requested by:** Casey Irvine

## Decision

Replace `$(play)` with `$(add)` for session launch on work item and PR leaf nodes. Keep `$(link-external)` for "Open in Browser." Two inline icons per item, consistent across both views.

## Rationale

### Why `$(add)` replaces `$(play)`

1. **Consistency with main tree.** The Agents view already uses `$(add)` for "Launch Session" on squad/agent nodes (`inline@0`). Work items and PRs perform the same action — creating a new terminal session. Same action → same icon.

2. **Casey's explicit ask.** _"There's maybe like a plus button that's like 'add a session.'"_ The `$(add)` icon directly maps to this mental model: you're _adding_ a session to your workspace, not _playing_ a recording.

3. **Semantic accuracy.** `$(play)` implies "run" or "resume" — a state transition on something that already exists. `$(add)` implies "create" — which is what actually happens. The user selects an agent from a QuickPick and a new terminal session is created. That's an "add" operation.

4. **No `$(play)` + `$(add)` dual icons.** Having both would raise the question "what's the difference?" The answer is nothing — they'd do the same thing. One icon, one meaning.

### Why `$(link-external)` stays

`$(link-external)` is VS Code's established convention for "open external URL" (used in Settings UI, built-in Git, etc.). Users already understand it. The `$(link-external)` collision with "Open in Squad UI" on squad nodes is a non-issue — squad nodes live in the Agents tree, not the Work Items or PRs trees. A user never sees both meanings simultaneously.

### Why only 2 inline icons

VS Code tree items get visually cluttered past 2-3 inline icons. Two icons keeps the layout clean and scannable. All supplementary actions (Go to Work Item, Go to PR) belong in the context menu where there's room for labels.

## Spec

### Inline Icons — Work Item Leaf Nodes

Applies to `viewItem =~ /^(work-item|ado-work-item|ado-parent-item)$/`

| Position | Icon | Command | Tooltip |
|---|---|---|---|
| `inline@0` | `$(add)` | `editless.launchFromWorkItem` | Launch with Agent |
| `inline@1` | `$(link-external)` | `editless.openInBrowser` | Open in Browser |

### Inline Icons — PR Leaf Nodes

Applies to `viewItem =~ /^(pull-request|ado-pull-request)$/`

| Position | Icon | Command | Tooltip |
|---|---|---|---|
| `inline@0` | `$(add)` | `editless.launchFromPR` | Launch with Agent |
| `inline@1` | `$(link-external)` | `editless.openInBrowser` | Open in Browser |

### Visual Layout (left → right)

```
Bug #1234: Fix login timeout     [+] [↗]
PR #567: Add retry logic          [+] [↗]
```

`[+]` = `$(add)` — primary action, leftmost, closest to label
`[↗]` = `$(link-external)` — secondary action, rightmost

### Command Icon Changes

Update the command definition for `editless.launchFromWorkItem` and `editless.launchFromPR`:

| Command | Current Icon | New Icon |
|---|---|---|
| `editless.launchFromWorkItem` | `$(play)` | `$(add)` |
| `editless.launchFromPR` | `$(play)` | `$(add)` |

### Position Changes

| Item | Current | New |
|---|---|---|
| Work item "Open in Browser" | `inline` (no position) | `inline@1` |
| Work item "Launch with Agent" | `inline@10` | `inline@0` |
| PR "Open in Browser" | `inline` (no position) | `inline@1` |
| PR "Launch with Agent" | `inline@10` | `inline@0` |

## Context Menu

The right-click menu complements the inline icons with labeled entries. Every inline action should also appear in the context menu (discoverability — users who don't recognize an icon can right-click to find the same action with a text label).

### Work Item Context Menu

| Group | Command | Label |
|---|---|---|
| `work-item@1` | `editless.launchFromWorkItem` | Launch with Agent |
| `work-item@2` | `editless.openInBrowser` | Open in Browser |
| `work-item@3` | `editless.goToWorkItem` | Go to Work Item |

### PR Context Menu

| Group | Command | Label |
|---|---|---|
| `pull-request@1` | `editless.launchFromPR` | Launch with Agent |
| `pull-request@2` | `editless.openInBrowser` | Open in Browser |
| `pull-request@3` | `editless.goToPRInBrowser` | Go to PR |

### Context Menu vs Inline Decision

| Action | Inline? | Context Menu? | Why |
|---|---|---|---|
| Launch with Agent | ✅ | ✅ | Primary action — needs maximum discoverability |
| Open in Browser | ✅ | ✅ | Common action — icon is universally understood, but label helps |
| Go to Work Item / Go to PR | ❌ | ✅ | Tertiary action — would clutter inline; context menu is sufficient |

## Migration Notes

- The `editless.launchFromWorkItem` and `editless.launchFromPR` command definitions change their `icon` property from `$(play)` to `$(add)`.
- The `view/item/context` menu entries change their `group` positions as specified above.
- No new commands are needed. No command IDs change.
- The `$(play)` icon is fully removed from the work items and PR views.

## Consistency Matrix

| View | Primary Action | Icon | Secondary Action | Icon |
|---|---|---|---|---|
| Agents tree (squad/agent) | Launch Session | `$(add)` | — | — |
| Work Items tree (leaf) | Launch with Agent | `$(add)` | Open in Browser | `$(link-external)` |
| PRs tree (leaf) | Launch with Agent | `$(add)` | Open in Browser | `$(link-external)` |

All three views now use `$(add)` for "create a session." One icon vocabulary across the entire extension.
