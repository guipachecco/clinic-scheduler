import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { env, isLocalhost } from "@/lib/env";
import { redactText } from "@/lib/logger";

import { reminderText } from "./message";

// The one way the app sends WhatsApp. With WHATSAPP_TOKEN and
// WHATSAPP_PHONE_NUMBER_ID the message goes out through the WhatsApp Cloud API
// of Meta as the approved template; otherwise it is written as a JSON file to
// WHATSAPP_OUTBOX_DIR, where development and the tests read it. A message the
// business starts must be a template: free text is refused outside the 24h
// after the patient's last message.

export type WhatsAppTemplate = {
  // Digits only, with the country code: "5511987654321".
  to: string;
  params: string[];
};

export type WhatsAppOutboxMessage = WhatsAppTemplate & {
  template: string;
  text: string;
  sentAt: string;
};

type Fetch = typeof fetch;

// The checkbox shows only where a reminder can go out: the real site with the
// Meta keys, or a local run (the outbox).
export function whatsappRemindersAvailable(): boolean {
  return env.WHATSAPP_TOKEN !== undefined || isLocalhost(env.BETTER_AUTH_URL);
}

export function messagesUrl(): string {
  return `https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
}

export async function sendWhatsAppTemplate(
  message: WhatsAppTemplate,
  fetchImpl: Fetch = fetch,
): Promise<void> {
  if (env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) {
    await sendWithCloudApi(env.WHATSAPP_TOKEN, message, fetchImpl);
    return;
  }
  await writeToOutbox(message);
}

async function sendWithCloudApi(
  token: string,
  message: WhatsAppTemplate,
  fetchImpl: Fetch,
) {
  const response = await fetchImpl(messagesUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: message.to,
      type: "template",
      template: {
        name: env.WHATSAPP_TEMPLATE,
        language: { code: env.WHATSAPP_TEMPLATE_LANGUAGE },
        components: [
          {
            type: "body",
            parameters: message.params.map((text) => ({ type: "text", text })),
          },
        ],
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const reason = await refusalReason(response);
    throw new Error(
      `Falha ao enviar o WhatsApp (Meta ${response.status})` +
        (reason ? `: ${reason}` : "."),
    );
  }
}

// Meta's own words for a refusal (template not approved, number not on
// WhatsApp, token expired...), so the log says why. Phone numbers are taken
// out. Empty when the body is not Meta's JSON.
async function refusalReason(response: Response): Promise<string> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return "";
  }
  const error =
    body && typeof body === "object"
      ? (body as { error?: Record<string, unknown> }).error
      : undefined;
  if (!error || typeof error !== "object") return "";
  const parts = [error.code, error.message, error.error_user_msg]
    .filter((part) => typeof part === "string" || typeof part === "number")
    .map(String);
  return redactText(parts.join(" | ")).slice(0, 500);
}

async function writeToOutbox(message: WhatsAppTemplate) {
  const dir = env.WHATSAPP_OUTBOX_DIR;
  await mkdir(dir, { recursive: true });
  const sentAt = new Date().toISOString();
  const entry: WhatsAppOutboxMessage = {
    ...message,
    template: env.WHATSAPP_TEMPLATE,
    text: reminderText(message.params),
    sentAt,
  };
  // Time first so the names sort in sending order.
  const name = `${sentAt.replaceAll(":", "-")}-${randomUUID()}.json`;
  await writeFile(path.join(dir, name), JSON.stringify(entry, null, 2));
}

// Messages written to the outbox, oldest first. Empty when the folder does
// not exist yet.
export async function readWhatsAppOutbox(
  dir: string = env.WHATSAPP_OUTBOX_DIR,
): Promise<WhatsAppOutboxMessage[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const entries = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map(
        async (name) =>
          JSON.parse(
            await readFile(path.join(dir, name), "utf8"),
          ) as WhatsAppOutboxMessage,
      ),
  );
  return entries;
}
