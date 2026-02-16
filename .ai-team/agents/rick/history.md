# Project Context

- **Owner:** Casey Irvine (cirvine@microsoft.com)
- **Project:** EditLess — a VS Code extension for managing AI agents, terminal sessions, and work items. The "editorless IDE" panel.
- **Stack:** TypeScript, VS Code Extension API, esbuild, vitest
- **Created:** 2026-02-15
- **Repo:** cirvine-MSFT/editless (private)
- **Prototype:** Ported from tools-squad/extension. Redactor module removed. Rebranded from "Squad Dashboard" to "EditLess."
- **Target:** Internal Microsoft distribution by Monday 2026-02-16 via GitHub Releases (VSIX)
- **User:** Casey is new to GitHub workflows (experienced with ADO). Explain GitHub concepts clearly.

## Learnings

### 2026-02-16: Go-live audit findings — one critical enum mismatch
Pre-release audit (issue #87) found EditLess is production-ready except for one critical blocker: `cli.provider` enum includes `"custom"` but KNOWN_PROFILES in cli-provider.ts does not define a custom profile. When user sets the setting to "custom", resolution fails silently and falls back to auto-detection, confusing UX. Fix: add `{ name: 'custom', command: '', versionCommand: '' }` to KNOWN_PROFILES so custom provider registers with no version/update capabilities (matches decision: custom CLIs get presence-only detection). Secondary findings: settings all follow naming conventions and have sensible defaults, no sensitive terms found (openai/coeus completely removed per decisions), test fixtures use generic names, feature detection is progressive and correct, notification toggles work properly. Documentation gap: README doesn't explain available settings yet (non-blocking, can be post-release patch).

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-02-15: Vitest mock type signature pattern
Vitest `vi.fn()` does NOT use the `vi.fn<[args], return>` type syntax. Use `.mockResolvedValue()` or `.mockReturnValue()` to set the return type. Example: `vi.fn().mockResolvedValue(undefined as T)` for async mocks. This tripped up the cli-provider tests — the `<[string, ...string[]], Promise<string | undefined>>` syntax is invalid and causes TypeScript errors.

### 2026-02-15: PR #14 generalized CLI update infrastructure — approved
Reviewed Morty's refactor of agency-specific update logic into provider-generic infrastructure. The abstraction is solid and scales cleanly. Three optional fields on CliProvider (`updateCommand`, `upToDatePattern`, `updateRunCommand`) control per-provider update support. Cache keys are per-provider using `editless.{providerName}UpdatePrompt`. The interface is clean and doesn't force providers to have update capabilities — providers without `updateCommand` are silently skipped. Tests cover multi-provider scenarios, cache isolation, and backward compat. `checkAgencyOnStartup` deprecated but still exported — that's the right balance for a recent API. All existing tests pass. The loop in `checkProviderUpdatesOnStartup` handles concurrent checks safely (async exec callbacks don't block). **Approved.** This will scale to copilot/claude when we learn their update mechanisms.

### 2026-02-16: PR #12 session persistence — approved with observations
Reviewed terminal session persistence implementation. Solves the Developer Window reload bug where terminals survived but disappeared from sidebar. Implementation uses workspaceState for persistence and name-based reconciliation on activation. **Decision: APPROVED.** Code is clean, tests are comprehensive (11 passing tests covering edge cases), and the design tradeoffs are reasonable for this use case. Name-based matching is pragmatic — VS Code doesn't provide terminal IDs across reloads, and name collisions are unlikely in practice (terminals are named with timestamp + squad icon). Serialization on every terminal change could theoretically cause perf issues with hundreds of terminals, but that's not a realistic scenario for this extension. The reconcile/persist pattern correctly handles orphaned entries (cleaned on reconcile), counter restoration (prevents index collisions), and onDidCloseTerminal race conditions (separate Map mutations from persistence). TypeScript is strict and clean. One minor edge case: if a user manually renames a terminal, reconciliation will fail silently for that terminal — acceptable tradeoff since manual rename is rare and explicitly breaks the contract. This is good engineering: solves the real problem, tests the edges, doesn't over-engineer hypotheticals.
