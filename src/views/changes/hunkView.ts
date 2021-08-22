import { html } from 'diff2html';

import * as vscode from 'vscode';

import { MagitChangeHunk } from '../../models/magitChangeHunk';
import { Section } from '../general/sectionHeader';
import { TextView } from '../general/textView';

export class HunkView extends TextView {
  isFoldable = true;

  get id() {
    return this.changeHunk.diff;
  }

  constructor(public section: Section, public changeHunk: MagitChangeHunk) {
    super(changeHunk.diff);
    const diff = html(changeHunk.diff);
    const panel = vscode.window.createWebviewPanel(
      'diff',
      'Diff',
      vscode.ViewColumn.One,
      {}
    );
    const prefix = `diff --git a/sample.js b/sample.js
index 0000001..0ddf2ba
--- a/sample.js
+++ b/sample.js
@@ -1 +1 @@
`;
    panel.webview.html = html(prefix + changeHunk.diff);
  }
}
