# Resume External Session — UX Spec

**Author:** Summer (Product Designer)  
**Date:** 2026-02-24  
**Issue:** #415  
**Context:** User request from jnichols0 to resume Copilot CLI sessions started outside EditLess

---

## Problem

EditLess can only resume sessions it already knows about (via `PersistedTerminalInfo`). Sessions started in raw Copilot CLI outside the extension have no persisted metadata, so users can't resume them from the sidebar.

The Copilot CLI stores all sessions in `~/.copilot/session-state/{guid}/`, each with `workspace.yaml`, `events.jsonl`, and other metadata. These sessions are resumable via `copilot --resume {guid}`, but there's no UI to access them.

**User need:** "I started a session in a standalone terminal. I want to resume it from EditLess without typing the GUID manually."

---

## Design Goals

1. **Discoverable** — users can find the feature when they need it
2. **Searchable** — finding the right session among dozens should be fast
3. **Informative** — show enough context to pick the right session (summary, date, path)
4. **Lightweight** — this is a v0.1.3 quick win, not a full session browser
5. **Agent-scoped** — resume makes sense per agent, not globally

---

## 1. Entry Points

### Primary: Context menu on agent tree items

**Location:** Right-click on any agent (squad or default Copilot CLI) in the sidebar tree

**Menu item:**
```
Resume External Session...
```

**Rationale:**
- Contextual — you're picking an agent, then picking a session for that agent
- Consistent with existing "Launch Session" action placement
- Discoverable — right-click is the natural exploration path for power users

### Secondary: Command palette

**Command:** `EditLess: Resume External Session`

**Behavior:**
1. If a session terminal is currently focused → pre-select that agent's sessions
2. Otherwise → show agent picker first, then session picker

**Rationale:**
- Command palette is for keyboard-first users
- Still needs agent context before showing sessions

### Not included in v0.1.3:
- ❌ Inline tree button (would clutter toolbar)
- ❌ Global "Resume Any Session" command (loses agent context)
- ❌ Status bar entry point (not discoverable enough)

---

## 2. Picker Design

### Step 1: Session QuickPick

VS Code `QuickPick` with:

**Title:** `Resume Session — {agent-icon} {agent-name}`

**Placeholder:** `Search by summary, branch, or GUID...`

**Items:**

Each session is displayed as:

```
{summary-first-100-chars}
{relative-time} · {branch} · {cwd-basename}
```

**Example items:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ Resume Session — 🚀 Alpha Squad                                     │
├─────────────────────────────────────────────────────────────────────┤
│ ⏎ Search by summary, branch, or GUID...                            │
├─────────────────────────────────────────────────────────────────────┤
│ ● Fix login validation bug in auth module                          │
│   2 hours ago · squad/213-fix-login · editless                     │
├─────────────────────────────────────────────────────────────────────┤
│ ● Add documentation for session resume feature                     │
│   1 day ago · squad/415-resume-external · editless                 │
├─────────────────────────────────────────────────────────────────────┤
│ ● Implement hierarchical filter UX for work items                  │
│   3 days ago · squad/390-filter-hierarchy · editless               │
├─────────────────────────────────────────────────────────────────────┤
│ $(note) Paste GUID directly                                        │
│   Enter a session GUID manually                                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Item Structure

**Label (line 1):**
- Icon: `$(circle-filled)` for recent sessions (< 7 days), `$(circle-outline)` for older
- Summary text from `workspace.yaml` (truncated to 100 chars)

**Description (line 2):**
- Relative time (Last modified on `events.jsonl`): "2 hours ago", "3 days ago", "Jan 15"
- Branch name from `workspace.yaml` (or "—" if missing)
- CWD basename (not full path — too long)

**Detail (tooltip):**
```
Full path: C:\Users\cirvine\code\work\editless
Session ID: 00031334-f9b2-4f01-ae31-37d7231db0a0
Last activity: 2 hours ago
Branch: squad/213-fix-login
Status: resumable
```

**Last item (special):**
- Label: `$(note) Paste GUID directly`
- Description: `Enter a session GUID manually`
- Triggers: InputBox for manual GUID entry

### Sorting & Scoping — Show ALL sessions, not just CWD-matched

**IMPORTANT (Casey directive):** The picker MUST show ALL sessions from `~/.copilot/session-state/`, not only those matching the current agent's CWD. The whole point is resuming sessions started outside EditLess — these may come from any directory, any project, any context.

**Default sort order:**
1. CWD-matched sessions first (sessions whose `workspace.yaml` CWD matches the current workspace) — these are most likely what the user wants
2. Within each group, sorted by last modified descending (most recent first)
3. Non-matched sessions follow, also sorted by recency
4. Sessions updated within last 7 days get `$(circle-filled)` icon; older get `$(circle-outline)`

