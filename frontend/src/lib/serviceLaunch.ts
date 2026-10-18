import { getServiceLaunchStatus } from "../content/serviceCatalog";
export const brandedServiceLaunchSlugs = [
  "store",
  "jobs",
  "education",
  "transport",
  "health",
] as const;
export type BrandedServiceLaunchSlug =
  (typeof brandedServiceLaunchSlugs)[number];

export const serviceLaunchNavigationState = (slug: string) => {
  if (getServiceLaunchStatus(slug) === "in-progress")
    return { inProgressEntry: slug };
  if (slug === "stream") return { streamEntry: true };
  return brandedServiceLaunchSlugs.includes(slug as BrandedServiceLaunchSlug)
    ? { serviceLaunch: slug }
    : undefined;
};
