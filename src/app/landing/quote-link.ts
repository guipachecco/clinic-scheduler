export const WHATSAPP_NUMBER = "5547991037244";

// Opens the owner's WhatsApp with the message already typed.
export function whatsappUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

// The "Quero um orçamento" buttons.
export const QUOTE_URL = whatsappUrl(
  "Oi! Vi o site da Zemana e quero um orçamento para minha clínica.",
);

// The ad source (utm_source) cut to a short plain word, or null when absent.
export function cleanSource(raw: string | null): string | null {
  const s = raw
    ?.toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 30);
  return s || null;
}

// Appends "(vim pelo <source>)" to the typed message of a link to the owner's
// WhatsApp, so each lead says where it came from. Other links stay as they are.
export function withSource(href: string, source: string): string {
  const url = new URL(href);
  if (url.hostname !== "wa.me" || url.pathname !== `/${WHATSAPP_NUMBER}`) {
    return href;
  }
  const text = url.searchParams.get("text") ?? "";
  if (text.endsWith(")") && text.includes("(vim pelo ")) return href;
  return whatsappUrl(`${text} (vim pelo ${source})`);
}
