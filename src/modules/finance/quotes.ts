import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { inClinic, type Tx } from "@/db/client";
import {
  auditLogs,
  installments,
  patients,
  products,
  quoteItems,
  quotes,
  saleItems,
  sales,
  services,
} from "@/db/schema";
import { MODULE_OFF_ERROR } from "@/modules/clinics/modules";
import { ANONYMIZED_NAME } from "@/modules/patients/patients";

import type { ApproveValues, QuoteFormValues, QuoteItemKind } from "./fields";
import { quoteTotals, sessionAmounts, splitAmount } from "./money";
import { monthlyDueDates } from "./recurrence";

// Quotes of one clinic: the owner writes them, sends them, and approves them
// into a sale with its payment plan. Every function takes the clinicId from
// the session. Patient names never go to audit_logs or error messages.

export type QuoteStatus =
  "draft" | "sent" | "approved" | "rejected" | "cancelled";

export type QuoteResult =
  | { ok: true; id: string }
  | { ok: false; formError?: string; fieldErrors?: Record<string, string> };

export type QuoteListItem = {
  id: string;
  number: number;
  patientId: string;
  patientName: string;
  status: QuoteStatus;
  expired: boolean;
  validUntil: string;
  totalCents: number;
  createdAt: Date;
};

export type QuoteDetail = QuoteListItem & {
  notes: string | null;
  discountCents: number;
  subtotalCents: number;
  sentAt: Date | null;
  saleId: string | null;
  items: {
    id: string;
    kind: QuoteItemKind;
    serviceId: string | null;
    productId: string | null;
    // The service or product name, copied when the item was saved.
    serviceName: string;
    // Sessions of a service, or the quantity of a product.
    sessions: number;
    unitPriceCents: number;
    discountCents: number;
    grossCents: number;
    netCents: number;
  }[];
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Arbitrary constant: quote numbers of a clinic are handed out one at a time.
const QUOTE_NUMBER_LOCK = 7_204_514;

const NOT_FOUND = "Orçamento não encontrado.";
const PATIENT_MISSING = "Escolha um paciente cadastrado.";
const SERVICE_MISSING = "Um dos serviços não existe mais.";
const PRODUCT_INACTIVE = "Este produto não está mais ativo.";

// Whether the clinic can put products in a quote: the action passes it from
// the session (products and finance modules on). Off unless said otherwise.
export type QuoteOptions = { productsOn?: boolean };

const fail = (formError: string): QuoteResult => ({ ok: false, formError });

function unexpected(error: unknown): Error {
  return new Error("Não foi possível salvar o orçamento.", { cause: error });
}

// Expired means sent and past its validity; drafts are not expired yet.
const isExpired = (status: QuoteStatus, validUntil: string, today: string) =>
  status === "sent" && validUntil < today;

async function checkPatient(tx: Tx, clinicId: string, patientId: string) {
  const [patient] = await tx
    .select({ anonymizedAt: patients.anonymizedAt })
    .from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.clinicId, clinicId)))
    .limit(1);
  return Boolean(patient && !patient.anonymizedAt);
}

type Item = QuoteFormValues["items"][number];

