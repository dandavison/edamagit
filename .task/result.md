# Result: Wire up delta syntax highlighting

## What changed

Two source files modified, one test file modified, no new files created.

### `src/utils/deltaWiring.ts`

Replaced stubs with three implementations:

- **`collectHunkViews(view)`** — walks the view tree collecting `HunkView`
  instances, **respecting fold state**. Uses a custom `walkVisible()` traversal
  that skips children of folded views. This is critical because `render()` sets
  `_range` on all subviews even inside folded parents, but those ranges don't
  correspond to actual document lines — applying decorations at those positions
  would color the wrong lines (e.g. filenames in the listing instead of diff
  content).
- **`groupDecorationsByStyle(decorations)`** — groups `DecorationRange[]` by
  `(foreground, background)` key, dropping colorless entries.
- **`applyDeltaDecorations(editor, view)`** — orchestrator composing the above
  with `getDocumentDeltaDecorations` to create VS Code decoration types and
  apply them.

### `src/utils/viewUtils.ts`

Wired `applyDeltaDecorations` into `ViewUtils.showView()`:

- Module-level `activeDecorations` map for decoration lifecycle management.
- Fire-and-forget call after `showTextDocument` with error logging.

### `src/test/suite/deltaWiring.test.ts`

- Updated existing test to explicitly unfold ChangeViews before asserting
  HunkView collection (ChangeView.foldedByDefault = true).
- Added test verifying folded ChangeViews yield zero HunkViews.

## Bug found and fixed

The original plan's `collectHunkViews` used `walkAllSubViews()` which ignores
fold state. `ChangeView` has `foldedByDefault = true`. When folded, `render()`
still assigns `_range` to child HunkViews as if expanded, but the parent's
fold-aware `range` getter returns a single-line range. The parent's `render()`
advances `currentLineNumber` by only 1, so subsequent views get correct line
numbers — but the HunkViews inside the folded ChangeView have stale/wrong
ranges pointing into the file listing area. Decorations landed on filenames
instead of diff content.

## Verification

```
$ make test   # 17 passing (192ms)
```
