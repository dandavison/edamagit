import * as assert from 'assert';
import { Tab } from 'vscode';
import { isLoneEditorGroup } from '../../commands/macros';

function group(tabCount: number): { tabs: readonly Tab[] } {
  return { tabs: new Array(tabCount).fill({} as Tab) };
}

suite('quitMagitView – lone editor detection', () => {

  test('single group with a single tab empties the workbench', () => {
    assert.strictEqual(isLoneEditorGroup([group(1)]), true);
  });

  test('single group with multiple tabs does not empty the workbench', () => {
    assert.strictEqual(isLoneEditorGroup([group(2)]), false);
  });

  test('multiple non-empty groups do not empty the workbench', () => {
    assert.strictEqual(isLoneEditorGroup([group(1), group(1)]), false);
  });

  test('empty groups are ignored when counting', () => {
    assert.strictEqual(isLoneEditorGroup([group(1), group(0)]), true);
    assert.strictEqual(isLoneEditorGroup([group(0)]), false);
  });
});
