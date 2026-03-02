# v0.1.4 Release: Triage & Bug Fixes

**Date:** 2026-03-02 UTC  
**Agents:** Rick (Lead, triage), Morty (Extension Dev, fixes)  
**Release Target:** Monday evening 2026-02-16  

## Summary

Rick triaged 3 critical bugs for v0.1.4. Morty implemented all 3 fixes:
- **#456**: CancellationError crash on shutdown (P1, commit a9d963e)
- **#458**: Resume session missing additionalArgs (P2, commit 1813805)
- **#457**: Resume session skips agent registration (P3, commit 4952ef8)

**Branch strategy:** All three fixes branch from `release/v0.1.x` (stable), not master (avoid 4 master-only commits).

**Status:** Fixes committed. Awaiting PR review & merge to release/v0.1.x.
