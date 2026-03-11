import { TextEditor, Range, Position, Disposable, window, Uri, workspace } from 'vscode';
import { View } from '../views/general/view';
import { HunkView } from '../views/changes/hunkView';
import { DecorationRange } from './deltaHighlighter';
import { DocumentView } from '../views/general/documentView';
import { getDocumentDeltaDecorations } from './deltaDecorations';
import { views } from '../extension';
import * as Constants from '../common/constants';

export interface DecorationGroup {
  foreground?: string;
  background?: string;
  ranges: { line: number; startChar: number; endChar: number }[];
}

const activeDecorations = new Map<string, Disposable[]>();

export function collectHunkViews(view: View): HunkView[] {
  const result: HunkView[] = [];
  walkVisible(view, result);
  return result;
}

function walkVisible(view: View, out: HunkView[]): void {
  for (const sub of view.subViews) {
    if (sub instanceof HunkView) {
      if (!sub.folded) {
        out.push(sub);
      }
    } else if (!sub.folded) {
      walkVisible(sub, out);
    }
  }
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
      backgroundColor: withAlpha(group.background, 'bb'),
    });
    const ranges = group.ranges.map(
      r => new Range(new Position(r.line, r.startChar), new Position(r.line, r.endChar)),
    );
    editor.setDecorations(decorationType, ranges);
    disposables.push(decorationType);
  }

  return disposables;
}

function withAlpha(color: string | undefined, alpha: string): string | undefined {
  if (!color) return undefined;
  // #rrggbb → #rrggbbaa; already-alpha colors pass through
  if (color.length === 7 && color[0] === '#') return color + alpha;
  return color;
}

function disposeForUri(key: string): void {
  const prev = activeDecorations.get(key);
  if (prev) {
    prev.forEach(d => d.dispose());
    activeDecorations.delete(key);
  }
}

export function refreshDeltaDecorations(uri: Uri): void {
  const key = uri.toString();
  const view = views.get(key);
  const editor = window.visibleTextEditors.find(
    ed => ed.document.uri.toString() === key,
  );
  if (!view || !editor) {
    disposeForUri(key);
    return;
  }

  disposeForUri(key);

  applyDeltaDecorations(editor, view).then(
    disposables => {
      if (disposables.length > 0) {
        activeDecorations.set(key, disposables);
      }
    },
    err => console.error('[edamagit] delta decorations failed:', err),
  );
}

export function registerDeltaDecorationListener(): Disposable {
  return workspace.onDidChangeTextDocument(e => {
    if (e.document.uri.scheme === Constants.MagitUriScheme) {
      refreshDeltaDecorations(e.document.uri);
    }
  });
}
