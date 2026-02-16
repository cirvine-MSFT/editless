# Project Context

- **Owner:** Casey Irvine (cirvine@microsoft.com)
- **Project:** EditLess — a VS Code extension for managing AI agents, terminal sessions, and work items. The "editorless IDE" panel.
- **Stack:** TypeScript, VS Code Extension API, esbuild, vitest
- **Created:** 2026-02-15
- **Repo:** cirvine-MSFT/editless (private)
- **Prototype:** Ported from tools-squad/extension. Redactor module removed. Rebranded from "Squad Dashboard" to "EditLess."
- **Target:** Internal Microsoft distribution by Monday 2026-02-16 via GitHub Releases (VSIX)
- **User:** Casey is new to GitHub workflows (experienced with ADO). Explain GitHub concepts clearly when setting up pipelines.

## Learnings


📌 **Team update (2026-02-16):** Documentation animation strategy — EditLess uses optimized GIFs stored in docs/media/ directory. Primary tool: ScreenToGif (Windows). Files must be <1 MB, max 800px width, 3–8 seconds duration. File naming is descriptive kebab-case (e.g., planning-feature.gif). Re-recording triggers documented: UI structure changes, command/shortcut changes, label changes, layout changes. Team reviews animations on code review checklist. — decided by Summer

📌 **Team update (2026-02-16):** Default release target — All new issues default to elease:v0.1 unless Casey explicitly directs otherwise. This ensures v0.1 work is automatically tagged correctly. — decided by Casey Irvine

