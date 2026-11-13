import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const property = /(?<![\w-])(?:background(?:-color|Color)?|color|border(?:-(?:top|right|bottom|left))?(?:-color|Color)?|outline(?:-color|Color)?|fill|stroke)\s*:\s*([^;}]+)/g;
const literal = /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch)\s*\(|\b(?:white|black|gr[ae]y|silver|red|green|blue|yellow|purple|orange|navy|teal|pink|maroon|lime|aqua|fuchsia|olive)\b/i;

export function checkThemeDiff(diff) {
  const failures = [];
  let file = '';
  let line = 0;
  for (const entry of diff.split(/\r?\n/)) {
    if (entry.startsWith('+++ b/')) { file = entry.slice(6); continue; }
    const hunk = entry.match(/^@@ .*\+(\d+)/);
    if (hunk) { line = Number(hunk[1]); continue; }
    if (entry.startsWith('-') || entry.startsWith('\\')) continue;
    if (!entry.startsWith('+') && !entry.startsWith(' ')) continue;
    if (entry.startsWith('+') && /^frontend\/src\/.*\.(?:css|[jt]sx?)$/.test(file)) {
      const source = entry.slice(1);
      const exception = /theme-color-exception:\s*[^*\/\s][^*\/]{7,}/.test(source);
      // Ignore comment-only lines; token declarations don't match `property`.
      if (!exception && !/^\s*(?:\/\*|\*|\/\/)/.test(source)) {
        for (const match of source.matchAll(property)) {
          if (literal.test(match[1])) {
            failures.push(`${file}:${line}: use a semantic theme variable: ${match[0].trim()}`);
          }
        }
      }
    }
    line++;
  }
  return failures;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--base')) {
      throw new Error('Usage: node scripts/check-theme.mjs [--base <commit>]');
    }
    const base = args[1] || 'HEAD';
    const root = fileURLToPath(new URL('../..', import.meta.url));
    const commit = execFileSync('git', ['rev-parse', '--verify', `${base}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
    const diff = execFileSync('git', ['diff', '--no-ext-diff', '--unified=0', commit, '--', 'frontend/src'], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const failures = checkThemeDiff(diff);
    if (failures.length) {
      console.error(failures.join('\n'));
      console.error('See AGENTS.md for theme variables and documented color exceptions.');
      process.exitCode = 1;
    } else console.log('Theme check passed: no undocumented literal interface colors in added lines.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
