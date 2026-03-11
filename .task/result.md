# Result: Wire up delta syntax highlighting

## What changed

| File | Change |
|---|---|
| `src/utils/deltaWiring.ts` | Implement `collectHunkViews`, `groupDecorationsByStyle`, `applyDeltaDecorations`; add `refreshDeltaDecorations` lifecycle manager and `registerDeltaDecorationListener` for content-change events |
| `src/utils/viewUtils.ts` | Call `refreshDeltaDecorations(uri)` after `showTextDocument` for initial render |
| `src/extension.ts` | Register `onDidChangeTextDocument` listener via `registerDeltaDecorationListener()` |
| `src/test/suite/deltaWiring.test.ts` | Add tests for fold-aware collection, fold exclusion, and full pipeline integration |

## Bugs found and fixed

### Bug 1: Decorations on wrong lines (folded views)

`collectHunkViews` used `walkAllSubViews()` which ignores fold state.
`ChangeView` has `foldedByDefault = true`. When folded, `render()` still sets
`_range` on child HunkViews as if expanded, but the fold-aware `range` getter
makes the parent occupy only 1 line. Result: HunkView ranges pointed into the
file listing area, causing decorations on filenames.

**Fix:** Replaced `walkAllSubViews()` with `walkVisible()` that skips children
of folded views.

### Bug 2: Decorations never applied (wrong trigger point)

`applyDeltaDecorations` was only called in `showView`, which runs once when the
document is first created. At that point, `ChangeView`s are folded by default →
`collectHunkViews` returns `[]` → no decorations. When the user later unfolds a
ChangeView, the content provider re-renders but decorations were never
re-applied.

**Fix:** Two trigger points:
1. `showView` calls `refreshDeltaDecorations(uri)` after showing the editor
   (handles initial render for views like `SectionDiffView` where hunks are
   unfolded from the start).
2. `workspace.onDidChangeTextDocument` listener calls
   `refreshDeltaDecorations(uri)` whenever a magit document's content changes
   (handles fold toggles, status refreshes, and any other re-render).

The `refreshDeltaDecorations` function centralizes the lifecycle: finds the
editor and view, disposes previous decoration types, and applies new ones.

## Verification

```
$ make test   # 18 passing (210ms)
```

Tests cover:
- `collectHunkViews` finds hunks in unfolded ChangeViews
- `collectHunkViews` excludes hunks inside folded ChangeViews
- Full pipeline (collect → delta → group) produces non-empty decoration groups
  with ranges within hunk bounds
- `groupDecorationsByStyle` groups correctly by (foreground, background)
