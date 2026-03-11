export interface DecorationRange {
  line: number;
  startChar: number;
  endChar: number;
  foreground?: string;
  background?: string;
}

export interface DeltaOptions {
  deltaExecutable?: string;
  syntaxTheme?: string;
}

export async function highlightDiffWithDelta(
  _diff: string,
  _filePath: string,
  _options?: DeltaOptions,
): Promise<DecorationRange[]> {
  // TODO: implement delta integration
  return [];
}
