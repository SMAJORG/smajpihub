import axios from "axios";
import type { Router } from "express";
import env from "../environments";

const translationCache = new Map<string, string>();
const requestWindows = new Map<string, { startedAt: number; count: number }>();
const MAX_TEXTS = 50;
const MAX_TEXT_LENGTH = 2_000;
const MAX_REQUESTS_PER_MINUTE = 120;

const getProviderBaseUrl = () => {
  const configured = env.translation_api_url.replace(/\/+$/, "");
  return /^https?:\/\//i.test(configured) ? configured : `http://${configured}`;
};

const mountTranslationEndpoints = (router: Router) => {
  router.post("/batch", async (req, res) => {
    const client = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const window = requestWindows.get(client);
    const usage = !window || now - window.startedAt >= 60_000 ? { startedAt: now, count: 1 } : { ...window, count: window.count + 1 };
    requestWindows.set(client, usage);
    if (usage.count > MAX_REQUESTS_PER_MINUTE) {
      res.status(429).json({ message: "Translation request limit reached. Please try again shortly." });
      return;
    }

    const texts = Array.isArray(req.body?.texts) ? req.body.texts : [];
    const target = String(req.body?.target || "").toLowerCase();

    if (!/^[a-z]{2,3}$/.test(target) || target === "en" || !texts.length || texts.length > MAX_TEXTS) {
      res.status(400).json({ message: "Provide 1-50 texts and a valid non-English target language code." });
      return;
    }

    const normalized: string[] = texts.map((text: unknown) => String(text || "").trim());
    if (normalized.some((text: string) => !text || text.length > MAX_TEXT_LENGTH)) {
      res.status(400).json({ message: `Each text must contain 1-${MAX_TEXT_LENGTH} characters.` });
      return;
    }

    const missing = [...new Set(normalized.filter((text: string) => !translationCache.has(`${target}:${text}`)))];

    try {
      if (missing.length) {
        const response = await axios.post(
          `${getProviderBaseUrl()}/translate`,
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
          if (translationCache.size > 10_000) translationCache.delete(translationCache.keys().next().value as string);
        });
      }

      res.json({ translations: normalized.map((text: string) => translationCache.get(`${target}:${text}`) || text) });
    } catch (error) {
      console.error("[translation] provider request failed", axios.isAxiosError(error) ? error.message : error);
      res.status(502).json({ message: "Automatic translation is temporarily unavailable." });
    }
  });
};

export default mountTranslationEndpoints;
