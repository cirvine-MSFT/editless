### 2026-02-19: Always wait for CI checks before merging PRs
**By:** Casey (via Copilot)
**What:** Squad agents must ALWAYS wait for all required CI checks (Lint/Build/Test, VS Code Integration Tests, scan) to pass before merging any PR. No exceptions — even when force-merging or using --admin flag. Never merge a PR with pending or failing checks.
**Why:** User directive — CI checks exist for a reason and must gate every merge, regardless of merge method.
