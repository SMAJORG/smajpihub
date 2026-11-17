import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ChatMessageText from "./ChatMessageText";
import { apiFetch } from "../lib/axiosClient";
import { normalizeLanguage } from "../localization/languages";
import { formatFounderWelcomeMessage, isFounderWelcomeSectionHeading, translateFounderWelcomeMessage } from "../lib/founderWelcome";

type WelcomeLink = { href: string; label: string };
const emptyLinks: WelcomeLink[] = [];
type TranslationState =
  | { source: string; target: string; value: string; links: WelcomeLink[] }
  | { source: string; target: string; error: true };

const containsNonLatinLetters = (text: string) =>
  [...text].some((character) => /\p{L}/u.test(character) && !/[a-z]/i.test(character));
const hasNonEnglishLanguageSignal = (text: string) =>
  containsNonLatinLetters(text) || /\b(?:bienvenue|bienvenido|bem-vind[oa]|karibu|barka da zuwa|ayyuka|huduma|hoş ?geld|servicios|serviços|services disponibles|services à venir)\b/iu.test(text);

async function translateLines(lines: string[], target: string, signal: AbortSignal): Promise<string[]> {
  const translations: string[] = [];
  for (let offset = 0; offset < lines.length; offset += 20) {
    const batch = lines.slice(offset, offset + 20);
    const response = await apiFetch("/translations/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts: batch, source: "auto", target }),
      signal,
    });
    const data = await response.json();
    if (!response.ok || data.status !== "translated" || !Array.isArray(data.translations) || data.translations.length !== batch.length || data.translations.some((value: unknown) => typeof value !== "string" || !value.trim())) {
      throw new Error("welcome_translation_unavailable");
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
  const sourceHeadingIndexes = useMemo(() => new Set(
    formatFounderWelcomeMessage(text).split("\n").filter(Boolean)
      .flatMap((line, index) => isFounderWelcomeSectionHeading(line) ? [index] : []),
  ), [text]);
  const translated = result?.source === text && result.target === target && "value" in result ? result.value : undefined;
  const displayLinks = result?.source === text && result.target === target && "links" in result ? result.links : links;
  const failed = result?.source === text && result.target === target && "error" in result;

  useEffect(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setResult(undefined);
    if (target === "en" && !hasNonEnglishLanguageSignal(text)) {
      setResult({ source: text, target, value: formatFounderWelcomeMessage(text), links });
      return () => controller.abort();
    }
    void translateFounderWelcomeMessage(text, target, (lines, language) => translateLines(lines, language, controller.signal))
      .then(async (value) => {
        const translatedLabels = target === "en" || !links.length
          ? links
          : (await translateLines(links.map((link) => link.label), target, controller.signal))
            .map((label, index) => ({ ...links[index], label }));
        if (!controller.signal.aborted) setResult({ source: text, target, value, links: translatedLabels });
      })
      .catch(() => { if (!controller.signal.aborted) setResult({ source: text, target, error: true }); });
    return () => controller.abort();
  }, [text, target, links]);

  const display = translated ?? (failed ? "" : undefined);
  const failureText = i18n.t("Welcome message cannot be displayed in your selected language right now.", {
    ns: "ui", keySeparator: false, nsSeparator: false,
    defaultValue: "Welcome message cannot be displayed in your selected language right now.",
  });
  let visibleLineIndex = 0;

  return <div className="founder-welcome-message" aria-busy={display === undefined} aria-live="polite">
    {failed ? <p role="alert">{failureText}</p> : display === undefined ? <span className="founder-welcome-loading" aria-label={i18n.t("Translating welcome message...", {
      ns: "ui", keySeparator: false, nsSeparator: false, defaultValue: "Translating welcome message...",
    })} /> : display.split(/\n{2,}/u).map((paragraph, paragraphIndex) => (
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
