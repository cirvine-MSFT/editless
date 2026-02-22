# Session: ADO Filter Hierarchy Fix

**Date:** 2026-02-22T21:57Z  
**Agent:** Morty (Extension Dev)  
**Issue:** Work item filter hierarchy collapse when ADO is only backend

## What Happened

Fixed `_getAdoRootItems()` to preserve org → project hierarchy instead of flattening to work items. Updated 12 tests, added 2 new tests. 787 tests pass.

## Commit

2ec5134 — Fix ADO filter hierarchy collapse when ADO is only visible backend
