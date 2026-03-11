# Implementation Plan: Wire up delta syntax highlighting

## Overview

The stub file `src/utils/deltaWiring.ts` exists with the correct interface and
exports. The test file `src/test/suite/deltaWiring.test.ts` imports
`collectHunkViews` and `groupDecorationsByStyle` from it. Implementation is
filling in the two pure functions, adding the orchestrator, and wiring the
integration point.

## Step 1: Implement `collectHunkViews` in `deltaWiring.ts`

Walk the view tree via `walkAllSubViews()` and collect `HunkView` instances:

```ts
export function collectHunkViews(view: View): HunkView[] {
  const result: HunkView[] = [];
  for (const sub of view.walkAllSubViews()) {
    if (sub instanceof HunkView) {
      result.push(sub);
    }
  }
  return result;
}
```

The view tree for a `ChangeSectionView` with N changes is:
`ChangeSectionView → [SectionHeaderView, ChangeView₁, …, ChangeViewₙ, LineBreakView]`
where each `ChangeView` has `[ChangeHeaderView, HunkView₁, …, HunkViewₘ]`.
`walkAllSubViews()` yields depth-first, so all `HunkView` instances are
reachable. The test constructs 2 changes with 1 hunk each and expects exactly 2
`HunkView` results.

**Note on fold state:** `ChangeView` has `foldedByDefault = true`. However,
`walkAllSubViews()` always walks all `subViews` regardless of fold state (fold
only affects `render()` output). So `collectHunkViews` will find hunks even when
their parent `ChangeView` is folded, which is correct—we want decorations for
all hunks that exist in the rendered document. The hunks still get valid ranges
from `render()` because `render()` assigns ranges to all subviews before
truncating the returned string array.

Wait—let me re-examine. `View.render()` at line 42-58 of `view.ts`:

```
render(startLineNumber) {
  this.retrieveFold();
  ...
  this.subViews.forEach(v => {
    const subViewRender = v.render(currentLineNumber);
    currentLineNumber += (v.range.end.line - v.range.start.line) + 1;
    renderedContent.push(...subViewRender);
  });
  this.range = ...;
  return this.folded ? renderedContent.slice(0, 1) : renderedContent;
}
```

**All** subviews are rendered (and get their ranges set) even when the parent is
folded—only the *returned* string array is truncated. So `HunkView` instances
always have valid ranges after `render()`. But when a `ChangeView` is folded,
its hunks' content is not in the document text, so applying decorations at those
line ranges would hit wrong lines. The test avoids this: `ChangeView` uses
`viewFoldStatusMemory` which is empty in a fresh test run, and
`foldedByDefault = true` means `retrieveFold()` will set `_folded = true`.

Actually, let me re-read more carefully. `retrieveFold()`:
```ts
protected retrieveFold() {
  if (this.isFoldable && this.id) {
    this._folded = viewFoldStatusMemory.get(this.id) ?? this.foldedByDefault;
  }
}
```

For `ChangeView`, `isFoldable = true` and `id` is defined, so it checks the
memory map. In a fresh test, the map won't have the key, so it falls back to
`this.foldedByDefault` which is `true`. That means ChangeView is folded in the
test. But `render()` still renders all subviews (including HunkView) and sets
their ranges—it just returns truncated output. The HunkView ranges will be set
but the content at those ranges won't actually be the hunk text in the final
document.

This is fine for the test: the test only checks that `collectHunkViews` returns
2 `HunkView` instances with `range.start.line >= 0`. It doesn't check that the
ranges correspond to actual document content.

For the real integration (`applyDeltaDecorations`), we should only collect hunks
from non-folded views. But that's Step 3's concern, and the test doesn't test
`applyDeltaDecorations`. For Step 1, the simple `instanceof` filter is correct
per the test expectations.

## Step 2: Implement `groupDecorationsByStyle` in `deltaWiring.ts`

Group `DecorationRange[]` by `(foreground, background)` key, dropping colorless
entries:

