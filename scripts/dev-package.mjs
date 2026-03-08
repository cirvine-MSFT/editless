#!/usr/bin/env node
/**
 * Dev build packager for EditLess.
 *
 * Generates a VS Code–compatible dev version using a date+revision scheme:
 *   0.{minor}.{YYYYMMDDNN}
 *
 * Example: 0.1.2026030701  (first build on 2026-03-07)
 *          0.1.2026030702  (second build that day)
 *
 * Usage:
 *   npm run dev:package            # build + package dev .vsix
 *   npm run dev:package -- --install  # also install into VS Code
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, join } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const PKG_PATH = join(ROOT, 'package.json');

// ── helpers ──────────────────────────────────────────────────────────

function today() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function nextRevision(dateStr) {
  // Scan existing .vsix files for today's date stamp to find the next revision
  const files = readdirSync(ROOT).filter(f => f.endsWith('.vsix'));
  const pattern = new RegExp(`editless-dev-.*\\.${dateStr}(\\d{2})\\.vsix`);
  let max = 0;
  for (const f of files) {
    const m = f.match(pattern);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return String(max + 1).padStart(2, '0');
}

function run(cmd) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

// ── main ─────────────────────────────────────────────────────────────

const flags = process.argv.slice(2);
const shouldInstall = flags.includes('--install');

const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf-8'));
const savedVersion = pkg.version;
const minor = savedVersion.split('.')[1] || '1';

const dateStr = today();
const rev = nextRevision(dateStr);
const devPatch = `${dateStr}${rev}`;
const devVersion = `0.${minor}.${devPatch}`;

console.log(`\n🔧 Dev build: ${savedVersion} → ${devVersion}\n`);

try {
  // 1. Patch version
  pkg.version = devVersion;
  writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');

  // 2. Build
  run('npm run build');

  // 3. Package .vsix
  const vsixName = `editless-dev-${devVersion}.vsix`;
  run(`npx vsce package --no-git-tag-version -o ${vsixName}`);

  console.log(`\n✅ Packaged: ${vsixName}`);

  // 4. Optionally install
  if (shouldInstall) {
    run(`code --install-extension ${vsixName} --force`);
    console.log(`\n✅ Installed ${devVersion} into VS Code`);
    console.log('   Reload VS Code to pick up the new version.');
  } else {
    console.log(`\n💡 To install: code --install-extension ${vsixName} --force`);
  }
} finally {
  // 5. Always restore original version
  pkg.version = savedVersion;
  writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`\n🔄 Restored package.json to ${savedVersion}`);
}
