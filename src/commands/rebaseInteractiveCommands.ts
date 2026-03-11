import { TextEditor } from 'vscode';

const COMMIT_ACTIONS = new Set([
  'pick', 'p', 'reword', 'r', 'edit', 'e',
  'squash', 's', 'fixup', 'f', 'drop', 'd',
]);

function replaceAction(line: string, newAction: string): string {
  const trimmed = line.trimStart();
  if (trimmed === '' || trimmed.startsWith('#')) return line;
  const firstWord = trimmed.split(/\s/, 1)[0];
  if (!COMMIT_ACTIONS.has(firstWord)) return line;
  const leadingWs = line.substring(0, line.length - trimmed.length);
  return leadingWs + newAction + trimmed.substring(firstWord.length);
}

function makeSetAction(action: string) {
  return async (editor: TextEditor) => {
    const line = editor.selection.active.line;
    const lineText = editor.document.lineAt(line).text;
    const replaced = replaceAction(lineText, action);
    if (replaced !== lineText) {
      await editor.edit(eb => {
        eb.replace(editor.document.lineAt(line).range, replaced);
      });
    }
  };
}

async function killLine(editor: TextEditor) {
  const line = editor.selection.active.line;
  const range = editor.document.lineAt(line).rangeIncludingLineBreak;
  await editor.edit(eb => eb.delete(range));
}

export const setRebasePick = makeSetAction('pick');
export const setRebaseReword = makeSetAction('reword');
export const setRebaseEdit = makeSetAction('edit');
export const setRebaseSquash = makeSetAction('squash');
export const setRebaseFixup = makeSetAction('fixup');
export const setRebaseDrop = makeSetAction('drop');
export const rebaseKillLine = killLine;

export const _private = { replaceAction };
