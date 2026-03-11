# Task: Wire up delta syntax highlighting in the magit status view

## Background

edamagit renders diffs as plain text in a virtual document (`magit://` scheme). Structural
highlighting (branch names, refs) uses VS Code semantic tokens. There is no use of
`TextEditor.setDecorations()` anywhere in the codebase.

A `delta` integration exists in two layers:
- `highlightDiffWithDelta()` spawns the `delta` binary, feeds it a unified diff, and parses
  ANSI output into `DecorationRange[]` (line, char range, fg/bg color).
- `getDocumentDeltaDecorations()` groups `HunkView[]` by file, reconstructs full diffs, calls
  `highlightDiffWithDelta`, and remaps line numbers from diff-local to document coordinates.

Neither layer is called from the extension's rendering pipeline.

## Goal

When the magit status view (or any view containing diff hunks) is displayed, diff hunks should
be syntax-highlighted by `delta`. The user should see colored diff output reflecting the
language-aware highlighting that `delta` provides.

## Specification

Implement three functions in `src/utils/deltaWiring.ts`:

1. **`collectHunkViews(view: View): HunkView[]`** — Walk the view tree via
   `walkAllSubViews()` and filter for `HunkView` instances.

2. **`groupDecorationsByStyle(decorations: DecorationRange[]): DecorationGroup[]`** — Group
   `DecorationRange` items by their `(foreground, background)` key. Each group becomes one
   `TextEditorDecorationType` + one `setDecorations` call. Drop decorations with neither
   foreground nor background.

3. **`applyDeltaDecorations(editor: TextEditor, view: DocumentView): Promise<Disposable[]>`**
   — Orchestrate: collectHunkViews → getDocumentDeltaDecorations → groupDecorationsByStyle →
   create `TextEditorDecorationType` per group → `editor.setDecorations()`. Return disposables
   for lifecycle management.

Wire the call: after `ViewUtils.showView()` returns a `TextEditor`, call
`applyDeltaDecorations` asynchronously. Dispose previous decoration types on re-render or
editor close.

## Constraints

- `delta` must be on `$PATH`; when it isn't, the highlighting silently degrades to no
  decorations (the existing `highlightDiffWithDelta` already handles this).
- The delta spawn adds ~40-50ms per file group. This is acceptable as a post-render async
  step but should not block the initial text display.
- Decoration types must be disposed on view re-render or editor close.

## Verification

Failing tests in `src/test/suite/deltaWiring.test.ts` exercise `collectHunkViews` and
`groupDecorationsByStyle`. These must pass when the implementation is complete.
