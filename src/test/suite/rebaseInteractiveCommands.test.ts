import * as assert from 'assert';
import { _private } from '../../commands/rebaseInteractiveCommands';

const replaceAction = _private.replaceAction;

suite('rebase interactive commands', () => {

  test('replaceAction - pick to squash', () => {
    assert.strictEqual(
      replaceAction('pick abc1234 Fix bug', 'squash'),
      'squash abc1234 Fix bug'
    );
  });

  test('replaceAction - pick to fixup', () => {
    assert.strictEqual(
      replaceAction('pick abc1234 Fix bug', 'fixup'),
      'fixup abc1234 Fix bug'
    );
  });

  test('replaceAction - pick to reword', () => {
    assert.strictEqual(
      replaceAction('pick abc1234 Fix bug', 'reword'),
      'reword abc1234 Fix bug'
    );
  });

  test('replaceAction - pick to edit', () => {
    assert.strictEqual(
      replaceAction('pick abc1234 Fix bug', 'edit'),
      'edit abc1234 Fix bug'
    );
  });

  test('replaceAction - pick to drop', () => {
    assert.strictEqual(
      replaceAction('pick abc1234 Fix bug', 'drop'),
      'drop abc1234 Fix bug'
    );
  });

  test('replaceAction - squash back to pick', () => {
    assert.strictEqual(
      replaceAction('squash abc1234 Fix bug', 'pick'),
      'pick abc1234 Fix bug'
    );
  });

  test('replaceAction - abbreviated action to full', () => {
    assert.strictEqual(
      replaceAction('p abc1234 Fix bug', 'squash'),
      'squash abc1234 Fix bug'
    );
  });

  test('replaceAction - idempotent pick to pick', () => {
    assert.strictEqual(
      replaceAction('pick abc1234 Fix bug', 'pick'),
      'pick abc1234 Fix bug'
    );
  });

  test('replaceAction - comment line unchanged', () => {
    const comment = '# This is a comment';
    assert.strictEqual(replaceAction(comment, 'squash'), comment);
  });

  test('replaceAction - empty line unchanged', () => {
    assert.strictEqual(replaceAction('', 'squash'), '');
  });

  test('replaceAction - exec line unchanged', () => {
    const exec = 'exec make test';
    assert.strictEqual(replaceAction(exec, 'squash'), exec);
  });

  test('replaceAction - break line unchanged', () => {
    const brk = 'break';
    assert.strictEqual(replaceAction(brk, 'squash'), brk);
  });

  test('replaceAction - fixup to edit', () => {
    assert.strictEqual(
      replaceAction('fixup def5678 Add feature', 'edit'),
      'edit def5678 Add feature'
    );
  });

  test('replaceAction - message with spaces preserved', () => {
    assert.strictEqual(
      replaceAction('pick abc1234 Fix the bug in the parser', 'reword'),
      'reword abc1234 Fix the bug in the parser'
    );
  });
});
