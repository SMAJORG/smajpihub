// One-time, opt-in authoring tool. Never imported by the application.
// Only repository UI messages are sent; no user content, credentials, or API keys.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/locales');
const source = JSON.parse(fs.readFileSync(path.join(directory, 'en.json'), 'utf8'));
const languages = ['fr', 'ar', 'ha', 'es', 'pt', 'zh', 'sw', 'hi', 'tr'];
const queue = [];
for (const language of languages) {
  const file = path.join(directory, `${language}.json`);
  const catalog = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  let batch = [], length = 0;
  const flush = () => { if (batch.length) queue.push({ language, file, catalog, texts: batch }); batch = []; length = 0; };
  for (const text of Object.keys(source)) {
    if (catalog[text]) continue;
    if (length + text.length > 2500) flush();
    batch.push(text); length += text.length + 1;
  }
  flush();
}
async function translate(language, texts, attempt = 0) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  const protectedTexts = texts.map(text => text.replace(/\{\{v(\d+)\}\}/g, (_, index) => `9876543${String(index).padStart(3, '0')}`));
  for (const [key, value] of Object.entries({ client: 'gtx', sl: 'en', tl: language === 'zh' ? 'zh-CN' : language, dt: 't', q: protectedTexts.join('\n') })) url.searchParams.set(key, value);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const translated = data[0].map(part => part[0] || '').join('').split('\n');
    if (translated.length !== texts.length) {
      if (texts.length === 1) return [data[0].map(part => part[0] || '').join('').replace(/9876543(\d{3})/g, (_, index) => `{{v${Number(index)}}}`)];
      const half = Math.ceil(texts.length / 2);
      return [...await translate(language, texts.slice(0, half)), ...await translate(language, texts.slice(half))];
    }
    return translated.map(text => text.replace(/9876543(\d{3})/g, (_, index) => `{{v${Number(index)}}}`));
  } catch (error) {
    if (attempt >= 4) throw error;
    await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
    return translate(language, texts, attempt + 1);
  }
}
let completed = 0;
console.log(`Authoring ${queue.length} batches; committed catalogs are used offline at runtime.`);
await Promise.all(Array.from({ length: 5 }, async () => {
  while (queue.length) {
    const job = queue.shift();
    try {
      const results = await translate(job.language, job.texts);
      job.texts.forEach((text, index) => {
        let value = results[index]?.trim();
        if (!value) throw new Error('Empty translation');
        // Restore interpolation identifiers: MT may insert whitespace or localize v.
        const expected = text.match(/\{\{v\d+\}\}/g) || [];
        const actual = value.match(/\{\s*\{[^{}]*\}\s*\}/g) || [];
        if (expected.length !== actual.length || expected.some(token => !value.includes(token))) {
          console.error(`${job.language}: skipping invalid interpolation: ${text}`);
          return;
        }
        job.catalog[text] = value;
      });
      fs.writeFileSync(job.file, JSON.stringify(Object.fromEntries(Object.keys(source).filter(key => job.catalog[key]).map(key => [key, job.catalog[key]])), null, 2) + '\n');
      completed++;
      if (completed % 20 === 0) console.log(`${completed} batches complete; ${queue.length} pending`);
    } catch (error) { console.error(job.language, String(error)); }
  }
}));
