# Refactoring plan: delta → generic diff colorizer

## Goal

Generalize the delta-specific diff colorization so that delta is just one
instance of a "diff colorizer" — any executable that takes unified diff on stdin
and emits ANSI-colored diff on stdout.

## Architectural assessment

The current three-layer architecture is sound and largely already generic:

| Layer | Current file | Responsibility | Delta-specific bits |
|-------|-------------|----------------|-------------------|
| Colorizer | `deltaHighlighter.ts` | Spawn external tool, parse ANSI → `DecorationRange[]` | Executable name, CLI args, theme→args mapping, light-theme list |
| Decorations | `deltaDecorations.ts` | Group hunks by file, call colorizer, map line coordinates | Only naming (`DeltaOptions`, function names) |
| Wiring | `deltaWiring.ts` | Collect HunkViews, group by style, apply VS Code decorations, lifecycle | Only naming and config field access |

The ANSI parsing (`tokensToRanges`) and coordinate mapping (`decorationsForFileGroup`)
are already fully generic. The delta coupling is concentrated in `spawnDelta()` and
the options/config naming.

## Design

### Colorizer abstraction

A **colorizer preset** maps a known executable name to its default arguments.
Unknown executables are invoked with no special arguments (just stdin → stdout).

```typescript
interface ColorizerOptions {
  executable?: string;    // empty/undefined = feature disabled
  syntaxTheme?: string;
}

// Internal: returns args array for known tools, empty for unknown
function colorizerArgs(executable: string, theme?: string): string[]
```

Delta's args (`--color-only --no-gitconfig --true-color always` etc.) and
light-theme detection move into `colorizerArgs` as a `delta` case. This is a
private helper, not an extensibility point — adding a new tool means adding
a case, which is the right granularity since each tool's CLI is different.

### Configuration

| Current | New | Notes |
|---------|-----|-------|
| `magit.delta-executable` | `magit.diff-colorizer` | Executable path or name. Empty = disabled. |
| `magit.delta-syntax-theme` | `magit.diff-colorizer-theme` | Theme name passed to tools that support it. |

The `magitConfig` type and `loadConfig()` in `extension.ts` update accordingly:
`deltaExecutable` → `diffColorizer`, `deltaSyntaxTheme` → `diffColorizerTheme`.

### File renames

| Current | New |
|---------|-----|
| `src/utils/deltaHighlighter.ts` | `src/utils/diffColorizer.ts` |
| `src/utils/deltaDecorations.ts` | `src/utils/diffDecorations.ts` |
| `src/utils/deltaWiring.ts` | `src/utils/diffWiring.ts` |
| `src/test/suite/deltaHighlighter.test.ts` | `src/test/suite/diffColorizer.test.ts` |
| `src/test/suite/deltaDecorations.test.ts` | `src/test/suite/diffDecorations.test.ts` |
| `src/test/suite/deltaWiring.test.ts` | `src/test/suite/diffWiring.test.ts` |

### Export renames

| Current | New |
|---------|-----|
| `DeltaOptions` | `ColorizerOptions` |
| `highlightDiffWithDelta` | `colorizeDiff` |
| `getDocumentDeltaDecorations` | `getDocumentDecorations` |
| `applyDeltaDecorations` | `applyDecorations` |
| `refreshDeltaDecorations` | `refreshDecorations` |
| `registerDeltaDecorationListener` | `registerDecorationListener` |

`DecorationRange`, `DecorationGroup`, `collectHunkViews`, and
`groupDecorationsByStyle` are already generic — no rename needed.

## Execution plan

### Commit 1: Rename and generalize source files

1. `git mv` the three source files to their new names.
2. Update `diffColorizer.ts`:
   - Rename `DeltaOptions` → `ColorizerOptions` (fields: `executable`, `syntaxTheme`).
   - Rename `highlightDiffWithDelta` → `colorizeDiff`.
   - Rename `spawnDelta` → `spawnColorizer`.
   - Extract delta-specific arg logic into `colorizerArgs(exe, theme)` with a
     `basename === 'delta'` branch. Unknown executables get `[]`.
   - Move `isLightSyntaxTheme` and `LIGHT_SYNTAX_THEMES` inside the delta branch
     (they're delta-specific knowledge).
3. Update `diffDecorations.ts`:
   - Update import path and names.
   - Rename `getDocumentDeltaDecorations` → `getDocumentDecorations`.
4. Update `diffWiring.ts`:
   - Update import paths and names.
   - Rename exported functions per table above.
5. Update `extension.ts`:
   - Import from `./utils/diffWiring`.
   - Config fields: `diffColorizer`, `diffColorizerTheme`.
   - `loadConfig()` reads `diff-colorizer` and `diff-colorizer-theme`.
6. Update `viewUtils.ts`: import from `./utils/diffWiring`.
7. Update `package.json`: rename the two settings.
8. Compile. Fix any errors.

### Commit 2: Rename and update test files

1. `git mv` the three test files to their new names.
2. Update imports and function references to match new names.
3. Update suite/test description strings (e.g. "Delta Highlighter" →
   "Diff Colorizer").
4. Update option field names in tests (`deltaExecutable` → `executable`).
5. Run tests. All should pass (the logic is unchanged, only names changed).

### Commit 3: Bump version

Bump `package.json` patch version per project convention.

## What this plan does NOT do

- No new abstraction layer, interface hierarchy, or plugin system. The
  `colorizerArgs` function is a simple switch on executable basename. This
  matches the problem's actual complexity: there are ~2-3 tools in this space,
  each with bespoke CLI flags.
- No backwards-compatibility shims for the old setting names. The feature hasn't
  shipped upstream.
- No functional changes to the colorization pipeline. The test suite validated
  in `validation.md` will catch any accidental behavioral change.
