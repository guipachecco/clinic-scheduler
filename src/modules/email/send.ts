import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "@/lib/env";

import { parseSender } from "./sender";

// The one way the app sends e-mail. With MAILERSEND_API_KEY (required on the
// real site, see src/lib/env.ts) the message goes out through MailerSend.
// Otherwise it is written as a JSON file to EMAIL_OUTBOX_DIR, where
// development and the tests read it. No import of "server-only":
// scripts/admin.ts loads this through src/lib/auth.ts.

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type OutboxMessage = EmailMessage & { sentAt: string };

export const MAILERSEND_URL = "https://api.mailersend.com/v1/email";

export async function sendEmail(message: EmailMessage): Promise<void> {
  if (env.MAILERSEND_API_KEY) {
    await sendWithMailerSend(env.MAILERSEND_API_KEY, message);
    return;
  }
  await writeToOutbox(message);
}

async function sendWithMailerSend(apiKey: string, message: EmailMessage) {
  // env.ts requires a valid EMAIL_FROM whenever there is a key.
  const from = parseSender(env.EMAIL_FROM ?? "");
  if (!from) throw new Error("EMAIL_FROM inválido.");
  const response = await fetch(MAILERSEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [{ email: message.to }],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });
  // Only the status: the response may echo the recipient.
  if (!response.ok) {
    throw new Error(
      `Falha ao enviar o e-mail (MailerSend ${response.status}).`,
    );
  }
}

async function writeToOutbox(message: EmailMessage) {
  const dir = env.EMAIL_OUTBOX_DIR;
  await mkdir(dir, { recursive: true });
  const sentAt = new Date().toISOString();
  const entry: OutboxMessage = { ...message, sentAt };
  // Time first so the names sort in sending order.
  const name = `${sentAt.replaceAll(":", "-")}-${randomUUID()}.json`;
  await writeFile(path.join(dir, name), JSON.stringify(entry, null, 2));
}

// Messages written to the outbox, oldest first. Empty when the folder does
// not exist yet.
export async function readOutbox(
  dir: string = env.EMAIL_OUTBOX_DIR,
): Promise<OutboxMessage[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const messages = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(async (name) => {
        const entry = JSON.parse(
          await readFile(path.join(dir, name), "utf8"),
        ) as OutboxMessage;
        return { name, entry };
      }),
  );
  return messages
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ entry }) => ({
      to: entry.to,
      subject: entry.subject,
      text: entry.text,
      html: entry.html,
      sentAt: entry.sentAt,
    }));
}
