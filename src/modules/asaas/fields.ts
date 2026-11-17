import * as z from "zod";

// Form of the "Receber sinal por Pix" connection: the owner pastes the API key
// of her own Asaas account. Imported by client components: no database, no
// server-only code.

export const connectSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(1, "Cole a chave de API do Asaas.")
    .max(500, "Texto longo demais."),
});

export type ConnectInput = z.input<typeof connectSchema>;
export type ConnectValues = z.output<typeof connectSchema>;
