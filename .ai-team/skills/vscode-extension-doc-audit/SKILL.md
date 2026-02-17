---
name: "vscode-extension-doc-audit"
description: "How to audit VS Code extension docs against package.json for accuracy"
domain: "documentation"
confidence: "low"
source: "earned"
---

## Context
VS Code extensions define their public API in `package.json` under `contributes`. Documentation (settings references, command lists, keybinding guides) must match this source of truth exactly. Drift happens frequently because package.json changes don't automatically propagate to docs.

## Audit Checklist

### Settings (`contributes.configuration`)
For each setting in package.json, verify in docs:
1. **Scope** — `resource`, `window`, `machine`, etc. must match exactly. "resource" ≠ "workspace".
2. **Default value** — especially for complex types (arrays, objects). Copy from package.json.
3. **Type** — `string`, `number`, `boolean`, `array`, `object`.
4. **Enum values** — if the setting has enum constraints, doc must list the same values.
5. **Description** — `markdownDescription` is the rich version; keep docs consistent with it.

### Commands (`contributes.commands`)
1. Every command in package.json should appear in docs if user-facing.
2. Check `commandPalette` `when: "false"` entries — these are context-only commands, not discoverable from palette.
3. Verify command titles match (category + title pattern).

### Keybindings (`contributes.keybindings`)
1. Verify key combos match between docs and package.json.
2. Include both Windows (`key`) and macOS (`mac`) variants in docs.

### Common Drift Patterns
- **Scope drift**: Settings start as "window", get changed to "resource" for multi-root support, docs don't update.
- **Default drift**: Defaults change during development, example code blocks in docs show old values.
- **Keybinding drift**: Keybindings are reassigned to avoid conflicts, docs keep the old binding.
- **Removed settings**: Settings get removed from package.json but remain documented.
- **New settings**: Settings added to package.json never get documented.

## Pattern
Always treat `package.json` as the single source of truth. When docs and code disagree, update docs to match code (not the other way around).
