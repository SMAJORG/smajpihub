import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/locales');
const source = JSON.parse(fs.readFileSync(path.join(directory, 'en.json'), 'utf8'));
const templates = JSON.parse(fs.readFileSync(path.join(directory, '../localization/templates.json'), 'utf8'));
for (const code of ['fr', 'ar', 'ha', 'es', 'pt', 'zh', 'sw', 'hi', 'tr']) {
  const file = path.join(directory, `${code}.json`);
  const catalog = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const brand of ['SMAJ PI HUB', 'SMAJ Pi Hub', 'SMAJ', 'Pi', 'SMAJ Store', 'SMAJ PI Jobs']) if (source[brand]) catalog[brand] = brand;
  if (code === 'hi' && source['{{v0}} of {{v1}} steps complete']) catalog['{{v0}} of {{v1}} steps complete'] = '{{v1}} चरणों में से {{v0}} पूरे हुए';
  if (code === 'tr' && source['Slide {{v0}} of {{v1}}']) catalog['Slide {{v0}} of {{v1}}'] = '{{v0}} / {{v1}} slayt';
  const result = {};
  for (const text of Object.keys(source)) {
    if (process.argv.includes('--refresh-templates') && templates.includes(text)) continue;
    const translated = catalog[text];
    if (translated && JSON.stringify((translated.match(/\{\{v\d+\}\}/g) || []).sort()) === JSON.stringify((text.match(/\{\{v\d+\}\}/g) || []).sort())) result[text] = translated;
  }
  fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n');
  console.log(`${code}: ${Object.keys(result).length}/${Object.keys(source).length}`);
}
