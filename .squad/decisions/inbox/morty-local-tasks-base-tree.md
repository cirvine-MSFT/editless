# BaseTreeProvider Integration Pattern for Third Backends

**Status:** Proposed  
**Date:** 2026-03-05  
**Decider:** Morty  
**Context:** PR #448 merge resolution

## Decision

When adding a third backend (Local Tasks) to a refactored tree provider using `BaseTreeProvider`, use protected method overrides rather than reverting the refactor to accommodate new features.

## Pattern

```typescript
// WorkItemsTreeProvider extends BaseTreeProvider<GitHubIssue, AdoWorkItem, ...>

// 1. Add backend-specific fields as private (not in base class)
private _localTasks = new Map<string, LocalTask[]>();
private _localConfigured = false;
private _localFolders: string[] = [];

// 2. Override _getRootChildren() to handle N backends
protected _getRootChildren(): WorkItemsTreeItem[] {
  const ghMap = this._getFilteredGitHubMap();
  const adoList = this.applyAdoRuntimeFilter(this._getAdoItemsList());
  const localTasks = this._getAllFilteredLocalTasks();
  
  const backendCount = (ghMap.size > 0 ? 1 : 0) + (adoList.length > 0 ? 1 : 0) + (localTasks.length > 0 ? 1 : 0);
  
  // Render 1, 2, or 3 backend groups...
}

// 3. Override getChildren() to intercept new contexts
getChildren(element?: TTreeItem): TTreeItem[] {
  if (!element) return this._getRootChildren();
  
  const ctx = element.contextValue?.replace(/-filtered$/, '') ?? '';
  
  // Handle new backend contexts first
  if (ctx === 'local-backend') return this._getLocalFolderNodes(...);
  if (ctx === 'local-folder') return this._getLocalTaskItems(...);
  
  // Delegate to base class for GitHub/ADO
  return super.getChildren(element);
}

// 4. Override getAllRepos() to include new backend
getAllRepos(): string[] {
  const repos = [...this._repos];
  if (this._adoConfigured) repos.push('(ADO)');
  if (this._localConfigured) repos.push('(Local)');
  return repos;
}

// 5. Update _doFetchAll() to fetch third backend
protected async _doFetchAll(): Promise<void> {
  // GitHub + ADO fetches...
  for (const folder of this._localFolders) {
    fetches.push(fetchLocalTasks(folder).then(...));
  }
  // ...
}
```

## Rationale

- **Preserves refactor:** BaseTreeProvider structure remains clean (2-backend abstraction)
- **Extends cleanly:** Third backend added via inheritance, not mutation
- **Type safe:** Compiler enforces abstract method implementations
- **Testable:** New backend behavior isolated in overrides, existing tests unaffected
- **Scalable:** Pattern works for 4th, 5th backends (e.g., Jira, Linear)

## Alternatives Considered

1. **Revert refactor:** Make BaseTreeProvider handle 3+ backends generically → rejected (over-abstraction)
2. **Duplicate code:** Copy BaseTreeProvider logic into WorkItemsTreeProvider → rejected (loses refactor value)
3. **Conditional base class:** Use template parameter for backend count → rejected (complexity)

## Consequences

- ✅ All 1108 tests pass after merge
- ✅ BaseTreeProvider remains reusable for PRsTreeProvider (2 backends only)
- ✅ Local Tasks feature works identically to master implementation
- ⚠️ `_getRootChildren()` override is ~80 lines (complex but unavoidable for 3-backend rendering)