// Service and product names are copied into the items, like appointments
// do. A product must be of the clinic and active. Returns the name of each
// item, in order, or the error that refuses the quote.
async function readItemNames(
  tx: Tx,
  clinicId: string,
  items: Item[],
  options: QuoteOptions,
): Promise<{ names: string[] } | { error: string }> {
  const serviceIds = [
    ...new Set(
      items.flatMap((item) =>
        item.kind === "service" ? [item.serviceId] : [],
      ),
    ),
  ];
  const productIds = [
    ...new Set(
      items.flatMap((item) =>
        item.kind === "product" ? [item.productId] : [],
      ),
    ),
  ];
  if (productIds.length > 0 && !options.productsOn) {
    return { error: MODULE_OFF_ERROR };
  }
  const serviceRows =
    serviceIds.length === 0
      ? []
      : await tx
          .select({
            id: services.id,
            name: services.name,
            isFlexible: services.isFlexible,
          })
          .from(services)
          .where(
            and(
              eq(services.clinicId, clinicId),
              inArray(services.id, serviceIds),
            ),
          );
  if (
    serviceRows.length !== serviceIds.length ||
    serviceRows.some((row) => row.isFlexible)
  ) {
    return { error: SERVICE_MISSING };
  }
  const productRows =
    productIds.length === 0
      ? []
      : await tx
          .select({ id: products.id, name: products.name })
          .from(products)
          .where(
            and(
              eq(products.clinicId, clinicId),
              eq(products.isActive, true),
              inArray(products.id, productIds),
            ),
          );
  if (productRows.length !== productIds.length) {
    return { error: PRODUCT_INACTIVE };
  }
  const serviceNames = new Map(serviceRows.map((row) => [row.id, row.name]));
  const productNames = new Map(productRows.map((row) => [row.id, row.name]));
  return {
    names: items.map((item) =>
      item.kind === "service"
        ? serviceNames.get(item.serviceId)!
        : productNames.get(item.productId)!,
    ),
  };
}

async function writeItems(
  tx: Tx,
  clinicId: string,
  quoteId: string,
  values: QuoteFormValues,
  names: string[],
) {
  await tx.insert(quoteItems).values(
    values.items.map((item, index) => ({
      clinicId,
      quoteId,
      serviceId: item.kind === "service" ? item.serviceId : null,
      productId: item.kind === "product" ? item.productId : null,
      serviceName: names[index]!,
      sessions: item.sessions,
      unitPriceCents: item.unitPrice,
      discountCents: item.discount,
      sortOrder: index,
    })),
  );
}

export async function createQuote(
  clinicId: string,
  values: QuoteFormValues,
  actorUserId: string,
  options: QuoteOptions = {},
): Promise<QuoteResult> {
  try {
    return await inClinic(clinicId, async (tx): Promise<QuoteResult> => {
      if (!(await checkPatient(tx, clinicId, values.patientId))) {
        return { ok: false, fieldErrors: { patientId: PATIENT_MISSING } };
      }
      const read = await readItemNames(tx, clinicId, values.items, options);
      if ("error" in read) return fail(read.error);
      const { names } = read;

      await tx.execute(
        sql`select pg_advisory_xact_lock(${QUOTE_NUMBER_LOCK}, hashtext(${clinicId}))`,
      );
      const [last] = await tx
        .select({ max: sql<number | null>`max(${quotes.number})` })
        .from(quotes)
        .where(eq(quotes.clinicId, clinicId));
      const [row] = await tx
        .insert(quotes)
        .values({
          clinicId,
          number: (last?.max ?? 0) + 1,
          patientId: values.patientId,
          validUntil: values.validUntil,
          discountCents: values.discount,
          notes: values.notes,
          createdByUserId: actorUserId,
        })
        .returning({ id: quotes.id });
      await writeItems(tx, clinicId, row!.id, values, names);
      await tx.insert(auditLogs).values({
        clinicId,
        actorType: "admin",
        actorUserId,
        action: "quote.created",
        entityType: "quote",
        entityId: row!.id,
      });
      return { ok: true, id: row!.id };
    });
  } catch (error) {
    throw unexpected(error);
  }
}

async function lockQuote(tx: Tx, clinicId: string, id: string) {
  const [quote] = await tx
    .select()
    .from(quotes)
    .where(and(eq(quotes.id, id), eq(quotes.clinicId, clinicId)))
    .for("update");
  return quote;
}

