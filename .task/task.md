Good morning. Below is the diff of your recent work adding colorization by delta.

Whatt I'd like to do is refactor this so that it is not specific to delta; delta is just an example of an executable that takes git diff on stdin and emits a colorized diff on stdout. My aim is to make the changes acceptable to the maintainer.


diff --git a/Makefile b/Makefile
new file mode 100644
index 0000000..8ceeb59
--- /dev/null
+++ b/Makefile
@@ -0,0 +1,21 @@
+install: clean build uninstall
+	cursor --install-extension magit-*.vsix --force
+	cursor --list-extensions --show-versions | grep magit
+
+clean:
+	@rm -f *.vsix
+
+build:
+	npm install
+	yes | npx vsce package
+
+uninstall:
+	cursor --uninstall-extension kahole.magit || true
+
+test:
+	npm run test
+
+dev-link:
+	ln -sfn $(CURDIR) ~/.cursor/extensions/kahole.magit
+
+.PHONY: install clean build uninstall test dev-link
diff --git a/package.json b/package.json
index 1d7e262..1d5fa34 100644
--- a/package.json
+++ b/package.json
@@ -473,6 +473,16 @@
           ],
           "default": "",
           "description": "Like `git.path`. Path and filename of the git executable, e.g. C:\\Program Files\\Git\\bin\\git.exe' (Windows). This can also be an array of string values containing multiple paths to look up."
+        },
+        "magit.delta-executable": {
+          "type": "string",
+          "default": "",
+          "description": "Path to the delta executable for syntax-highlighted diffs. Defaults to 'delta' on PATH."
+        },
+        "magit.delta-syntax-theme": {
+          "type": "string",
+          "default": "",
+          "description": "Syntax theme for delta diff highlighting (e.g. 'Dracula', 'GitHub', 'Monokai Extended'). When set, also infers --light/--dark from the theme name. When empty, uses delta's default with --dark."
         }
       }
     },
