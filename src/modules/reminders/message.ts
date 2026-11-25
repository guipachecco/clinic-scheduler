import { DateTime } from "luxon";

// The pure part of the WhatsApp reminder: which appointments are due and the
// words of the message. The template approved at Meta (docs/lembrete-whatsapp.md)
// has five body variables, in this order:
//
//   Olá, {{1}}! Lembrete da {{2}}: seu horário é amanhã, {{3}}, às {{4}}
//   ({{5}}). Se não puder ir, avise a clínica com antecedência.

export type ReminderInput = {
  patientName: string;
  clinicName: string;
  serviceName: string;
  startsAt: Date;
  timezone: string;
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
  ];
}

// The message as the patient reads it (Z-API, outbox, tests). No "amanhã":
// the lead may be 3 h or 1 h.
// shortcut: the Meta template still says "amanhã"; submit a new one before
// going back to the Cloud API with leads under a day.
export function reminderText(params: string[]): string {
  const [name, clinic, day, time, service] = params;
  return (
    `Olá, ${name}! Lembrete da ${clinic}: seu horário é ${day}, ` +
    `às ${time} (${service}). Se não puder ir, avise a clínica com antecedência.`
  );
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
    // Set when the message goes out from another number (the automatic
    // reminder via Z-API): "avisar por aqui" would reach Zemana, so the
    // closing line links to the clinic's own WhatsApp instead.
    clinicPhone?: string | null;
  },
): string {
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
  if (input.clinicPhone === undefined) {
    lines.push("", "Se não puder vir, é só avisar por aqui. Até lá! 💜");
  } else {
    const contact = input.clinicPhone && whatsappNumber(input.clinicPhone);
    lines.push(
      "",
      contact
        ? `Se não puder vir, avise a ${input.clinicName.trim()} pelo WhatsApp: https://wa.me/${contact}`
        : "Se não puder vir, avise a clínica com antecedência.",
      "Até lá! 💜",
    );
  }
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
