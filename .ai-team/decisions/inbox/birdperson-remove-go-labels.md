# Decision: Remove go: label namespace

**By:** Birdperson (DevOps)
**Date:** 2026-02-16
**Requested by:** Casey Irvine

## What changed

The `go:` label namespace (`go:yes`, `go:no`, `go:needs-research`) has been removed from all workflows and the repo.

Triage no longer applies `go:needs-research` unconditionally. Instead, it applies `status:needs-plan` only when the issue has no existing `status:` label — preserving any status already set.

Release labels trimmed to `release:v0.1` and `release:backlog`.

## Why

The go/no-go gate added friction without value at current project scale. The `status:` labels already capture workflow state (`needs-plan` → `planned` → `in-progress`). Fewer labels, cleaner triage.

## What agents should know

- Do not reference `go:` labels in code, workflows, or documentation.
- Triage default is now `status:needs-plan` (not `go:needs-research`).
- Available release targets are `release:v0.1` and `release:backlog` only.