```ts
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
```

Test expectations:
- 5 input decorations, 1 colorless → 4 decorations grouped into 3 groups.
- `#ff0000` (no bg): 2 ranges (lines 5 and 6).
- `#ff0000` + `#111111` bg: 1 range (line 7).
- `#00ff00` (no bg): 1 range (line 5).
- Total ranges across groups: 4.

## Step 3: Implement `applyDeltaDecorations` in `deltaWiring.ts`

Orchestrator function. Add imports for vscode types and `getDocumentDeltaDecorations`:

```ts
import { TextEditor, Range, Position, Disposable, window } from 'vscode';
import { DocumentView } from '../views/general/documentView';
import { getDocumentDeltaDecorations } from './deltaDecorations';

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
```

This function is not tested by the existing test file (no mock for the delta
subprocess), but it composes the tested pieces.

## Step 4: Wire integration point in `ViewUtils.showView`

In `src/utils/viewUtils.ts`, after `window.showTextDocument` returns the
`TextEditor`, fire-and-forget `applyDeltaDecorations`. Manage a
`Map<string, Disposable[]>` keyed by URI to dispose previous decorations on
re-render.

```ts
import { applyDeltaDecorations } from './deltaWiring';
import { Disposable } from 'vscode';

// Module-level map for decoration lifecycle
const activeDecorations = new Map<string, Disposable[]>();

// Inside showView, after getting the editor:
public static async showView(...) {
  views.set(uri.toString(), view);
  let doc = await workspace.openTextDocument(uri);
  const editor = await window.showTextDocument(doc, { ... });

  // Dispose previous decorations for this URI
  const prev = activeDecorations.get(uri.toString());
  if (prev) {
    prev.forEach(d => d.dispose());
    activeDecorations.delete(uri.toString());
  }

  // Apply new decorations (fire-and-forget)
  applyDeltaDecorations(editor, view).then(
    disposables => {
      if (disposables.length > 0) {
        activeDecorations.set(uri.toString(), disposables);
      }
    },
    err => console.error('[edamagit] delta decorations failed:', err),
  );

  return editor;
}
```

Key design decisions:
- **Fire-and-forget**: `showView` still returns the `TextEditor` immediately
  after `showTextDocument`. The delta subprocess runs asynchronously and
  decorations appear when ready (~40-50ms later).
- **Dispose-on-re-render**: The `activeDecorations` map ensures previous
  `TextEditorDecorationType` instances are disposed before new ones are created.
- **Silent degradation**: The `.then(_, err => console.error(...))` catch
  ensures delta failures never surface to the user.

## Step 5: Verify types compile and tests pass

```bash
cd /Users/dan/tmp/3p/edamagit && npm run test-compile
```

Then run the full test suite.

## File change summary

| File | Change |
|---|---|
| `src/utils/deltaWiring.ts` | Replace stubs with implementations of `collectHunkViews`, `groupDecorationsByStyle`, and add `applyDeltaDecorations` |
| `src/utils/viewUtils.ts` | Import `applyDeltaDecorations`, add `activeDecorations` map, wire call after `showTextDocument` |

No new files created. Two files modified.

## Running the tests

From the repo root:

```bash
cd /Users/dan/tmp/3p/edamagit && npm run test
```

Or equivalently:

```bash
cd /Users/dan/tmp/3p/edamagit && make test
```

This runs `npm-run-all test-compile vscode-test`, which compiles TypeScript and
then runs the VS Code extension test runner. The test file
`src/test/suite/deltaWiring.test.ts` exercises both `collectHunkViews` and
`groupDecorationsByStyle`.

To verify the tests fail without the implementation, revert `deltaWiring.ts` to
its stub state (both functions returning `[]`) and re-run. The
`collectHunkViews` test will fail with `Expected one HunkView per change` (0 ≠
2) and the `groupDecorationsByStyle` test will fail with `Total ranges must
equal colored input decorations` (0 ≠ 4).
