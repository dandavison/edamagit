# Result: Delta Syntax Highlighting

## What changed

**`src/utils/deltaHighlighter.ts`** — replaced the stub with a working implementation.

### Implementation

1. **`spawnDelta()`** — async helper that spawns the `delta` executable with `--color-only
   --no-gitconfig --true-color always --syntax-theme <theme>`, writes the diff to stdin, collects
   stdout, and returns `null` on any failure (ENOENT, non-zero exit, 5s timeout). Flags
   `--file-style=omit` and `--hunk-header-style=plain` suppress delta's decorative headers so
   the output is just ANSI-colored diff lines.

2. **`tokensToRanges()`** — pure function that walks `ParseToken[]` from `ansi-sequence-parser`,
   tracking line/column position across newlines in token values, and emits a `DecorationRange`
   for each colored segment. Uses `createColorPalette()` from the library to convert all color
   types (named, 256-table, 24-bit RGB) to hex strings.

3. **`highlightDiffWithDelta()`** — orchestrates: spawn delta, parse ANSI, convert to ranges.
   Logs `performance.now()` elapsed time for the spawn to the extension output channel.

### Dependency

`ansi-sequence-parser` was already in `node_modules` (no `package.json` change needed).

## Why

The plan called for a core utility function that spawns `delta`, parses its ANSI SGR output into
`DecorationRange[]`, and gracefully returns `[]` on failure. This is the foundation for
delta-based syntax highlighting in the magit diff views. Integration into VS Code decorations is
out of scope for this step.

## Verification

All 12 tests pass (`npm run test`), including the 3 delta highlighter tests:
- Positive case: produces decoration ranges with colors (~43ms)
- Line bounds: decoration lines stay within diff bounds
- Graceful failure: nonexistent delta path returns `[]`
