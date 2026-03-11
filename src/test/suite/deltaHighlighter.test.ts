import * as assert from 'assert';
import { highlightDiffWithDelta, DecorationRange } from '../../utils/deltaHighlighter';

const sampleDiff = `diff --git a/src/server.ts b/src/server.ts
index 1a2b3c4..5d6e7f8 100644
--- a/src/server.ts
+++ b/src/server.ts
@@ -10,7 +10,8 @@ import { createLogger } from './logger';
 const app = express();
 const logger = createLogger('server');

-function startServer(port: number) {
+async function startServer(port: number): Promise<void> {
+  logger.info(\`Starting server on port \${port}\`);
   app.listen(port, () => {
     logger.info('Server started');
   });
`;

suite('Delta Highlighter', () => {

  test('produces decoration ranges with syntax colors for a TypeScript diff', async () => {
    const ranges: DecorationRange[] = await highlightDiffWithDelta(sampleDiff, 'src/server.ts');

    assert.ok(ranges.length > 0, 'Expected at least one decoration range from delta');

    const hasColor = ranges.some(r => r.foreground !== undefined || r.background !== undefined);
    assert.ok(hasColor, 'Expected at least one range with a foreground or background color');
  });

  test('preserves diff structure (line count unchanged)', async () => {
    const ranges: DecorationRange[] = await highlightDiffWithDelta(sampleDiff, 'src/server.ts');

    const maxLine = Math.max(...ranges.map(r => r.line));
    const inputLines = sampleDiff.split('\n').length - 1; // trailing newline
    assert.ok(maxLine < inputLines, 'Decoration line numbers must be within diff bounds');
  });

  test('returns empty array when delta is not installed', async () => {
    const ranges = await highlightDiffWithDelta(sampleDiff, 'src/server.ts', {
      deltaExecutable: '/nonexistent/delta'
    });
    assert.deepStrictEqual(ranges, [], 'Should gracefully return empty array');
  });
});
