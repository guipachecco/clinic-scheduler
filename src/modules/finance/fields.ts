import * as z from "zod";

import { parsePriceToCents } from "@/modules/services/fields";

// Client-safe schemas for the financial forms. The server parses the raw
// input again with the same schemas. Money arrives as text ("1.250,00") and
// leaves as integer cents.

export const PAYMENT_PLAN_LABELS = {
  upfront: "À vista",
  installments: "Parcelado",
  per_session: "Por sessão",
} as const;
export type PaymentPlanValue = keyof typeof PAYMENT_PLAN_LABELS;

export const QUOTE_STATUS_LABELS = {
  draft: "Rascunho",
  sent: "Enviado",
  approved: "Aprovado",
  rejected: "Recusado",
  cancelled: "Cancelado",
} as const;

export const DEFAULT_QUOTE_VALIDITY_DAYS = 15;
export const MAX_INSTALLMENTS = 48;
export const MAX_SESSIONS = 200;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const isRealDate = (value: string) => {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};

export const dateField = (message = "Informe uma data válida.") =>
  z.string().trim().refine(isRealDate, message);

// Required money, in cents. `allowZero` for prices; amounts paid are > 0.
export const moneyField = (options: { allowZero?: boolean } = {}) =>
  z
    .string()
    .trim()
    .transform((value, ctx) => {
      const cents = parsePriceToCents(value);
      if (cents === null) {
        ctx.addIssue({ code: "custom", message: "Informe um valor válido." });
        return z.NEVER;
      }
      if (!options.allowZero && cents === 0) {
        ctx.addIssue({
          code: "custom",
          message: "O valor precisa ser maior que zero.",
        });
        return z.NEVER;
      }
      return cents;
    });

// Optional money: empty means zero (discounts).
const optionalMoney = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return 0;
    const cents = parsePriceToCents(value);
    if (cents === null) {
      ctx.addIssue({ code: "custom", message: "Informe um valor válido." });
      return z.NEVER;
    }
    return cents;
  });

const intField = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, `Informe ${label}.`)
    .transform(Number)
    .refine(
      (n) => n >= min && n <= max,
      `${label[0]!.toUpperCase()}${label.slice(1)} deve ficar entre ${min} e ${max}.`,
    );

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .transform((value) => (value === "" ? null : value));

export const quoteItemSchema = z.object({
  serviceId: z.uuid({ error: "Escolha o serviço." }),
  sessions: intField(1, MAX_SESSIONS, "a quantidade de sessões"),
  unitPrice: moneyField({ allowZero: true }),
  discount: optionalMoney,
});

export const quoteFormSchema = z
  .object({
    patientId: z.uuid({ error: "Escolha o paciente." }),
    validUntil: dateField("Informe até quando o orçamento vale."),
    discount: optionalMoney,
    notes: optionalText(500),
    items: z
      .array(quoteItemSchema)
      .min(1, "Adicione pelo menos um serviço.")
      .max(30),
  })
  .superRefine((data, ctx) => {
    let subtotal = 0;
    data.items.forEach((item, index) => {
      const gross = item.sessions * item.unitPrice;
      if (item.discount > gross) {
        ctx.addIssue({
          code: "custom",
          path: ["items", index, "discount"],
          message: "O desconto passa do valor do item.",
        });
      }
      subtotal += Math.max(0, gross - item.discount);
    });
    if (data.discount > subtotal) {
      ctx.addIssue({
        code: "custom",
        path: ["discount"],
        message: "O desconto passa do valor do orçamento.",
      });
    }
  });

export type QuoteFormInput = z.input<typeof quoteFormSchema>;
export type QuoteFormValues = z.output<typeof quoteFormSchema>;

// How the patient pays, chosen when the quote is approved.
export const approveSchema = z
  .object({
    plan: z.enum(["upfront", "installments", "per_session"], {
      error: "Escolha a forma de pagamento.",
    }),
    firstDueDate: dateField("Informe o vencimento."),
    installmentsCount: z.string().trim().default("1"),
    // Optional overrides for "parcelado", one per installment, in order.
    amounts: z.array(z.string()).default([]),
    dueDates: z.array(z.string()).default([]),
    acknowledgeExpired: z.boolean().default(false),
  })
  .transform((data, ctx) => {
    let count = 1;
    if (data.plan === "installments") {
      count = Number(data.installmentsCount);
      if (!Number.isInteger(count) || count < 1 || count > MAX_INSTALLMENTS) {
        ctx.addIssue({
          code: "custom",
          path: ["installmentsCount"],
          message: `Use de 1 a ${MAX_INSTALLMENTS} parcelas.`,
        });
        return z.NEVER;
      }
    }
    const amounts: (number | null)[] = [];
    const dueDates: (string | null)[] = [];
    if (data.plan === "installments") {
      for (let i = 0; i < count; i++) {
        const raw = (data.amounts[i] ?? "").trim();
        if (raw === "") amounts.push(null);
        else {
          const cents = parsePriceToCents(raw);
          if (cents === null || cents === 0) {
            ctx.addIssue({
              code: "custom",
              path: ["amounts", i],
              message: "Valor da parcela inválido.",
            });
            return z.NEVER;
          }
          amounts.push(cents);
        }
        const date = (data.dueDates[i] ?? "").trim();
        if (date === "") dueDates.push(null);
        else if (!isRealDate(date)) {
          ctx.addIssue({
            code: "custom",
            path: ["dueDates", i],
            message: "Vencimento inválido.",
          });
          return z.NEVER;
        } else dueDates.push(date);
      }
    }
    return {
      plan: data.plan,
      firstDueDate: data.firstDueDate,
      count,
      amounts,
      dueDates,
      acknowledgeExpired: data.acknowledgeExpired,
    };
  });