### Search/Filter Behavior

VS Code QuickPick provides built-in fuzzy search. Users can type:
- Summary keywords: "login", "documentation"
- Branch name: "squad/213", "main"
- GUID fragments: "00031334", "f9b2"
- CWD path: "editless", "tools-squad"

The QuickPick matches across all visible text (label + description).

### Empty State

**No sessions found for agent:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ Resume Session — 🚀 Alpha Squad                                     │
├─────────────────────────────────────────────────────────────────────┤
│ No external sessions found                                          │
│   No sessions in ~/.copilot/session-state matched this agent       │
├─────────────────────────────────────────────────────────────────────┤
│ $(note) Paste GUID directly                                        │
│   Enter a session GUID manually                                    │
└─────────────────────────────────────────────────────────────────────┘
```

**All sessions in state dir (no CWD filter):**

```
┌─────────────────────────────────────────────────────────────────────┐
│ Resume Session — $(copilot) Copilot CLI                            │
├─────────────────────────────────────────────────────────────────────┤
│ ⏎ Search by summary, branch, or GUID...                            │
├─────────────────────────────────────────────────────────────────────┤
│ ○ Session in different project                                     │
│   5 days ago · main · other-project                                │
├─────────────────────────────────────────────────────────────────────┤
│ ○ Another external session                                         │
│   1 week ago · feature/xyz · tools-squad                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Flow

### Happy Path: Resume via picker

1. User right-clicks agent "🚀 Alpha Squad" → **Resume External Session...**
2. EditLess scans `~/.copilot/session-state/` for sessions matching agent's `squadPath` (via CWD in `workspace.yaml`)
3. QuickPick opens showing matched sessions, sorted by last modified
4. User types "login" → QuickPick filters to sessions with "login" in summary
5. User presses Enter on "Fix login validation bug..."
6. EditLess validates session is resumable (checks `workspace.yaml` + `events.jsonl` exist)
7. New terminal launches with `copilot --agent squad --resume 00031334-f9b2-4f01-ae31-37d7231db0a0`
8. Terminal appears in agent's session list with name "🚀 Fix login validation bug"

### Alternative Path: Manual GUID entry

1. User right-clicks agent → **Resume External Session...**
2. QuickPick opens
3. User selects "$(note) Paste GUID directly"
4. InputBox appears: "Enter session GUID to resume"
5. User pastes `00031334-f9b2-4f01-ae31-37d7231db0a0`
6. EditLess validates session is resumable
7. Terminal launches with resume command

### Keyboard-First Path: Command palette

1. User presses Ctrl+Shift+P → types "resume"
2. Selects **EditLess: Resume External Session**
3. Agent picker appears (all squads + default CLI)
4. User picks "🚀 Alpha Squad"
5. Session QuickPick opens → same flow as above

---

## 4. Edge Cases

### No sessions found for agent

**Scenario:** Agent's `squadPath` has never been used in a Copilot CLI session

**Behavior:**
- QuickPick shows empty state (see design above)
- "Paste GUID directly" option still available
- User can manually enter any GUID from a different project

**Message:** No error toast. The empty picker is self-explanatory.

### Invalid GUID pasted

**Scenario:** User enters malformed GUID or non-existent session ID

**Validation:**
1. Check GUID format: `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`
2. Check session directory exists: `~/.copilot/session-state/{guid}/`
3. Run `SessionContextResolver.isSessionResumable(guid)`

**Error message (toast):**
```
Cannot resume session: Session {guid} not found or is not resumable. Check the GUID and try again.
```

### Session already active in EditLess

**Scenario:** User tries to resume a session that's already running in an EditLess-tracked terminal

**Detection:**
- Check `TerminalManager._terminals` for any entry with matching `agentSessionId`

**Behavior:**
- Don't show the session in the picker (pre-filter during scan)
- If manually entered, show warning toast:
  ```
  Session {guid} is already active. Use "Focus Session" to switch to it.
  ```
- Optionally: focus the existing terminal instead of showing error

### Session not resumable (missing files)

**Scenario:** Session directory exists but `workspace.yaml` or `events.jsonl` is missing

**Behavior:**
- Session appears in picker with warning icon: `$(warning) {summary}`
- Description includes: `not resumable`
- On selection, show error (same as existing relaunch validation):
  ```
  Cannot resume session: Session {guid} has no workspace.yaml — session state is missing or corrupted.
  ```

### Stale session (> 14 days old)

**Scenario:** Session exists but hasn't been touched in over 14 days

**Behavior:**
- Session appears in picker with stale icon: `$(archive) {summary}`
- Description includes: `{date} (stale)`
- On selection, show warning (same as existing relaunch):
  ```
  ⚠️ Session {guid} has not been updated in over 14 days. It may be outdated.
  ```
