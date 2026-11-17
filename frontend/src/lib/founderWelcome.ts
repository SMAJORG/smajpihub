type WelcomeConversation = {
  participantId?: string;
};

type WelcomeMessage = {
  senderId: string;
  welcomeAccountId?: string;
  welcomeVersion?: number;
  message: string;
};

const standaloneUrl = /^https?:\/\/\S+$/iu;
const sectionHeadingLine = /^(?:(?:our\s+)?live\s+services?|current\s+services?|available\s+services?|upcoming\s+services?|coming\s+soon|(?:official\s+)?social(?:\s+media)?\s+links?|stay\s+connected|(?:a\s+message\s+from\s+the\s+)?(?:founder\s*(?:&|and)\s*CEO|CEO)(?:\s+message|\s+note)?|现有服务|目前服务|即将推出的服务|官方社交链接|الخدمات الحالية|الخدمات القادمة|الخدمات المتاحة|روابط التواصل الرسمية|servicios disponibles|próximos servicios|serviços disponíveis|próximos serviços|services disponibles|services à venir|huduma zinazopatikana|huduma zijazo|उपलब्ध सेवाएँ|आगामी सेवाएँ|mevcut hizmetler|yaklaşan hizmetler)\s*[:：]?$/iu;
const sectionType = (line: string) => {
  if (/\b(?:our\s+)?live\s+services?\b|\bcoming\s+soon\b|\bupcoming\s+services?\b|现有服务|目前服务|即将推出的服务|الخدمات الحالية|الخدمات القادمة|الخدمات المتاحة|servicios disponibles|serviços disponíveis|services disponibles|services à venir|huduma zinazopatikana|huduma zijazo|उपलब्ध सेवाएँ|आगामी सेवाएँ|mevcut hizmetler|yaklaşan hizmetler/iu.test(line)) return "services";
  if (/\b(?:social(?:\s+media)?\s+links?|stay\s+connected)\b|官方社交链接|روابط التواصل الرسمية/iu.test(line)) return "other";
  if (/\b(?:founder\s*(?:&|and)\s*CEO|CEO)\b/iu.test(line)) return "other";
  return "";
};
export const isFounderWelcomeSectionHeading = (line: string) =>
  sectionHeadingLine.test(line.trim());

export function isFounderWelcomeMessage(
  conversation: WelcomeConversation,
  message: WelcomeMessage,
  currentUserId: string,
): boolean {
  return Boolean(
    message.welcomeAccountId &&
    typeof message.welcomeVersion === "number" &&
    conversation.participantId &&
    message.senderId === conversation.participantId &&
    message.senderId !== currentUserId,
  );
}

export function formatFounderWelcomeMessage(message: string): string {
  let formatted = message.replace(/\r\n?/g, "\n").trim().split("\n").flatMap((line) => {
    const trimmed = line.trim();
    const comingSoon = trimmed.match(/^coming\s+soon\s*[:：]\s*(.+)$/iu);
    if (comingSoon) return ["", "Coming Soon:", comingSoon[1].trim(), ""];
    if (sectionHeadingLine.test(trimmed)) return ["", trimmed, ""];
    return [line];
  }).join("\n").trim();
  formatted = formatted
    .replace(/[ \t]*(https?:\/\/[^\s<>"'`\\\u0000-\u001f\u007f]+)[ \t]*/giu, (match) => `\n${match.trim()}\n`)
    .replace(/\band\s*\n(?=https?:\/\/)/giu, "and ")
    .replace(/\n{2,}(?=https?:\/\/)/giu, "\n")
    .replace(/(https?:\/\/[^\n]+)\n{2,}/giu, "$1\n")
    .replace(/;\s*/gu, "\n")
    .replace(/([.!?。！？])\s+(?=[\p{L}\d])/gu, "$1\n\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();

  let inServices = false;
  const lines = formatted.split("\n").flatMap((line) => {
    if (!line.trim()) return [line];
    const type = sectionType(line);
    if (type) {
      inServices = type === "services";
      return [line.trim()];
    }
    if (!inServices || standaloneUrl.test(line.trim())) return [line.trimEnd()];
    return line.split(/[•▪◦,]/u)
      .map((item) => item.replace(/^[•▪◦-]\s*/u, "").trim())
      .filter(Boolean)
      .map((item) => `• ${item}`);
  });
  return lines.join("\n").replace(/\n{3,}/gu, "\n\n").trim();
}

export async function translateFounderWelcomeMessage(
  message: string,
  target: string,
  translateLines: (lines: string[], target: string) => Promise<string[]>,
): Promise<string> {
  const lines = formatFounderWelcomeMessage(message).split("\n");
  const textIndexes: number[] = [];
  const textLines: string[] = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || standaloneUrl.test(trimmed)) return;
    if (/^(?:[•▪◦-]\s*)?SMAJ(?:\s+PI)?\s+[\p{L}\p{N} &'’.-]+$/iu.test(trimmed)) return;
    textIndexes.push(index);
    textLines.push(line);
  });
  if (!textLines.length) return lines.join("\n");
  const translated = await translateLines(textLines, target);
  if (translated.length !== textLines.length || translated.some((line, index) =>
    typeof line !== "string" || !line.trim() || line.trim() === textLines[index].trim())) {
    throw new Error("welcome_translation_invalid_response");
  }
  textIndexes.forEach((index, translatedIndex) => { lines[index] = translated[translatedIndex]; });
  return lines.join("\n");
}
