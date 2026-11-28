import { DateTime } from "luxon";

// The pure part of the WhatsApp reminder: which appointments are due and the
// words of the message. The template approved at Meta (lembrete_horario_v2)
// has an image header, six body variables and a "Ver endereço no mapa" button
// (https://zemana.com.br/{{1}}, the clinic's slug):
//
//   Olá, {{1}}.
//   Este é um lembrete do seu horário na {{2}}:
//   Data: {{3}} / Horário: {{4}} / Serviço: {{5}} / Endereço: {{6}}
//   Caso não possa comparecer, pedimos que avise a clínica com antecedência.

export type ReminderInput = {
  patientName: string;
  clinicName: string;
  serviceName: string;
  startsAt: Date;
  timezone: string;
  address?: string | null;
};

// Meta refuses a variable with a line break, a tab or more than four spaces in
// a row, and an empty one. Long names are cut.
export function templateText(value: string, max = 60): string {
  const text = value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
  const cut = text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
  return cut || "-";
}

// Only the first name: friendlier, and less of her data in the message.
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

export function reminderParams(input: ReminderInput): string[] {
  const start = DateTime.fromJSDate(input.startsAt, {
    zone: input.timezone,
  }).setLocale("pt-BR");
  return [
    templateText(firstName(input.patientName), 40),
    templateText(input.clinicName),
    // "quinta-feira, 19/11"
    templateText(start.toFormat("cccc, dd/LL")),
    templateText(start.toFormat("HH:mm")),
    templateText(input.serviceName),
    templateText(input.address ?? "", 120),
  ];
}

// The template's body as the patient reads it (message log, outbox, tests).
export function reminderText(params: string[]): string {
  const [name, clinic, day, time, service, address] = params;
  return [
    `Olá, ${name}.`,
    "",
    `Este é um lembrete do seu horário na ${clinic}:`,
    "",
    `Data: ${day}`,
    `Horário: ${time}`,
    `Serviço: ${service}`,
    `Endereço: ${address}`,
    "",
    "Caso não possa comparecer, pedimos que avise a clínica com antecedência.",
  ].join("\n");
}

// "+5511987654321" -> "5511987654321", the form the Cloud API takes. Null when
// it is not E.164 (patients_phone_check keeps that from happening).
export function whatsappNumber(phone: string): string | null {
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone.slice(1) : null;
}

// The clinic's own map link, else a Google Maps search of its address (the
// same rule as the clinic page). Null without either.
export function clinicMapsLink(
  address: string | null,
  mapsUrl: string | null,
): string | null {
  if (mapsUrl?.trim()) return mapsUrl.trim();
  if (address?.trim()) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
  }
  return null;
}

// "hoje, quarta-feira (18/11)", "amanhã, …" or "do dia 20/11 (sexta-feira)"
// in the clinic's zone.
function whenLabel(input: { startsAt: Date; timezone: string; now: Date }) {
  const zone = input.timezone;
  const start = DateTime.fromJSDate(input.startsAt, { zone }).setLocale(
    "pt-BR",
  );
  const today = DateTime.fromJSDate(input.now, { zone }).startOf("day");
  const days = Math.round(start.startOf("day").diff(today, "days").days);
  const date = `${start.toFormat("cccc")} (${start.toFormat("dd/LL")})`;
  const when =
    days === 0
      ? `hoje, ${date}`
      : days === 1
        ? `amanhã, ${date}`
        : `do dia ${start.toFormat("dd/LL")} (${start.toFormat("cccc")})`;
  return { start, when };
}

// The reminder the clinic sends by hand from its own WhatsApp (the "Avisar
// pelo WhatsApp" queue of the agenda). Free text, unlike the template of the
// automatic reminder: a warmer note with the address and the map link, and
// "hoje", "amanhã" or the date, since the owner may pick any day. It goes
// out from the clinic's number, so "avisar por aqui" reaches the clinic.
export function manualReminderText(
  input: ReminderInput & {
    now: Date;
    address?: string | null;
    mapsUrl?: string | null;
  },
): string {
  const { start, when } = whenLabel(input);
  const name = firstName(input.patientName);
  const address = input.address?.trim() || null;
  const map = clinicMapsLink(address, input.mapsUrl ?? null);
  const lines = [
    `Olá${name ? `, ${name}` : ""}! 😊`,
    `Passando aqui para lembrar do seu horário ${when}, às ` +
      `${start.toFormat("HH:mm")} — ${input.serviceName.trim()}, na ` +
      `${input.clinicName.trim()}.`,
  ];
  if (address || map) {
    lines.push("");
    if (address) lines.push(`📍 ${address}`);
    if (map) lines.push(`🗺️ Como chegar: ${map}`);
  }
  lines.push("", "Se não puder vir, é só avisar por aqui. Até lá! 💜");
  return lines.join("\n");
}

