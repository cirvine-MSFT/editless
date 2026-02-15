# EditLess Workflow: Plan → Execute → Review

> Reference doc for all agents. See `decisions.md` for the rationale behind these choices.

## Label Scheme

All labels use `prefix:value` syntax. Labels are mutually exclusive within their namespace.

### Categories

| Prefix | Purpose | Exclusive? | Example |
|--------|---------|------------|---------|
| `type:` | What kind of work | Yes | `type:feature`, `type:bug` |
| `priority:` | How urgent | Yes | `priority:p0` |
| `status:` | Workflow state | Yes | `status:planned` |
| `squad:` | Agent assignment | No (can have multiple) | `squad:morty` |
| `release:` | When it ships | Yes | `release:v0.5.0` |
| `go:` | Decision gate | Yes | `go:yes` |

Standalone: `duplicate` (no namespace)

### Status Lifecycle

```
status:needs-plan → status:planned → status:in-progress → [close issue]
                                                        ↘ status:review → [close issue]
```

| Status | Meaning | Who transitions |
|--------|---------|-----------------|
| `status:needs-plan` | Needs design before implementation | Coding session adds; Planning session removes |
| `status:planned` | Plan exists, ready to execute | Planning session adds |
| `status:in-progress` | Agent actively working | Coding session adds/removes |
| `status:review` | Needs HUMAN review | Agent reviewer adds |

No `done` label — closing the issue IS done.

## Workflow Steps

### 1. Triage
- Issues created by Casey or agents
- Coding session evaluates: can it execute confidently?
- Yes → work directly (skip to Execute)
- No → add `status:needs-plan`

### 2. Plan (Planning Session)
- Pick up `status:needs-plan` issues
- Create implementation plan as a **linked plan file**
- Post comment on issue linking to plan
- Transition: remove `status:needs-plan`, add `status:planned`

### 3. Execute (Coding Session)
- Pick up `status:planned` issues (skip `release:backlog`)
- Add `status:in-progress`
- Branch: `squad/{issue-number}-{slug}`
- Open draft PR with `Closes #{number}`
- Remove `status:in-progress`

### 4. Review
**Simple (most PRs):** Agent approves → squash merge → issue closes
**Complex:** Agent adds `status:review` + `⚠️ Needs human review: {reason}` → blocks until Casey reviews

## Cross-Platform (GitHub ↔ ADO)

Portable labels (use identically on both): `status:`, `squad:`, `go:`
GitHub-only (ADO has native equivalents): `type:`, `priority:`
