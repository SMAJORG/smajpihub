import axios from "axios";
import type { Router } from "express";
import env from "../environments";

const translationCache = new Map<string, string>();
const requestWindows = new Map<string, { startedAt: number; count: number }>();
const MAX_TEXTS = 20;
const MAX_TEXT_LENGTH = 1_000;
const MAX_REQUESTS_PER_MINUTE = 60;
const MAX_CACHE_ENTRIES = 3_000;
const REQUEST_WINDOW_TTL_MS = 2 * 60_000;
const SUPPORTED_TARGETS = new Set(["fr", "sw", "ar", "zh"]);
const activeProviderTargets = new Set<string>();
let lastWindowCleanupAt = 0;

const getProviderBaseUrl = (target: string) => {
  const providers: Record<string, string> = {
    ar: env.translation_api_url_ar,
    sw: env.translation_api_url_sw,
    zh: env.translation_api_url_zh,
  };
  const configured = (providers[target] || env.translation_api_url).replace(/\/+$/, "");
  return /^https?:\/\//i.test(configured) ? configured : `http://${configured}`;
};

const mountTranslationEndpoints = (router: Router) => {
  router.post("/batch", async (req, res) => {
    const client = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    if (now - lastWindowCleanupAt >= REQUEST_WINDOW_TTL_MS) {
      for (const [key, value] of requestWindows) {
        if (now - value.startedAt >= REQUEST_WINDOW_TTL_MS) requestWindows.delete(key);
      }
      lastWindowCleanupAt = now;
    }
    const window = requestWindows.get(client);
    const usage = !window || now - window.startedAt >= 60_000 ? { startedAt: now, count: 1 } : { ...window, count: window.count + 1 };
    requestWindows.set(client, usage);
    if (usage.count > MAX_REQUESTS_PER_MINUTE) {
      res.status(429).json({ message: "Translation request limit reached. Please try again shortly." });
      return;
    }

    const texts = Array.isArray(req.body?.texts) ? req.body.texts : [];
    const target = String(req.body?.target || "").toLowerCase();

    if (!SUPPORTED_TARGETS.has(target) || !texts.length || texts.length > MAX_TEXTS) {
      res.status(400).json({ message: `Provide 1-${MAX_TEXTS} texts and a valid non-English target language code.` });
      return;
    }

    const normalized: string[] = texts.map((text: unknown) => String(text || "").trim());
    if (normalized.some((text: string) => !text || text.length > MAX_TEXT_LENGTH)) {
      res.status(400).json({ message: `Each text must contain 1-${MAX_TEXT_LENGTH} characters.` });
      return;
    }

    const missing = [...new Set(normalized.filter((text: string) => !translationCache.has(`${target}:${text}`)))];

    if (missing.length && activeProviderTargets.has(target)) {
      res.setHeader("Retry-After", "2");
      res.status(503).json({ message: "Translation service is busy. Please retry shortly." });
      return;
    }

    try {
      if (missing.length) {
        activeProviderTargets.add(target);
        const response = await axios.post(
          `${getProviderBaseUrl(target)}/translate`,
          {
            q: missing,
            source: "auto",
            target,
            format: "text",
            ...(env.translation_api_key ? { api_key: env.translation_api_key } : {}),
          },
          { timeout: 30_000 },
        );
        const results = Array.isArray(response.data) ? response.data : [response.data];
        missing.forEach((text, index) => {
          const translated = String(results[index]?.translatedText || text).trim();
          translationCache.set(`${target}:${text}`, translated || text);
          if (translationCache.size > MAX_CACHE_ENTRIES) translationCache.delete(translationCache.keys().next().value as string);
        });
      }

      res.json({ translations: normalized.map((text: string) => translationCache.get(`${target}:${text}`) || text) });
    } catch (error) {
      console.error("[translation] provider request failed", axios.isAxiosError(error) ? error.message : error);
      res.status(502).json({ message: "Automatic translation is temporarily unavailable." });
    } finally {
      if (missing.length) activeProviderTargets.delete(target);
    }
  });
};

export default mountTranslationEndpoints;
