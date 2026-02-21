# Decision: Windows shell quoting in ProcessPool integration tests

**Author:** Meeseeks (Tester)
**Date:** 2026-02-20
**Context:** ACP ProcessPool #370

## Decision

When writing integration tests that spawn real child processes via `ProcessPool` (which uses `spawn()` with `shell: true`), avoid `console.log()`, `console.error()`, and single-quoted string literals in `-e`/`-p` arguments. On Windows, `shell: true` routes through `cmd.exe` which interprets parentheses as grouping operators and strips single quotes.

**Safe patterns:**
- `node --version` (no special chars)
- `node -e "process.exit(42)"` (exit code testing — parens work because cmd.exe sees them inside double quotes from spawn's auto-quoting)
- `node -e "process.stderr.write('oops\\n');process.exit(1)"` (stderr — works when no outer quoting conflict)
- `node -p "'string'"` does NOT work (single quotes stripped by cmd.exe)

**Why this matters:** ProcessPool uses `shell: true` for the real ACP use case. Integration tests must respect the same quoting constraints users will encounter.
