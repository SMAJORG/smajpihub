export type CommunityShareTarget = {
  name: "WhatsApp" | "Telegram" | "X" | "Email";
  className: "whatsapp" | "telegram" | "x" | "email";
  href: string;
};

export const createCommunityShareTargets = (url: string, title: string, text: string): CommunityShareTarget[] => {
  const body = [text.trim(), url].filter(Boolean).join("\n\n");
  const shareText = text.trim() || title;
  return [
    { name: "WhatsApp", className: "whatsapp", href: `https://wa.me/?text=${encodeURIComponent(body)}` },
    { name: "Telegram", className: "telegram", href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareText)}` },
    { name: "X", className: "x", href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}` },
    { name: "Email", className: "email", href: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}` },
  ];
};
