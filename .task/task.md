# Task: Wire up delta syntax highlighting in the magit status view

## Background

edamagit renders diffs as plain text in a virtual document (`magit://` scheme). Structural
highlighting (branch names, refs) uses VS Code semantic tokens. There is no use of
`TextEditor.setDecorations()` anywhere in the codebase.

A `delta` integration exists in two layers:
- `highlightDiffWithDelta()` spawns the `delta` binary, feeds it a unified diff, and parses
  ANSI output into `DecorationRange[]` (line, char range, fg/bg color).
- `getDocumentDeltaDecorations()` is a stub intended to take rendered `HunkView[]` instances,
  reconstruct the full diff, call `highlightDiffWithDelta`, and remap the returned line numbers
  from diff-local coordinates to document coordinates.

Neither layer is called from the extension's rendering pipeline. The stub returns `[]`.

## Goal

When the magit status view (or any view containing diff hunks) is displayed, diff hunks should
be syntax-highlighted by `delta`. The user should see colored diff output reflecting the
language-aware highlighting that `delta` provides.

## What needs to happen

1. **Implement `getDocumentDeltaDecorations`** — the stub in `src/utils/deltaDecorations.ts`.
   Groups hunks by file, reconstructs full diffs, calls `highlightDiffWithDelta`, remaps line
   numbers to document space. A plan and test already exist for this.

2. **Convert `DecorationRange[]` to VS Code decoration API calls** — `setDecorations` requires
   `TextEditorDecorationType` objects, one per unique style (color combination). We need a
   module that:
   - Groups `DecorationRange` items by their (foreground, background) pair
   - Creates a `TextEditorDecorationType` for each unique pair
   - Calls `editor.setDecorations(type, ranges)` for each group

3. **Collect `HunkView` instances from the view tree** — after a `DocumentView` is rendered,
   walk its subview tree to find all `HunkView` instances. These have the `changeHunk` data
   and, after `render()`, the document-coordinate `range`.

4. **Trigger decoration application** — find the right integration point in the rendering
   lifecycle. Likely after `ViewUtils.showView()` returns a `TextEditor`, or in response to
   `contentProvider.onDidChange`. The decoration call is async (spawns `delta`) so it will
   apply slightly after the text appears, which is fine.

5. **Lifecycle management** — dispose decoration types when the view is re-rendered or the
   editor is closed, to avoid stale decorations and leaked disposables.

## Constraints

- `delta` must be on `$PATH`; when it isn't, the highlighting silently degrades to no
  decorations (the existing `highlightDiffWithDelta` already handles this).
- The delta spawn adds ~40-50ms per file group. This is acceptable as a post-render async
  step but should not block the initial text display.
- Existing tests in `src/test/suite/deltaDecorations.test.ts` cover the decoration extraction
  logic. The wiring into the extension is best verified manually.
