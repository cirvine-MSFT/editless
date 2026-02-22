# Decision: Unified Work Item Types

**Status:** Accepted
**Date:** 2026-02-22
**Author:** Rick (Lead)

## Context
We support both Azure DevOps (Work Items) and GitHub (Issues). ADO has native "Types" (Bug, User Story, Task), while GitHub uses labels.

## Decision
We will treat GitHub labels starting with `type:` as equivalent to ADO Work Item types.
- `type:bug` ≈ Bug
- `type:feature` ≈ Feature/User Story
- `type:task` ≈ Task

The UI will present a unified "Type" filter that maps to these underlying representations.

## Consequences
- Users must follow `type:{name}` convention in GitHub for filters to work.
- We standardized on "Labels" as the UI term for tags/labels across both providers.
