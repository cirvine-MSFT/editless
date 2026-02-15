import * as assert from 'assert';
import * as vscode from 'vscode';

suite('EditLess Extension', () => {
  test('should activate successfully', async () => {
    const ext = vscode.extensions.getExtension('cirvine-MSFT.editless');
    assert.ok(ext, 'Extension should be installed');
    await ext.activate();
    assert.strictEqual(ext.isActive, true, 'Extension should be active');
  });

  test('should register the agent tree view', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes('editless.refresh'),
      'editless.refresh command should be registered',
    );
  });
});