export type ApproveInput = z.input<typeof approveSchema>;
export type ApproveValues = z.output<typeof approveSchema>;

export const paymentSchema = z.object({
  installmentId: z.uuid(),
  paidOn: dateField("Informe a data do pagamento."),
  amount: moneyField(),
  paymentMethodId: z.uuid({ error: "Escolha a forma de pagamento." }),
  notes: optionalText(200),
});
export type PaymentInput = z.input<typeof paymentSchema>;
export type PaymentValues = z.output<typeof paymentSchema>;

export const reasonSchema = z
  .string()
  .trim()
  .min(1, "Informe o motivo.")
  .max(200, "Use no máximo 200 caracteres.");

export const expenseSchema = z.object({
  spentOn: dateField("Informe a data."),
  amount: moneyField(),
  categoryId: z.uuid({ error: "Escolha a categoria." }),
  paymentMethodId: z.uuid({ error: "Escolha a forma de pagamento." }),
  description: optionalText(200),
});
export type ExpenseInput = z.input<typeof expenseSchema>;
export type ExpenseValues = z.output<typeof expenseSchema>;

// Scheduling the sessions of a sold item at once.
export const scheduleSessionsSchema = z.object({
  saleItemId: z.uuid(),
  durationMinutes: intField(5, 720, "a duração"),
  slots: z
    .array(
      z.object({
        date: dateField(),
        startTime: z.string().trim().regex(TIME_PATTERN, "Informe o horário."),
      }),
    )
    .min(1, "Escolha pelo menos uma data.")
    .max(MAX_SESSIONS),
  acknowledgeWarnings: z.boolean().default(false),
});
export type ScheduleSessionsInput = z.input<typeof scheduleSessionsSchema>;
export type ScheduleSessionsValues = z.output<typeof scheduleSessionsSchema>;

// Changing an approved sale.
export const reviseSchema = z
  .object({
    reason: reasonSchema,
    action: z.enum(["add_sessions", "add_item", "remove_sessions", "replan"]),
    saleItemId: z.string().optional(),
    serviceId: z.string().optional(),
    sessions: z.string().trim().default("0"),
    sessionPrice: z.string().trim().default(""),
    installmentsCount: z.string().trim().default("1"),
    firstDueDate: z.string().trim().default(""),
  })
  .transform((data, ctx) => {
    const fail = (path: string, message: string) => {
      ctx.addIssue({ code: "custom", path: [path], message });
      return z.NEVER;
    };
    const sessions = Number(data.sessions);
    const needsSessions = data.action !== "replan";
    if (
      needsSessions &&
      (!Number.isInteger(sessions) || sessions < 1 || sessions > MAX_SESSIONS)
    ) {
      return fail("sessions", "Informe a quantidade de sessões.");
    }
    let sessionPriceCents = 0;
    if (data.action === "add_sessions" || data.action === "add_item") {
      const cents = parsePriceToCents(data.sessionPrice);
      if (cents === null)
        return fail("sessionPrice", "Informe o valor por sessão.");
      sessionPriceCents = cents;
    }
    if (
      (data.action === "add_sessions" || data.action === "remove_sessions") &&
      !z.uuid().safeParse(data.saleItemId).success
    ) {
      return fail("saleItemId", "Escolha o item.");
    }
    if (
      data.action === "add_item" &&
      !z.uuid().safeParse(data.serviceId).success
    ) {
      return fail("serviceId", "Escolha o serviço.");
    }
    const count = Number(data.installmentsCount);
    if (!Number.isInteger(count) || count < 1 || count > MAX_INSTALLMENTS) {
      return fail(
        "installmentsCount",
        `Use de 1 a ${MAX_INSTALLMENTS} parcelas.`,
      );
    }
    if (data.firstDueDate !== "" && !isRealDate(data.firstDueDate)) {
      return fail("firstDueDate", "Vencimento inválido.");
    }
    return {
      reason: data.reason,
      action: data.action,
      saleItemId: data.saleItemId ?? null,
      serviceId: data.serviceId ?? null,
      sessions: needsSessions ? sessions : 0,
      sessionPriceCents,
      installmentsCount: count,
      firstDueDate: data.firstDueDate === "" ? null : data.firstDueDate,
    };
  });
export type ReviseInput = z.input<typeof reviseSchema>;
export type ReviseValues = z.output<typeof reviseSchema>;

// Field errors keyed by path ("items.0.discount"), for forms with lists.
export function issuesToFieldErrors(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "form";
    if (!(key in errors)) errors[key] = issue.message;
  }
  return errors;
}
