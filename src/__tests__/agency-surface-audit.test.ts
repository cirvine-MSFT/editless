import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Guardrail: ensures ZERO Agency CLI references exist in the repo.
 * Agency was replaced with a generic CLI provider system in #101.
 * If this test fails, an agency reference was re-introduced — remove it.
 *
 * Scans all text files in the repo EXCEPT:
 *   - .squad/, .ai-team/ (internal squad state — historical references are fine)
 *   - .squad-templates/, .ai-team-templates/
 *   - node_modules/, dist/, out/ (generated)
 *   - __tests__/, __integration__/ (test files may reference the word)
 *   - .git/ (git internals)
 *   - Binary/image files
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const SKIP_DIRS = new Set([
  '.ai-team', '.ai-team-templates', '.squad', '.squad-templates',
  'node_modules', 'dist', 'out',
  '__tests__', '__integration__', '.git', 'icons', '.vscode-test',
]);

const TEXT_EXTENSIONS = new Set([
  '.ts', '.js', '.json', '.md', '.yml', '.yaml', '.sh', '.html', '.css', '.mjs',
]);

function collectFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full));
    } else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(full);
    }
  }
  return results;
}

describe('Agency CLI removal guardrail (#101)', () => {
  it('should have ZERO agency references in repo files (excluding .ai-team and tests)', () => {
    const files = collectFiles(REPO_ROOT);
    const violations: string[] = [];

    for (const filePath of files) {
      const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comment-only lines in code files
        if (/^\s*(\/\/|\/\*|\*|#)/.test(line)) continue;
        if (/agency/i.test(line)) {
          const rel = path.relative(REPO_ROOT, filePath);
          violations.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      }
    }

    expect(violations, `Agency references found:\n${violations.join('\n')}`).toHaveLength(0);
  });

  it('should find at least one file to scan', () => {
    const files = collectFiles(REPO_ROOT);
    expect(files.length).toBeGreaterThan(0);
  });
});
