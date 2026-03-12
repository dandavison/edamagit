import { ChildProcess, spawn } from 'child_process';
import { parseAnsiSequences, createColorPalette, ParseToken } from 'ansi-sequence-parser';
import { basename } from 'path';

export interface DecorationRange {
  line: number;
  startChar: number;
  endChar: number;
  foreground?: string;
  background?: string;
}

export interface ColorizerOptions {
  executable?: string;
  syntaxTheme?: string;
}

export async function colorizeDiff(
  diff: string,
  filePath: string,
  options?: ColorizerOptions,
): Promise<DecorationRange[]> {
  const t0 = performance.now();
  const stdout = await spawnColorizer(diff, filePath, options);
  const elapsed = performance.now() - t0;
  if (stdout === null) {
    return [];
  }
  console.log(`[edamagit] diff colorizer spawn: ${elapsed.toFixed(0)}ms`);
  const tokens = parseAnsiSequences(stdout);
  return tokensToRanges(tokens);
}

function colorizerArgs(executable: string, theme?: string): string[] {
  if (basename(executable) !== 'delta') {
    return [];
  }
  const args = [
    '--color-only',
    '--no-gitconfig',
    '--max-line-distance', '0.6',
    '--true-color', 'always',
  ];
  if (theme) {
    args.push('--syntax-theme', theme);
    args.push(isDeltaLightTheme(theme) ? '--light' : '--dark');
  } else {
    args.push('--dark');
  }
  return args;
}

const DELTA_LIGHT_THEMES = new Set([
  'Catppuccin Latte', 'GitHub', 'gruvbox-light', 'gruvbox-white',
  'Monokai Extended Light', 'OneHalfLight', 'Solarized (light)',
]);

function isDeltaLightTheme(theme: string): boolean {
  return DELTA_LIGHT_THEMES.has(theme) || theme.toLowerCase().includes('light');
}

function spawnColorizer(diff: string, filePath: string, options?: ColorizerOptions): Promise<string | null> {
  const exe = options?.executable ?? 'delta';
  const args = colorizerArgs(exe, options?.syntaxTheme);
  return new Promise((resolve) => {
    let proc: ChildProcess;
    try {
      proc = spawn(exe, args, { stdio: ['pipe', 'pipe', 'ignore'] });
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
