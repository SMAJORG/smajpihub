export type ServiceDefinition = {
  slug: string;
  name: string;
  experience: string;
  description: string;
  items: string[];
  atlasIndex: number;
  live?: boolean;
  inProgress?: boolean;
};

export const serviceCatalog: ServiceDefinition[] = [
  { slug: "store", name: "SMAJ Store", experience: "Get anything", description: "Buy and sell products with Pi.", items: ["Products", "Stores", "Sellers", "Deals", "Delivery"], atlasIndex: 0, live: true },
  { slug: "stream", name: "SMAJ Stream", experience: "Watch anytime", description: "Movies, series, creators, and live content.", items: ["Movies", "Series", "Videos", "Creators", "Live"], atlasIndex: 12, live: true },
  { slug: "jobs", name: "SMAJ Jobs", experience: "Work anywhere", description: "Jobs, freelance work, hiring, and talent.", items: ["Jobs", "Freelance", "Hiring", "Talent", "Companies"], atlasIndex: 2, live: true },
  { slug: "education", name: "SMAJ Education", experience: "Learn anything", description: "Learning, training, skills, and certifications.", items: ["Courses", "Skills", "Training", "Certifications", "Learning resources"], atlasIndex: 3, live: true },
  { slug: "sports", name: "SMAJ Sports", experience: "Play together", description: "Sports, scores, clubs, games, and fans.", items: ["Sports", "Scores", "Clubs", "Games", "Community"], atlasIndex: 13, live: true },
  { slug: "food", name: "SMAJ Food", experience: "Eat anytime", description: "Restaurants, delivery, groceries, and offers.", items: ["Restaurants", "Food delivery", "Groceries", "Offers"], atlasIndex: 1, live: true },
  { slug: "health", name: "SMAJ Health", experience: "Stay healthy", description: "Healthcare, appointments, and pharmacy access.", items: ["Doctors", "Appointments", "Pharmacy", "Health services"], atlasIndex: 4, live: true },
  { slug: "transport", name: "SMAJ Transport", experience: "Move anywhere", description: "Transport, mobility, delivery, and rentals.", items: ["Rides", "Transport", "Delivery", "Rentals"], atlasIndex: 5, live: true },
  { slug: "agro", name: "SMAJ Agro", experience: "Grow more", description: "Agriculture marketplace and supply connections.", items: ["Farmers", "Crops", "Buyers", "Suppliers", "Equipment"], atlasIndex: 6, live: true },
  { slug: "energy", name: "SMAJ Energy", experience: "Power life", description: "Utilities and energy services.", items: ["Energy", "Utilities", "Bills", "Services"], atlasIndex: 7, live: true },
  { slug: "charity", name: "SMAJ Charity", experience: "Give hope", description: "Verified donations and community impact.", items: ["Donations", "Causes", "Community support", "Impact"], atlasIndex: 8, live: true },
  { slug: "housing", name: "SMAJ Housing", experience: "Find homes", description: "Property, rentals, agents, and land.", items: ["Properties", "Rentals", "Agents", "Land"], atlasIndex: 9, live: true },
  { slug: "events", name: "SMAJ Events", experience: "Discover events", description: "Events, tickets, shows, and experiences.", items: ["Events", "Tickets", "Shows", "Experiences"], atlasIndex: 10, live: true },
  { slug: "swap", name: "SMAJ Swap", experience: "Swap anything", description: "Token exchange, pools, and ecosystem liquidity.", items: ["Tokens", "Swap", "Liquidity", "Pools"], atlasIndex: 11, live: true },
  { slug: "token", name: "SMAJ Token", experience: "Earn more", description: "Rewards, loyalty, and ecosystem utility.", items: ["Rewards", "Loyalty", "Benefits", "Ecosystem utility"], atlasIndex: 14 },
];

export type ServiceLaunchStatus = "live" | "in-progress" | "coming-soon";

const liveServiceSlugs = new Set(["store", "stream", "jobs"]);

export const getServiceLaunchStatus = (slug: string): ServiceLaunchStatus => {
  if (liveServiceSlugs.has(slug)) return "live";
  if (slug === "education") return "coming-soon";
  return "in-progress";
};

export const getServiceLaunchLabel = (slug: string) => {
  const status = getServiceLaunchStatus(slug);
  return status === "live" ? "LIVE" : status === "coming-soon" ? "COMING SOON" : "IN PROGRESS";
};
export const serviceRoute = (slug: string) => `/services/${slug}`;

export const serviceAppPath = (slug: string) => {
  if (slug === "store") return "/store";
  if (slug === "stream") return "/app/services/stream";
  if (slug === "food") return "/services/food-delivery";
  return `/services/${slug}`;
};
