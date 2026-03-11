import { View } from '../views/general/view';
import { HunkView } from '../views/changes/hunkView';
import { DecorationRange } from './deltaHighlighter';

export interface DecorationGroup {
  foreground?: string;
  background?: string;
  ranges: { line: number; startChar: number; endChar: number }[];
}

export function collectHunkViews(_view: View): HunkView[] {
  return [];
}

export function groupDecorationsByStyle(_decorations: DecorationRange[]): DecorationGroup[] {
  return [];
}
