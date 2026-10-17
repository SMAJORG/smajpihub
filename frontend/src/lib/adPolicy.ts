export const adPlacements = {
  homeBanner: { label: "Home banner", format: "banner", paths: ["/", "/home", "/dashboard"] },
  storeNative: { label: "Store native ad", format: "native", paths: ["/store", "/services/store"] },
  streamNative: {
    label: "Stream native ad",
    format: "native",
    paths: ["/stream", "/services/stream", "/app/services/stream"],
  },
  discoveryReward: { label: "Optional discovery reward", format: "rewarded", paths: ["/services", "/app/services"] },
} as const;
export type AdPlacement = keyof typeof adPlacements;
export type AdRect = { top: number; bottom: number; left: number; right: number };
export function canDisplayAdSlot(rect: AdRect, width: number, bottom: number, blockers: AdRect[] = []): boolean {
  return (
    rect.top >= 8 &&
    rect.bottom <= bottom - 8 &&
    rect.left >= 0 &&
    rect.right <= width &&
    rect.bottom > rect.top &&
    rect.right > rect.left &&
    blockers.every(
      block =>
        block.right <= block.left ||
        block.bottom <= block.top ||
        rect.right <= block.left ||
        rect.left >= block.right ||
        rect.bottom <= block.top ||
        rect.top >= block.bottom
    )
  );
}
export type AdSettings = { enabled: boolean; placements: Partial<Record<AdPlacement, boolean>> };
export const defaultAdSettings: AdSettings = { enabled: false, placements: {} };
export function placementForPath(path: string): AdPlacement | undefined {
  return (Object.keys(adPlacements) as AdPlacement[]).find(key =>
    (adPlacements[key].paths as readonly string[]).includes(path)
  );
}
