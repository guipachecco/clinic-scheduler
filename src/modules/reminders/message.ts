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

// The whole of "tomorrow" in the clinic's zone: [from, to).
export function tomorrowRange(
  now: Date,
  timezone: string,
): { from: Date; to: Date } {
  const start = DateTime.fromJSDate(now, { zone: timezone })
    .startOf("day")
    .plus({ days: 1 });
  return {
    from: start.toJSDate(),
    to: start.plus({ days: 1 }).toJSDate(),
  };
}

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

// The message as the patient reads it, for the outbox and the tests.
export function reminderText(params: string[]): string {
  const [name, clinic, day, time, service] = params;
  return (
    `Olá, ${name}! Lembrete da ${clinic}: seu horário é amanhã, ${day}, ` +
    `às ${time} (${service}). Se não puder ir, avise a clínica com antecedência.`
  );
}

// "+5511987654321" -> "5511987654321", the form the Cloud API takes. Null when
// it is not E.164 (patients_phone_check keeps that from happening).
export function whatsappNumber(phone: string): string | null {
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone.slice(1) : null;
}

// The reminder the clinic sends by hand from its own WhatsApp (the "Avisar
// pelo WhatsApp" queue of the agenda): the same words as the template, with
// "hoje", "amanhã" or the date, since the owner may pick any day.
export function manualReminderText(
  input: ReminderInput & { now: Date },
): string {
  const zone = input.timezone;
  const start = DateTime.fromJSDate(input.startsAt, { zone }).setLocale(
    "pt-BR",
  );
  const today = DateTime.fromJSDate(input.now, { zone }).startOf("day");
  const days = Math.round(start.startOf("day").diff(today, "days").days);
  const when =
    days === 0
      ? "hoje"
      : days === 1
        ? "amanhã"
        : `no dia ${start.toFormat("dd/LL")}`;
  const name = firstName(input.patientName);
  return (
    `Olá${name ? `, ${name}` : ""}! Lembrete da ${input.clinicName.trim()}: ` +
    `seu horário é ${when}, ${start.toFormat("cccc")}, às ` +
    `${start.toFormat("HH:mm")} (${input.serviceName.trim()}). Se não ` +
    `puder ir, avise a clínica com antecedência.`
  );
}

// A wa.me link that opens the conversation with the text ready to send.
// Null when the phone is not E.164.
export function whatsappLink(phone: string, text: string): string | null {
  const number = whatsappNumber(phone);
  return number
    ? `https://wa.me/${number}?text=${encodeURIComponent(text)}`
    : null;
}
