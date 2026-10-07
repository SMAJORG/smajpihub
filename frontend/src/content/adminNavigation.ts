export type AdminNavItem = { label: string; to?: string };
export type AdminNavGroup = { number: number; label: string; icon: "overview" | "users" | "payments" | "platform" | "safety" | "system"; items: AdminNavItem[] };
const items = (labels: string[], routes: Record<string, string> = {}): AdminNavItem[] => labels.map((label) => ({ label, to: routes[label] }));

const configuredAdminNavigation: AdminNavGroup[] = [
  { number: 1, label: "Overview", icon: "overview", items: items(["Dashboard", "Live Activity", "Platform Health", "Pending Actions", "Global Analytics"], { Dashboard: "/admin", "Global Analytics": "/admin/reports" }) },
  { number: 2, label: "Users & Identity", icon: "users", items: items(["All Users", "Pi Accounts", "Basic Users", "Verified Users", "Trusted Sellers / Providers", "KYB Applications", "Suspended Users", "User Reports", "Verification Logs"], { "All Users": "/admin/users", "KYB Applications": "/admin/onboarding", "User Reports": "/admin/reports" }) },
  { number: 3, label: "Pi Payments", icon: "payments", items: items(["Dashboard", "All Transactions", "Pending Payments", "Completed Payments", "Failed Payments", "Payment Confirmations", "Refund / Reversal Cases", "Service Transactions", "Blockchain Logs"], { Dashboard: "/admin/orders", "All Transactions": "/admin/orders", "Pending Payments": "/admin/orders", "Completed Payments": "/admin/orders", "Failed Payments": "/admin/orders" }) },
  { number: 4, label: "SMAJ AI Assistant", icon: "platform", items: items(["Usage Dashboard", "Conversations", "Recommendations", "Search Activity", "Service Navigation", "Reports", "Safety Controls", "AI Configuration"]) },
  { number: 5, label: "SMAJ Store", icon: "platform", items: items(["Dashboard", "Products", "Pending Products", "Sellers", "Vendor Verification", "Orders", "Payments", "Categories", "Reviews & Ratings", "Buyer/Seller Chat", "Disputes", "Reports"], { Dashboard: "/admin/products", Products: "/admin/products", "Pending Products": "/admin/products", Orders: "/admin/orders", Payments: "/admin/orders", Reports: "/admin/reports" }) },
  { number: 6, label: "SMAJ Pi Stream", icon: "platform", items: items(["Dashboard", "Movies", "Series", "Documentaries", "Episodes", "Categories", "Media Library", "Uploads", "Storage", "View Analytics", "Reports", "Moderation"], { Dashboard: "/admin/stream", Movies: "/admin/stream/catalog", Series: "/admin/stream/catalog", Documentaries: "/admin/stream/catalog", "Media Library": "/admin/stream/catalog", "View Analytics": "/admin/stream/analytics", Reports: "/admin/stream/moderation", Moderation: "/admin/stream/moderation" }) },
  { number: 7, label: "SMAJ Pi Sports", icon: "platform", items: items(["Dashboard", "Live Sports", "Matches", "Scores", "Teams", "Competitions", "Sports News", "Broadcasts", "Community", "Reports"]) },
  { number: 8, label: "SMAJ Food Delivery", icon: "platform", items: items(["Dashboard", "Restaurants", "Restaurant Verification", "Menus", "Orders", "Customers", "Drivers / Riders", "Deliveries", "Tracking", "Payments", "Loyalty / Rewards", "Disputes"]) },
  { number: 9, label: "SMAJ Pi Jobs", icon: "platform", items: items(["Dashboard", "Jobs", "Freelance Jobs", "Job Seekers", "Employers", "Professional Profiles", "Applications", "Contracts", "Milestones", "Payments", "Reviews", "Disputes", "Reports"], { Dashboard: "/admin/jobs", Jobs: "/admin/jobs", "Freelance Jobs": "/admin/jobs", "Job Seekers": "/admin/jobs", Employers: "/admin/jobs", "Professional Profiles": "/admin/jobs", Applications: "/admin/jobs", Reports: "/admin/jobs" }) },
  { number: 10, label: "SMAJ Pi Health", icon: "platform", items: items(["Dashboard", "Healthcare Providers", "Provider Verification", "Patients", "Consultations", "Appointments", "Health Records", "Payments", "Reports", "Compliance"]) },
  { number: 11, label: "SMAJ Pi Edu", icon: "platform", items: items(["Dashboard", "Courses", "Students", "Instructors", "Universities", "Institutions", "Institution Applications", "Programs", "Partner Verification", "Enrollments", "Learning Paths", "Certificates", "Payments", "Reviews", "Reports"], { "Universities": "/admin/universities", "Institutions": "/admin/education/institutions", "Institution Applications": "/admin/education/institutions", "Programs": "/admin/education/institutions", "Courses": "/admin/courses", "Enrollments": "/admin/education/institutions", "Certificates": "/admin/education/institutions", "Payments": "/admin/education/institutions", "Partner Verification": "/admin/education/teachers" }) },
  { number: 12, label: "SMAJ Pi Transport", icon: "platform", items: items(["Dashboard", "Drivers", "Driver Verification", "Vehicles", "Ride Requests", "Deliveries", "Car Rentals", "Routes", "Tracking", "Payments", "Ratings", "Reports"]) },
  { number: 13, label: "SMAJ Pi Agro", icon: "platform", items: items(["Dashboard", "Farmers", "Buyers", "Suppliers", "Products", "Orders", "Markets", "Pricing", "Payments", "Verification", "Disputes"]) },
  { number: 14, label: "SMAJ Pi Energy", icon: "platform", items: items(["Dashboard", "Utility Providers", "Electricity", "Water", "Gas", "Bills", "Payments", "Usage Tracking", "Transactions", "Reports"]) },
  { number: 15, label: "SMAJ Pi Charity", icon: "platform", items: items(["Dashboard", "NGOs", "NGO Verification", "Campaigns", "Donations", "Donors", "Impact Reports", "Payments", "Reports"]) },
  { number: 16, label: "SMAJ Pi Housing", icon: "platform", items: items(["Dashboard", "Properties", "Property Owners", "Agents", "Provider Verification", "Rentals", "Property Sales", "Applications", "Payments", "Reports", "Disputes"]) },
  { number: 17, label: "SMAJ Pi Events", icon: "platform", items: items(["Dashboard", "Events", "Organizers", "Organizer Verification", "Tickets", "Ticket Sales", "Attendees", "Payments", "Ticket Validation", "Reports"]) },
  { number: 18, label: "SMAJ Pi Swap", icon: "platform", items: items(["Dashboard", "Listings", "Sellers", "Buyers", "Exchanges", "Categories", "Payments", "Reviews", "Reports", "Disputes"]) },
  { number: 19, label: "SMAJ Token", icon: "platform", items: items(["Dashboard", "Token Holders", "Rewards", "Loyalty", "Cashback", "Staking", "Governance", "Voting", "Fee Discounts", "Token Activity"]) },
  { number: 20, label: "Trust & Safety", icon: "safety", items: items(["Moderation Queue", "Fraud Alerts", "User Reports", "Seller Reports", "Provider Reports", "Content Reports", "Open Disputes", "Suspensions", "Bans", "Investigation History"], { "Moderation Queue": "/admin/reports", "User Reports": "/admin/reports", "Content Reports": "/admin/reports", "Open Disputes": "/admin/reports" }) },
  { number: 21, label: "Communications", icon: "system", items: items(["Notifications", "Announcements", "Messages", "Email", "Push Notifications", "Notification Templates"]) },
  { number: 22, label: "Content & CMS", icon: "system", items: items(["News", "Homepage", "Service Pages", "Banners", "FAQ", "White Paper", "Legal Pages", "Media Library"], { Banners: "/admin/heroes" }) },
  { number: 23, label: "Partners", icon: "users", items: items(["All Partners", "Applications", "Approved Partners", "Businesses", "NGOs", "Universities", "Healthcare Providers", "Restaurants"], { Applications: "/admin/ambassadors" }) },
  { number: 24, label: "Developers & API", icon: "system", items: items(["API Dashboard", "Developers", "Applications", "API Keys", "API Usage", "Webhooks", "Integration Logs", "Documentation"]) },
  { number: 25, label: "Analytics", icon: "overview", items: items(["Platform Analytics", "User Growth", "Active Users", "Countries", "Services Usage", "Pi Transaction Volume", "Conversion", "Revenue / Fees", "Growth Reports"], { "Platform Analytics": "/admin/reports" }) },
  { number: 26, label: "System", icon: "system", items: items(["Admin Team", "Roles & Permissions", "Audit Logs", "Pi Network Integration", "Payment Configuration", "Verification Settings", "AI Settings", "API Settings", "Storage", "Security", "System Health", "Feature Flags", "Localization", "General Settings"], { "General Settings": "/admin/settings" }) },
];

const routeSlug = (value: string) => value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const adminNavigation: AdminNavGroup[] = configuredAdminNavigation.map((group) => ({
  ...group,
  items: group.items.map((item) => ({
    ...item,
    to: item.to || "/admin/modules/" + String(group.number).padStart(2, "0") + "-" + routeSlug(group.label) + "/" + routeSlug(item.label),
  })),
}));

export const searchableAdminNavigation = adminNavigation.flatMap((group) => group.items.filter((item) => item.to).map((item) => ({ ...item, to: item.to!, group: group.label, icon: group.icon })));
