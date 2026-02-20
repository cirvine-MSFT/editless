### 2026-02-19: CLI provider abstraction replaced with inline settings

**By:** Morty

**What:** Removed the entire CLI provider abstraction layer (`src/cli-provider.ts`) and replaced it with direct `editless.cli.*` settings (command, launchCommand, createCommand). All consumers now read settings directly instead of going through provider resolution and probing.

**Why:** The generic provider infrastructure served no purpose — there was only one provider (Copilot CLI), no UI to switch providers, and the `execSync`-based version probing at startup was blocking extension activation (flagged in #107). The abstraction added complexity without providing value. Direct settings are simpler, faster (no startup probing), and easier to test (configuration mocks instead of provider module mocks).

**Affected files:**
- Deleted: `src/cli-provider.ts`, `src/__tests__/cli-provider.test.ts`
- Added settings: `editless.cli.command`, `editless.cli.launchCommand`, `editless.cli.createCommand`
- Updated: `src/extension.ts`, `src/discovery.ts`, `src/terminal-manager.ts`
- Test mocks updated in: `auto-refresh.test.ts`, `extension-commands.test.ts`, `discovery-commands.test.ts`, `discovery.test.ts`, `terminal-manager.test.ts`

**Pattern for future work:** If you find yourself building a "provider" abstraction with only one implementation and no UI to switch, inline it as direct settings instead. Provider patterns are only justified when runtime pluggability is needed.
