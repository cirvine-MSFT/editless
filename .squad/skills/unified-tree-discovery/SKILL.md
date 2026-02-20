# Skill: Unified Tree Discovery Pattern

## Problem
Multiple discovery sources (workspace files, directories, external configs) need to feed a single tree view section without duplicating scan logic or creating divergent UX flows.

## Pattern

### 1. Unified discovery module
Create a single module that:
- Defines a common `DiscoveredItem` interface covering all source types
- Exports one `discoverAll()` function that aggregates all sources
- Accepts the registry to exclude already-registered items
- Deduplicates by ID, with priority order (workspace > external)

```typescript
export interface DiscoveredItem {
  id: string;
  name: string;
  type: 'agent' | 'squad'; // Extensible union
  source: 'workspace' | 'copilot-dir';
  path: string;
  description?: string;
  // Type-specific optional fields
}
```

### 2. Tree view integration
- Single collapsible "Discovered (N)" section at tree root
- Sort by type (squads first), then alphabetically within type
- Each type gets its own icon but shares the same container
- Context menu actions (Add, Hide) work identically for all types

### 3. Refresh = re-discover
Instead of manually maintaining the discovered list (filtering on add, etc.), re-run `discoverAll()` after any mutation. This eliminates stale state bugs.

```typescript
function refreshDiscovery(): void {
  discoveredItems = discoverAll(workspaceFolders, registry);
  treeProvider.setDiscoveredItems(discoveredItems);
}
```

### 4. Backward compat
- Keep legacy setters (`setDiscoveredAgents`) alongside new ones
- Tree view merges both lists, deduplicating by ID
- Deprecate old settings rather than removing them

## When to Apply
- Anytime multiple scan sources feed a single tree section
- When unifying previously separate discovery flows
- When adding a new discoverable item type to an existing tree

## Files
- `src/unified-discovery.ts` — reference implementation
- `src/editless-tree.ts` — tree integration pattern
