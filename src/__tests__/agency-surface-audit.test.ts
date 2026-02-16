import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Guardrail: ensures ZERO Agency CLI references exist in non-test source.
 * Agency was replaced with a generic CLI provider system in #101.
 * If this test fails, an agency reference was re-introduced — remove it.
 */

const SRC_DIR = path.resolve(__dirname, '..');

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

describe('Agency CLI removal guardrail (#101)', () => {
  it('should have ZERO agency references in non-test source files', () => {
    const files = collectSourceFiles(SRC_DIR);
    const violations: string[] = [];

    for (const filePath of files) {
      const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comment-only lines
        if (/^\s*(\/\/|\/\*|\*)/.test(line)) continue;
        if (/agency/i.test(line)) {
          const rel = path.relative(SRC_DIR, filePath);
          violations.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      }
    }

    expect(violations, `Agency references found:\n${violations.join('\n')}`).toHaveLength(0);
  });

  it('should find at least one source file to scan', () => {
    const files = collectSourceFiles(SRC_DIR);
    expect(files.length).toBeGreaterThan(0);
  });
});
