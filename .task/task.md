## Task: Wire delta syntax highlighting into edamagit's diff display

### Problem

edamagit displays diffs as plain text with no syntax highlighting. The utility
`highlightDiffWithDelta` exists and produces `DecorationRange[]` from a diff
string via the `delta` tool, but no code path in the extension calls it. Diffs
in the status view (and diff views) are rendered through `HunkView` → `TextView`
→ `ContentProvider` as uncolored text.

### Goal

When a magit document containing diff hunks is displayed, apply delta-produced
syntax-highlighting decorations to the editor. The decorations must be
positioned correctly in document coordinate space (each hunk's DecorationRange
line numbers are relative to the hunk; they must be offset to the hunk's
position within the rendered document).

### Constraints

- **Performance**: delta is spawned per-diff (not per-hunk). Highlighting must
  not block document rendering — decorations can be applied asynchronously after
  the document text is ready. Batch all hunks for a single file into one delta
  call where possible.
- **Graceful degradation**: if delta is not installed, no decorations are
  applied (no errors, no user-visible difference from today).
- **Minimal change surface**: use `vscode.TextEditor.setDecorations()` with
  decoration types created from delta's color output. Do not alter the existing
  semantic tokens or TextMate grammar.
