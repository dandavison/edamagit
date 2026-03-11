import { ChildProcess, spawn } from 'child_process';
import { parseAnsiSequences, createColorPalette, ParseToken } from 'ansi-sequence-parser';

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
  diff: string,
  filePath: string,
  options?: DeltaOptions,
): Promise<DecorationRange[]> {
  const t0 = performance.now();
  const stdout = await spawnDelta(diff, filePath, options);
  const elapsed = performance.now() - t0;
  if (stdout === null) {
    return [];
  }
  console.log(`[edamagit] delta spawn: ${elapsed.toFixed(0)}ms`);
  const tokens = parseAnsiSequences(stdout);
  return tokensToRanges(tokens);
}

function spawnDelta(diff: string, filePath: string, options?: DeltaOptions): Promise<string | null> {
  const exe = options?.deltaExecutable ?? 'delta';
  const theme = options?.syntaxTheme ?? 'GitHub';
  return new Promise((resolve) => {
    let proc: ChildProcess;
    try {
      proc = spawn(exe, [
        '--color-only',
        '--no-gitconfig',
        '--max-line-distance', '0.6',
        '--true-color', 'always',
        '--syntax-theme', theme,
        `--file-style=omit`,
        `--hunk-header-style=plain`,
      ], { stdio: ['pipe', 'pipe', 'ignore'] });
    } catch {
      resolve(null);
      return;
    }
    const chunks: Buffer[] = [];
    proc.stdout!.on('data', (chunk: Buffer) => chunks.push(chunk));
    proc.on('error', () => resolve(null));
    proc.on('close', (code) => {
      if (code !== 0) {
        resolve(null);
      } else {
        resolve(Buffer.concat(chunks).toString('utf-8'));
      }
    });
    const timeout = setTimeout(() => { proc.kill(); resolve(null); }, 5000);
    proc.on('close', () => clearTimeout(timeout));
    proc.stdin!.end(diff);
  });
}

const palette = createColorPalette();

function tokensToRanges(tokens: ParseToken[]): DecorationRange[] {
  const ranges: DecorationRange[] = [];
  let line = 0;
  let col = 0;
  for (const token of tokens) {
    const hasFg = token.foreground !== null;
    const hasBg = token.background !== null;
    const segments = token.value.split('\n');
    for (let i = 0; i < segments.length; i++) {
      if (i > 0) {
        line++;
        col = 0;
      }
      const seg = segments[i];
      if (seg.length > 0 && (hasFg || hasBg)) {
        const range: DecorationRange = {
          line,
          startChar: col,
          endChar: col + seg.length,
        };
        if (hasFg) { range.foreground = palette.value(token.foreground!); }
        if (hasBg) { range.background = palette.value(token.background!); }
        ranges.push(range);
      }
      col += seg.length;
    }
  }
  return ranges;
}
