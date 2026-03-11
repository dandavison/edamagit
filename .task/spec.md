# Spec: Wire up delta syntax highlighting in magit views

## Bug (absence of feature)

`getDocumentDeltaDecorations()` in `src/utils/deltaDecorations.ts` correctly
reconstructs diffs from `HunkView[]`, calls `delta`, and remaps line numbers to
document coordinates. But nothing in the extension ever calls it. The rendering
pipeline (`ContentProvider.provideTextDocumentContent` → `view.render()` →
`ViewUtils.showView()`) produces plain text with no diff syntax highlighting.

## Analysis

### What exists

| Layer | File | Status |
|---|---|---|
| Delta subprocess + ANSI parsing | `src/utils/deltaHighlighter.ts` | Complete, tested |
| Hunk grouping + coordinate remapping | `src/utils/deltaDecorations.ts` | Complete, tested |
| View tree with `HunkView` instances | `src/views/changes/hunkView.ts` | Complete |
| `View.walkAllSubViews()` generator | `src/views/general/view.ts:89` | Complete |

### What is missing

Three pure-logic functions and one integration point:

1. **`collectHunkViews(view: View): HunkView[]`** — Walk the view tree via
   `walkAllSubViews()` and filter for `HunkView` instances. Trivial but must
   exist as an explicit function for testability and to avoid scattering
   `instanceof` checks.

2. **`groupDecorationsByStyle(decorations: DecorationRange[]): DecorationGroup[]`**
   — Group `DecorationRange` items by their `(foreground, background)` key.
   Each group becomes one `TextEditorDecorationType` + one `setDecorations`
   call. Decorations with neither foreground nor background are dropped.

3. **`applyDeltaDecorations(editor: TextEditor, view: DocumentView): Promise<Disposable[]>`**
   — Orchestrator: collectHunkViews → getDocumentDeltaDecorations →
   groupDecorationsByStyle → create `TextEditorDecorationType` per group →
   `editor.setDecorations()`. Returns disposables for lifecycle management.

4. **Integration point** — After `ViewUtils.showView()` returns a `TextEditor`,
   call `applyDeltaDecorations` asynchronously (fire-and-forget with error
   logging). Dispose previous decoration types on re-render.

### Data flow

```
DocumentView
  └─ walkAllSubViews() ──▶ HunkView[]
                              │
                    getDocumentDeltaDecorations()
                              │
                        DecorationRange[]
                              │
                    groupDecorationsByStyle()
                              │
                       DecorationGroup[]
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
    createDecorationType  createDecorationType  ...
    editor.setDecorations editor.setDecorations ...
```

## Failing tests

`src/test/suite/deltaWiring.test.ts` — two tests:

1. **collectHunkViews** — Builds a `ChangeSectionView` with 2 changes (each
   having 1 hunk), renders it, calls `collectHunkViews`, asserts it returns 2
   `HunkView` instances with valid ranges. **Fails:** stub returns `[]`.

2. **groupDecorationsByStyle** — Feeds 5 `DecorationRange` items (3 distinct
   style keys, 1 colorless), asserts correct grouping into 3 groups with
   correct range counts. **Fails:** stub returns `[]`.

## Constraints

- `delta` absence degrades silently (no decorations, no errors).
- Delta spawn (~40-50ms per file group) must not block initial text display.
- Decoration types must be disposed on view re-render or editor close.
