# Result: delta → generic diff colorizer refactoring

## Commits

1. **74b2976** – Generalize delta-specific diff colorization to generic diff colorizer
2. **4bde075** – Rename and update test files for generic diff colorizer
3. **9b773ca** – Bump version to 0.6.70

## What changed

### Source file renames

| Old | New |
|-----|-----|
| `src/utils/deltaHighlighter.ts` | `src/utils/diffColorizer.ts` |
| `src/utils/deltaDecorations.ts` | `src/utils/diffDecorations.ts` |
| `src/utils/deltaWiring.ts` | `src/utils/diffWiring.ts` |

### Test file renames

| Old | New |
|-----|-----|
| `src/test/suite/deltaHighlighter.test.ts` | `src/test/suite/diffColorizer.test.ts` |
| `src/test/suite/deltaDecorations.test.ts` | `src/test/suite/diffDecorations.test.ts` |
| `src/test/suite/deltaWiring.test.ts` | `src/test/suite/diffWiring.test.ts` |

### Export renames

| Old | New |
|-----|-----|
| `DeltaOptions` | `ColorizerOptions` |
| `highlightDiffWithDelta` | `colorizeDiff` |
| `getDocumentDeltaDecorations` | `getDocumentDecorations` |
| `applyDeltaDecorations` | `applyDecorations` |
| `refreshDeltaDecorations` | `refreshDecorations` |
| `registerDeltaDecorationListener` | `registerDecorationListener` |

### Configuration renames

| Old | New |
|-----|-----|
| `magit.delta-executable` | `magit.diff-colorizer` |
| `magit.delta-syntax-theme` | `magit.diff-colorizer-theme` |

### Architectural change

Delta-specific CLI args (`--color-only`, `--no-gitconfig`, `--true-color always`,
`--syntax-theme`, `--light`/`--dark`) and light-theme detection are now encapsulated in
`colorizerArgs()`, which dispatches on `basename(executable) === 'delta'`. Unknown
executables receive no special arguments — they are invoked with just stdin → stdout.

The `ColorizerOptions` interface uses generic field names (`executable`, `syntaxTheme`)
rather than delta-specific ones.

### Internal name change in diffDecorations.ts

The local mapping field `deltaStart` was renamed to `colorizerStart` since it refers to
line offsets in the colorizer output, not delta specifically.

## Verification

- `tsc --noEmit`: clean
- `npm test`: all 42 tests pass (32 pre-existing + 10 from the delta/diff colorizer suites,
  which now appear under their new names)
