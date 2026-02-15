# Project Context

- **Owner:** Casey Irvine (cirvine@microsoft.com)
- **Project:** EditLess — a VS Code extension for managing AI agents, terminal sessions, and work items. The "editorless IDE" panel.
- **Stack:** TypeScript, VS Code Extension API, esbuild, vitest
- **Created:** 2026-02-15
- **Repo:** cirvine-MSFT/editless (private)
- **Prototype:** Ported from tools-squad/extension. Redactor module removed. Rebranded from "Squad Dashboard" to "EditLess."
- **Target:** Internal Microsoft distribution by Monday 2026-02-16 via GitHub Releases (VSIX)

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

- **2026-02-16 — cli-provider.test.ts (#11):** `checkAgencyOnStartup` uses callback-based `exec`, so mocking with synchronous callback invocation works fine for most tests. For the "does not block" assertion, capture the callback without calling it to prove the function returns first. Use `vi.hoisted()` to define mock fns referenced by `vi.mock` factories — vitest hoists `vi.mock` above `const` declarations. The vscode mock in `src/__tests__/mocks/vscode.ts` doesn't have `globalState`; building a bespoke context mock with a `Map`-backed store is simpler and more flexible.