📌 **Team update (2026-02-16):** Worktree enforcement reinforced to hard constraint — Git checkout violations (agent on #213 checked out branches on the main clone instead of using worktrees) have happened repeatedly despite existing documentation. The rule is now a non-negotiable constraint enforced through code review: the main clone (C:\Users\cirvine\code\work\editless) is PULL-ONLY, all feature branch work must use git worktrees. Violations must be caught and rejected in PR review. — reinforced by Casey Irvine
<!-- Append new learnings below. Each entry is something lasting about the project. -->

📌 Team update (2026-02-16): Squad folder rename — `.squad/` support added with `.ai-team/` backward compatibility via `src/team-dir.ts` utility. Any future code that needs to locate the team directory must use `resolveTeamDir()` or `resolveTeamMd()` — never hardcode paths. — decided by Morty

📌 Team update (2026-02-16): v0.1 Release Triage & Scope Lock — 7 P0 items locked (including session persistence #94), 8 P1 items prioritized. #101 (Generic CLI Provider) flagged for scope review — architectural dependency may require design decision. Scope lock after 15:00 UTC. — decided by Rick

📌 Pipeline update (2026-02-16): Removed `go:` label namespace — `go:yes`, `go:no`, `go:needs-research` all retired. Triage now applies `status:needs-plan` as default (respects existing `status:` labels). Release labels trimmed to `release:v0.1` and `release:backlog` only. Enforcement workflow no longer manages `go:` mutual exclusivity or go→release side effects. — requested by Casey

📌 **Team decision (2026-02-17):** VSCE_PAT is not an internal term — Removed VSCE_PAT and vsce_pat from `.github/internal-terms.txt`. These are standard GitHub Actions secret names for VS Marketplace publishing, not internal references or leaked credentials. The scan should catch real leaks (corpnet, internal domains, old branding), not legitimate workflow secret names. — decided by Birdperson

📌 Pipeline audit complete (2026-02-16): **CI/CD Pipeline Status Report** — All core test pipelines executing correctly. CI workflow (lint, build, unit tests via vitest) runs on every push/PR targeting main/master (~17s). Integration tests run on separate workflow with xvfb display server (~14s). Both have 100% pass rate on recent runs (200 CI runs, 170 integration runs reviewed). Release pipeline active (1 successful tag-based release). **Gap identified**: No coverage reporting configured (vitest supports coverage but not enabled in config). **Recommendation**: Add optional coverage report upload step. Branch protection status: **unknown** (no access to branch protection API in this session). Squad CI (separate test runner in .ai-team/) checks .ai-team tests on PR/push to dev branch.
<!-- Append new learnings below. Each entry is something lasting about the project. -->

📌 Scan fix (2026-02-16): **Internal terms scan false positives resolved (#42)** — Two fixes: (1) Rephrased SquadUI description in `docs/getting-started.md` ("view the squad dashboard" → "monitor squad activity") to avoid matching the "Squad Dashboard" old-branding term — the reference was to csharpfritz's SquadUI extension, not our retired name. (2) Removed `VSCE_PAT`/`vsce_pat` from `.github/internal-terms.txt` — these are standard GitHub Actions secret names for VS Marketplace publishing, not leaked credentials. The scan still catches all real internal terms (corpnet, internal domains, codenames, old branding). Key files: `.github/internal-terms.txt`, `.github/workflows/terms-scan.yml`, `docs/getting-started.md`.

📌 Team update (2026-02-16): Squad folder rename — `.squad/` support added with `.ai-team/` backward compatibility via `src/team-dir.ts` utility. Any future code that needs to locate the team directory must use `resolveTeamDir()` or `resolveTeamMd()` — never hardcode paths. — decided by Morty

📌 Team update (2026-02-16): v0.1 Release Triage & Scope Lock — 7 P0 items locked (including session persistence #94), 8 P1 items prioritized. #101 (Generic CLI Provider) flagged for scope review — architectural dependency may require design decision. Scope lock after 15:00 UTC. — decided by Rick

📌 Pipeline update (2026-02-16): Removed `go:` label namespace — `go:yes`, `go:no`, `go:needs-research` all retired. Triage now applies `status:needs-plan` as default (respects existing `status:` labels). Release labels trimmed to `release:v0.1` and `release:backlog` only. Enforcement workflow no longer manages `go:` mutual exclusivity or go→release side effects. — requested by Casey



📌 **Team update (2026-02-16):** Default release target — All new issues default to elease:v0.1 unless Casey explicitly directs otherwise. This ensures v0.1 work is automatically tagged correctly. — decided by Casey Irvine

📌 **Team update (2026-02-16):** Worktree enforcement reinforced to hard constraint — Git checkout violations (agent on #213 checked out branches on the main clone instead of using worktrees) have happened repeatedly despite existing documentation. The rule is now a non-negotiable constraint enforced through code review: the main clone (C:\Users\cirvine\code\work\editless) is PULL-ONLY, all feature branch work must use git worktrees. Violations must be caught and rejected in PR review. — reinforced by Casey Irvine
<!-- Append new learnings below. Each entry is something lasting about the project. -->

📌 Team update (2026-02-16): Squad folder rename — `.squad/` support added with `.ai-team/` backward compatibility via `src/team-dir.ts` utility. Any future code that needs to locate the team directory must use `resolveTeamDir()` or `resolveTeamMd()` — never hardcode paths. — decided by Morty

📌 Team update (2026-02-16): v0.1 Release Triage & Scope Lock — 7 P0 items locked (including session persistence #94), 8 P1 items prioritized. #101 (Generic CLI Provider) flagged for scope review — architectural dependency may require design decision. Scope lock after 15:00 UTC. — decided by Rick

📌 Pipeline update (2026-02-16): Removed `go:` label namespace — `go:yes`, `go:no`, `go:needs-research` all retired. Triage now applies `status:needs-plan` as default (respects existing `status:` labels). Release labels trimmed to `release:v0.1` and `release:backlog` only. Enforcement workflow no longer manages `go:` mutual exclusivity or go→release side effects. — requested by Casey

📌 Pipeline audit complete (2026-02-16): **CI/CD Pipeline Status Report** — All core test pipelines executing correctly. CI workflow (lint, build, unit tests via vitest) runs on every push/PR targeting main/master (~17s). Integration tests run on separate workflow with xvfb display server (~14s). Both have 100% pass rate on recent runs (200 CI runs, 170 integration runs reviewed). Release pipeline active (1 successful tag-based release). **Gap identified**: No coverage reporting configured (vitest supports coverage but not enabled in config). **Recommendation**: Add optional coverage report upload step. Branch protection status: **unknown** (no access to branch protection API in this session). Squad CI (separate test runner in .ai-team/) checks .ai-team tests on PR/push to dev branch.
<!-- Append new learnings below. Each entry is something lasting about the project. -->

📌 Team update (2026-02-16): Squad folder rename — `.squad/` support added with `.ai-team/` backward compatibility via `src/team-dir.ts` utility. Any future code that needs to locate the team directory must use `resolveTeamDir()` or `resolveTeamMd()` — never hardcode paths. — decided by Morty

📌 Team update (2026-02-16): v0.1 Release Triage & Scope Lock — 7 P0 items locked (including session persistence #94), 8 P1 items prioritized. #101 (Generic CLI Provider) flagged for scope review — architectural dependency may require design decision. Scope lock after 15:00 UTC. — decided by Rick

📌 Pipeline update (2026-02-16): Removed `go:` label namespace — `go:yes`, `go:no`, `go:needs-research` all retired. Triage now applies `status:needs-plan` as default (respects existing `status:` labels). Release labels trimmed to `release:v0.1` and `release:backlog` only. Enforcement workflow no longer manages `go:` mutual exclusivity or go→release side effects. — requested by Casey


