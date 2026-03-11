# Implementation Plan: Delta Syntax Highlighting

## Overview

Implement `highlightDiffWithDelta()` in `src/utils/deltaHighlighter.ts` to spawn `delta`, parse
its ANSI SGR output into `DecorationRange[]`, and gracefully return `[]` on failure.

The existing interfaces (`DecorationRange`, `DeltaOptions`) and function signature are already
defined as a stub. Integration into the VS Code extension (decorations, settings, editor hooks)
is out of scope for this step — the goal is the core function that the existing test exercises.

## Step 0: Add `ansi-sequence-parser` dependency

```sh
npm install ansi-sequence-parser
```

This library parses ANSI SGR sequences (including 24-bit true color) into typed spans:
`{value, foreground, background, decorations}` where colors are discriminated unions
(`NamedColor | TableColor | RgbColor`). It handles all the SGR complexity (compound sequences,
resets, erase-line codes) so we don't have to.

## Step 1: Implement `highlightDiffWithDelta`

**File:** `src/utils/deltaHighlighter.ts`

The function must:

1. **Resolve the delta executable.** Use `options.deltaExecutable` if provided; otherwise default
   to `'delta'` (found via `PATH`).

2. **Spawn delta** with `child_process.spawn`, passing the diff on stdin. Args:
   ```
   --color-only
   --no-gitconfig
   --max-line-distance 0.6
   --true-color always
   --syntax-theme <theme>
   ```
   Default theme: `options.syntaxTheme ?? 'GitHub'`.

3. **Handle spawn failure gracefully.** If the executable doesn't exist or exits non-zero, return
   `[]`. This satisfies the "nonexistent delta" test case. Use a try/catch around the spawn; do
   not let errors propagate.

4. **Parse ANSI output using `ansi-sequence-parser`.** Call `parseAnsiSequences(stdout)` to get
   an array of `ParsedSpan` objects, each with `.value` (visible text), `.foreground`, and
   `.background` (typed color unions or null).

5. **Convert spans to `DecorationRange[]`.** Walk the parsed spans, tracking current line and
   character offset. For each span:
   - Split `.value` on newlines (a span can contain newlines)
   - For each segment, if the span has a foreground or background color, emit a `DecorationRange`
     with the appropriate line/startChar/endChar and hex color string
   - Advance character offset by segment length; on newline, increment line and reset offset
   - Convert `RgbColor` to `#rrggbb`; for `NamedColor`/`TableColor`, map to a reasonable hex
     value (or skip — delta with `--true-color always` should only produce RGB)

6. **Return the array of `DecorationRange`** objects.

### Helper: `spawnDelta`

A small async helper that wraps `child_process.spawn`, writes stdin, collects stdout, and returns
the output string. Returns `null` on any error (ENOENT, non-zero exit, timeout). Use a reasonable
timeout (5 seconds).

### Helper: `spansToRanges`

A pure function `(spans: ParsedSpan[]) => DecorationRange[]` that walks the parsed spans and
emits decoration ranges. This separation keeps `highlightDiffWithDelta` simple and makes the
conversion logic independently testable if needed.

## Step 2: Verify

Run the existing test suite. The three tests exercise:

1. **Positive case:** A TypeScript diff produces decoration ranges with colors.
2. **Line bounds:** Decoration line numbers stay within the diff's line count.
3. **Graceful failure:** A nonexistent delta path returns `[]`.

No changes to the test file are needed.

## What is NOT in scope

- `package.json` settings (`magit.delta-enabled`, `magit.delta-path`)
- `extension.ts` integration (editor visibility hooks, decoration application)
- `contentProvider.ts` changes
- `TextEditorDecorationType` caching and `setDecorations()` calls

These are the extension-integration layer. This plan covers only the core utility that the test
validates.

## How to run the tests

Prerequisites: `delta` must be installed and on `PATH` (confirmed: `/Users/dan/bin/delta` v0.18.2).

```sh
cd /Users/dan/tmp/3p/edamagit
npm run test
```

This runs `npm-run-all test-compile vscode-test`, which:
1. Compiles TypeScript to `out/` via `tsc -p ./`
2. Runs `@vscode/test-cli` which discovers `out/src/test/**/*.test.js` and executes them inside a
   VS Code electron instance

The tests **pass** with the implementation and **fail** without it (the stub returns `[]`, so
the first test's `assert.ok(ranges.length > 0, ...)` fails).

To run just the delta highlighter test in isolation (faster iteration during development):

```sh
cd /Users/dan/tmp/3p/edamagit
npm run test-compile && npx vscode-test --grep "Delta Highlighter"
```
