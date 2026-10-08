export type BlogContentBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "list"; items: string[] }
  | { type: "steps"; items: string[] };

export type BlogPost = {
  slug: string;
  title: string;
  snippet: string;
  author: string;
  date: string;
  readTime: string;
  category: string;
  tags: string[];
  featured?: boolean;
  content: BlogContentBlock[];
};

export const blogPosts: BlogPost[] = [
  {
    slug: "how-smaj-connects-pi-projects",
    title: "Building the Economic Utility Layer for the Pi Ecosystem",
    snippet: "How commerce, work, and trusted participation support practical Pi utility.",
    author: "SMAJ Team",
    date: "2026-01-18",
    readTime: "8 min read",
    category: "Platform",
    tags: ["Ecosystem", "Platform", "Guides"],
    featured: true,
    content: [
      { type: "heading", text: "Why Commerce and Work Come First" },
      {
        type: "paragraph",
        text: "SMAJ PI HUB aims to connect verified people and businesses to commerce, work, and real-world services through one Pi identity and one Pi wallet. Store and Jobs form the initial economic foundation; additional modules follow validated demand and readiness.",
      },
      {
        type: "paragraph",
        text: "This structure improves trust, lowers confusion, and supports faster adoption of real Pi utility because the same identity flow, service language, and support standards are reused across modules.",
      },
      { type: "heading", text: "Cross-Platform Access Flow" },
      {
        type: "steps",
        items: [
          "Connect Pi wallet from the main header.",
          "Select a module like Store, Marketplace, or Digital Services.",
          "Continue with a shared identity and trust profile.",
          "Confirm Pi transaction and track delivery or milestone status.",
        ],
      },
      { type: "quote", text: "One ecosystem, one wallet touchpoint, many real-world Pi use cases." },
    ],
  },
  {
    slug: "building-trusted-pi-commerce",
    title: "Building Trusted Pi Commerce Through Marketplace Participation",
    snippet: "How Pi payments and planned marketplace protections can support more accountable exchanges.",
    author: "Marketplace Ops",
    date: "2026-01-10",
    readTime: "6 min read",
    category: "Marketplace",
    tags: ["Marketplace", "Security"],
    content: [
      { type: "heading", text: "Trust by Design" },
      {
        type: "paragraph",
        text: "A healthy marketplace needs clear merchant information and accountable exchanges. Enhanced seller verification, reputation, fraud monitoring, and dispute workflows are planned; Pi sign-in alone does not guarantee seller reliability.",
      },
      { type: "heading", text: "Planned Transaction Protections" },
      {
        type: "paragraph",
        text: "Escrow-related protections remain planned capabilities. Any implementation must be consistent with the intended non-custodial marketplace model. A potential SMAJ token is deferred and is not part of the launch plan.",
      },
    ],
  },
  {
    slug: "connect-wallet-once-access-more-services",
    title: "Connect Your Wallet Once and Access Multiple Services Across the Hub",
    snippet: "A simple workflow to move from browsing to ordering, delivery, and support.",
    author: "Product Team",
    date: "2026-01-06",
    readTime: "5 min read",
    category: "Guides",
    tags: ["Guides", "Platform"],
    content: [
      { type: "heading", text: "Single Sign-In Experience" },
      {
        type: "paragraph",
        text: "Wallet-first onboarding creates one reliable account path across modules, reducing friction and repeated setup steps.",
      },
    ],
  },
];

export const featuredBlogPost = blogPosts.find(post => post.featured) ?? blogPosts[0];
