Currently, edamagit does not display diffs with syntax highlighting:

/var/folders/d2/hflhkhsd08v8nbjf3jf9yfdm0000gn/T/clipboard-1773222136247.png

I would like edamagit to use delta (https://github.com/dandavison/delta) for syntax highlighting. Use delta -h to get an overview of all commands.

For reference, look at how I do this in magit-delta: ~/src/magit-delta. There are some delta args you'll want to use for this use case.

## Specification

### Problem
Edamagit displays diffs as plain text. The only coloring comes from the TextMate `source.diff`
grammar (which colors `+` lines green, `-` lines red, `@@` lines blue). There is no syntax
highlighting of the actual code content within diff hunks.

### Solution
Pipe raw git diff output through `delta --color-only` to obtain ANSI-colored diff output, parse the
ANSI escape sequences into color ranges, and apply them as VS Code editor decorations.

### Architecture

**New module: `src/utils/deltaHighlighter.ts`**

Core function: given raw diff text and a file path (for language detection), spawn `delta` with
appropriate arguments, capture ANSI output, and return an array of decoration descriptors (line,
character range, foreground color, background color).

Delta arguments (derived from magit-delta):
- `--color-only`: Preserve original diff structure; only add ANSI color sequences
- `--max-line-distance 0.6`: Within-line diff alignment parameter
- `--true-color always`: Use 24-bit ANSI color
- `--no-gitconfig`: Ignore user's gitconfig delta configuration (which may enable side-by-side,
  line numbers, etc. that would break the diff structure)
- `--syntax-theme <theme>`: Auto-selected based on VS Code's active color theme kind (dark/light)

**ANSI parsing**: Parse SGR sequences (`\x1b[...m`) from delta's stdout to extract foreground and
background RGB colors. Map these to VS Code `TextEditorDecorationType` instances.

**Decoration application**: After `ContentProvider` renders the document and it is displayed in an
editor, apply decorations to the visible text editor. This requires hooking into the editor
lifecycle (e.g. `onDidChangeVisibleTextEditors` or after `showView`).

**Configuration**: Add a `magit.delta-enabled` boolean setting (default: true) and a
`magit.delta-path` string setting for the delta executable path.

### Data flow
1. Git diff text obtained (via VS Code Git API or `gitRun`)
2. Diff text piped through delta → ANSI-colored output
3. ANSI sequences parsed into `DecorationRange[]`
4. Plain diff text (with ANSI stripped) used for rendering (as today)
5. After document is displayed, decorations applied to the editor

### Constraints
- Delta processing must not block the UI; use async spawning
- If delta is not installed, fall back silently to current behavior
- The `--color-only` flag is mandatory: delta must not alter diff structure
- Decorations must be reapplied when the document is re-rendered (e.g. after fold/unfold)
