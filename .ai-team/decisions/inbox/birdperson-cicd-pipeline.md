# Decision: CI/CD pipeline structure

**By:** Birdperson (DevOps), issue #82
**Date:** 2025-07-19

## What

Three GitHub Actions workflows handle the full CI/CD lifecycle:

- **`ci.yml`** — Lint, build, test on every push/PR to main/master. Single job, <5 min target.
- **`release.yml`** — Full quality gate + VSIX packaging + GitHub Release. Triggered by `v*.*.*` tags or manual `workflow_dispatch`. Pre-release detection for alpha/beta/rc tags.
- **`integration.yml`** — VS Code integration tests (`xvfb-run`) in a separate workflow. Runs on push/PR but does not block main CI.

Key choices:
- **Node 22 LTS** across all workflows (upgraded from 20).
- **`npm ci`** everywhere — deterministic installs from lockfile.
- **Version from `package.json`** — single source of truth. Tags should match but package.json wins.
- **`workflow_dispatch`** on release — allows manual releases using package.json version + commit SHA as release name.
- **`softprops/action-gh-release@v2`** for GitHub Releases — creates tags on manual dispatch.
- **Integration tests are a separate workflow**, not a separate job in CI. They need `xvfb-run` and are slower — keeping them decoupled means CI stays fast and integration flakes don't block merges.

## Why

- Batch-c scaffolded the workflows but was missing: lint/test gates in release, workflow_dispatch, pre-release support, main branch triggers, and explanatory comments.
- Casey is learning GitHub Actions (experienced with ADO) — comments explain non-obvious concepts like `npm ci` vs `npm install`, `xvfb-run`, and `GITHUB_OUTPUT`.
- Separate integration workflow avoids the "flaky integration test blocks all PRs" problem while still running on every push.
