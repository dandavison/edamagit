import * as assert from 'assert';
import { Uri } from 'vscode';
import { collectHunkViews, groupDecorationsByStyle } from '../../utils/deltaWiring';
import { DecorationRange } from '../../utils/deltaHighlighter';
import { HunkView } from '../../views/changes/hunkView';
import { ChangeSectionView } from '../../views/changes/changesSectionView';
import { ChangeView } from '../../views/changes/changeView';
import { Section } from '../../views/general/sectionHeader';
import { MagitChange } from '../../models/magitChange';
import { Status } from '../../typings/git';

const diffHeader = `diff --git a/src/app.ts b/src/app.ts
index aaa1111..bbb2222 100644
--- a/src/app.ts
+++ b/src/app.ts
`;

const hunkDiff = `@@ -1,5 +1,6 @@
 import express from 'express';
+import cors from 'cors';

 const app = express();
+app.use(cors());
 app.listen(3000);`;

function makeChange(path: string): MagitChange {
  const uri = Uri.parse(`file:///repo/${path}`);
  return {
    uri,
    originalUri: uri,
    renameUri: undefined,
    status: Status.MODIFIED,
    hunks: [{ diff: hunkDiff, diffHeader, uri }],
  };
}

suite('Delta Wiring – view tree collection and style grouping', () => {

  test('collectHunkViews finds HunkViews in unfolded ChangeViews', () => {
    const changes = [makeChange('src/app.ts'), makeChange('src/server.ts')];
    const section = new ChangeSectionView(Section.Unstaged, changes);
    // Unfold each ChangeView so its hunks are visible in the document
    for (const sub of section.subViews) {
      if (sub instanceof ChangeView) {
        sub.folded = false;
      }
    }
    section.render(0);

    const hunkViews = collectHunkViews(section);

    assert.strictEqual(hunkViews.length, 2, 'Expected one HunkView per change');
    for (const hv of hunkViews) {
      assert.ok(hv instanceof HunkView, 'Each element must be a HunkView');
      assert.ok(
        hv.range.start.line >= 0,
        'HunkView range must be set after render',
      );
    }
  });

  test('collectHunkViews excludes HunkViews inside folded ChangeViews', () => {
    const changes = [makeChange('src/folded1.ts'), makeChange('src/folded2.ts')];
    const section = new ChangeSectionView(Section.Unstaged, changes);
    // ChangeView.foldedByDefault = true; fresh URIs ensure no stale fold memory
    section.render(0);

    const hunkViews = collectHunkViews(section);

    assert.strictEqual(hunkViews.length, 0,
      'Folded ChangeViews should not yield HunkViews (their ranges do not correspond to document lines)');
  });

  test('groupDecorationsByStyle groups by (foreground, background) pair', () => {
    const decorations: DecorationRange[] = [
      { line: 5, startChar: 0, endChar: 6, foreground: '#ff0000' },
      { line: 5, startChar: 7, endChar: 12, foreground: '#00ff00' },
      { line: 6, startChar: 0, endChar: 4, foreground: '#ff0000' },
      { line: 7, startChar: 0, endChar: 10, foreground: '#ff0000', background: '#111111' },
      { line: 8, startChar: 0, endChar: 3 },
    ];

    const groups = groupDecorationsByStyle(decorations);

    // Decorations with no color at all should be excluded
    const withColor = decorations.filter(d => d.foreground || d.background);
    const totalRanges = groups.reduce((sum, g) => sum + g.ranges.length, 0);
    assert.strictEqual(totalRanges, withColor.length, 'Total ranges must equal colored input decorations');

    // #ff0000 (no bg) should be one group with 2 ranges
    const redGroup = groups.find(g => g.foreground === '#ff0000' && !g.background);
    assert.ok(redGroup, 'Expected a group for foreground=#ff0000');
    assert.strictEqual(redGroup!.ranges.length, 2);

    // #ff0000 + #111111 bg should be a separate group
    const redBgGroup = groups.find(g => g.foreground === '#ff0000' && g.background === '#111111');
    assert.ok(redBgGroup, 'Expected a separate group when background differs');
    assert.strictEqual(redBgGroup!.ranges.length, 1);

    // #00ff00 should be its own group
    const greenGroup = groups.find(g => g.foreground === '#00ff00');
    assert.ok(greenGroup, 'Expected a group for foreground=#00ff00');
    assert.strictEqual(greenGroup!.ranges.length, 1);
  });
});
