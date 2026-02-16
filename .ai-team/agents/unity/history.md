# Project Context

- **Owner:** Casey Irvine (cirvine@microsoft.com)
- **Project:** EditLess — a VS Code extension for managing AI agents, terminal sessions, and work items. The "editorless IDE" panel.
- **Stack:** TypeScript, VS Code Extension API, esbuild, vitest
- **Created:** 2026-02-15
- **Repo:** cirvine-MSFT/editless (private)
- **Target:** Internal Microsoft distribution by Monday 2026-02-16 via GitHub Releases (VSIX)

## Project Learnings (from import)

- EditLess uses progressive feature detection — features light up based on what's installed (agency CLI, copilot CLI, .ai-team/ directories). The integration layer must follow this pattern: detect → connect → surface. Never show UI for services that aren't available.
- GitHub client exists at `src/github-client.ts` with `fetchLinkedPRs` for PR linking. Extend this for new GitHub API surface.
- ADO integration is planned (#58, #34, #56) — will need a parallel `ado-client.ts` with similar patterns.
- Cross-platform abstraction: GitHub and ADO work items should share a common interface so the UI layer (Morty's domain) consumes a unified data shape.
- Dynamic agent discovery (#75) scans `.github/agents/*.agent.md` and root-level `*.agent.md`. The scanning infrastructure lives in `src/agent-discovery.ts`.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

📌 Team update (2026-02-16): Squad folder rename — `.squad/` support added with `.ai-team/` backward compatibility via `src/team-dir.ts` utility. Any future code that needs to locate the team directory must use `resolveTeamDir()` or `resolveTeamMd()` — never hardcode paths. — decided by Morty

📌 Team update (2026-02-16): Label taxonomy simplified — `go:` namespace (go:yes, go:no, go:needs-research) removed. Triage now applies `status:needs-plan` only when no existing `status:` label exists. Release labels limited to `release:v0.1` and `release:backlog`. When integrating ADO labels, these same status and release categories apply. — decided by Birdperson
