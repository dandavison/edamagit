import { TextEditor, Range, Position, Disposable, window } from 'vscode';
import { View } from '../views/general/view';
import { HunkView } from '../views/changes/hunkView';
import { DecorationRange } from './deltaHighlighter';
import { DocumentView } from '../views/general/documentView';
import { getDocumentDeltaDecorations } from './deltaDecorations';

export interface DecorationGroup {
  foreground?: string;
  background?: string;
  ranges: { line: number; startChar: number; endChar: number }[];
}

export function collectHunkViews(view: View): HunkView[] {
  const result: HunkView[] = [];
  for (const sub of view.walkAllSubViews()) {
    if (sub instanceof HunkView) {
      result.push(sub);
    }
  }
  return result;
}

export function groupDecorationsByStyle(decorations: DecorationRange[]): DecorationGroup[] {
  const map = new Map<string, DecorationGroup>();
  for (const d of decorations) {
    if (!d.foreground && !d.background) continue;
    const key = `${d.foreground ?? ''}|${d.background ?? ''}`;
    let group = map.get(key);
    if (!group) {
      group = { foreground: d.foreground, background: d.background, ranges: [] };
      map.set(key, group);
    }
    group.ranges.push({ line: d.line, startChar: d.startChar, endChar: d.endChar });
  }
  return [...map.values()];
}

export async function applyDeltaDecorations(
  editor: TextEditor,
  view: DocumentView,
): Promise<Disposable[]> {
  const hunkViews = collectHunkViews(view);
  if (hunkViews.length === 0) return [];

  const decorations = await getDocumentDeltaDecorations(hunkViews);
  if (decorations.length === 0) return [];

  const groups = groupDecorationsByStyle(decorations);
  const disposables: Disposable[] = [];

  for (const group of groups) {
    const decorationType = window.createTextEditorDecorationType({
      color: group.foreground,
      backgroundColor: group.background,
    });
    const ranges = group.ranges.map(
      r => new Range(new Position(r.line, r.startChar), new Position(r.line, r.endChar)),
    );
    editor.setDecorations(decorationType, ranges);
    disposables.push(decorationType);
  }

  return disposables;
}
