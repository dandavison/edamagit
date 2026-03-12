import { DecorationRange, ColorizerOptions, colorizeDiff } from './diffColorizer';
import { HunkView } from '../views/changes/hunkView';

export async function getDocumentDecorations(
  hunkViews: HunkView[],
  options?: ColorizerOptions,
): Promise<DecorationRange[]> {
  if (hunkViews.length === 0) {
    return [];
  }

  const byFile = new Map<string, HunkView[]>();
  for (const hv of hunkViews) {
    const key = hv.changeHunk.uri.toString();
    let group = byFile.get(key);
    if (!group) {
      group = [];
      byFile.set(key, group);
    }
    group.push(hv);
  }

  const results = await Promise.all(
    [...byFile.values()].map(group => decorationsForFileGroup(group, options)),
  );
  return results.flat();
}

async function decorationsForFileGroup(
  group: HunkView[],
  options?: ColorizerOptions,
): Promise<DecorationRange[]> {
  const { diffHeader, uri } = group[0].changeHunk;

  const headerNormalized = diffHeader.endsWith('\n') ? diffHeader : diffHeader + '\n';
  const fullDiff = headerNormalized + group.map(hv => hv.changeHunk.diff).join('\n');

  const headerLineCount = headerNormalized.split('\n').length - 1;
  const mappings: { colorizerStart: number; lineCount: number; docStart: number }[] = [];
  let cursor = headerLineCount;
  for (const hv of group) {
    const lineCount = hv.changeHunk.diff.split('\n').length;
    mappings.push({ colorizerStart: cursor, lineCount, docStart: hv.range.start.line });
    cursor += lineCount;
  }

  const raw = await colorizeDiff(fullDiff, uri.fsPath, options);

  const result: DecorationRange[] = [];
  for (const d of raw) {
    for (const m of mappings) {
      if (d.line >= m.colorizerStart && d.line < m.colorizerStart + m.lineCount) {
        result.push({ ...d, line: m.docStart + (d.line - m.colorizerStart) });
        break;
      }
    }
  }
  return result;
}
