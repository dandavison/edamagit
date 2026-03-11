# Result: `getDocumentDeltaDecorations`

## What changed

**`src/utils/deltaDecorations.ts`** — replaced the stub (returning `[]`) with the
full implementation.

## How it works

1. Groups `HunkView` instances by file URI
2. For each file group, reconstructs the full unified diff (`diffHeader` + hunk diffs)
   that `delta` expects as input
3. Builds a line-offset mapping so each hunk's position in the reconstructed diff
   can be translated back to its position in the rendered VS Code document
4. Calls `highlightDiffWithDelta` with the full diff
5. Remaps each returned `DecorationRange` from diff-local coordinates to document
   coordinates using the hunk mapping; decorations falling in the diff header
   region (no corresponding `HunkView`) are discarded

File groups are processed in parallel via `Promise.all`.

## Tests

All 14 tests pass (`npm run test`), including:
- `extracts decorations in document coordinates from HunkViews` — verifies
  decorations are non-empty, lines are offset correctly, and syntax colors are present
- `returns empty array when delta is unavailable` — verifies graceful fallback
