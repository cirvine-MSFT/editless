# AI Team Decisions

---

### 2026-02-19: Always wait for CI checks before merging PRs
**By:** Casey (via Copilot)
**What:** Squad agents must ALWAYS wait for all required CI checks (Lint/Build/Test, VS Code Integration Tests, scan) to pass before merging any PR. No exceptions — even when force-merging or using --admin flag. Never merge a PR with pending or failing checks.
**Why:** User directive — CI checks exist for a reason and must gate every merge, regardless of merge method.


---

# Issue #496 Triage Decision - Separate ADO Projects for WIs and PRs

**Date:** 2026-03-06  
**Decision Maker:** Rick (Lead)  
**Context:** Triage for 0.2 release

## Summary

**DEFER #496 to post-0.2.** Recommend implementing #487 (repo-level scoping) first as it solves a broader problem and addresses 80% of user needs.

## Analysis

### Current State
- Single shared ADO project configuration (`editless.ado.project`)
- Both Work Items and PRs trees use same org/project
- Configuration shared via BaseTreeProvider
- Settings defined in package.json (workspace-scoped)

### Issue #496 Request
User wants:
- Work Items from Project A
- PRs from Project B
- Different projects for each tree

### Issue #487 (Related)
- Scope views to current repo instead of entire project
- Addresses "too noisy" problem
- Overlaps with #477 (already done: PR filtering by assignee/creator)

## Why Defer #496

1. **#487 solves the underlying problem better**
   - Most users don't need different *projects*, they need better *filtering*
   - Repo-level scoping addresses noise without configuration complexity
   - More intuitive UX: "show PRs for this repo" vs "configure two projects"

2. **Implementation complexity**
   - Requires splitting shared config into separate settings
   - BaseTreeProvider architectural changes (shared state pattern)
   - 6-7 files touched: package.json, base-tree-provider.ts, work-items-tree.ts, prs-tree.ts, extension-integrations.ts, extension.ts, commands
   - Configuration UI complexity (two project pickers instead of one)
   - Edge cases: what if both trees need same project? Duplication.

3. **Rare use case**
   - Only one user request so far (saredd)
   - Casey's comment suggests #496 is bundled with "filtering" work — #487 is more critical filtering
   - Cross-project scenarios are edge cases in ADO workflows

4. **Better served by #487**
   - If user has WIs in Project A and PRs in Project B repos, they can:
     - Configure Project A, filter WIs to relevant queries
     - Switch config to Project B when working on PRs
     - OR use repo-level scoping in #487 to reduce noise
   - Not ideal, but acceptable until we validate demand

## Recommendation

**For 0.2:**
- ✅ Implement #487 (repo-level scoping for PRs and WIs)
- ❌ Defer #496 (separate projects)

**Post-0.2:**
- Monitor feedback after #487 ships
- If users still request cross-project, revisit #496
- Potential future: workspace-level project overrides per tree (more advanced)

**Suggested Squad Member for #487:**
- **Primary:** Scribe (handles data filtering, tree logic, ADO integration)
- **Review:** Rick (architectural review for BaseTreeProvider changes)

## Implementation Estimate for #487

**Scope:** Medium (3-5 hours)
- Modify `fetchAdoWorkItems` and `fetchAdoPRs` to accept optional repo filter
- Add repo-detection logic in `extension-integrations.ts`
- Update tree providers to filter by current workspace repo
- Add setting: `editless.ado.scopeToCurrentRepo` (boolean, default false)
- Test with multi-repo ADO projects

**Files:**
- `src/ado-client.ts` (add repo param to API calls)
- `src/extension-integrations.ts` (detect current repo)
- `src/work-items-tree.ts` & `src/prs-tree.ts` (filter logic)
- `package.json` (add setting)

