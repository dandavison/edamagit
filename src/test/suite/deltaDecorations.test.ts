import * as assert from 'assert';
import { getDocumentDeltaDecorations } from '../../utils/deltaDecorations';
import { HunkView } from '../../views/changes/hunkView';
import { Section } from '../../views/general/sectionHeader';
import { Uri } from 'vscode';

const diffHeader = `diff --git a/src/server.ts b/src/server.ts
index 1a2b3c4..5d6e7f8 100644
--- a/src/server.ts
+++ b/src/server.ts
`;

const hunkText = `@@ -10,7 +10,8 @@ import { createLogger } from './logger';
 const app = express();
 const logger = createLogger('server');

-function startServer(port: number) {
+async function startServer(port: number): Promise<void> {
+  logger.info(\`Starting server on port \${port}\`);
   app.listen(port, () => {
     logger.info('Server started');
   });`;

suite('Delta Decorations – view-level integration', () => {

  test('extracts decorations in document coordinates from HunkViews', async () => {
    const uri = Uri.parse('file:///test/src/server.ts');
    const hunkView = new HunkView(Section.Unstaged, {
      diff: hunkText,
      diffHeader,
      uri,
    });

    // Simulate the hunk appearing at line 5 in the rendered document
    // (as it would after status header, section header, file header, etc.)
    const documentStartLine = 5;
    hunkView.render(documentStartLine);

    const decorations = await getDocumentDeltaDecorations([hunkView]);

    // delta should produce syntax-colored ranges for TypeScript code
    assert.ok(decorations.length > 0, 'Expected decoration ranges from delta');

    // All decoration lines must be in document coordinate space,
    // i.e. offset by the hunk's position in the document
    for (const d of decorations) {
      assert.ok(
        d.line >= documentStartLine,
        `Decoration line ${d.line} should be >= document start line ${documentStartLine}`,
      );
    }

    // At least one range should have a foreground color (syntax highlight)
    const hasColor = decorations.some(d => d.foreground !== undefined);
    assert.ok(hasColor, 'Expected at least one decoration with a foreground color');
  });

  test('returns empty array when delta is unavailable', async () => {
    const uri = Uri.parse('file:///test/src/server.ts');
    const hunkView = new HunkView(Section.Unstaged, {
      diff: hunkText,
      diffHeader,
      uri,
    });
    hunkView.render(0);

    const decorations = await getDocumentDeltaDecorations([hunkView], {
      deltaExecutable: '/nonexistent/delta',
    });
    assert.deepStrictEqual(decorations, []);
  });
});
