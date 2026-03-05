# Wave 2 Terminal Manager Extraction - Partial Completion

**Date:** 2025-01-XX  
**Context:** Issues #246, #247 - Codebase Review Wave 2  
**Agent:** Morty (Extension Dev)

## Summary

Completed partial extraction work on terminal-manager.ts as part of Wave 2 decomposition effort.

## What Was Completed

### Terminal Manager Reduction (506 → 444 lines, -62 lines)

Extracted three new modules from terminal-manager.ts:

1. **session-id-detector.ts** (49 lines)
   - Extracted `SessionIdDetector` class
   - Handles detection and assignment of Copilot session IDs to terminals
   - Matches session-state directories with terminal agent paths
   - Reduces coupling of session detection logic with terminal management

2. **string-utils.ts** (6 lines)  
   - Extracted `stripEmoji()` utility function
   - Pure utility with no dependencies on terminal manager

3. **terminal-types.ts** (41 lines)
   - Extracted `TerminalInfo` and `PersistedTerminalInfo` interfaces
   - Shared types now imported by multiple modules (terminal-manager, terminal-persistence, session-recovery, session-id-detector)
   - Reduces circular dependencies

### Backward Compatibility

All extractions maintain full backward compatibility via re-exports in terminal-manager.ts:
```typescript
export type { TerminalInfo, PersistedTerminalInfo } from './terminal-types';
export { stripEmoji } from './string-utils';
```

Existing imports continue to work without modification.

### Test Coverage

All 1201 tests continue to pass after extractions.

## What Remains

### Terminal Manager (444 → target ≤300 lines)

Terminal-manager.ts is still above the 300-line target. Additional candidates for extraction:

- **Launch state tracking** (~20 lines): `_setLaunching`, `_clearLaunching`, `LAUNCH_TIMEOUT_MS`
- **Change batching logic** (~10 lines): `_scheduleChange` and timer management
- **Context builders** (~18 lines): `_getMatchContext`, `_getRecoveryContext` - however these are tightly coupled

Challenges:
- The class has cohesive responsibilities (terminal lifecycle, persistence, state)
- Most remaining code is core orchestration logic
- Further extractions risk creating fragmented abstractions
- Diminishing returns on complexity reduction

**Recommendation:** Terminal-manager.ts at 444 lines is a significant improvement from 506. Consider whether the 300-line target is necessary given the cohesive nature of remaining code.

### Work Items Tree Provider Extraction (NOT STARTED)

**Status:** Not started due to complexity  
**File:** work-items-tree.ts (615 lines → target ≤300)  
**Created:** backend-provider-interface.ts (72 lines)

Challenges:
- Deep coupling between GitHub, ADO, and local task logic
- Shared state management (filters, level filters, child maps)
- Complex inheritance from BaseTreeProvider
- Provider pattern implementation would require significant refactoring

**Recommendation:** This extraction requires careful design to avoid breaking the existing provider pattern. Suggest tackling in a dedicated focused session.

### Extension.ts Decomposition (NOT STARTED)

**Status:** Not started  
**File:** extension.ts (553 lines → target ≤200)

Potential extraction targets:
- Settings initialization logic
- Core manager construction
- Discovery setup
- Integration setup (GitHub, ADO, local)
- File watchers and status bar setup

**Recommendation:** This is feasible but requires careful testing of the activate() orchestration flow.

### Tier 2 Files (NOT STARTED)

- work-item-commands.ts (513 lines → target ≤300)
- editless-tree.ts (504 lines → target ≤300)
- agent-commands.ts (466 lines → target ≤300)

## Files Modified

- src/terminal-manager.ts (506 → 444 lines)
- src/terminal-persistence.ts (updated imports)
- src/session-recovery.ts (updated imports)

## Files Created

- src/session-id-detector.ts (49 lines)
- src/string-utils.ts (6 lines)
- src/terminal-types.ts (41 lines)

## Testing

✅ All 1201 tests passing  
✅ TypeScript compilation successful  
✅ No breaking changes to public APIs

## Next Steps

1. **Option A - Continue terminal-manager reduction:**  
   Extract launch state tracking and change batching if 300-line target is firm requirement.

2. **Option B - Tackle extension.ts:**  
   More straightforward extraction with clear separation of concerns.

3. **Option C - Accept current state:**  
   Recognize that 444 lines for terminal-manager.ts is a reasonable size for a cohesive orchestrator class.

## Lessons Learned

- Pure utilities and type definitions are easy wins for extraction
- Orchestrator classes naturally trend toward moderate size (300-500 lines)
- Strategy pattern extractions (like work-items providers) require more design time
- Test coverage gives confidence in refactoring

