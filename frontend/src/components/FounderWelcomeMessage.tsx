import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ChatMessageText from "./ChatMessageText";
import { apiFetch } from "../lib/axiosClient";
import { normalizeLanguage } from "../localization/languages";
import { formatFounderWelcomeMessage, isFounderWelcomeSectionHeading, translateFounderWelcomeMessage } from "../lib/founderWelcome";

type WelcomeLink = { href: string; label: string };
const emptyLinks: WelcomeLink[] = [];
type TranslationState = { source: string; target: string; value: string; links: WelcomeLink[] };

async function translateLines(lines: string[], target: string, signal: AbortSignal): Promise<string[]> {
  const translations: string[] = [];
  for (let offset = 0; offset < lines.length; offset += 20) {
    const batch = lines.slice(offset, offset + 20);
    const response = await apiFetch("/translations/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts: batch, source: "auto", target, allowUnchanged: true }),
      signal,
    });
    const data = await response.json();
    if (!response.ok || data.status !== "translated" || !Array.isArray(data.translations) || data.translations.length !== batch.length || data.translations.some((value: unknown) => typeof value !== "string" || !value.trim())) {
      throw new Error("welcome_translation_unavailable");
    }
    if (data.translations.some((value: string, index: number) => value.trim() === batch[index].trim())) {
      throw new Error("welcome_translation_incomplete");
    }
    translations.push(...data.translations);
  }
  return translations;
}

export default function FounderWelcomeMessage({ text, links = emptyLinks }: { text: string; links?: WelcomeLink[] }) {
  const { i18n } = useTranslation();
  const target = normalizeLanguage(i18n.resolvedLanguage || "en");
  const [result, setResult] = useState<TranslationState>();
  const request = useRef<AbortController | null>(null);
  const original = useMemo(() => formatFounderWelcomeMessage(text), [text]);
  const sourceHeadingIndexes = useMemo(() => new Set(
    formatFounderWelcomeMessage(text).split("\n").filter(Boolean)
      .flatMap((line, index) => isFounderWelcomeSectionHeading(line) ? [index] : []),
  ), [text]);
  const translated = result?.source === text && result.target === target && "value" in result ? result.value : undefined;
  const displayLinks = result?.source === text && result.target === target && "links" in result ? result.links : links;
  const display = translated ?? original;
  const translating = target !== "en" && translated === undefined;

  useEffect(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setResult(undefined);
    if (target === "en") {
      setResult({ source: text, target, value: original, links });
      return () => controller.abort();
    }
    let cancelled = false;
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    void translateFounderWelcomeMessage(text, target, (lines, language) => translateLines(lines, language, controller.signal))
      .then(async (value) => {
        const translatedLabels = !links.length
          ? links
          : (await translateLines(links.map((link) => link.label), target, controller.signal))
            .map((label, index) => ({ ...links[index], label }));
        if (!controller.signal.aborted) setResult({ source: text, target, value, links: translatedLabels });
      })
      .catch(() => {
        if (!cancelled) setResult({ source: text, target, value: original, links });
      })
      .finally(() => window.clearTimeout(timeout));
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeout); };
  }, [text, target, links, original]);

  let visibleLineIndex = 0;

  return <div className="founder-welcome-message" aria-busy={translating} aria-live="polite">
    {display.split(/\n{2,}/u).map((paragraph, paragraphIndex) => (
      <p key={paragraphIndex}>{paragraph.split("\n").map((line, lineIndex) => {
        const heading = isFounderWelcomeSectionHeading(line) || sourceHeadingIndexes.has(visibleLineIndex);
        visibleLineIndex += 1;
        const linkLine = /^https?:\/\/\S+$/iu.test(line.trim());
        const content = heading ? <strong>{line}</strong> : <ChatMessageText text={line} links={displayLinks} />;
        return <span className={linkLine ? "founder-welcome-link-line" : undefined} key={lineIndex}>
          {lineIndex ? <br /> : null}{content}
        </span>;
      })}</p>
    ))}
  </div>;
}
