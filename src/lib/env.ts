import * as z from "zod";

const PLACEHOLDER_SECRET = "troque-por-um-segredo-gerado";

export const serverEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z.url({
      protocol: /^postgres(ql)?$/,
      error: "deve ser uma URL postgres:// ou postgresql://",
    }),
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
  })
  .refine(
    (env) =>
      env.NODE_ENV !== "production" ||
      env.BETTER_AUTH_URL.startsWith("https://") ||
      isLocalhost(env.BETTER_AUTH_URL),
    {
      error: "deve usar https em produção",
      path: ["BETTER_AUTH_URL"],
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
