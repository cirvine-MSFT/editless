### Remove deprecated registry code from discovery.ts

**Date:** 2026-02-26  
**Author:** Rick  
**Status:** Implemented  
**Issue:** #399

**What:** Removed `RegistryLike` interface, `promptAndAddSquads()`, and `autoRegisterWorkspaceSquads()` from `discovery.ts`. These were marked `@deprecated — no longer called from extension code` but kept "for backward compatibility with existing tests."

**Why:** Dead code is dead code. The deprecation note preserved 100 lines of registry-pattern code and its test file (`discovery-commands.test.ts`, already deleted by Morty) purely out of caution. With the auto-discover refactor merged, there's no backward compatibility concern — no production code calls these functions. Keeping them increases maintenance burden and confuses future contributors about which pattern is canonical.

**Rule going forward:** When a function is deprecated as part of a refactor, remove it in the same PR. Don't defer cleanup to "later" — later never comes, and deprecated code accumulates. If tests exist solely for deprecated functions, remove those tests too.
