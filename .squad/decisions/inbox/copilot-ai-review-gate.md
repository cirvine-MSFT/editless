### 2026-03-22: Merge-blocking AI review gate on `master`

**By:** Casey Irvine (via Copilot)
**What:** PRs targeting `master` now require the `AI Review` status check in addition to the existing CI checks. Human approvals remain optional (`0` required approvals), but merge still requires passing checks and resolved conversations. Non-draft PRs automatically request GitHub Copilot review.
**Why:** This keeps the repository open to contributor PRs and agent merge flows without manual approval bottlenecks, while still enforcing a merge-blocking automated review gate before changes land on `master`.
