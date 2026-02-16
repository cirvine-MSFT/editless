### 2026-02-17: Session persistence — launchCommand stored in PersistedTerminalInfo
**By:** Morty (coding agent)
**Issue:** #94
**What:** `launchCommand` is persisted alongside terminal metadata in `workspaceState`, rather than looked up from the squad config at relaunch time.
**Why:** The squad config may not exist at relaunch (registry changed, squad removed, repo not yet loaded). Storing the command at launch time makes relaunch self-contained and removes the dependency on registry availability during crash recovery.

**Resume convention:** When `agentSessionId` is set, relaunch appends `--resume <sessionId>` to the persisted launch command. This is a convention that upstream CLIs (Copilot, Agency) can adopt. If a CLI uses a different resume flag, the convention can be overridden by storing a custom resume command pattern in the future.
