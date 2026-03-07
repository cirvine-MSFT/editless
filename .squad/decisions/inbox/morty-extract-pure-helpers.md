# Decision: Extract pure helpers for testability

**Date:** 2026-03-07
**Author:** Morty
**Context:** PR #507 review — regex parsing had zero test coverage because it was inline in `initAdoIntegration()` which requires full VS Code mocking.

**Decision:** When VS Code extension code contains pure logic (no `vscode` API calls), extract it as an exported helper function so it can be unit-tested with minimal mocking. Applied this to `parseAdoConnectionString()` in `extension-integrations.ts`.

**Rationale:** Pure functions are trivially testable. Keeping them inline in functions that depend on `vscode` forces tests to mock the entire VS Code API just to test string parsing. Extraction costs nothing and enables focused tests.

**Impact:** Future ADO or config parsing logic should follow this pattern — extract pure helpers, test them independently.
