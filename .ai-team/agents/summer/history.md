# Project Context

- **Owner:** Casey Irvine (cirvine@microsoft.com)
- **Project:** EditLess — a VS Code extension for managing AI agents, terminal sessions, and work items. The "editorless IDE" panel.
- **Stack:** TypeScript, VS Code Extension API, esbuild, vitest
- **Created:** 2026-02-15
- **Repo:** cirvine-MSFT/editless (private)
- **Prototype:** Ported from tools-squad/extension. Redactor module removed. Rebranded from "Squad Dashboard" to "EditLess."
- **Target:** Internal Microsoft distribution by Monday 2026-02-16 via GitHub Releases (VSIX)
- **Taglines:** "Leave the editor for your mind" · "Plan, delegate, and review your AI team's work"

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

📌 Team update (2026-02-16): Squad folder rename — `.squad/` support added with `.ai-team/` backward compatibility via `src/team-dir.ts` utility. Any future code that needs to locate the team directory must use `resolveTeamDir()` or `resolveTeamMd()` — never hardcode paths. — decided by Morty

📌 Team update (2026-02-16): Label taxonomy simplified — `go:` namespace (go:yes, go:no, go:needs-research) removed. Triage now applies `status:needs-plan` only when no existing `status:` label exists. Release labels limited to `release:v0.1` and `release:backlog`. — decided by Birdperson

📌 Team update (2026-02-16): Casey's voice in personal narratives — Conversational, enthusiastic, and authentic. Use short declarative sentences for impact and preserve casual phrasing. Edits should be light-touch—fixing grammar without changing the natural, personal tone. — decided by Summer

📌 Documentation pattern (2026-02-16): Philosophy vs. Story docs — `docs/story.md` is Casey's personal narrative (how EditLess came to be). `docs/philosophy.md` is the "why" (why editorless development matters, what the shift looks like). Story is emotional/personal; Philosophy is intellectual/universal. Don't conflate them. Cross-reference them instead. — decided by Summer

