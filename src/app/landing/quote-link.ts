const WHATSAPP_NUMBER = "5547991037244";

// Opens the owner's WhatsApp with the message already typed.
export function whatsappUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

// The "Quero um orçamento" buttons.
export const QUOTE_URL = whatsappUrl(
  "Oi! Vi o site da Zemana e quero um orçamento para minha clínica.",
);
