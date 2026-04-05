import { TextEditor, Selection, Position } from 'vscode';

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

function selectedLines(editor: TextEditor): number[] {
  const lines = new Set<number>();
  for (const sel of editor.selections) {
    for (let i = sel.start.line; i <= sel.end.line; i++) {
      lines.add(i);
    }
  }
  return [...lines].sort((a, b) => a - b);
}

function makeSetAction(action: string) {
  return async (editor: TextEditor) => {
    const lines = selectedLines(editor);
    await editor.edit(eb => {
      for (const line of lines) {
        const lineText = editor.document.lineAt(line).text;
        const replaced = replaceAction(lineText, action);
        if (replaced !== lineText) {
          eb.replace(editor.document.lineAt(line).range, replaced);
        }
      }
    });
    const lastLine = lines[lines.length - 1];
    movePastLine(editor, lastLine);
  };
}

async function killLine(editor: TextEditor) {
  const lines = selectedLines(editor);
  await editor.edit(eb => {
    for (const line of [...lines].reverse()) {
      eb.delete(editor.document.lineAt(line).rangeIncludingLineBreak);
    }
  });
}

function movePastLine(editor: TextEditor, line: number): void {
  if (line < editor.document.lineCount - 1) {
    const pos = new Position(line + 1, 0);
    editor.selection = new Selection(pos, pos);
  }
}

export const setRebasePick = makeSetAction('pick');
export const setRebaseReword = makeSetAction('reword');
export const setRebaseEdit = makeSetAction('edit');
export const setRebaseSquash = makeSetAction('squash');
export const setRebaseFixup = makeSetAction('fixup');
export const setRebaseDrop = makeSetAction('drop');
export const rebaseKillLine = killLine;

export const _private = { replaceAction };