@@ -804,6 +814,7 @@
   },
   "dependencies": {
     "@vscode/iconv-lite-umd": "^0.7.0",
+    "ansi-sequence-parser": "^1.1.3",
     "date-fns": "^2.16.1",
     "jsonc-parser": "^3.0.0",
     "which": "^3.0.0"
diff --git a/src/extension.ts b/src/extension.ts
index 4facf0f..ed8c24e 100644
--- a/src/extension.ts
+++ b/src/extension.ts
@@ -58,6 +58,7 @@ import { copyBufferRevisionCommands } from './commands/copyBufferRevisionCommand
 import { submodules } from './commands/submodulesCommands';
 import { forgeRefreshInterval } from './forge';
 import { bisecting } from './commands/bisectCommands';
+import { registerDeltaDecorationListener } from './utils/deltaWiring';

 export const magitRepositories: Map<string, MagitRepository> = new Map<string, MagitRepository>();
 export const views: Map<string, DocumentView> = new Map<string, DocumentView>();
@@ -65,7 +66,7 @@ export const processLog: MagitProcessLogEntry[] = [];

 export let gitApi: API;
 export let logPath: string;
-export let magitConfig: { displayBufferSameColumn?: boolean, forgeEnabled?: boolean, hiddenStatusSections: Set<string>, quickSwitchEnabled?: boolean, gitPath?: string };
+export let magitConfig: { displayBufferSameColumn?: boolean, forgeEnabled?: boolean, hiddenStatusSections: Set<string>, quickSwitchEnabled?: boolean, gitPath?: string, deltaExecutable?: string, deltaSyntaxTheme?: string };

 function loadConfig() {
   let workspaceConfig = workspace.getConfiguration('magit');
@@ -75,7 +76,9 @@ function loadConfig() {
     forgeEnabled: workspaceConfig.get('forge-enabled'),
     hiddenStatusSections: readHiddenStatusSections(workspaceConfig.get('hide-status-sections')),
     quickSwitchEnabled: workspaceConfig.get('quick-switch-enabled'),
-    gitPath: workspaceConfig.get('git-path')
+    gitPath: workspaceConfig.get('git-path'),
+    deltaExecutable: workspaceConfig.get('delta-executable') || undefined,
+    deltaSyntaxTheme: workspaceConfig.get('delta-syntax-theme') || undefined,
   };

   let configCodePath: string | undefined = workspaceConfig.get('code-path');
@@ -130,6 +133,7 @@ export function activate(context: ExtensionContext) {
   context.subscriptions.push(
     contentProvider,
     providerRegistrations,
+    registerDeltaDecorationListener(),
   );

   context.subscriptions.push(
diff --git a/src/test/suite/deltaDecorations.test.ts b/src/test/suite/deltaDecorations.test.ts
new file mode 100644
index 0000000..02cd5ae
--- /dev/null
+++ b/src/test/suite/deltaDecorations.test.ts
@@ -0,0 +1,72 @@
+import * as assert from 'assert';
+import { getDocumentDeltaDecorations } from '../../utils/deltaDecorations';
+import { HunkView } from '../../views/changes/hunkView';
+import { Section } from '../../views/general/sectionHeader';
+import { Uri } from 'vscode';
+
+const diffHeader = `diff --git a/src/server.ts b/src/server.ts
+index 1a2b3c4..5d6e7f8 100644
+--- a/src/server.ts
++++ b/src/server.ts
+`;
+
+const hunkText = `@@ -10,7 +10,8 @@ import { createLogger } from './logger';
+ const app = express();
+ const logger = createLogger('server');
+
+-function startServer(port: number) {
++async function startServer(port: number): Promise<void> {
++  logger.info(\`Starting server on port \${port}\`);
+   app.listen(port, () => {
+     logger.info('Server started');
+   });`;
+
+suite('Delta Decorations – view-level integration', () => {
+
+  test('extracts decorations in document coordinates from HunkViews', async () => {
+    const uri = Uri.parse('file:///test/src/server.ts');
+    const hunkView = new HunkView(Section.Unstaged, {
+      diff: hunkText,
+      diffHeader,
+      uri,
+    });
+
+    // Simulate the hunk appearing at line 5 in the rendered document
+    // (as it would after status header, section header, file header, etc.)
+    const documentStartLine = 5;
+    hunkView.render(documentStartLine);
+
+    const decorations = await getDocumentDeltaDecorations([hunkView]);
+
+    // delta should produce syntax-colored ranges for TypeScript code
+    assert.ok(decorations.length > 0, 'Expected decoration ranges from delta');
+
+    // All decoration lines must be in document coordinate space,
+    // i.e. offset by the hunk's position in the document
+    for (const d of decorations) {
+      assert.ok(
+        d.line >= documentStartLine,
+        `Decoration line ${d.line} should be >= document start line ${documentStartLine}`,
+      );
+    }
+
+    // At least one range should have a foreground color (syntax highlight)
+    const hasColor = decorations.some(d => d.foreground !== undefined);
+    assert.ok(hasColor, 'Expected at least one decoration with a foreground color');
+  });
+
+  test('returns empty array when delta is unavailable', async () => {
+    const uri = Uri.parse('file:///test/src/server.ts');
+    const hunkView = new HunkView(Section.Unstaged, {
+      diff: hunkText,
+      diffHeader,
+      uri,
+    });
+    hunkView.render(0);
+
+    const decorations = await getDocumentDeltaDecorations([hunkView], {
+      deltaExecutable: '/nonexistent/delta',
+    });
+    assert.deepStrictEqual(decorations, []);
+  });
+});
diff --git a/src/test/suite/deltaHighlighter.test.ts b/src/test/suite/deltaHighlighter.test.ts
new file mode 100644
index 0000000..015dc6c
--- /dev/null
+++ b/src/test/suite/deltaHighlighter.test.ts
@@ -0,0 +1,45 @@
+import * as assert from 'assert';
+import { highlightDiffWithDelta, DecorationRange } from '../../utils/deltaHighlighter';
+
+const sampleDiff = `diff --git a/src/server.ts b/src/server.ts
+index 1a2b3c4..5d6e7f8 100644
+--- a/src/server.ts
++++ b/src/server.ts
+@@ -10,7 +10,8 @@ import { createLogger } from './logger';
+ const app = express();
+ const logger = createLogger('server');
+
+-function startServer(port: number) {
++async function startServer(port: number): Promise<void> {
++  logger.info(\`Starting server on port \${port}\`);
+   app.listen(port, () => {
+     logger.info('Server started');
+   });
+`;
+
+suite('Delta Highlighter', () => {
+
+  test('produces decoration ranges with syntax colors for a TypeScript diff', async () => {
+    const ranges: DecorationRange[] = await highlightDiffWithDelta(sampleDiff, 'src/server.ts');
+
+    assert.ok(ranges.length > 0, 'Expected at least one decoration range from delta');
+
+    const hasColor = ranges.some(r => r.foreground !== undefined || r.background !== undefined);
+    assert.ok(hasColor, 'Expected at least one range with a foreground or background color');
+  });
+
+  test('preserves diff structure (line count unchanged)', async () => {
+    const ranges: DecorationRange[] = await highlightDiffWithDelta(sampleDiff, 'src/server.ts');
+
+    const maxLine = Math.max(...ranges.map(r => r.line));
+    const inputLines = sampleDiff.split('\n').length - 1; // trailing newline
+    assert.ok(maxLine < inputLines, 'Decoration line numbers must be within diff bounds');
+  });
+
+  test('returns empty array when delta is not installed', async () => {
+    const ranges = await highlightDiffWithDelta(sampleDiff, 'src/server.ts', {
+      deltaExecutable: '/nonexistent/delta'
+    });
+    assert.deepStrictEqual(ranges, [], 'Should gracefully return empty array');
+  });
+});
diff --git a/src/test/suite/deltaWiring.test.ts b/src/test/suite/deltaWiring.test.ts
new file mode 100644
index 0000000..45709ea
--- /dev/null
+++ b/src/test/suite/deltaWiring.test.ts
@@ -0,0 +1,139 @@
+import * as assert from 'assert';
+import { Uri } from 'vscode';
+import { collectHunkViews, groupDecorationsByStyle } from '../../utils/deltaWiring';
+import { getDocumentDeltaDecorations } from '../../utils/deltaDecorations';
+import { DecorationRange } from '../../utils/deltaHighlighter';
+import { HunkView } from '../../views/changes/hunkView';
+import { ChangeSectionView } from '../../views/changes/changesSectionView';
+import { ChangeView } from '../../views/changes/changeView';
+import { Section } from '../../views/general/sectionHeader';
+import { MagitChange } from '../../models/magitChange';
+import { Status } from '../../typings/git';
+
+const diffHeader = `diff --git a/src/app.ts b/src/app.ts
+index aaa1111..bbb2222 100644
+--- a/src/app.ts
++++ b/src/app.ts
+`;
+
+const hunkDiff = `@@ -1,5 +1,6 @@
+ import express from 'express';
++import cors from 'cors';
+
+ const app = express();
++app.use(cors());
+ app.listen(3000);`;
+
+function makeChange(path: string): MagitChange {
+  const uri = Uri.parse(`file:///repo/${path}`);
+  return {
+    uri,
+    originalUri: uri,
+    renameUri: undefined,
+    status: Status.MODIFIED,
+    hunks: [{ diff: hunkDiff, diffHeader, uri }],
+  };
+}
+
+suite('Delta Wiring – view tree collection and style grouping', () => {
+
+  test('collectHunkViews finds HunkViews in unfolded ChangeViews', () => {
+    const changes = [makeChange('src/app.ts'), makeChange('src/server.ts')];
+    const section = new ChangeSectionView(Section.Unstaged, changes);
+    // Unfold each ChangeView so its hunks are visible in the document
+    for (const sub of section.subViews) {
+      if (sub instanceof ChangeView) {
+        sub.folded = false;
+      }
+    }
+    section.render(0);
+
+    const hunkViews = collectHunkViews(section);
+
+    assert.strictEqual(hunkViews.length, 2, 'Expected one HunkView per change');
+    for (const hv of hunkViews) {
+      assert.ok(hv instanceof HunkView, 'Each element must be a HunkView');
+      assert.ok(
+        hv.range.start.line >= 0,
+        'HunkView range must be set after render',
+      );
+    }
+  });
+
+  test('collectHunkViews excludes HunkViews inside folded ChangeViews', () => {
+    const changes = [makeChange('src/folded1.ts'), makeChange('src/folded2.ts')];
+    const section = new ChangeSectionView(Section.Unstaged, changes);
+    // ChangeView.foldedByDefault = true; fresh URIs ensure no stale fold memory
+    section.render(0);
+
+    const hunkViews = collectHunkViews(section);
+
+    assert.strictEqual(hunkViews.length, 0,
+      'Folded ChangeViews should not yield HunkViews (their ranges do not correspond to document lines)');
+  });
+
+  test('full pipeline: unfolded hunks produce non-empty decoration groups', async () => {
+    const changes = [makeChange('src/pipeline.ts')];
+    const section = new ChangeSectionView(Section.Unstaged, changes);
+    for (const sub of section.subViews) {
+      if (sub instanceof ChangeView) {
+        sub.folded = false;
+      }
+    }
+    section.render(0);
+
+    const hunkViews = collectHunkViews(section);
+    assert.ok(hunkViews.length > 0, 'Should find hunks in unfolded ChangeViews');
+
+    const decorations = await getDocumentDeltaDecorations(hunkViews);
+    assert.ok(decorations.length > 0, 'Delta should produce decoration ranges');
+
+    const groups = groupDecorationsByStyle(decorations);
+    assert.ok(groups.length > 0, 'Should produce at least one style group');
+
+    const totalRanges = groups.reduce((sum, g) => sum + g.ranges.length, 0);
+    assert.ok(totalRanges > 0, 'Groups must contain ranges');
+
+    // Decoration lines must fall within the hunk ranges in the document
+    const minLine = Math.min(...hunkViews.map(hv => hv.range.start.line));
+    const maxLine = Math.max(...hunkViews.map(hv => hv.range.end.line));
+    for (const g of groups) {
+      for (const r of g.ranges) {
+        assert.ok(r.line >= minLine && r.line <= maxLine,
+          `Decoration line ${r.line} outside hunk range [${minLine}, ${maxLine}]`);
+      }
+    }
+  });
+
+  test('groupDecorationsByStyle groups by (foreground, background) pair', () => {
+    const decorations: DecorationRange[] = [
+      { line: 5, startChar: 0, endChar: 6, foreground: '#ff0000' },
+      { line: 5, startChar: 7, endChar: 12, foreground: '#00ff00' },
+      { line: 6, startChar: 0, endChar: 4, foreground: '#ff0000' },
+      { line: 7, startChar: 0, endChar: 10, foreground: '#ff0000', background: '#111111' },
+      { line: 8, startChar: 0, endChar: 3 },
+    ];
+
+    const groups = groupDecorationsByStyle(decorations);
+
+    // Decorations with no color at all should be excluded
+    const withColor = decorations.filter(d => d.foreground || d.background);
+    const totalRanges = groups.reduce((sum, g) => sum + g.ranges.length, 0);
+    assert.strictEqual(totalRanges, withColor.length, 'Total ranges must equal colored input decorations');
+
+    // #ff0000 (no bg) should be one group with 2 ranges
+    const redGroup = groups.find(g => g.foreground === '#ff0000' && !g.background);
+    assert.ok(redGroup, 'Expected a group for foreground=#ff0000');
+    assert.strictEqual(redGroup!.ranges.length, 2);
+
+    // #ff0000 + #111111 bg should be a separate group
+    const redBgGroup = groups.find(g => g.foreground === '#ff0000' && g.background === '#111111');
+    assert.ok(redBgGroup, 'Expected a separate group when background differs');
+    assert.strictEqual(redBgGroup!.ranges.length, 1);
+
+    // #00ff00 should be its own group
+    const greenGroup = groups.find(g => g.foreground === '#00ff00');
+    assert.ok(greenGroup, 'Expected a group for foreground=#00ff00');
+    assert.strictEqual(greenGroup!.ranges.length, 1);
+  });
+});
diff --git a/src/utils/deltaDecorations.ts b/src/utils/deltaDecorations.ts
new file mode 100644
index 0000000..2714842
--- /dev/null
+++ b/src/utils/deltaDecorations.ts
@@ -0,0 +1,59 @@
+import { DecorationRange, DeltaOptions, highlightDiffWithDelta } from './deltaHighlighter';
+import { HunkView } from '../views/changes/hunkView';
+
+export async function getDocumentDeltaDecorations(
+  hunkViews: HunkView[],
+  options?: DeltaOptions,
+): Promise<DecorationRange[]> {
+  if (hunkViews.length === 0) {
+    return [];
+  }
+
+  const byFile = new Map<string, HunkView[]>();
+  for (const hv of hunkViews) {
+    const key = hv.changeHunk.uri.toString();
+    let group = byFile.get(key);
+    if (!group) {
+      group = [];
+      byFile.set(key, group);
+    }
+    group.push(hv);
+  }
+
+  const results = await Promise.all(
+    [...byFile.values()].map(group => decorationsForFileGroup(group, options)),
+  );
+  return results.flat();
+}
+
+async function decorationsForFileGroup(
+  group: HunkView[],
+  options?: DeltaOptions,
+): Promise<DecorationRange[]> {
+  const { diffHeader, uri } = group[0].changeHunk;
+
+  const headerNormalized = diffHeader.endsWith('\n') ? diffHeader : diffHeader + '\n';
+  const fullDiff = headerNormalized + group.map(hv => hv.changeHunk.diff).join('\n');
+
+  const headerLineCount = headerNormalized.split('\n').length - 1;
+  const mappings: { deltaStart: number; lineCount: number; docStart: number }[] = [];
+  let cursor = headerLineCount;
+  for (const hv of group) {
+    const lineCount = hv.changeHunk.diff.split('\n').length;
+    mappings.push({ deltaStart: cursor, lineCount, docStart: hv.range.start.line });
+    cursor += lineCount;
+  }
+
+  const raw = await highlightDiffWithDelta(fullDiff, uri.fsPath, options);
+
+  const result: DecorationRange[] = [];
+  for (const d of raw) {
+    for (const m of mappings) {
+      if (d.line >= m.deltaStart && d.line < m.deltaStart + m.lineCount) {
+        result.push({ ...d, line: m.docStart + (d.line - m.deltaStart) });
+        break;
+      }
+    }
+  }
+  return result;
+}
diff --git a/src/utils/deltaHighlighter.ts b/src/utils/deltaHighlighter.ts
new file mode 100644
index 0000000..55e1cbd
--- /dev/null
+++ b/src/utils/deltaHighlighter.ts
@@ -0,0 +1,112 @@
+import { ChildProcess, spawn } from 'child_process';
+import { parseAnsiSequences, createColorPalette, ParseToken } from 'ansi-sequence-parser';
+
+export interface DecorationRange {
+  line: number;
+  startChar: number;
+  endChar: number;
+  foreground?: string;
+  background?: string;
+}
+
+export interface DeltaOptions {
+  deltaExecutable?: string;
+  syntaxTheme?: string;
+}
+
+export async function highlightDiffWithDelta(
+  diff: string,
+  filePath: string,
+  options?: DeltaOptions,
+): Promise<DecorationRange[]> {
+  const t0 = performance.now();
+  const stdout = await spawnDelta(diff, filePath, options);
+  const elapsed = performance.now() - t0;
+  if (stdout === null) {
+    return [];
+  }
+  console.log(`[edamagit] delta spawn: ${elapsed.toFixed(0)}ms`);
+  const tokens = parseAnsiSequences(stdout);
+  return tokensToRanges(tokens);
+}
+
+function spawnDelta(diff: string, filePath: string, options?: DeltaOptions): Promise<string | null> {
+  const exe = options?.deltaExecutable ?? 'delta';
+  const theme = options?.syntaxTheme;
+  const args = [
+    '--color-only',
+    '--no-gitconfig',
+    '--max-line-distance', '0.6',
+    '--true-color', 'always',
+  ];
+  if (theme) {
+    args.push('--syntax-theme', theme);
+    args.push(isLightSyntaxTheme(theme) ? '--light' : '--dark');
+  } else {
+    args.push('--dark');
+  }
+  return new Promise((resolve) => {
+    let proc: ChildProcess;
+    try {
+      proc = spawn(exe, args, { stdio: ['pipe', 'pipe', 'ignore'] });
+    } catch {
+      resolve(null);
+      return;
+    }
+    const chunks: Buffer[] = [];
+    proc.stdout!.on('data', (chunk: Buffer) => chunks.push(chunk));
+    proc.on('error', () => resolve(null));
+    proc.on('close', (code) => {
+      if (code !== 0) {
+        resolve(null);
+      } else {
+        resolve(Buffer.concat(chunks).toString('utf-8'));
+      }
+    });
+    const timeout = setTimeout(() => { proc.kill(); resolve(null); }, 5000);
+    proc.on('close', () => clearTimeout(timeout));
+    proc.stdin!.end(diff);
+  });
+}
+
+const palette = createColorPalette();
+
+function tokensToRanges(tokens: ParseToken[]): DecorationRange[] {
+  const ranges: DecorationRange[] = [];
+  let line = 0;
+  let col = 0;
+  for (const token of tokens) {
+    const hasFg = token.foreground !== null;
+    const hasBg = token.background !== null;
+    const segments = token.value.split('\n');
+    for (let i = 0; i < segments.length; i++) {
+      if (i > 0) {
+        line++;
+        col = 0;
+      }
+      const seg = segments[i];
+      if (seg.length > 0 && (hasFg || hasBg)) {
+        const range: DecorationRange = {
+          line,
+          startChar: col,
+          endChar: col + seg.length,
+        };
+        if (hasFg) { range.foreground = palette.value(token.foreground!); }
+        if (hasBg) { range.background = palette.value(token.background!); }
+        ranges.push(range);
+      }
+      col += seg.length;
+    }
+  }
+  return ranges;
+}
+
+// Mirrors delta's LIGHT_SYNTAX_THEMES + lowercase "light" heuristic.
+const LIGHT_SYNTAX_THEMES = new Set([
+  'Catppuccin Latte', 'GitHub', 'gruvbox-light', 'gruvbox-white',
+  'Monokai Extended Light', 'OneHalfLight', 'Solarized (light)',
+]);
+
+function isLightSyntaxTheme(theme: string): boolean {
+  return LIGHT_SYNTAX_THEMES.has(theme) || theme.toLowerCase().includes('light');
+}
diff --git a/src/utils/deltaWiring.ts b/src/utils/deltaWiring.ts
new file mode 100644
index 0000000..4fd9973
--- /dev/null
+++ b/src/utils/deltaWiring.ts
@@ -0,0 +1,126 @@
+import { TextEditor, Range, Position, Disposable, window, Uri, workspace } from 'vscode';
+import { View } from '../views/general/view';
+import { HunkView } from '../views/changes/hunkView';
+import { DecorationRange } from './deltaHighlighter';
+import { DocumentView } from '../views/general/documentView';
+import { getDocumentDeltaDecorations } from './deltaDecorations';
+import { magitConfig, views } from '../extension';
+import * as Constants from '../common/constants';
+
+export interface DecorationGroup {
+  foreground?: string;
+  background?: string;
+  ranges: { line: number; startChar: number; endChar: number }[];
+}
+
+const activeDecorations = new Map<string, Disposable[]>();
+
+export function collectHunkViews(view: View): HunkView[] {
+  const result: HunkView[] = [];
+  walkVisible(view, result);
+  return result;
+}
+
+function walkVisible(view: View, out: HunkView[]): void {
+  for (const sub of view.subViews) {
+    if (sub instanceof HunkView) {
+      if (!sub.folded) {
+        out.push(sub);
+      }
+    } else if (!sub.folded) {
+      walkVisible(sub, out);
+    }
+  }
+}
+
+export function groupDecorationsByStyle(decorations: DecorationRange[]): DecorationGroup[] {
+  const map = new Map<string, DecorationGroup>();
+  for (const d of decorations) {
+    if (!d.foreground && !d.background) continue;
+    const key = `${d.foreground ?? ''}|${d.background ?? ''}`;
+    let group = map.get(key);
+    if (!group) {
+      group = { foreground: d.foreground, background: d.background, ranges: [] };
+      map.set(key, group);
+    }
+    group.ranges.push({ line: d.line, startChar: d.startChar, endChar: d.endChar });
+  }
+  return [...map.values()];
+}
+
+export async function applyDeltaDecorations(
+  editor: TextEditor,
+  view: DocumentView,
+): Promise<Disposable[]> {
+  const hunkViews = collectHunkViews(view);
+  if (hunkViews.length === 0) return [];
+
+  const decorations = await getDocumentDeltaDecorations(hunkViews, {
+    deltaExecutable: magitConfig.deltaExecutable,
+    syntaxTheme: magitConfig.deltaSyntaxTheme,
+  });
+  if (decorations.length === 0) return [];
+
+  const groups = groupDecorationsByStyle(decorations);
+  const disposables: Disposable[] = [];
+
+  for (const group of groups) {
+    const decorationType = window.createTextEditorDecorationType({
+      color: group.foreground,
+      backgroundColor: withAlpha(group.background, 'bb'),
+    });
+    const ranges = group.ranges.map(
+      r => new Range(new Position(r.line, r.startChar), new Position(r.line, r.endChar)),
+    );
+    editor.setDecorations(decorationType, ranges);
+    disposables.push(decorationType);
+  }
+
+  return disposables;
+}
+
+function withAlpha(color: string | undefined, alpha: string): string | undefined {
+  if (!color) return undefined;
+  // #rrggbb → #rrggbbaa; already-alpha colors pass through
+  if (color.length === 7 && color[0] === '#') return color + alpha;
+  return color;
+}
+
+function disposeForUri(key: string): void {
+  const prev = activeDecorations.get(key);
+  if (prev) {
+    prev.forEach(d => d.dispose());
+    activeDecorations.delete(key);
+  }
+}
+
+export function refreshDeltaDecorations(uri: Uri): void {
+  const key = uri.toString();
+  const view = views.get(key);
+  const editor = window.visibleTextEditors.find(
+    ed => ed.document.uri.toString() === key,
+  );
+  if (!view || !editor) {
+    disposeForUri(key);
+    return;
+  }
+
+  disposeForUri(key);
+
+  applyDeltaDecorations(editor, view).then(
+    disposables => {
+      if (disposables.length > 0) {
+        activeDecorations.set(key, disposables);
+      }
+    },
+    err => console.error('[edamagit] delta decorations failed:', err),
+  );
+}
+
+export function registerDeltaDecorationListener(): Disposable {
+  return workspace.onDidChangeTextDocument(e => {
+    if (e.document.uri.scheme === Constants.MagitUriScheme) {
+      refreshDeltaDecorations(e.document.uri);
+    }
+  });
+}
diff --git a/src/utils/viewUtils.ts b/src/utils/viewUtils.ts
index 3f0e699..1aacec7 100644
--- a/src/utils/viewUtils.ts
+++ b/src/utils/viewUtils.ts
@@ -7,6 +7,7 @@ import { SemanticTokenTypes } from '../common/constants';
 import GitTextUtils from './gitTextUtils';
 import { DocumentView } from '../views/general/documentView';
 import { magitConfig, views } from '../extension';
+import { refreshDeltaDecorations } from './deltaWiring';

 function hasUri(obj: unknown): obj is { uri: Uri } {
   return typeof obj === 'object' && obj !== null && 'uri' in obj && obj.uri instanceof Uri;
@@ -27,7 +28,9 @@ export default class ViewUtils {
   public static async showView(uri: Uri, view: DocumentView, textDocumentShowOptions: TextDocumentShowOptions = { preview: false, preserveFocus: false }) {
     views.set(uri.toString(), view);
     let doc = await workspace.openTextDocument(uri);
-    return window.showTextDocument(doc, { viewColumn: ViewUtils.showDocumentColumn(), ...textDocumentShowOptions });
+    const editor = await window.showTextDocument(doc, { viewColumn: ViewUtils.showDocumentColumn(), ...textDocumentShowOptions });
+    refreshDeltaDecorations(uri);
+    return editor;
   }

   public static showDocumentColumn(doc?: TextDocument): ViewColumn {
