### 2026-02-16: Remove go:* labels, fix triage to use status: labels
**By:** Casey Irvine (via Copilot)
**What:** Remove the entire go:* label namespace (go:yes, go:no, go:needs-research). Release labels are only release:v0.1 and release:backlog. Triage should apply status:needs-plan or status:planned instead of go:needs-research, and must NOT overwrite existing status: labels.
**Why:** User request — simplifying the label scheme and fixing triage overwrite behavior.
