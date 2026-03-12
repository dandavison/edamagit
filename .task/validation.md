# Test suite validation for delta→generic colorizer refactoring

Deliberate breakages were introduced one at a time, compiled, and tested.
Each breakage was reverted after observation.

## Breakages tested

### 1. Off-by-one in line mapping (`deltaDecorations.ts`)

**Change:** `m.docStart + (d.line - m.deltaStart)` → `+ 1`

**Result (before test fix):** `deltaWiring.test.ts` "full pipeline" caught it
(`Decoration line 9 outside hunk range [2, 8]`). But `deltaDecorations.test.ts`
did NOT catch it — it only checked `d.line >= documentStartLine` (lower bound),
so the shifted-up lines still passed.

**Action taken:** Strengthened `deltaDecorations.test.ts` to check both bounds:
`d.line >= documentStartLine && d.line <= documentEndLine`. After fix, both
tests catch the off-by-one.

### 2. Remove fold guard on non-HunkView recursion (`deltaWiring.ts`)

**Change:** `} else if (!sub.folded) {` → `} else {`

**Result:** `deltaWiring.test.ts` "collectHunkViews excludes HunkViews inside
folded ChangeViews" caught it (`2 !== 0`). **PASS**

### 3. Collapse style grouping key to constant (`deltaWiring.ts`)

**Change:** grouping key `${d.foreground}|${d.background}` → `'all'`

**Result:** `deltaWiring.test.ts` "groupDecorationsByStyle groups by
(foreground, background) pair" caught it (`4 !== 2`). **PASS**

### 4. Remove `--color-only` from delta spawn args (`deltaHighlighter.ts`)

**Change:** Removed `'--color-only'` from args array.

**Result:** `deltaHighlighter.test.ts` "preserves diff structure" caught it
(`Decoration line numbers must be within diff bounds`). **PASS**

### 5. Swap foreground/background in ANSI→decoration mapping (`deltaHighlighter.ts`)

**Change:** Swapped `range.foreground = palette.value(token.foreground!)` with
background assignment and vice versa.

**Result:** Two tests failed: `deltaHighlighter.test.ts` "preserves diff
structure" and `deltaWiring.test.ts` "groupDecorationsByStyle". **PASS**

### 6. Remove no-color filter in groupDecorationsByStyle (`deltaWiring.ts`)

**Change:** Removed `if (!d.foreground && !d.background) continue;`

**Result:** `deltaWiring.test.ts` "groupDecorationsByStyle" caught it
(`5 !== 4` — extra uncolored decoration leaked through). **PASS**

### 7. Break default executable name (`deltaHighlighter.ts`)

**Change:** Default `'delta'` → `'nonexistent-binary'`

**Result:** Three tests failed across all three test files — every integration
test that relies on the default executable. **PASS**

## Summary

| # | Breakage | Caught? | By which test(s) |
|---|----------|---------|-------------------|
| 1 | Line mapping off-by-one | Partial → Fixed | deltaWiring (pipeline), now also deltaDecorations |
| 2 | Fold guard removed | Yes | deltaWiring (fold exclusion) |
| 3 | Grouping key collapsed | Yes | deltaWiring (style grouping) |
| 4 | --color-only removed | Yes | deltaHighlighter (line bounds) |
| 5 | fg/bg swapped | Yes | deltaHighlighter + deltaWiring |
| 6 | No-color filter removed | Yes | deltaWiring (style grouping) |
| 7 | Default executable broken | Yes | All three test files |

## Test improvement made

One test was strengthened: `deltaDecorations.test.ts` now checks that decoration
lines fall within `[documentStartLine, documentStartLine + hunkLineCount - 1]`
rather than only checking the lower bound. This ensures the coordinate
translation in `decorationsForFileGroup` is tested with full bounds coverage
at the decorations layer, not just the wiring pipeline layer.
