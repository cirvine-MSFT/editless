import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Keybindings regression tests', () => {
  it('should not have any F2 keybindings', () => {
    const pkgPath = path.join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    
    const keybindings = pkg.contributes?.keybindings ?? [];
    const f2Bindings = keybindings.filter(
      (kb: { key: string }) => kb.key === 'f2'
    );
    
    expect(f2Bindings).toHaveLength(0);
  });
});
