import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "@/lib/env";

// The one way the app sends e-mail. With RESEND_API_KEY (required on the real
// site, see src/lib/env.ts) the message goes out through Resend. Otherwise it
// is written as a JSON file to EMAIL_OUTBOX_DIR, where development and the
// tests read it. No import of "server-only": scripts/admin.ts loads this
// through src/lib/auth.ts.

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type OutboxMessage = EmailMessage & { sentAt: string };

const RESEND_URL = "https://api.resend.com/emails";

export async function sendEmail(message: EmailMessage): Promise<void> {
  if (env.RESEND_API_KEY) {
    await sendWithResend(env.RESEND_API_KEY, message);
    return;
  }
  await writeToOutbox(message);
}

async function sendWithResend(apiKey: string, message: EmailMessage) {
  const response = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });
  // Only the status: the response may echo the recipient.
  if (!response.ok) {
    throw new Error(`Falha ao enviar o e-mail (Resend ${response.status}).`);
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
