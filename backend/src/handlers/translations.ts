import axios from 'axios';
import { createHash } from 'crypto';
import type { Router, Response } from 'express';
import env from '../environments';

const LANGUAGES = new Set(['en', 'fr', 'ar', 'ha', 'es', 'pt', 'zh', 'sw', 'hi', 'tr']);
type Language = { code: string; targets: string[] };
type Provider = { get: typeof axios.get; post: typeof axios.post };
type Configuration = { url: string; key: string; overrides?: Record<string, string>; now?: () => number };
class TranslationError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

export const mountTranslationEndpoints = (router: Router, configuration: Configuration = {
  url: env.translation_api_url, key: env.translation_api_key,
  overrides: { ar: env.translation_api_url_ar, sw: env.translation_api_url_sw, zh: env.translation_api_url_zh },
}, provider: Provider = axios) => {
  const now = configuration.now || Date.now;
  const cache = new Map<string, { text: string; expires: number }>();
  const capabilities = new Map<string, { languages: Language[]; expires: number }>();
  const windows = new Map<string, { start: number; count: number }>();
  let active = 0;
  let lastCleanup = 0;
  const baseUrl = (target: string) => {
    const value = (configuration.overrides?.[target] || configuration.url).replace(/\/+$/, '');
    if (!value) throw new TranslationError(503, 'translation_not_configured');
    if (!/^https?:\/\//i.test(value)) throw new TranslationError(503, 'translation_invalid_configuration');
    return value;
  };
  const discover = async (url: string): Promise<Language[]> => {
    const saved = capabilities.get(url);
    if (saved && saved.expires > now()) return saved.languages;
    const response = await provider.get(`${url}/languages`, { timeout: 5000, maxContentLength: 65536, maxRedirects: 0 });
    if (!Array.isArray(response.data) || response.data.some((item: Language) => typeof item?.code !== 'string' || !Array.isArray(item.targets) || item.targets.some(target => typeof target !== 'string'))) throw new TranslationError(502, 'translation_invalid_capabilities');
    capabilities.set(url, { languages: response.data, expires: now() + 600000 });
    return response.data;
  };
  const failure = (res: Response, error: unknown) => {
    // No provider URLs, secrets, request text, or axios configuration in logs/errors.
    if (error instanceof TranslationError) return res.status(error.status).json({ status: 'unavailable', code: error.code });
    return res.status(502).json({ status: 'unavailable', code: 'translation_provider_unavailable' });
  };
  router.get('/languages', async (_req, res) => {
    if (active >= 2) { res.status(503).json({ status: 'unavailable', code: 'translation_busy' }); return; }
    active++;
    try {
      const pairs: Record<string, string[]> = {};
      const probes = new Map<string, Promise<Language[]>>();
      for (const target of LANGUAGES) {
        try {
          const url = baseUrl(target);
          if (!probes.has(url)) probes.set(url, discover(url).catch(() => []));
        } catch { /* Unconfigured targets are explicitly unavailable. */ }
      }
      await Promise.all(probes.values());
      for (const target of LANGUAGES) {
        try {
          const supported = await probes.get(baseUrl(target)) || [];
          pairs[target] = supported.filter(language => language.targets.includes(target) && language.code !== target).map(language => language.code);
        } catch { pairs[target] = []; }
      }
      res.json({ status: Object.values(pairs).some(sources => sources.length) ? 'available' : 'unavailable', sourcesByTarget: pairs });
    } finally { active--; }
  });
  router.post('/batch', async (req, res) => {
    const timestamp = now();
    if (timestamp - lastCleanup >= 60000) {
      for (const [ip, window] of windows) if (timestamp - window.start >= 60000) windows.delete(ip);
      lastCleanup = timestamp;
    }
    const client = req.ip || req.socket.remoteAddress || 'unknown';
    const previous = windows.get(client);
    const usage = !previous || timestamp - previous.start >= 60000 ? { start: timestamp, count: 0 } : previous;
    usage.count++;
    if (usage.count > 30 || (!windows.has(client) && windows.size >= 10000)) {
      res.setHeader('Retry-After', '60');
      res.status(429).json({ status: 'unavailable', code: 'translation_rate_limited' }); return;
    }
    windows.set(client, usage);
    const texts: unknown = req.body?.texts;
    const target = typeof req.body?.target === 'string' ? req.body.target.toLowerCase() : '';
    const source = typeof req.body?.source === 'string' ? req.body.source.toLowerCase() : 'auto';
    if (!LANGUAGES.has(target) || (source !== 'auto' && !LANGUAGES.has(source)) || source === target || !Array.isArray(texts) || !texts.length || texts.length > 20 || texts.some(text => typeof text !== 'string' || !text.trim() || text.length > 1000)) {
      res.status(400).json({ status: 'unavailable', code: 'translation_invalid_request' }); return;
    }
    const input = texts as string[];
    let slot = false;
    try {
      const url = baseUrl(target);
      const keyFor = (text: string) => createHash('sha256').update(JSON.stringify([url, source, target, text])).digest('hex');
      for (const [key, entry] of cache) if (entry.expires <= timestamp) cache.delete(key);
      const missing = [...new Set(input.filter(text => !cache.has(keyFor(text))))];
      if (missing.length) {
        if (active >= 2) throw new TranslationError(503, 'translation_busy');
        active++; slot = true;
        const languages = await discover(url);
        const supported = source === 'auto'
          ? languages.some(language => language.code !== target && language.targets.includes(target))
          : languages.some(language => language.code === source && language.targets.includes(target));
        if (!supported) throw new TranslationError(422, 'translation_unsupported_pair');
        const response = await provider.post(`${url}/translate`, {
          q: missing, source, target, format: 'text',
          ...(configuration.key ? { api_key: configuration.key } : {}),
        }, { timeout: 8000, maxContentLength: 262144, maxRedirects: 0 });
        // LibreTranslate returns { translatedText: string[] } for q arrays.
        // Older compatible providers return [{ translatedText: string }].
        const data = response.data;
        const results = Array.isArray(data?.translatedText) ? data.translatedText : Array.isArray(data) ? data.map(item => item?.translatedText) : missing.length === 1 ? [data?.translatedText] : [];
        if (results.length !== missing.length || results.some((text: unknown) => typeof text !== 'string' || !text.trim() || text.length > 10000)) throw new TranslationError(502, 'translation_invalid_response');
        if (results.some((text: string, index: number) => text.trim() === missing[index].trim())) throw new TranslationError(422, 'translation_unchanged');
        // Validate the whole batch before caching any result.
        missing.forEach((text, index) => {
          cache.set(keyFor(text), { text: results[index], expires: now() + 300000 });
          if (cache.size > 3000) cache.delete(cache.keys().next().value!);
        });
      }
      res.json({ status: 'translated', source, target, translations: input.map(text => cache.get(keyFor(text))!.text) });
    } catch (error) { failure(res, error); }
    finally { if (slot) active--; }
  });
};
export default mountTranslationEndpoints;
