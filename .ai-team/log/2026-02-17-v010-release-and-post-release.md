# Session: v0.1.0 Release & Post-Release

**Requested by:** Casey Irvine  
**Date:** 2026-02-17  
**Status:** Complete

## Summary

v0.1.0 shipped to VS Marketplace. Post-release work included:
- Updated README with marketplace link (PR #276)
- Filed two P0 bugs: #277 (Add Agent flow), #278 (Resume Session flow)
- Discussed and decided release branching strategy: Ship from master, no release branches until parallel release lines needed, bump version right before tagging

## Key Decisions

- **Release branching:** Monoline strategy. v0.1.x bugfixes and v0.2.0 features both ship from master. No release branches until hotfix of old version while new features in flight. Version bump in package.json happens immediately before tagging.
- **VSCE_PAT fix:** Use `npx @vscode/vsce` instead of bare `vsce` in GitHub Actions workflows to ensure devDependency binaries resolve in CI.

## Issues Created

- #277: Add Agent flow P0 bug
- #278: Resume Session flow P0 bug

## Related PRs

- #275: Fix vsce command resolution in release workflow
- #276: Update README with marketplace link
