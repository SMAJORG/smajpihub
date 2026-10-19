import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../lib/axiosClient';
import { normalizeLanguage } from '../localization/languages';

// User content is opt-in. Failed/identical responses always display the original
// with an explicit failure label, and never enter the interface catalog.
export default function DynamicTranslation({ text, source = 'auto' }: { text: string; source?: string }) {
  const { i18n } = useTranslation();
  const target = normalizeLanguage(i18n.resolvedLanguage || 'en');
  const [result, setResult] = useState<{ text: string; source: string; target: string; value: string }>();
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const [failureFor, setFailureFor] = useState('');
  useEffect(() => {
    generation.current++;
    request.current?.abort();
    setState('idle');
    return () => { generation.current++; request.current?.abort(); };
  }, [text, source, target]);
  const translated = result?.text === text && result.source === source && result.target === target ? result.value : undefined;
  const translate = async () => {
    const run = ++generation.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    setState('loading');
    setFailureFor('');
    try {
      const response = await apiFetch('/translations/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: [text], source, target }), signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || data.status !== 'translated' || typeof data.translations?.[0] !== 'string' || !data.translations[0].trim() || data.translations[0].trim() === text.trim()) throw new Error('translation_unavailable');
      if (run === generation.current) { setResult({ text, source, target, value: data.translations[0] }); setState('idle'); }
    } catch { if (run === generation.current) { setState('failed'); setFailureFor(JSON.stringify([text, target])); } }
    finally { window.clearTimeout(timeout); }
  };
  return <span className="dynamic-translation">
    <span translate="no" dir="auto">{translated || text}</span>
    {source !== target && text.trim().length > 0 && text.length <= 1000 ? <button type="button" disabled={state === 'loading'} onClick={() => translated ? setResult(undefined) : void translate()}>{translated ? 'Show original' : 'Translate'}</button> : null}
    {state === 'failed' && failureFor === JSON.stringify([text, target]) ? <small role="status">Translation unavailable. Showing original text.</small> : null}
  </span>;
}