- Resume proceeds (non-blocking warning)

### No session-state directory

**Scenario:** `~/.copilot/session-state` doesn't exist (fresh Copilot CLI install)

**Behavior:**
- QuickPick shows empty state
- "Paste GUID directly" option available
- No error toast — user hasn't done anything wrong

---

## 5. Naming

### Command Names

| Command ID | Display Name | Menu Label |
|------------|--------------|------------|
| `editless.resumeExternalSession` | Resume External Session | Resume External Session... |

### QuickPick Text

| Element | Text |
|---------|------|
| Title | `Resume Session — {icon} {agent-name}` |
| Placeholder | `Search by summary, branch, or GUID...` |
| Empty state label | `No external sessions found` |
| Empty state description | `No sessions in ~/.copilot/session-state matched this agent` |
| Manual GUID item label | `$(note) Paste GUID directly` |
| Manual GUID item description | `Enter a session GUID manually` |

### InputBox Text (manual GUID)

| Element | Text |
|---------|------|
| Prompt | `Enter session GUID to resume` |
| Placeholder | `00000000-0000-0000-0000-000000000000` |
| Validation error | `Invalid GUID format` |

### Terminal Naming

**New terminal name:**
```
{agent-icon} {session-summary-first-50-chars}
```

Example: `🚀 Fix login validation bug in auth module`

**If summary is empty:** Use fallback `{agent-icon} Resumed Session`

---

## 6. Mockup

### Full QuickPick with Sessions

```
╔═════════════════════════════════════════════════════════════════════╗
║ Resume Session — 🚀 Alpha Squad                                     ║
╠═════════════════════════════════════════════════════════════════════╣
║ ⏎ Search by summary, branch, or GUID...                            ║
╠═════════════════════════════════════════════════════════════════════╣
║                                                                     ║
║ ● Fix login validation bug in auth module                          ║
║   2 hours ago · squad/213-fix-login · editless                     ║
║                                                                     ║
║ ● Add documentation for session resume feature                     ║
║   1 day ago · squad/415-resume-external · editless                 ║
║                                                                     ║
║ ● Implement hierarchical filter UX for work items                  ║
║   3 days ago · squad/390-filter-hierarchy · editless               ║
║                                                                     ║
║ ○ Review PR feedback and update tests                              ║
║   Jan 15 · main · editless                                         ║
║                                                                     ║
║ ⚠ Debug terminal state persistence issues                          ║
║   Jan 10 · bugfix/terminal-state · editless (not resumable)        ║
║                                                                     ║
║ ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――― ║
║                                                                     ║
║ $(note) Paste GUID directly                                        ║
║   Enter a session GUID manually                                    ║
║                                                                     ║
╚═════════════════════════════════════════════════════════════════════╝
```

### Search Filtered

```
╔═════════════════════════════════════════════════════════════════════╗
║ Resume Session — 🚀 Alpha Squad                                     ║
╠═════════════════════════════════════════════════════════════════════╣
║ login                                                               ║
╠═════════════════════════════════════════════════════════════════════╣
║                                                                     ║
║ ● Fix login validation bug in auth module                          ║
║   2 hours ago · squad/213-fix-login · editless                     ║
║                                                                     ║
╚═════════════════════════════════════════════════════════════════════╝
```

### Empty State

```
╔═════════════════════════════════════════════════════════════════════╗
║ Resume Session — 🚀 Alpha Squad                                     ║
╠═════════════════════════════════════════════════════════════════════╣
║ ⏎ Search by summary, branch, or GUID...                            ║
╠═════════════════════════════════════════════════════════════════════╣
║                                                                     ║
║ No external sessions found                                         ║
║   No sessions in ~/.copilot/session-state matched this agent       ║
║                                                                     ║
║ ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――― ║
║                                                                     ║
║ $(note) Paste GUID directly                                        ║
║   Enter a session GUID manually                                    ║
║                                                                     ║
╚═════════════════════════════════════════════════════════════════════╝
```

### Manual GUID InputBox

```
╔═════════════════════════════════════════════════════════════════════╗
║ Enter session GUID to resume                                       ║
╠═════════════════════════════════════════════════════════════════════╣
║ 00000000-0000-0000-0000-000000000000                                ║
╚═════════════════════════════════════════════════════════════════════╝
```

---

## Implementation Notes

### Session Discovery Logic

**Scan strategy:**

