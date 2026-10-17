const slugs = new Set([
  "store",
  "stream",
  "jobs",
  "education",
  "sports",
  "food",
  "health",
  "transport",
  "agro",
  "energy",
  "charity",
  "housing",
  "events",
  "swap",
  "token",
]);
const text = (value: unknown, max = 300) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
const url = (value: unknown, image = false) => {
  const result = text(value, 2048);
  if (result && !(image ? /^(https:\/\/|\/(?!\/))/ : /^\/(?!\/)/).test(result))
    throw new Error(
      image
        ? "Images must use HTTPS or an app asset path."
        : "Choose a link within this app, starting with /.",
    );
  return result;
};
const number = (value: unknown, min: number, max: number) => {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error("Enter a valid number.");
  return Math.max(min, Math.min(max, n));
};
export function parseSiteContent(input: any) {
  if (
    !input ||
    !Array.isArray(input.services) ||
    !Array.isArray(input.sections) ||
    input.services.length > 15 ||
    input.sections.length > 40
  )
    throw new Error("Invalid home content.");
  const serviceIds = new Set<string>(),
    sectionIds = new Set<string>();
  const services = input.services.map((s: any) => {
    if (!slugs.has(s.slug) || serviceIds.has(s.slug))
      throw new Error("Unknown or duplicate service.");
    serviceIds.add(s.slug);
    if (!["live", "in-progress", "coming-soon"].includes(s.status))
      throw new Error("Choose a valid service status.");
    return {
      slug: s.slug,
      name: text(s.name, 120),
      description: text(s.description),
      experience: text(s.experience, 120),
      items: Array.isArray(s.items)
        ? s.items.slice(0, 12).map((v: unknown) => text(v, 80))
        : [],
      icon: url(s.icon, true),
      status: s.status,
      progress: number(s.progress ?? 0, 0, 100),
      order: number(s.order ?? 0, 0, 999),
    };
  });
  const sections = input.sections.map((s: any) => {
    if (!/^[a-z][a-z0-9-]{0,59}$/.test(s.id) || sectionIds.has(s.id))
      throw new Error("Invalid or duplicate section.");
    sectionIds.add(s.id);
    if (
      !["automatic", "custom"].includes(s.mode) ||
      !Array.isArray(s.cards) ||
      s.cards.length > 40
    )
      throw new Error("Choose a valid section mode and at most 40 cards.");
    const cardIds = new Set<string>();
    return {
      id: s.id,
      title: text(s.title, 120),
      subtitle: text(s.subtitle),
      to: url(s.to),
      visible: s.visible !== false,
      mode: s.mode,
      order: number(s.order ?? 0, 0, 999),
      cards: s.cards.map((c: any) => {
        if (!/^[a-zA-Z0-9_-]{1,80}$/.test(c.id) || cardIds.has(c.id))
          throw new Error("Each card needs a unique ID.");
        cardIds.add(c.id);
        if (c.serviceSlug && !slugs.has(c.serviceSlug))
          throw new Error("Choose a valid shared service icon.");
        return {
          serviceSlug: c.serviceSlug || "",
          id: c.id,
          title: text(c.title, 180),
          text: text(c.text, 600),
          image: url(c.image, true),
          icon: url(c.icon, true),
          to: url(c.to),
          badge: text(c.badge, 80),
          homeName: text(c.homeName, 80),
          awayName: text(c.awayName, 80),
          homeIcon: url(c.homeIcon, true),
          awayIcon: url(c.awayIcon, true),
          homeScore: text(c.homeScore, 10),
          awayScore: text(c.awayScore, 10),
          competition: text(c.competition, 120),
        };
      }),
    };
  });
  // Fixed placement registry: remote content can switch test placements, never supply IDs.
  const ads = {
    enabled: input.ads?.enabled === true,
    placements: Object.fromEntries(
      ["homeBanner", "storeNative", "streamNative", "discoveryReward"].map(key => [key, input.ads?.placements?.[key] === true]),
    ),
  };
  return { services, sections, ads };
}
