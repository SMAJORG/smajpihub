import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../lib/axiosClient";

type TranslationTarget =
  | { kind: "text"; node: Text; source: string }
  | { kind: "attribute"; element: Element; attribute: string; source: string };

const cacheKey = (language: string) => `smaj_auto_translation_${language}_v1`;
const TRANSLATABLE_ATTRIBUTES = ["placeholder", "title", "aria-label"] as const;
const originalText = new WeakMap<Text, string>();
const appliedText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();
const appliedAttributes = new WeakMap<Element, Map<string, string>>();

const readCache = (language: string) => {
  try {
    return JSON.parse(window.localStorage.getItem(cacheKey(language)) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
};

const shouldTranslate = (value: string) => {
  const text = value.trim();
  if (text.length < 2 || !/[A-Za-z]/.test(text)) return false;
  if (/^(https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/i.test(text)) return false;
  if (/^(SMAJ(?: PI HUB| Token)?|Pi|EN|FR|LIVE)$/i.test(text)) return false;
  return true;
};

const isExcluded = (element: Element | null) =>
  !element || Boolean(element.closest("script, style, noscript, code, pre, textarea, [contenteditable='true'], [translate='no'], [data-no-auto-translate]"));

const collectTargets = (root: Node): TranslationTarget[] => {
  const targets: TranslationTarget[] = [];
  const visitText = (node: Text) => {
    if (isExcluded(node.parentElement)) return;
    const current = node.nodeValue || "";
    const lastApplied = appliedText.get(node);
    if (!originalText.has(node) || (lastApplied !== undefined && current !== lastApplied)) originalText.set(node, current);
    const source = originalText.get(node) || current;
    if (shouldTranslate(source)) targets.push({ kind: "text", node, source });
  };
  const visitElement = (element: Element) => {
    if (isExcluded(element)) return;
    for (const attribute of TRANSLATABLE_ATTRIBUTES) {
      const current = element.getAttribute(attribute);
      if (!current) continue;
      const originals = originalAttributes.get(element) || new Map<string, string>();
      const applied = appliedAttributes.get(element)?.get(attribute);
      if (!originals.has(attribute) || (applied !== undefined && current !== applied)) originals.set(attribute, current);
      originalAttributes.set(element, originals);
      const source = originals.get(attribute) || current;
      if (shouldTranslate(source)) targets.push({ kind: "attribute", element, attribute, source });
    }
  };

  if (root.nodeType === Node.TEXT_NODE) visitText(root as Text);
  if (root.nodeType === Node.ELEMENT_NODE) visitElement(root as Element);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    if (walker.currentNode.nodeType === Node.TEXT_NODE) visitText(walker.currentNode as Text);
    else visitElement(walker.currentNode as Element);
  }
  return targets;
};

const restoreEnglish = (root: Node) => {
  const targets = collectTargets(root);
  for (const target of targets) {
    if (target.kind === "text") {
      const original = originalText.get(target.node);
      if (original !== undefined) target.node.nodeValue = original;
      appliedText.delete(target.node);
    } else {
      const original = originalAttributes.get(target.element)?.get(target.attribute);
      if (original !== undefined) target.element.setAttribute(target.attribute, original);
      appliedAttributes.get(target.element)?.delete(target.attribute);
    }
  }
};

const AutomaticPageTranslator = () => {
  const { i18n } = useTranslation();

  useEffect(() => {
    let disposed = false;
    let timer = 0;
    let retryTimer = 0;
    let generation = 0;
    let targetLanguage = (i18n.language || i18n.resolvedLanguage || "en").split("-")[0].toLowerCase();
    let cache = readCache(targetLanguage);
    const pendingRoots = new Set<Node>();

    const saveCache = (language: string, values: Record<string, string>) => {
      try {
        const entries = Object.entries(values).slice(-1_500);
        window.localStorage.setItem(cacheKey(language), JSON.stringify(Object.fromEntries(entries)));
      } catch {
        // Translation remains functional when storage is unavailable.
      }
    };

    const apply = (target: TranslationTarget, translated: string) => {
      if (!translated) return;
      if (target.kind === "text") {
        if (target.node.nodeValue === translated) return;
        target.node.nodeValue = translated;
        appliedText.set(target.node, translated);
      } else {
        if (target.element.getAttribute(target.attribute) === translated) return;
        target.element.setAttribute(target.attribute, translated);
        const values = appliedAttributes.get(target.element) || new Map<string, string>();
        values.set(target.attribute, translated);
        appliedAttributes.set(target.element, values);
      }
    };

    const translate = async (targets: TranslationTarget[], run: number) => {
      const language = targetLanguage;
      const runCache = cache;
      const bySource = new Map<string, TranslationTarget[]>();
      targets.forEach((target) => bySource.set(target.source, [...(bySource.get(target.source) || []), target]));
      const missing = [...bySource.keys()].filter((source) => !runCache[source]);

      for (let index = 0; index < missing.length && !disposed; index += 40) {
        const texts = missing.slice(index, index + 40);
        try {
          const response = await apiFetch("/translations/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ texts, target: language }),
          });
          if (!response.ok) continue;
          const data = (await response.json()) as { translations?: string[] };
          texts.forEach((source, offset) => { runCache[source] = data.translations?.[offset] || source; });
          saveCache(language, runCache);
        } catch {
          window.clearTimeout(retryTimer);
          retryTimer = window.setTimeout(() => schedule(document.body), 5_000);
        }
      }

      if (disposed || run !== generation || language !== targetLanguage || language === "en") return;
      bySource.forEach((items, source) => items.forEach((target) => apply(target, runCache[source])));
    };

    const process = () => {
      timer = 0;
      const root = document.body;
      if (!root) return;
      if (targetLanguage === "en") {
        restoreEnglish(root);
        pendingRoots.clear();
        return;
      }
      const roots = pendingRoots.size ? [...pendingRoots] : [root];
      pendingRoots.clear();
      const targets = roots.flatMap(collectTargets);
      void translate(targets, generation);
    };

    const schedule = (root: Node = document.body) => {
      if (!root) return;
      pendingRoots.add(root);
      window.clearTimeout(timer);
      window.clearTimeout(retryTimer);
      timer = window.setTimeout(process, 120);
    };

    const observer = new MutationObserver((mutations) => {
      if (targetLanguage === "en") return;
      mutations.forEach((mutation) => {
        if (mutation.type === "characterData") schedule(mutation.target);
        mutation.addedNodes.forEach((node) => schedule(node));
        if (mutation.type === "attributes") schedule(mutation.target);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...TRANSLATABLE_ATTRIBUTES] });

    const onLanguageChanged = (language: string) => {
      targetLanguage = language.split("-")[0].toLowerCase();
      cache = readCache(targetLanguage);
      generation += 1;
      schedule(document.body);
    };
    i18n.on("languageChanged", onLanguageChanged);
    schedule(document.body);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      observer.disconnect();
      i18n.off("languageChanged", onLanguageChanged);
    };
  }, [i18n]);

  return null;
};

export default AutomaticPageTranslator;
