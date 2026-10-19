import type { i18n } from 'i18next';
import { catalogs } from './catalog-data.js';
import legacy from './legacy-en.json';
import templates from './templates.json';
export { catalogs };
const en = catalogs.en;
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
function structured(value: unknown, catalog: Record<string, string>): unknown {
  if (typeof value === 'string') return catalog[normalize(value)] || value;
  if (Array.isArray(value)) return value.map(item => structured(item, catalog));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, structured(item, catalog)]));
  return value;
}
export const resources = Object.fromEntries(Object.entries(catalogs).map(([code, catalog]) => [code, {
  translation: structured(legacy, catalog), ui: catalog,
}]));
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = templates.map(source => ({ source,
  regex: new RegExp('^' + source.split(/\{\{v\d+\}\}/).map(part => escapeRegex(part).replace(/ /g, '\\s+')).join('(.+?)') + '$', 's'),
}));
// Only committed interface messages are eligible; unknown content stays original.
export function localizeText(value: unknown, instance: i18n): unknown {
  if (typeof value !== 'string' || !value.trim()) return value;
  const normalized = normalize(value);
  const whitespace = value.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
  if (Object.hasOwn(en, normalized)) return whitespace[1] + instance.t(normalized, { ns: 'ui', keySeparator: false, nsSeparator: false, defaultValue: normalized }) + whitespace[3];
  for (const { source, regex } of patterns) {
    const match = value.trim().match(regex);
    if (match) {
      const values = Object.fromEntries(match.slice(1).map((text, index) => [`v${index}`, text]));
      return whitespace[1] + instance.t(source, { ...values, ns: 'ui', keySeparator: false, nsSeparator: false, defaultValue: normalized }) + whitespace[3];
    }
  }
  return value;
}
