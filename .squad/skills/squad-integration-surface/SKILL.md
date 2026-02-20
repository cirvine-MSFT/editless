---
name: Squad Integration Surface
confidence: medium
source: earned
last_updated: 2026-02-20
---

# Squad Integration Surface

> How to analyze a Squad-managed project's integration surface for UI/tooling work.

## Pattern

Squad is a file-based coordination framework. All integration happens through reading and watching `.ai-team/` directory files. There is no runtime API, no IPC, no event bus.

## State Files and Their Purpose

| File | Format | Signal Type | Update Frequency |
|------|--------|-------------|-----------------|
| `team.md` | Markdown (## Members table) | Roster changes | Rare (team init/modify) |
| `decisions.md` | Markdown (### blocks) | Team decisions | After each Scribe merge |
| `decisions/inbox/*.md` | Markdown | **Real-time work signal** | During agent work |
| `agents/{name}/charter.md` | Markdown | Agent identity | At creation only |
| `agents/{name}/history.md` | Markdown | Agent learnings | After each session |
| `orchestration-log/*.md` | Markdown (table) | Spawn evidence | Per agent spawn |
| `log/*.md` | Markdown | Session diary | Per session |
| `skills/*/SKILL.md` | Markdown + frontmatter | Earned patterns | When skills extracted |
| `ceremonies.md` | Markdown (tables) | Ceremony config | Rare |
| `casting/registry.json` | JSON | Name mappings | Team modify |
| `casting/policy.json` | JSON | Universe config | At init |
| `plugins/marketplaces.json` | JSON | Plugin sources | User CLI command |

## Key Insight

The `decisions/inbox/` directory is the **heartbeat**. When agents work, files appear here. When Scribe merges, they disappear. Monitoring this directory gives the most accurate real-time picture of squad activity.

## Integration Priority Rule

When deciding what to surface in UI: **read frequency in Squad > write frequency**. `decisions.md` is read by every agent on every spawn — it's the most important shared state. `team.md` is read at session start. `history.md` is read at spawn time. Prioritize surfacing files proportional to how often Squad's own agents read them.

## Applicability

Any project building UI or tooling on top of Squad-managed teams.
