# Result: Wire up delta syntax highlighting

## What changed

Two files modified, no new files created.

### `src/utils/deltaWiring.ts`

Replaced stubs with three implementations:

- **`collectHunkViews(view)`** — walks the view tree via `walkAllSubViews()` and
  collects all `HunkView` instances regardless of fold state.
- **`groupDecorationsByStyle(decorations)`** — groups `DecorationRange[]` by
  `(foreground, background)` key, dropping colorless entries. Uses a `Map` keyed
  by `"fg|bg"` string.
- **`applyDeltaDecorations(editor, view)`** — orchestrator that composes the
  above with `getDocumentDeltaDecorations` to create VS Code
  `TextEditorDecorationType`s and apply them. Returns `Disposable[]` for
  lifecycle management.

### `src/utils/viewUtils.ts`

Wired `applyDeltaDecorations` into `ViewUtils.showView()`:

- Added a module-level `activeDecorations` map (`Map<string, Disposable[]>`)
  keyed by URI to track decoration lifecycle.
- After `showTextDocument`, disposes any previous decorations for the URI, then
  fires `applyDeltaDecorations` asynchronously (fire-and-forget with error
  logging).

## Why

The delta highlighting pipeline was complete (`deltaHighlighter.ts` →
`deltaDecorations.ts`) but had no integration point. The two pure functions
bridge the gap between the view tree and the decoration pipeline, and the
orchestrator + wiring in `showView` makes decorations appear automatically when
any magit document is displayed.

## Verification

```
$ make test   # 16 passing (195ms)
```

All tests pass including the two new `Delta Wiring` tests for `collectHunkViews`
and `groupDecorationsByStyle`.
