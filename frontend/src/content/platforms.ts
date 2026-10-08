export type PlatformDefinition = {
  name: string;
  routeSegment: string;
  description: string;
  status: "Live" | "Coming Soon" | "In Progress";
};

export const platformDefinitions: PlatformDefinition[] = [
  { name: "SMAJ Store", routeSegment: "store", description: "Shop products and services with Pi.", status: "Live" },
  {
    name: "SMAJ Food Delivery",
    routeSegment: "food-delivery",
    description: "Order food through trusted local merchants.",
    status: "Live",
  },
  {
    name: "SMAJ PI Jobs",
    routeSegment: "jobs",
    description: "Find jobs and freelance opportunities.",
    status: "Live",
  },
  {
    name: "SMAJ PI Health",
    routeSegment: "health",
    description: "Book care and medical services.",
    status: "Live",
  },
  {
    name: "SMAJ PI Edu",
    routeSegment: "education",
    description: "Learn skills from trusted mentors.",
    status: "Live",
  },
  {
    name: "SMAJ PI Transport",
    routeSegment: "transport",
    description: "Access mobility and ride services.",
    status: "Coming Soon",
  },
  {
    name: "SMAJ PI Agro",
    routeSegment: "agro",
    description: "Support farmers, food supply, and agri-market access.",
    status: "Coming Soon",
  },
  {
    name: "SMAJ PI Energy",
    routeSegment: "energy",
    description: "Discover clean energy and utility services.",
    status: "Coming Soon",
  },
  {
    name: "SMAJ PI Charity",
    routeSegment: "charity",
    description: "Contribute to transparent community support campaigns.",
    status: "Coming Soon",
  },
  {
    name: "SMAJ PI Housing",
    routeSegment: "housing",
    description: "Browse rental and housing options.",
    status: "Coming Soon",
  },
  {
    name: "SMAJ PI Events",
    routeSegment: "events",
    description: "Explore tickets, events, and local experiences.",
    status: "Coming Soon",
  },
  {
    name: "SMAJ PI Swap",
    routeSegment: "swap",
    description: "Swap supported digital assets across ecosystem flows.",
    status: "Coming Soon",
  },
  {
    name: "SMAJ PI Stream",
    routeSegment: "stream",
    description: "Watch and monetize creator-first streaming content.",
    status: "Live",
  },
  {
    name: "SMAJ PI Sports",
    routeSegment: "sports",
    description: "Follow sports communities, activities, and fan utilities.",
    status: "Live",
  },
  {
    name: "SMAJ Token",
    routeSegment: "token",
    description:
      "Deferred concept, outside the current core strategy and launch plan. Any future token requires a clear use case and a separate decision.",
    status: "Coming Soon",
  },
];

const launchPriority = ["store", "jobs"];

export const orderedPlatformDefinitions = [...platformDefinitions].sort((left, right) => {
  const leftIndex = launchPriority.indexOf(left.routeSegment);
  const rightIndex = launchPriority.indexOf(right.routeSegment);
  const leftPriority = leftIndex === -1 ? launchPriority.length : leftIndex;
  const rightPriority = rightIndex === -1 ? launchPriority.length : rightIndex;
  return leftPriority - rightPriority;
});
