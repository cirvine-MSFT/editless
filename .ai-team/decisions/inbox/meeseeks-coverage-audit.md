# Test Coverage Audit — Pre-Release Go-Live

**By:** Meeseeks (Tester), issue #89
**Date:** 2026-02-17
**Status:** Audit complete, gaps filed

## Executive Summary

200 unit tests pass across 11 test files. 2 integration test files (6 tests) exist but require VS Code host — they fail in vitest (expected). No skipped or commented-out tests. Test quality is high: descriptive names, appropriate mocks (VS Code API mocked, internal logic tested directly), good use of `vi.hoisted()` patterns.

**Overall:** 7/19 source modules have good coverage, 5 have partial, 7 have none. The untested modules include critical user-facing code (tree view, registry, session labels).

## Coverage Matrix

| Source File | Test File | Tests | Assessment | Notes |
|---|---|---|---|---|
| `agent-discovery.ts` | `agent-discovery.test.ts` | 18 | 🟢 Good | All 3 exported functions tested with edge cases |
| `cli-provider.ts` | `cli-provider.test.ts` | 23 | 🟢 Good | `checkAgencyOnStartup`, `checkProviderUpdatesOnStartup` thoroughly tested |
| `discovery.ts` | `discovery.test.ts` | 18 | 🟡 Partial | `discoverAgentTeams` well-tested; `promptAndAddSquads`, `registerDiscoveryCommand`, `checkDiscoveryOnStartup` untested (vscode UI wrappers) |
| `editless-tree.ts` | `tree-providers.test.ts` | 3 | 🟡 Partial | Only `getParent()` and basic `getChildren()` tested. `findTerminalItem`, terminal/orphan rendering, visibility filtering all untested |
| `extension.ts` | `__integration__/extension.test.ts` | 2 | 🔴 None | Integration tests only (can't run in vitest). 32 commands registered, 0 handler tests |
| `github-client.ts` | — | 0 | 🔴 None | All 4 async functions wrapping `gh` CLI untested |
| `notifications.ts` | `notifications.test.ts` | 11 | 🟢 Good | `isNotificationEnabled` + `checkAndNotify` with transition/suppression paths |
| `prs-tree.ts` | `tree-providers.test.ts` | 4 | 🟡 Partial | Basic provider tested; `derivePRState`, multi-repo grouping, loading state untested |
| `registry.ts` | — | 0 | 🔴 None | `loadSquads`, `updateSquad`, `addSquads` all untested. Core data layer. |
| `scanner.ts` | `scanner.test.ts` | 17 | 🟢 Good | All 5 exported functions tested |
| `session-context.ts` | `session-context.test.ts` | 22 | 🟢 Good | YAML parsing, path normalization, resolver integration |
| `session-labels.ts` | — | 0 | 🔴 None | Label CRUD, persistence, event firing all untested |
| `squad-upgrader.ts` | — | 0 | 🔴 None | Version parsing, npx checks, upgrade flow untested |
| `status-bar.ts` | — | 0 | 🔴 None | Rendering logic, inbox caching untested |
| `terminal-manager.ts` | `terminal-manager.test.ts` | 56 | 🟢 Good | Lifecycle, persistence, reconciliation, orphans, session state — thorough |
| `types.ts` | — | — | N/A | Type definitions only |
| `visibility.ts` | `visibility.test.ts` | 11 | 🟢 Good | Hide/show/persist with re-instantiation |
| `vscode-compat.ts` | `vscode-compat.test.ts` | 11 | 🟢 Good | All 3 functions tested |
| `watcher.ts` | — | 0 | 🔴 None | Debounce, lifecycle, dispose untested |
| `work-items-tree.ts` | `tree-providers.test.ts` | 8 | 🟡 Partial | Label filtering & milestones tested; multi-repo, loading state gaps |

**Additional test files:**
- `custom-commands.test.ts` (8 tests) — validates package.json schema for custom commands
- Integration: `extension.test.ts` (2), `persistence.test.ts` (4) — require VS Code host

**Totals:** 200 unit tests passing | 11 test files | 19 source modules (excl. types.ts)

## Command Coverage

32 commands registered in `package.json`. **Zero** have handler execution tests. `custom-commands.test.ts` validates the schema/registration pattern but doesn't execute handlers.

| Command | Logic Complexity | Tested? |
|---|---|---|
| `editless.launchSession` | Medium (picker fallback, empty check) | ❌ |
| `editless.renameSession` | High (3 code paths, label + tab rename) | ❌ |
| `editless.addAgent` | High (file creation, custom command, validation) | ❌ |
| `editless.addSquad` | High (npx check, init vs upgrade) | ❌ |
| `editless.changeModel` | Medium (regex parse, string mutation) | ❌ |
| `editless.launchFromWorkItem` | Medium (clipboard + launch) | ❌ |
| `editless.goToPR` | Medium (single vs multi PR) | ❌ |
| Others (25) | Low (thin wrappers) | ❌ |

## Prioritized Gap List

### P0 — Could cause user-visible bugs

| # | Module | Issue | Risk |
|---|---|---|---|
| 1 | `editless-tree.ts` | [#104](https://github.com/cirvine-MSFT/editless/issues/104) | Broken tree view — primary UI surface |
| 2 | `registry.ts` | [#105](https://github.com/cirvine-MSFT/editless/issues/105) | Squads fail to load/persist |
| 3 | `session-labels.ts` | [#106](https://github.com/cirvine-MSFT/editless/issues/106) | Session labels lost on reload |
| 4 | `extension.ts` commands | [#108](https://github.com/cirvine-MSFT/editless/issues/108) | Command handlers crash or misbehave |

### P1 — Maintainability risk

| # | Module | Issue | Risk |
|---|---|---|---|
| 5 | `squad-upgrader.ts` | [#111](https://github.com/cirvine-MSFT/editless/issues/111) | Brittle frontmatter parsing |
| 6 | `status-bar.ts` | [#113](https://github.com/cirvine-MSFT/editless/issues/113) | Incorrect status bar rendering |
| 7 | `watcher.ts` | [#115](https://github.com/cirvine-MSFT/editless/issues/115) | Debounce/dispose lifecycle bugs |
| 8 | `prs-tree.ts` | [#118](https://github.com/cirvine-MSFT/editless/issues/118) | PR state derivation incorrect |
| 9 | `github-client.ts` | [#120](https://github.com/cirvine-MSFT/editless/issues/120) | JSON parse errors silently wrong |

### P2 — Nice to have (no issues filed)

| # | Module | Notes |
|---|---|---|
| 10 | `discovery.ts` | `promptAndAddSquads`, `registerDiscoveryCommand` are vscode UI wrappers |
| 11 | `work-items-tree.ts` | Multi-repo grouping, concurrent fetch edge cases |

## Test Quality Assessment

**✅ Strengths:**
- Test names are descriptive and follow `should {behavior}` convention
- Mocks are appropriate: VS Code API mocked, internal logic tested directly
- Good use of `vi.hoisted()` for mock function references
- No skipped or commented-out tests
- Edge cases covered in well-tested modules (terminal-manager has 56 tests!)
- `vi.waitFor()` used correctly for async tree provider tests

**⚠️ Concerns:**
- `tree-providers.test.ts` combines 3 providers in one file — consider splitting
- Integration tests pick up compiled `out/` files and fail — vitest config excludes `src/__integration__/**` but not `out/integration/**`
- No test coverage metrics (istanbul/c8) configured — should add for CI

## Recommendations

1. **Before go-live:** P0 #104 (editless-tree) is highest risk — the tree view is the entire UI
2. **Week 1 post-launch:** Close remaining P0s (#105, #106, #108)
3. **Week 2:** P1 issues (#111, #113, #115, #118, #120)
4. **Ongoing:** Add `c8` coverage reporting to CI pipeline
5. **Quick fix:** Add `'out/integration/**'` to vitest `exclude` to silence integration test failures
