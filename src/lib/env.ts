import * as z from "zod";

import { parseSender } from "@/modules/email/sender";

const PLACEHOLDER_SECRET = "troque-por-um-segredo-gerado";

function postgresUrl() {
  return z.url({
    protocol: /^postgres(ql)?$/,
    error: "deve ser uma URL postgres:// ou postgresql://",
  });
}

// An empty value (KEY= in .env) counts as unset.
function optionalText() {
  return z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined);
}

export const serverEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    // One login per PostgreSQL role (see src/db/roles.ts). The owner
    // DATABASE_URL is deliberately left out: the app never connects as the
    // owner; only migrations, scripts and tests do (src/db/owner.ts).
    DATABASE_URL_AUTH: postgresUrl(),
    DATABASE_URL_PANEL: postgresUrl(),
    DATABASE_URL_CLIENT: postgresUrl(),
    DATABASE_URL_PLATFORM: postgresUrl(),
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "deve ter pelo menos 32 caracteres")
      .refine((value) => !value.includes(PLACEHOLDER_SECRET), {
        error: "ainda está com o valor de exemplo",
      }),
    BETTER_AUTH_URL: z.url({
      protocol: /^https?$/,
      error: "deve ser a URL pública do site, como https://exemplo.com.br",
    }),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    // E-mail (src/modules/email/send.ts). With MAILERSEND_API_KEY, messages go
    // out through MailerSend from EMAIL_FROM; without it, they are written as
    // JSON files to EMAIL_OUTBOX_DIR and nothing leaves the machine.
    MAILERSEND_API_KEY: optionalText(),
    EMAIL_FROM: optionalText().refine(
      (value) => value === undefined || parseSender(value) !== null,
      {
        error:
          'deve ser um remetente, como "Zemana <nao-responda@seudominio.com.br>"',
      },
    ),
    EMAIL_OUTBOX_DIR: optionalText().transform((value) => value ?? ".emails"),
    // Mercado Pago (docs/mercado-pago.md). The application of the Zemana at
    // Mercado Pago: clinics connect their own accounts to it by OAuth.
    // Without MP_CLIENT_ID the panel hides "Conectar Mercado Pago".
    MP_CLIENT_ID: optionalText(),
    MP_CLIENT_SECRET: optionalText(),
    // Signs the notifications (Webhooks > Configurar notificações, in the
    // application). Without it, every notification is refused.
    MP_WEBHOOK_SECRET: optionalText(),
  })
  .refine(
    (env) =>
      (env.MP_CLIENT_ID === undefined) === (env.MP_CLIENT_SECRET === undefined),
    {
      error: "defina MP_CLIENT_ID e MP_CLIENT_SECRET juntas",
      path: ["MP_CLIENT_SECRET"],
    },
  )
  .refine(
    (env) =>
      env.NODE_ENV !== "production" ||
      env.BETTER_AUTH_URL.startsWith("https://") ||
      isLocalhost(env.BETTER_AUTH_URL),
    {
      error: "deve usar https em produção",
      path: ["BETTER_AUTH_URL"],
    },
  )
  // A real site must send its e-mails. A production build on localhost (the
  // end-to-end tests) may keep them in the outbox.
  .refine(
    (env) =>
      env.NODE_ENV !== "production" ||
      isLocalhost(env.BETTER_AUTH_URL) ||
      env.MAILERSEND_API_KEY !== undefined,
    { error: "obrigatória em produção", path: ["MAILERSEND_API_KEY"] },
  )
  .refine(
    (env) =>
      env.MAILERSEND_API_KEY === undefined || env.EMAIL_FROM !== undefined,
    {
      error: "obrigatória quando MAILERSEND_API_KEY está definida",
      path: ["EMAIL_FROM"],
    },
  );

export type ServerEnv = z.infer<typeof serverEnvSchema>;

function isLocalhost(url: string) {
  const { hostname } = new URL(url);
  return hostname === "localhost" || hostname === "127.0.0.1";
}

// Never include the values in the error: they may be secrets.
export function parseServerEnv(
  source: Record<string, string | undefined>,
): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => {
        const message =
          issue.code === "invalid_type" ? "não definida" : issue.message;
        return `- ${issue.path.join(".")}: ${message}`;
      })
      .join("\n");
    throw new Error(
      `Variáveis de ambiente inválidas ou ausentes:\n${problems}\nVeja o .env.example e a seção "Configuração" do README.`,
    );
  }
  return result.data;
}

export const env = parseServerEnv(process.env);