// A link that opens the conversation with the text ready to send. It goes
// straight to api.whatsapp.com: wa.me redirects there and, on the way, turns
// emoji into "�". Null when the phone is not E.164.
export function whatsappLink(phone: string, text: string): string | null {
  const number = whatsappNumber(phone);
  return number
    ? `https://api.whatsapp.com/send?phone=${number}&text=${encodeURIComponent(text)}`
    : null;
}

// ---- Automatic reminder from Zemana's number (migration 0043) ----
// The patient writes first (her activation code); her "1" or "2" afterwards
// is recorded and answered with the clinic's contact.

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newOptInCode(random: () => number = Math.random): string {
  return Array.from(
    { length: 6 },
    () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)],
  ).join("");
}

// The activation code inside her message ("… Código: K7P2Q9"), if any.
export function optInCodeFrom(text: string): string | null {
  const match = /c[óo]digo:?\s*([A-Z0-9]{6})\b/i.exec(text);
  return match ? match[1]!.toUpperCase() : null;
}

// "1" confirms, "2" she cannot come. A short answer only: a "1" inside a
// longer message is not a choice.
export function replyChoice(text: string): "confirmed" | "declined" | null {
  const answer = text.trim().replace(/[.!*]/g, "").toLowerCase();
  if (["1", "sim", "confirmo", "confirmado"].includes(answer)) {
    return "confirmed";
  }
  if (["2", "não", "nao"].includes(answer)) return "declined";
  return null;
}

// Reminders allowed today: 10 on the first day, 5 more each day, up to 150.
export function warmUpLimit(daysSinceFirst: number): number {
  return Math.min(150, 10 + 5 * Math.max(0, daysSinceFirst));
}

// The text she sends to activate, ready in the WhatsApp link.
export function optInMessage(clinicName: string, code: string): string {
  return `Oi! Quero receber os lembretes da ${clinicName.trim()} ✅ Código: ${code}`;
}

export function optInAckText(clinicName: string): string {
  return [
    `Pronto! ✅ Você vai receber aqui os lembretes da ${clinicName.trim()}.`,
    "",
    "Salve este número como *Lembretes Zemana* para não perder nenhum. 💜",
  ].join("\n");
}

type ClinicContact = {
  clinicName: string;
  address: string | null;
  mapsUrl: string | null;
  clinicPhone: string | null;
};

function contactLink(phone: string | null): string | null {
  const number = phone ? whatsappNumber(phone) : null;
  return number ? `https://wa.me/${number}` : null;
}

// After her "1": now the address, the map and the clinic's own WhatsApp.
export function confirmedText(input: ClinicContact): string {
  const address = input.address?.trim() || null;
  const map = clinicMapsLink(address, input.mapsUrl);
  const contact = contactLink(input.clinicPhone);
  const lines = ["Perfeito, confirmado! ✅ Te esperamos."];
  if (address || map) {
    lines.push("");
    if (address) lines.push(`📍 ${address}`);
    if (map) lines.push(`🗺️ Como chegar: ${map}`);
  }
  if (contact) {
    lines.push(
      "",
      `Qualquer coisa, fale com a ${input.clinicName.trim()}: ${contact}`,
    );
  }
  return lines.join("\n");
}

// After her "2": the owner sees it in the panel; she gets the clinic's contact.
export function declinedText(input: ClinicContact): string {
  const contact = contactLink(input.clinicPhone);
  return [
    `Tudo bem, já avisei a ${input.clinicName.trim()}. 💜`,
    contact
      ? `Para remarcar, fale com ela: ${contact}`
      : "Para remarcar, entre em contato com a clínica.",
  ].join("\n");
}
