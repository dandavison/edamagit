## Spec: Delta syntax highlighting for edamagit diffs

### Architecture analysis

**Current rendering pipeline:**

1. `statusCommands.ts` fetches diffs via `repository.diffWithHEAD()` etc.
2. `toMagitChange()` parses each diff into `MagitChange.hunks: MagitChangeHunk[]`
3. `ChangeView` creates `HunkView(section, hunk)` per hunk
4. `HunkView extends TextView` — its `render()` emits the hunk's diff text as plain lines
5. `ContentProvider.provideTextDocumentContent()` calls `view.render(0).join('\n')` — pure text, no color
6. `SemanticTokensProvider` provides tokens only for `SemanticTextView` instances (branch names, etc.) — hunks are `TextView`, not `SemanticTextView`

**The gap:** `highlightDiffWithDelta()` in `deltaHighlighter.ts` converts a diff
string into `DecorationRange[]` (line/char/color). Nothing calls it. Nothing
applies `TextEditor.setDecorations()` for diff content.

### Missing component: view-level decoration extraction

The core missing piece is a function that:

1. Walks a rendered `DocumentView` tree
2. Finds all `HunkView` instances
3. Groups hunks by file (so a single delta call per file, not per hunk)
4. For each file-group, reconstructs the full diff (header + hunks) and calls `highlightDiffWithDelta`
5. Offsets the returned `DecorationRange[]` line numbers from hunk-local coordinates to document coordinates using `hunkView.range.start.line`
6. Returns all decorations ready for `TextEditor.setDecorations()`

This function (`getDocumentDeltaDecorations` or similar) is what the failing test
exercises.

### Performance considerations

- **One delta process per changed file** (not per hunk, not one giant call for
  all files) — balances process overhead against parallelism
- **Async, non-blocking**: `ContentProvider` returns text immediately;
  decorations are applied in a subsequent tick after delta completes
- **Decoration type caching**: group ranges by (fg, bg) color pair → one
  `TextEditorDecorationType` per unique color pair, reused across updates
- **Debounce**: on rapid view updates (e.g. staging/unstaging), debounce
  decoration recomputation

### Failing test rationale

The test constructs a `HunkView` with known diff text and document position,
then asserts that a function exists to extract delta decorations in document
coordinates. Since no such function exists today, the test fails — demonstrating
that the feature is absent.