1. Read all directories in `~/.copilot/session-state/`
2. For each dir, read `workspace.yaml` → parse `cwd` field and `summary`
3. Normalize paths (lowercase, forward slashes, trim trailing slashes)
4. Check if `cwd` matches current workspace folder → mark as "local" (sort to top)
5. Filter out sessions already tracked by `TerminalManager` (check `agentSessionId`)
6. Read `events.jsonl` last modified time → sort: local-first, then by recency
7. ALL sessions are shown — non-matching CWDs are included (sorted lower, not excluded)

**Performance:**
- Only scan once per command invocation (not on picker keystroke)
- For projects with hundreds of sessions, consider caching in `SessionContextResolver._cwdIndex`
- Timeout: if scan takes > 2 seconds, show "Loading..." placeholder

### Resumability Check

Reuse existing `SessionContextResolver.isSessionResumable(guid)` logic:
- ✅ `workspace.yaml` exists and readable
- ✅ `events.jsonl` exists and readable
- ⚠️ Stale if last modified > 14 days ago

### Terminal Launch

Same flow as `relaunchSession()` in `TerminalManager`:

1. Build command: `{baseCmd} --resume {guid}`
2. Create terminal with env vars:
   - `EDITLESS_SESSION_ID={guid}`
   - `EDITLESS_SQUAD_ID={squadId}`
3. Register terminal in `_terminals` map
4. Start session watcher for activity tracking

**Terminal metadata:**
- `agentSessionId`: the resumed GUID
- `displayName`: from `workspace.yaml` summary (or fallback to "Resumed Session")
- `squadId`, `squadName`, `squadIcon`: from agent config
- `launchCommand`: for future relaunch
- `squadPath`: from agent config

---

## Out of Scope (Future Enhancements)

❌ **Rich session browser:** Timeline view, checkpoint history, file tree  
❌ **Cross-agent session resume:** Resume a Squad session as default CLI  
❌ **Session tags/favorites:** Bookmark frequently resumed sessions  
❌ **Auto-suggest recent sessions:** Show recent external sessions in agent tree  
❌ **Session archival:** Move old sessions to archive, hide from picker  
❌ **Multi-select resume:** Resume multiple sessions at once  
❌ **Session diff preview:** Show what changed since last checkpoint  

---

## Success Metrics (Post-Launch)

1. **Usage:** % of users who resume external sessions vs. only EditLess-launched sessions
2. **Discovery:** Search usage vs. manual GUID entry (should favor search)
3. **Error rate:** % of resume attempts that fail validation
4. **Time to resume:** Median time from right-click to session loaded

---

## Acceptance Criteria

✅ User can right-click agent → Resume External Session  
✅ QuickPick shows sessions from `~/.copilot/session-state/` matching agent's CWD  
✅ Search filters by summary, branch, GUID, and CWD  
✅ Manual GUID entry option available  
✅ Invalid/missing sessions show clear error messages  
✅ Stale sessions show warning but allow resume  
✅ Already-active sessions are filtered from picker  
✅ Resumed terminal appears in agent's session list with appropriate metadata  
✅ Command palette variant works (agent picker → session picker)  

---

## Design Rationale

### Why agent-scoped, not global?

**Rejected:** Global "Resume Any Session" command with all sessions from all projects

**Reasoning:**
- Sessions are tied to a project/CWD → resuming in the wrong context is confusing
- Agent-scoped matches existing mental model (agent = project context)
- Reduces picker clutter (filter sessions by relevance)

**Concession:** Manual GUID entry allows power users to resume any session if needed

### Why QuickPick, not tree view integration?

**Rejected:** Show external sessions as gray/orphaned items in agent tree

**Reasoning:**
- Tree is for active sessions — external sessions are ephemeral discovery
- Scanning `session-state` on every tree refresh is expensive
- External sessions may number in the hundreds (tree clutter)

**Concession:** If usage shows demand, Phase 2 could add "Recent External" tree section

### Why show stale/non-resumable sessions?

**Rejected:** Hide sessions that fail `isSessionResumable()`

**Reasoning:**
- Users may be debugging why a session won't resume (file missing)
- Showing with warning icon signals "something's wrong, but I can see it"
- Picker is searchable — if user searches for a GUID, they expect to find it

**Safety:** Non-resumable sessions show error on selection, not on picker render

---

## Related Decisions

- **#322: Session resume validation** — reuse validation logic for external sessions
- **#317: Unified discovery flow** — similar picker pattern (discovered items → action)
- **Hierarchical filter UX** — QuickPick with sections + search is proven pattern

---

**Next Steps:**

1. Morty: Implement `editless.resumeExternalSession` command
2. Morty: Add session scan logic using `SessionContextResolver._ensureIndex()`
3. Morty: Wire QuickPick with session items + manual GUID fallback
4. Summer: Review implementation UX against this spec
5. Casey: Test with real external sessions (dogfood with raw CLI)