// Only drafts change. To change a sent quote, duplicate it and cancel the old.
export async function updateQuote(
  clinicId: string,
  id: string,
  values: QuoteFormValues,
  actorUserId: string,
  options: QuoteOptions = {},
): Promise<QuoteResult> {
  if (!UUID_PATTERN.test(id)) return fail(NOT_FOUND);
  try {
    return await inClinic(clinicId, async (tx): Promise<QuoteResult> => {
      const quote = await lockQuote(tx, clinicId, id);
      if (!quote) return fail(NOT_FOUND);
      if (quote.status !== "draft") {
        return fail(
          "Só o rascunho pode ser editado. Duplique o orçamento para mudar.",
        );
      }
      if (!(await checkPatient(tx, clinicId, values.patientId))) {
        return { ok: false, fieldErrors: { patientId: PATIENT_MISSING } };
      }
      const read = await readItemNames(tx, clinicId, values.items, options);
      if ("error" in read) return fail(read.error);
      const { names } = read;

      await tx
        .update(quotes)
        .set({
          patientId: values.patientId,
          validUntil: values.validUntil,
          discountCents: values.discount,
          notes: values.notes,
        })
        .where(eq(quotes.id, id));
      await tx.delete(quoteItems).where(eq(quoteItems.quoteId, id));
      await writeItems(tx, clinicId, id, values, names);
      await tx.insert(auditLogs).values({
        clinicId,
        actorType: "admin",
        actorUserId,
        action: "quote.updated",
        entityType: "quote",
        entityId: id,
      });
      return { ok: true, id };
    });
  } catch (error) {
    throw unexpected(error);
  }
}

const TRANSITIONS: Record<string, QuoteStatus[]> = {
  sent: ["draft"],
  rejected: ["sent"],
  cancelled: ["draft", "sent"],
};

export async function setQuoteStatus(
  clinicId: string,
  id: string,
  to: "sent" | "rejected" | "cancelled",
  actorUserId: string,
  now: Date = new Date(),
): Promise<QuoteResult> {
  if (!UUID_PATTERN.test(id)) return fail(NOT_FOUND);
  return inClinic(clinicId, async (tx): Promise<QuoteResult> => {
    const quote = await lockQuote(tx, clinicId, id);
    if (!quote) return fail(NOT_FOUND);
    if (!TRANSITIONS[to]!.includes(quote.status)) {
      return fail("Este orçamento não pode mudar para esse status.");
    }
    await tx
      .update(quotes)
      .set({
        status: to,
        ...(to === "sent" ? { sentAt: now } : { decidedAt: now }),
      })
      .where(eq(quotes.id, id));
    await tx.insert(auditLogs).values({
      clinicId,
      actorType: "admin",
      actorUserId,
      action: "quote.status_changed",
      entityType: "quote",
      entityId: id,
      changes: { from: quote.status, to },
    });
    return { ok: true, id };
  });
}

// A new draft with the same patient, items and discount.
export async function duplicateQuote(
  clinicId: string,
  id: string,
  validUntil: string,
  actorUserId: string,
  options: QuoteOptions = {},
): Promise<QuoteResult> {
  const quote = await getQuote(clinicId, id, validUntil);
  if (!quote) return fail(NOT_FOUND);
  return createQuote(
    clinicId,
    {
      patientId: quote.patientId,
      validUntil,
      discount: quote.discountCents,
      notes: quote.notes,
      items: quote.items.map((item) => {
        const priced = {
          sessions: item.sessions,
          unitPrice: item.unitPriceCents,
          discount: item.discountCents,
        };
        return item.productId
          ? { kind: "product" as const, productId: item.productId, ...priced }
          : { kind: "service" as const, serviceId: item.serviceId!, ...priced };
      }),
    },
    actorUserId,
    options,
  );
}

