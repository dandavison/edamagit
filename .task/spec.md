# Delta Syntax Highlighting for Edamagit

## Analysis

### Current diff rendering pipeline

1. **Diff acquisition**: Raw diff text comes from VS Code's Git API
   (`repository.diffWithHEAD()`, `repository.diffIndexWithHEAD()`) or from `gitRun` with
   `['diff', '--no-ext-diff', ...]` (in `diffingCommands.ts`).

2. **Parsing**: `GitTextUtils.diffToHunks()` splits the diff at `@@` markers into
   `MagitChangeHunk` objects (`{diff, diffHeader, uri}`).

3. **View tree**: `HunkView extends TextView` wraps each hunk's raw diff text. `TextView.render()`
   splits on newlines and returns the text as-is.

4. **Content provision**: `ContentProvider.provideTextDocumentContent()` calls `view.render(0).join('\n')`
   and returns the plain text string.

5. **Coloring**: Only the TextMate grammar (`syntaxes/magit.tmGrammar.json`) applies basic diff
   coloring via `source.diff` patterns. The `SemanticTokensProvider` only colors git ref names.

### What magit-delta does

From `~/src/magit-delta/magit-delta.el`:

- Hooks into `magit-diff-wash-diffs-hook`
- Pipes the entire buffer through `delta` via `call-process-region`
- Delta args: `--color-only --max-line-distance 0.6 --true-color always --syntax-theme <auto>`
- Converts resulting ANSI escape sequences to Emacs overlays via `xterm-color-colorize-buffer`
- Remaps magit's built-in diff faces to `default` so delta's colors take precedence

### VS Code analog

VS Code doesn't have an ANSI-to-overlay converter. Instead:

- Parse ANSI SGR sequences from delta's output into `{line, startChar, endChar, fg, bg}` records
- Create `TextEditorDecorationType` instances (one per unique color combination, cached)
- Apply via `TextEditor.setDecorations()`

### Key files to modify

| File | Change |
|------|--------|
| `src/utils/deltaHighlighter.ts` | New: spawn delta, parse ANSI, return decoration ranges |
| `src/extension.ts` | Register decoration application on editor visibility changes |
| `src/providers/contentProvider.ts` | After rendering, trigger decoration pass |
| `package.json` | Add `magit.delta-enabled` and `magit.delta-path` settings |

### Delta arguments rationale

| Arg | Why |
|-----|-----|
| `--color-only` | Mandatory: preserves diff structure (no line numbers, no side-by-side) |
| `--no-gitconfig` | User's `.gitconfig` may configure delta for terminal use with features incompatible with embedding |
| `--max-line-distance 0.6` | Same as magit-delta; controls within-line diff matching |
| `--true-color always` | Ensures 24-bit color output regardless of terminal detection |
| `--syntax-theme` | Matches VS Code theme: dark → "Monokai Extended", light → "GitHub" |

### Failing test

The test (`src/test/suite/deltaHighlighter.test.ts`) invokes the delta highlighter on a
realistic TypeScript diff and asserts that decoration ranges with syntax-highlighting colors
are returned. It fails because the module does not yet exist.
