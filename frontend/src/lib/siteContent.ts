import { useSyncExternalStore } from "react";
import { apiFetch } from "./axiosClient";
import type { AdSettings } from "./adPolicy";
export type ContentCard = {
  id: string;
  title: string;
  text: string;
  image: string;
  icon: string;
  serviceSlug?: string;
  to: string;
  badge: string;
  homeName?: string;
  awayName?: string;
  homeIcon?: string;
  awayIcon?: string;
  homeScore?: string;
  awayScore?: string;
  competition?: string;
};
export type HomeSection = {
  id: string;
  title: string;
  subtitle: string;
  to: string;
  visible: boolean;
  mode: "automatic" | "custom";
  order: number;
  cards: ContentCard[];
};
export type ServiceContent = {
  slug: string;
  name: string;
  experience: string;
  description: string;
  items: string[];
  icon: string;
  status: "live" | "in-progress" | "coming-soon";
  progress: number;
  order: number;
};
export type SiteContent = { services: ServiceContent[]; sections: HomeSection[]; ads?: AdSettings };
let content: SiteContent = { services: [], sections: [] };
const listeners = new Set<() => void>();
let contentVersion = 0;
export const getSiteContent = () => content;
export const publishSiteContent = (value: SiteContent) => {
  contentVersion += 1;
  content = value;
  listeners.forEach(fn => fn());
};
export const useSiteContent = () =>
  useSyncExternalStore(
    fn => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    getSiteContent,
    getSiteContent
  );
let refreshing: Promise<void> | null = null;
export const refreshSiteContent = (): Promise<void> => {
  if (refreshing) return refreshing;
  const startedVersion = contentVersion;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  refreshing = apiFetch("/site-content", { cache: "no-store", signal: controller.signal })
    .then(response => {
      if (!response.ok) throw new Error("Home content is unavailable.");
      return response.json();
    })
    .then(data => {
      if (
        startedVersion === contentVersion &&
        Array.isArray(data.content?.services) &&
        Array.isArray(data.content?.sections)
      )
        publishSiteContent(data.content);
    })
    .finally(() => {
      window.clearTimeout(timeout);
      refreshing = null;
    });
  return refreshing;
};
export const serviceIcon = (slug: string, fallback: string) =>
  content.services.find(s => s.slug === slug)?.icon || fallback;