// Approving creates the sale, its items and its installments in one
// transaction. The sum of the installments is always the sale total.
export async function approveQuote(
  clinicId: string,
  id: string,
  plan: ApproveValues,
  actorUserId: string,
  today: string,
): Promise<QuoteResult & { saleId?: string }> {
  if (!UUID_PATTERN.test(id)) return fail(NOT_FOUND);
  try {
    return await inClinic(clinicId, async (tx) => {
      const quote = await lockQuote(tx, clinicId, id);
      if (!quote) return fail(NOT_FOUND);
      if (quote.status !== "draft" && quote.status !== "sent") {
        return fail("Este orçamento não pode mais ser aprovado.");
      }
      if (
        isExpired(quote.status, quote.validUntil, today) &&
        !plan.acknowledgeExpired
      ) {
        return fail(
          "Este orçamento venceu. Confirme para aprovar mesmo assim.",
        );
      }
      const items = await tx
        .select()
        .from(quoteItems)
        .where(eq(quoteItems.quoteId, id))
        .orderBy(asc(quoteItems.sortOrder));
      const totals = quoteTotals(items, quote.discountCents);

      const [sale] = await tx
        .insert(sales)
        .values({
          clinicId,
          quoteId: id,
          patientId: quote.patientId,
          paymentPlan: plan.plan,
          totalCents: totals.totalCents,
          createdByUserId: actorUserId,
        })
        .returning({ id: sales.id });
      const saleId = sale!.id;

      const itemRows = await tx
        .insert(saleItems)
        .values(
          items.map((item, index) => ({
            clinicId,
            saleId,
            serviceId: item.serviceId,
            productId: item.productId,
            serviceName: item.serviceName,
            sessions: item.sessions,
            totalCents: totals.items[index]!.netCents,
            sortOrder: index,
          })),
        )
        .returning({ id: saleItems.id, sortOrder: saleItems.sortOrder });
      itemRows.sort((a, b) => a.sortOrder - b.sortOrder);

      const parts = planInstallments(plan, totals, items, itemRows, today);
      if ("error" in parts) return { ok: false, fieldErrors: parts.error };
      if (parts.rows.length > 0) {
        await tx.insert(installments).values(
          parts.rows.map((part, index) => ({
            clinicId,
            saleId,
            saleItemId: part.saleItemId,
            number: index + 1,
            amountCents: part.amountCents,
            dueDate: part.dueDate,
          })),
        );
      }

      await tx
        .update(quotes)
        .set({ status: "approved", decidedAt: new Date() })
        .where(eq(quotes.id, id));
      await tx.insert(auditLogs).values({
        clinicId,
        actorType: "admin",
        actorUserId,
        action: "quote.approved",
        entityType: "quote",
        entityId: id,
        changes: {
          saleId,
          plan: plan.plan,
          totalCents: totals.totalCents,
          installments: parts.rows.length,
        },
      });
      return { ok: true, id, saleId };
    });
  } catch (error) {
    throw unexpected(error);
  }
}

type PlannedInstallment = {
  saleItemId: string | null;
  amountCents: number;
  dueDate: string | null;
};

// The installments of a new sale. Zero-value parts (a free session) are
// left out, since an installment is always more than zero. "Por sessão": an
// undated installment per session of a service, and one per product item,
// due on the day of the sale (a product has no session to wait for).
function planInstallments(
  plan: ApproveValues,
  totals: ReturnType<typeof quoteTotals>,
  items: { sessions: number; productId: string | null }[],
  itemRows: { id: string }[],
  today: string,
): { rows: PlannedInstallment[] } | { error: Record<string, string> } {
  if (plan.plan === "per_session") {
    const rows = items.flatMap((item, index): PlannedInstallment[] => {
      const saleItemId = itemRows[index]!.id;
      const net = totals.items[index]!.netCents;
      if (item.productId) {
        return [{ saleItemId, amountCents: net, dueDate: today }];
      }
      return sessionAmounts(net, item.sessions).map((amountCents) => ({
        saleItemId,
        amountCents,
        dueDate: null,
      }));
    });
    return { rows: rows.filter((row) => row.amountCents > 0) };
  }
  if (totals.totalCents === 0) return { rows: [] };

  const count = plan.plan === "upfront" ? 1 : plan.count;
  const dates = monthlyDueDates(plan.firstDueDate, count).map(
    (date, i) => plan.dueDates[i] ?? date,
  );
  // Fixed amounts stay; the rest of the total is split over the others.
  const fixed = plan.amounts.reduce<number>(
    (sum, value) => sum + (value ?? 0),
    0,
  );
  const free =
    plan.amounts.length === 0
      ? count
      : plan.amounts.filter((v) => v === null).length;
  if (
    fixed > totals.totalCents ||
    (free === 0 && fixed !== totals.totalCents)
  ) {
    return {
      error: {
        amounts: "A soma das parcelas precisa ser igual ao total do orçamento.",
      },
    };
  }
  const rest = free > 0 ? splitAmount(totals.totalCents - fixed, free) : [];
  let next = 0;
  const amounts = Array.from({ length: count }, (_, i) => {
    const value = plan.amounts[i];
    return value ?? rest[next++]!;
  });
  if (amounts.some((amount) => amount <= 0)) {
    return {
      error: { amounts: "Cada parcela precisa ter valor maior que zero." },
    };
  }
  return {
    rows: amounts.map((amountCents, i) => ({
      saleItemId: null,
      amountCents,
      dueDate: dates[i]!,
    })),
  };
}

