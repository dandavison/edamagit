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
    return []; // delta not installed
  }
  console.log(`[edamagit] delta spawn: ${elapsed.toFixed(0)}ms`);
  const tokens = parseAnsiSequences(stdout);
  return tokensToRanges(tokens);
}

// Returns stdout on success, null if delta is not installed.
// Throws on all other failures (non-zero exit, timeout).
function spawnDelta(diff: string, filePath: string, options?: DeltaOptions): Promise<string | null> {
  const exe = options?.deltaExecutable ?? 'delta';
  const theme = options?.syntaxTheme ?? 'GitHub';
  return new Promise((resolve, reject) => {
    let proc: ChildProcess;
    try {
      proc = spawn(exe, [
        '--color-only',
        '--no-gitconfig',
        '--max-line-distance', '0.6',
        '--true-color', 'always',
        '--syntax-theme', theme,
        isLightSyntaxTheme(theme) ? '--light' : '--dark',
      ], { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      resolve(null);
      return;
    }
    const chunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    proc.stdout!.on('data', (chunk: Buffer) => chunks.push(chunk));
    proc.stderr!.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    proc.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        resolve(null);
      } else {
        reject(new Error(`delta process error: ${err.message}`));
      }
    });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks).toString('utf-8'));
      } else {
        const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim();
        reject(new Error(`delta exited with code ${code}${stderr ? ': ' + stderr : ''}`));
      }
    });
    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error(`delta timed out after 5000ms`));
    }, 5000);
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

// Mirrors delta's LIGHT_SYNTAX_THEMES + lowercase "light" heuristic.
const LIGHT_SYNTAX_THEMES = new Set([
  'Catppuccin Latte', 'GitHub', 'gruvbox-light', 'gruvbox-white',
  'Monokai Extended Light', 'OneHalfLight', 'Solarized (light)',
]);

function isLightSyntaxTheme(theme: string): boolean {
  return LIGHT_SYNTAX_THEMES.has(theme) || theme.toLowerCase().includes('light');
}
