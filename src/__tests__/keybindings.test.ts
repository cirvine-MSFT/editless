import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Keybindings regression tests', () => {
  it('should not have F2 keybinding with terminalFocus context', () => {
    const pkgPath = path.join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    
    const keybindings = pkg.contributes?.keybindings ?? [];
    const f2TerminalFocusBinding = keybindings.find(
      (kb: { key: string; when: string }) => 
        kb.key === 'f2' && kb.when?.includes('terminalFocus')
    );
    
    expect(f2TerminalFocusBinding).toBeUndefined();
  });

  it('should still have F2 keybinding for tree view contexts', () => {
    const pkgPath = path.join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    
    const keybindings = pkg.contributes?.keybindings ?? [];
    const f2TreeViewBindings = keybindings.filter(
      (kb: { key: string; when: string }) => 
        kb.key === 'f2' && kb.when?.includes('editlessTree')
    );
    
    expect(f2TreeViewBindings.length).toBeGreaterThan(0);
  });
});
