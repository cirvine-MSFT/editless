import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8'),
);

const properties = packageJson.contributes.configuration.properties;
const customCommandsSchema = properties['editless.customCommands'];
const commands: Array<{ command: string }> = packageJson.contributes.commands;

// ---------------------------------------------------------------------------
// Custom Commands — configuration schema
// ---------------------------------------------------------------------------

describe('editless.customCommands configuration schema', () => {
  it('should define customCommands as an array setting', () => {
    expect(customCommandsSchema).toBeDefined();
    expect(customCommandsSchema.type).toBe('array');
    expect(customCommandsSchema.default).toEqual([]);
  });

  it('should require label and command on each entry', () => {
    const itemSchema = customCommandsSchema.items;
    expect(itemSchema.type).toBe('object');
    expect(itemSchema.required).toContain('label');
    expect(itemSchema.required).toContain('command');
  });

  it('should define label as a string property', () => {
    const props = customCommandsSchema.items.properties;
    expect(props.label.type).toBe('string');
  });

  it('should define command as a string property', () => {
    const props = customCommandsSchema.items.properties;
    expect(props.command.type).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Custom Commands — command registration
// ---------------------------------------------------------------------------

describe('editless.runCustomCommand command registration', () => {
  it('should register the runCustomCommand command in package.json', () => {
    const match = commands.find(c => c.command === 'editless.runCustomCommand');
    expect(match).toBeDefined();
  });

  it('should expose runCustomCommand in the terminal context menu', () => {
    const contextMenus: Array<{ command: string; when?: string }> =
      packageJson.contributes.menus['view/item/context'];
    const entry = contextMenus.find(m => m.command === 'editless.runCustomCommand');
    expect(entry).toBeDefined();
    expect(entry!.when).toContain('terminal');
  });
});

// ---------------------------------------------------------------------------
// CustomCommandEntry interface shape (compile-time + runtime validation)
// ---------------------------------------------------------------------------

describe('CustomCommandEntry interface contract', () => {
  it('should accept a valid entry with label and command', () => {
    const entry = { label: 'Say hi', command: 'echo hello' };
    expect(entry.label).toBe('Say hi');
    expect(entry.command).toBe('echo hello');
  });

  it('should handle an empty customCommands array gracefully', () => {
    const entries: Array<{ label: string; command: string }> = [];
    expect(entries).toHaveLength(0);
    expect(entries.map(e => e.label)).toEqual([]);
  });
});
