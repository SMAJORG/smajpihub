// Details and attendance links checked against each organizer's official website.
// Keep the dashboard artwork and original saved card content unchanged.
export const restoredEventDetails: Record<string, {
  text: string; dateLabel: string; location: string; endDate: string;
  websiteUrl: string; registrationUrl?: string; actionLabel?: string; badge: string;
}> = {
  "event-3": {
    text: "Pi Network's online developer summit features platform announcements, technical demonstrations, developer conversations and app showcases. Day 1 and Day 2 premiere at 16:00 UTC on Pi Network's official YouTube channel. November 19 features the Pi Next hackathon announcement. Recordings are available after each premiere; no ticket booking is required.",
    dateLabel: "17–19 November 2026 · Premieres on 17 and 18 November at 16:00 UTC",
    location: "Online · Pi Network official channels", endDate: "2026-11-19",
    websiteUrl: "https://minepi.com/ecosystem-summit/",
    registrationUrl: "https://minepi.com/ecosystem-summit/", actionLabel: "Watch on official website", badge: "Online",
  },
  "adb4eaf2-8d0a-4efc-af7b-3f0593b19da6": {
    text: "RX Global's World Future Energy Summit brings together the clean energy and sustainability community at ADNEC Centre Abu Dhabi. Complimentary visitor registration includes the exhibition and conferences. Opening hours (Abu Dhabi, UTC+4): 12 January 07:30–17:00; 13–14 January 09:00–17:00. Complete registration on the organizer's website to obtain your visitor badge.",
    dateLabel: "12–14 January 2027 · Abu Dhabi local time (UTC+4)",
    location: "ADNEC Centre Abu Dhabi, United Arab Emirates", endDate: "2027-01-14",
    websiteUrl: "https://www.worldfutureenergysummit.com/en-gb/visit.html",
    registrationUrl: "https://register.worldfutureenergysummit.com/reed_shop/WFE--27",
    actionLabel: "Book / Register free", badge: "Free visitor registration",
  },
  "b53ceeb1-27e3-4fd8-b275-7e54402dfb08": {
    text: "NODES 2026 was Neo4j's free, 24-hour online developer conference on 12 November 2026, covering AI engineering, data intelligence and modern applications. This event has ended. Visit Neo4j's official event website for the agenda and any available recordings or follow-up resources.",
    dateLabel: "12 November 2026 · 24-hour online conference",
    location: "Online · Neo4j", endDate: "2026-11-12",
    websiteUrl: "https://neo4j.com/nodes/", badge: "Ended · Free event",
  },
};
