import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Guardrail: ensures Agency CLI surface area is limited to an approved allowlist.
 * If this test fails, a new agency reference was added that isn't in the allowlist.
 * Either add it to APPROVED_PATTERNS (with team approval) or remove the reference.
 */

const SRC_DIR = path.resolve(__dirname, '..');

// Approved patterns — every line containing "agency" (case-insensitive)
// in non-test source must match at least one of these.
const APPROVED_PATTERNS: RegExp[] = [
  // Approved CLI invocations
  /agency\s+--version/,
  /agency\s+update/,
  /agency\s+copilot/,
  // String literal: provider name ('agency' or "agency")
  /['"]agency['"]/,
  // Capitalized form in user-facing strings / display text
  /Agency/,
  // Part of a camelCase/PascalCase identifier (word char adjacent)
  /\wagency|agency\w/i,
  // Comment lines (single-line, block, or JSDoc)
  /^\s*\/\//,
  /^\s*\*/,
  /^\s*\/\*/,
];

function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === '__integration__') { continue; }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(full));
    } else if (entry.name.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results;
}

describe('Agency CLI surface area audit', () => {
  it('should only contain approved agency references in non-test source files', () => {
    const files = collectSourceFiles(SRC_DIR);
    const violations: string[] = [];

    for (const filePath of files) {
      const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!/agency/i.test(line)) { continue; }

        const approved = APPROVED_PATTERNS.some(p => p.test(line));
        if (!approved) {
          const rel = path.relative(SRC_DIR, filePath);
          violations.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      }
    }

    expect(violations, `Unapproved agency references found:\n${violations.join('\n')}`).toHaveLength(0);
  });

  it('should find at least one source file to scan', () => {
    const files = collectSourceFiles(SRC_DIR);
    expect(files.length).toBeGreaterThan(0);
  });

  it('should find known agency references (sanity check)', () => {
    const files = collectSourceFiles(SRC_DIR);
    const allLines = files.flatMap(f => fs.readFileSync(f, 'utf-8').split('\n'));
    const agencyLines = allLines.filter(l => /agency/i.test(l));
    // cli-provider.ts alone has many references — expect a healthy count
    expect(agencyLines.length).toBeGreaterThan(5);
  });
});
