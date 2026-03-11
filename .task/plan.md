# Implementation plan: `getDocumentDeltaDecorations`

## Summary

Implement the stub `getDocumentDeltaDecorations()` in `src/utils/deltaDecorations.ts`.
The function takes rendered `HunkView[]` instances and returns `DecorationRange[]` in
document coordinate space, suitable for `TextEditor.setDecorations()`.

## Single file to change

**`src/utils/deltaDecorations.ts`** — replace the stub with the real implementation.

No other files need modification. The function signature, imports, and test already exist.

## Algorithm

```
getDocumentDeltaDecorations(hunkViews, options?):
  1. Group hunkViews by file URI (changeHunk.uri.toString())
  2. For each file group (in parallel via Promise.all):
     a. Reconstruct full diff: diffHeader + all hunk diffs joined by '\n'
        - Use the diffHeader from the first hunk (all hunks of the same file share it)
        - Join: diffHeader + hunk1.diff + '\n' + hunk2.diff (if multiple hunks)
        - Ensure diffHeader ends with '\n' before appending hunks
     b. Compute the line offset mapping:
        - headerLineCount = number of lines in diffHeader (split by '\n', ignore trailing empty)
        - For each hunk in order, record:
          * deltaStartLine: where this hunk starts in the full diff (cumulative)
          * hunkLineCount: number of lines in hunk.diff
          * documentStartLine: hunkView.range.start.line
        - First hunk's deltaStartLine = headerLineCount
        - Subsequent: previous deltaStartLine + previous hunkLineCount
     c. Call highlightDiffWithDelta(fullDiff, filePath, options)
     d. For each returned DecorationRange, find which hunk it belongs to
        (by checking deltaStartLine <= range.line < deltaStartLine + hunkLineCount),
        then remap: range.line = documentStartLine + (range.line - deltaStartLine)
     e. Discard decorations that fall in the header region (no corresponding HunkView)
  3. Concatenate all file-group results and return
```

## Key details

### Diff reconstruction

`diffHeader` typically looks like:
```
diff --git a/file b/file\n
index abc..def 100644\n
--- a/file\n
+++ b/file\n
```

The hunk `diff` field starts with `@@`. The full diff for delta is simply
`diffHeader + hunkDiffs.join('\n')`. We must ensure `diffHeader` ends with `\n`
so the `@@` line starts on its own line.

### Line counting

Use `str.split('\n')` but handle trailing newlines carefully. If `diffHeader`
ends with `\n`, then `diffHeader.split('\n')` produces a trailing empty string —
the header occupies `split.length - 1` lines. The hunk text does NOT have a
leading `\n`, so it starts immediately after the header.

### Edge cases

- **Folded hunks**: A folded HunkView still has `range` set by `render()`, but
  only the first line is displayed. We should still process it (delta doesn't
  care about folding — we're highlighting the underlying text). However, the
  test always renders unfolded, so this is not a concern for correctness now.
- **Empty hunkViews array**: Return `[]` immediately.
- **Delta unavailable**: `highlightDiffWithDelta` already returns `[]`, so the
  mapping loop produces nothing. The second test exercises this.

## Implementation

```typescript
import { DecorationRange, DeltaOptions, highlightDiffWithDelta } from './deltaHighlighter';
import { HunkView } from '../views/changes/hunkView';

export async function getDocumentDeltaDecorations(
  hunkViews: HunkView[],
  options?: DeltaOptions,
): Promise<DecorationRange[]> {
  if (hunkViews.length === 0) {
    return [];
  }

  // Group hunks by file URI
  const byFile = new Map<string, HunkView[]>();
  for (const hv of hunkViews) {
    const key = hv.changeHunk.uri.toString();
    let group = byFile.get(key);
    if (!group) {
      group = [];
      byFile.set(key, group);
    }
    group.push(hv);
  }

  // Process each file group in parallel
  const results = await Promise.all(
    [...byFile.entries()].map(([_uri, group]) =>
      decorationsForFileGroup(group, options),
    ),
  );

  return results.flat();
}

async function decorationsForFileGroup(
  group: HunkView[],
  options?: DeltaOptions,
): Promise<DecorationRange[]> {
  const diffHeader = group[0].changeHunk.diffHeader;
  const filePath = group[0].changeHunk.uri.fsPath;

  // Reconstruct full diff
  const headerNormalized = diffHeader.endsWith('\n') ? diffHeader : diffHeader + '\n';
  const fullDiff = headerNormalized + group.map(hv => hv.changeHunk.diff).join('\n');

  // Compute line mapping: for each hunk, where it starts in the full diff
  const headerLineCount = headerNormalized.split('\n').length - 1;
  const hunkMappings: { deltaStart: number; lineCount: number; docStart: number }[] = [];
  let cursor = headerLineCount;
  for (const hv of group) {
    const lineCount = hv.changeHunk.diff.split('\n').length;
    hunkMappings.push({
      deltaStart: cursor,
      lineCount,
      docStart: hv.range.start.line,
    });
    cursor += lineCount;
  }

  // Run delta
  const raw = await highlightDiffWithDelta(fullDiff, filePath, options);

  // Remap to document coordinates
  const result: DecorationRange[] = [];
  for (const d of raw) {
    for (const m of hunkMappings) {
      if (d.line >= m.deltaStart && d.line < m.deltaStart + m.lineCount) {
        result.push({
          ...d,
          line: m.docStart + (d.line - m.deltaStart),
        });
        break;
      }
    }
    // Decorations in the header region are silently discarded
  }
  return result;
}
```

## What the tests verify

1. **`extracts decorations in document coordinates from HunkViews`**: Creates a
   HunkView rendered at document line 5, calls `getDocumentDeltaDecorations`,
   asserts decorations are non-empty, all lines >= 5, and at least one has a
   foreground color.

2. **`returns empty array when delta is unavailable`**: Uses a nonexistent delta
   executable, asserts empty result.

Both tests pass with the implementation and fail with the stub (which returns `[]`).

## Running the tests

The tests run inside a VS Code extension host via `@vscode/test-electron`.

```sh
cd /Users/dan/tmp/3p/edamagit
npm run test
```

This runs `npm-run-all test-compile vscode-test`, which:
1. `tsc -p ./` — compiles TypeScript
2. Launches a VS Code instance and runs Mocha test suites matching `**/**.test.js`

The delta decorations test suite is at `src/test/suite/deltaDecorations.test.ts`.

**Prerequisite**: The `delta` binary must be on `$PATH` (the first test invokes
it). The second test uses a nonexistent path and does not require delta.

To verify the tests fail without the implementation: revert `src/utils/deltaDecorations.ts`
to the stub (returning `[]`) and run `npm run test` — the first test will fail
with "Expected decoration ranges from delta".
