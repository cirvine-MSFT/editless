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

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-02-15: Vitest mock type signature pattern
Vitest `vi.fn()` does NOT use the `vi.fn<[args], return>` type syntax. Use `.mockResolvedValue()` or `.mockReturnValue()` to set the return type. Example: `vi.fn().mockResolvedValue(undefined as T)` for async mocks. This tripped up the cli-provider tests — the `<[string, ...string[]], Promise<string | undefined>>` syntax is invalid and causes TypeScript errors.

### 2026-02-15: PR #14 generalized CLI update infrastructure — approved
Reviewed Morty's refactor of agency-specific update logic into provider-generic infrastructure. The abstraction is solid and scales cleanly. Three optional fields on CliProvider (`updateCommand`, `upToDatePattern`, `updateRunCommand`) control per-provider update support. Cache keys are per-provider using `editless.{providerName}UpdatePrompt`. The interface is clean and doesn't force providers to have update capabilities — providers without `updateCommand` are silently skipped. Tests cover multi-provider scenarios, cache isolation, and backward compat. `checkAgencyOnStartup` deprecated but still exported — that's the right balance for a recent API. All existing tests pass. The loop in `checkProviderUpdatesOnStartup` handles concurrent checks safely (async exec callbacks don't block). **Approved.** This will scale to copilot/claude when we learn their update mechanisms.
