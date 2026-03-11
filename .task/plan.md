# Implementation Plan: Delta Syntax Highlighting

## Overview

Implement `highlightDiffWithDelta()` in `src/utils/deltaHighlighter.ts` to spawn `delta`, parse
its ANSI SGR output into `DecorationRange[]`, and gracefully return `[]` on failure.

The existing interfaces (`DecorationRange`, `DeltaOptions`) and function signature are already
defined as a stub. Integration into the VS Code extension (decorations, settings, editor hooks)
is out of scope for this step — the goal is the core function that the existing test exercises.

## Step 1: Implement `highlightDiffWithDelta`

**File:** `src/utils/deltaHighlighter.ts`

The function must:

1. **Resolve the delta executable.** Use `options.deltaExecutable` if provided; otherwise default
   to `'delta'` (found via `PATH`).

2. **Spawn delta** with `child_process.execFile` (promisified), passing the diff on stdin. Args:
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

4. **Parse ANSI SGR sequences from stdout.** Delta produces 24-bit color via:
   - `\x1b[38;2;R;G;Bm` — set foreground to RGB
   - `\x1b[48;2;R;G;Bm` — set background to RGB
   - `\x1b[0m` — reset all attributes
   - `\x1b[0K` — erase to end of line (ignore, it's a terminal artifact)
   - Compound sequences like `\x1b[48;2;R;G;B;38;2;R;G;Bm` (both in one escape)

   The parser walks stdout character by character, tracking:
   - Current line number and character offset (within the visible/stripped text)
   - Current active foreground and background colors
   - Start position of the current color span

   On each color change or newline, emit a `DecorationRange` for the span that just ended (if it
   had any color). Convert RGB values to `#rrggbb` hex strings.

5. **Return the array of `DecorationRange`** objects.

### Implementation details

The ANSI parser is the core complexity. Key design decisions:

- **Single-pass streaming parser.** Walk the delta output string once. When `\x1b[` is
  encountered, extract everything up to `m` (or `K`, which we skip). Parse the semicolon-delimited
  parameters to extract `38;2;R;G;B` and `48;2;R;G;B` subsequences. `0` resets both colors.

- **Character position tracking.** The `startChar` and `endChar` in `DecorationRange` refer to
  positions in the *stripped* (ANSI-free) text. The parser must count only visible characters.

- **Emit on color change.** When the active fg/bg changes, close the current span and open a new
  one. When a newline is encountered, close the current span, increment line, reset char offset.

- **Skip empty spans.** Don't emit a `DecorationRange` if `startChar === endChar`.

### Helper: `spawnDelta`

A small async helper that wraps `child_process.spawn`, writes stdin, collects stdout, and returns
the output string. Returns `null` on any error (ENOENT, non-zero exit, timeout). Use a reasonable
timeout (5 seconds).

### Helper: `parseAnsiRanges`

A pure function `(ansiText: string) => DecorationRange[]` that implements the parser. This
separation makes the parser independently testable and keeps `highlightDiffWithDelta` simple.

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
