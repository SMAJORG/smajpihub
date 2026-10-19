import { createContext, createElement, useContext, type ElementType, type ReactNode, type Key } from 'react';
import { jsx as reactJsx, jsxs as reactJsxs, Fragment } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import { localizeText } from './catalog';
export { Fragment };
export type { JSX } from 'react/jsx-runtime';
// React owns translated nodes: no DOM mutation, requests, or application remount.
const Original = createContext(false);
export function originalContent(children: ReactNode) {
  return createElement(Original.Provider, { value: true }, children);
}
const skipped = new Set(['script', 'style', 'code', 'pre', 'svg', 'path']);
type HostProps = { host: ElementType; children?: ReactNode } & Record<string, unknown>;
function LocalizedHost({ host, __smajDisplay: _display, ...props }: HostProps) {
  const { i18n } = useTranslation();
  const inherited = useContext(Original);
  const original = inherited || props.translate === 'no' || props['data-no-auto-translate'] !== undefined || (typeof host === 'string' && skipped.has(host));
  const preserveChildren = host === 'textarea' || props.contentEditable === true || props.contentEditable === 'true';
  if (original) return createElement(Original.Provider, { value: true }, createElement(host, props));
  const translated = { ...props };
  for (const attribute of ['placeholder', 'title', 'aria-label', 'alt', 'label', 'helperText', 'emptyText', 'buttonText']) {
    if (typeof props[attribute] === 'string') translated[attribute] = localizeText(props[attribute], i18n);
  }
  const localizeChildren = (children: ReactNode): ReactNode => Array.isArray(children) ? children.map(localizeChildren) : localizeText(children, i18n) as ReactNode;
  if ('children' in props) translated.children = preserveChildren ? props.children : localizeChildren(props.children);
  if (host === 'option' && props.value === undefined && typeof props.children === 'string') translated.value = props.children;
  const element = createElement(host, translated);
  return preserveChildren ? createElement(Original.Provider, { value: true }, element) : element;
}
type Jsx = typeof reactJsx;
function render(factory: Jsx, type: ElementType, props: unknown, key?: Key) {
  const values = props as Record<string, unknown> | null;
  // In-house components render localized DOM themselves. Their title/label
  // props can also be form data, so they must reach those components unchanged.
  if (typeof type !== 'string' && type !== Fragment && !values?.__smajDisplay) return factory(type, props, key);
  // Audited UI dependencies render through React's standard JSX runtime; their
  // display props are marked by the build-time localization transform.
  return factory(LocalizedHost, { ...(props as Record<string, unknown>), host: type }, key);
}
export const jsx: Jsx = (type, props, key) => render(reactJsx, type, props, key);
export const jsxs: Jsx = (type, props, key) => render(reactJsxs, type, props, key);
