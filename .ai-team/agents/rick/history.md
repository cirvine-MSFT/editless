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
