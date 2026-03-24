### 2026-03-23: `master` PRs require one human approval

**By:** Casey Irvine (via Copilot)
**What:** Removed the AI review gate and automatic Copilot review policy for `master`. Pull requests targeting `master` now require the existing CI checks, resolved conversations, and one human approving review. GitHub does not count the pull request author's own approval toward the required review count. Admin enforcement remains off, so repository owners and admins can still bypass these protections if needed.
**Why:** This is simpler and more predictable than the AI review gate while still requiring a real human review signal for contributor pull requests.
