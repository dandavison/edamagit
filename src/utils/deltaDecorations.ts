import { DecorationRange, DeltaOptions } from './deltaHighlighter';
import { HunkView } from '../views/changes/hunkView';

/**
 * Extract delta syntax-highlighting decorations for HunkViews,
 * with line numbers in document coordinate space.
 *
 * TODO: implement — currently a stub that returns no decorations.
 */
export async function getDocumentDeltaDecorations(
  _hunkViews: HunkView[],
  _options?: DeltaOptions,
): Promise<DecorationRange[]> {
  return [];
}
