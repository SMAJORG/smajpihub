import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const normalize = text => text.replace(/\s+/g, ' ').trim();
const messages = new Set();
const templates = new Set();
const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rarr: '→', larr: '←', times: '×', middot: '·', ndash: '–', mdash: '—', hellip: '…', copy: '©' };
const decode = text => text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, entity) => entity[0] === '#' ? String.fromCodePoint(parseInt(entity.slice(entity[1].toLowerCase() === 'x' ? 2 : 1), entity[1].toLowerCase() === 'x' ? 16 : 10)) : entities[entity] || match);
function human(text) {
  return /[A-Za-z]/.test(text) && !/^(?:https?:|\/|\.|#|@|data:)/.test(text) &&
    !/[{}<>]|=>|\\[dwsb]/.test(text) &&
    (/[A-Z]/.test(text) || /[a-z] [a-z]/.test(text)) &&
    !/^[\w.-]+\.(?:png|jpg|svg|css|ts|tsx|mp4|json|com|org|net)$/.test(text);
}
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!['localization', 'locales', 'types', 'assets', 'tests'].includes(entry.name)) walk(name);
    } else if (/\.tsx?$/.test(name) && !name.endsWith('i18n.ts')) {
      const source = ts.createSourceFile(name, fs.readFileSync(name, 'utf8'), ts.ScriptTarget.Latest, true, name.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const visit = node => {
        if (ts.isJsxText(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
          if (!ts.isImportDeclaration(node.parent) && !ts.isLiteralTypeNode(node.parent)) {
            const text = normalize(ts.isJsxText(node) ? decode(node.text) : node.text);
            if (human(text) || (ts.isJsxText(node) && /[A-Za-z]/.test(text))) messages.add(text);
          }
        }
        if (ts.isTemplateExpression(node)) {
          const text = normalize(node.head.text + node.templateSpans.map((part, index) => `{{v${index}}}` + part.literal.text).join(''));
          const literal = text.replace(/\{\{v\d+\}\}/g, '');
          if (human(literal) && /[A-Za-z]{3}/.test(literal) && !/^(?:rgb|rgba|linear-gradient|[A-Z_]+_)/.test(literal)) { messages.add(text); templates.add(text); }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
}
walk(path.join(root, 'frontend/src'));
walk(path.join(root, 'mobile/src'));
// Retain existing structured i18next keys used by the public home page.
const legacy = JSON.parse(fs.readFileSync(path.join(root, 'frontend/src/localization/legacy-en.json'), 'utf8'));
const addLegacy = value => { if (typeof value === 'string') messages.add(normalize(value)); else if (value && typeof value === 'object') Object.values(value).forEach(addLegacy); };
addLegacy(legacy);
const extras = ['Translation unavailable. Showing original text.', 'Translate', 'Show original', 'Pick language', 'Choose language', 'Language', 'Close', 'Cancel', 'Save',
  'pending', 'approved', 'rejected', 'completed', 'cancelled', 'canceled', 'published', 'active', 'inactive', 'draft', 'failed', 'processing', 'paid', 'unpaid', 'delivered', 'shipped', 'refunded', 'open', 'closed', 'online', 'offline', 'free', 'live', 'available', 'unavailable', 'verified', 'unverified', 'yes', 'no', 'on', 'off'];
extras.forEach(text => messages.add(text));
const sorted = [...messages].sort();
fs.mkdirSync(path.join(root, 'frontend/src/locales'), { recursive: true });
fs.writeFileSync(path.join(root, 'frontend/src/locales/en.json'), JSON.stringify(Object.fromEntries(sorted.map(text => [text, text])), null, 2) + '\n');
fs.writeFileSync(path.join(root, 'frontend/src/localization/templates.json'), JSON.stringify([...templates].sort(), null, 2) + '\n');
console.log(`${sorted.length} interface messages, ${templates.size} interpolation templates; ${sorted.join('').length} source characters`);