const listColumns = {
  id: quotes.id,
  number: quotes.number,
  patientId: quotes.patientId,
  patientName: patients.name,
  anonymizedAt: patients.anonymizedAt,
  status: quotes.status,
  validUntil: quotes.validUntil,
  discountCents: quotes.discountCents,
  createdAt: quotes.createdAt,
};

// Total of each quote, from its items and discounts.
// Explicit names: Drizzle writes columns unqualified inside sql``.
const itemsTotal = sql<number>`coalesce((
  select sum(qi.sessions * qi.unit_price_cents - qi.discount_cents)
  from quote_items qi where qi.quote_id = "quotes"."id"), 0)::int`;

export async function listQuotes(
  clinicId: string,
  input: { today: string; status?: QuoteStatus; patientId?: string },
): Promise<QuoteListItem[]> {
  const rows = await inClinic(clinicId, (tx) =>
    tx
      .select({ ...listColumns, itemsTotal })
      .from(quotes)
      .innerJoin(patients, eq(quotes.patientId, patients.id))
      .where(
        and(
          eq(quotes.clinicId, clinicId),
          input.status ? eq(quotes.status, input.status) : undefined,
          input.patientId ? eq(quotes.patientId, input.patientId) : undefined,
        ),
      )
      .orderBy(desc(quotes.number))
      .limit(200),
  );
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    patientId: row.patientId,
    patientName: row.anonymizedAt ? ANONYMIZED_NAME : row.patientName,
    status: row.status,
    expired: isExpired(row.status, row.validUntil, input.today),
    validUntil: row.validUntil,
    totalCents: row.itemsTotal - row.discountCents,
    createdAt: row.createdAt,
  }));
}

export async function getQuote(
  clinicId: string,
  id: string,
  today: string,
): Promise<QuoteDetail | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const [row] = await inClinic(clinicId, (tx) =>
    tx
      .select({
        ...listColumns,
        notes: quotes.notes,
        sentAt: quotes.sentAt,
        saleId: sales.id,
      })
      .from(quotes)
      .innerJoin(patients, eq(quotes.patientId, patients.id))
      .leftJoin(sales, eq(sales.quoteId, quotes.id))
      .where(and(eq(quotes.id, id), eq(quotes.clinicId, clinicId)))
      .limit(1),
  );
  if (!row) return null;
  const items = await inClinic(clinicId, (tx) =>
    tx
      .select()
      .from(quoteItems)
      .where(eq(quoteItems.quoteId, id))
      .orderBy(asc(quoteItems.sortOrder)),
  );
  const totals = quoteTotals(items, row.discountCents);
  return {
    id: row.id,
    number: row.number,
    patientId: row.patientId,
    patientName: row.anonymizedAt ? ANONYMIZED_NAME : row.patientName,
    status: row.status,
    expired: isExpired(row.status, row.validUntil, today),
    validUntil: row.validUntil,
    totalCents: totals.totalCents,
    createdAt: row.createdAt,
    notes: row.notes,
    discountCents: row.discountCents,
    subtotalCents: totals.subtotalCents,
    sentAt: row.sentAt,
    saleId: row.saleId,
    items: items.map((item, index) => ({
      id: item.id,
      kind: item.productId ? "product" : "service",
      serviceId: item.serviceId,
      productId: item.productId,
      serviceName: item.serviceName,
      sessions: item.sessions,
      unitPriceCents: item.unitPriceCents,
      discountCents: item.discountCents,
      grossCents: totals.items[index]!.grossCents,
      netCents: totals.items[index]!.netCents,
    })),
  };
}
