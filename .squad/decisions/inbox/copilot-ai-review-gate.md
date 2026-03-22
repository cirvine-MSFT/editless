### 2026-03-22: Merge-blocking AI review gate on `master`

**By:** Casey Irvine (via Copilot)
**What:** PRs targeting `master` now require the `AI Review` status check in addition to the existing CI checks. Human approvals remain optional (`0` required approvals), but merge still requires passing checks and resolved conversations. The `AI Review` gate verifies that a GitHub Copilot review or review comment exists on non-draft PRs, and relies on GitHub Copilot PR review being enabled for the repository.
**Why:** This keeps the repository open to contributor PRs and agent merge flows without manual approval bottlenecks, while still enforcing a merge-blocking automated review gate before changes land on `master`.
