import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";

import { inClinic, platformDb, type Tx } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import {
  appointments,
  auditLogs,
  patients,
  products,
  quotes,
  saleItems,
  sales,
  stockMovements,
  users,
} from "@/db/schema";

import type { EntryValues, UsageValues } from "./fields";

// Data functions for the stock of one clinic, as app_panel inside the clinic
// (inClinic). products.stock_quantity is the sum of the product's movements:
// every movement is inserted together with the matching update of the
// balance, in the same transaction, while the product row is locked. Values
// never go to audit_logs or into error messages; only ids and quantities do.
//
// Locks are always taken in the same order (sale, then its items, then
// products by id), so two operations never wait on each other in a cycle.
// stock_movements rows cannot be locked (app_panel has no UPDATE on them,
// which SELECT ... FOR UPDATE needs): the product row is the lock for every
// movement of that product, reversals included.

export type StockResult = { ok: true } | { ok: false; formError: string };

export type StockMovementKind = (typeof stockMovements.$inferSelect)["kind"];

export type StockHistoryEntry = {
  id: string;
  kind: StockMovementKind;
  quantity: number;
  createdAt: Date;
  actorName: string | null;
  note: string | null;
  origin:
    | { type: "entry" }
    | {
        type: "appointment";
        appointmentId: string;
        patientName: string;
        startsAt: Date;
      }
    | { type: "sale"; saleId: string; saleNumber: number };
  reversed: boolean;
};

export type AppointmentUsage = {
  movementId: string;
  productName: string;
  quantity: number;
  saleNumber: number | null;
  reversed: boolean;
};

export type OpenSaleItem = {
  saleItemId: string;
  saleId: string;
  saleNumber: number;
  productId: string;
  productName: string;
  remaining: number;
};

export type SaleProductProgress = {
  saleItemId: string;
  productName: string;
  sold: number;
  done: number;
  remaining: number;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HISTORY_LIMIT = 100;
const USAGE_STATUSES = ["confirmed", "completed"] as const;

const PRODUCT_NOT_FOUND = "Produto não encontrado.";
const PRODUCT_INACTIVE = "Este produto está desativado.";
const APPOINTMENT_NOT_FOUND = "Atendimento não encontrado.";
const APPOINTMENT_STATUS =
  "Só dá para registrar produto em atendimento confirmado ou concluído.";
const SALE_NOT_FOUND = "Venda não encontrada.";
const SALE_CANCELLED = "Esta venda foi cancelada.";
const SALE_ITEM_INVALID =
  "Este item de venda não é deste produto nem desta pessoa.";
const NOTHING_TO_HAND_OVER = "Os produtos desta venda já têm baixa.";
const MOVEMENT_NOT_FOUND = "Movimento não encontrado.";
const REVERSAL_NOT_REVERSIBLE = "Um estorno não pode ser desfeito.";
const ALREADY_REVERSED = "Esta baixa já foi desfeita.";

const insufficient = (n: number) =>
  `Estoque insuficiente: há ${n}. Lance uma entrada primeiro.`;
const insufficientNamed = (name: string, n: number) =>
  `${name}: estoque insuficiente: há ${n}. Lance uma entrada primeiro.`;
const saleExceeded = (number: number, n: number) =>
  `Na venda nº ${number} faltam só ${n}.`;

const fail = (formError: string): StockResult => ({ ok: false, formError });

// Never lets driver details (which can echo values) out of this module.
function unexpected(error: unknown): Error {
  return new Error("Não foi possível salvar o estoque.", { cause: error });
}

// Units of a sale item still to go out: what was sold plus its movements
// (outs are negative, their reversals positive). Raw SQL with explicit table
// names: only for queries whose outer table is "sale_items" (not aliased).
const itemMovementsOf = () =>
  sql<number>`coalesce((
    select sum(m.quantity) from stock_movements m
    where m.sale_item_id = "sale_items"."id"), 0)::int`;

// Same rule, for queries whose outer table is "stock_movements".
const reversedOf = () =>
  sql<boolean>`exists (
    select 1 from stock_movements r
    where r.reverses_id = "stock_movements"."id")`;

async function lockProducts(tx: Tx, clinicId: string, ids: string[]) {
  return tx
    .select({
      id: products.id,
      name: products.name,
      isActive: products.isActive,
      stockQuantity: products.stockQuantity,
    })
    .from(products)
    .where(and(eq(products.clinicId, clinicId), inArray(products.id, ids)))
    .orderBy(asc(products.id))
    .for("update");
}

async function lockProduct(tx: Tx, clinicId: string, id: string) {
  const [row] = await lockProducts(tx, clinicId, [id]);
  return row;
}

// The balance moves with the movement. products_stock_check (>= 0) stays as
// the last guard behind the comparison made under the lock.
async function addToStock(
  tx: Tx,
  clinicId: string,
  productId: string,
  delta: number,
) {
  await tx
    .update(products)
    .set({ stockQuantity: sql`${products.stockQuantity} + ${delta}` })
    .where(and(eq(products.id, productId), eq(products.clinicId, clinicId)));
}

async function lockSale(tx: Tx, clinicId: string, saleId: string) {
  const [sale] = await tx
    .select({
      id: sales.id,
      patientId: sales.patientId,
      cancelledAt: sales.cancelledAt,
      saleNumber: quotes.number,
    })
    .from(sales)
    .innerJoin(quotes, eq(sales.quoteId, quotes.id))
    .where(and(eq(sales.id, saleId), eq(sales.clinicId, clinicId)))
    .for("update", { of: sales });
  return sale;
}

async function audit(
  tx: Tx,
  clinicId: string,
  actorUserId: string,
  action: `stock.${"entry" | "usage" | "handover" | "reversal"}`,
  movementId: string,
  changes: Record<string, string | number | null>,
) {
  await tx.insert(auditLogs).values({
    clinicId,
    actorType: "admin",
    actorUserId,
    action,
    entityType: "stock_movement",
    entityId: movementId,
    changes,
  });
}

// ---------------------------------------------------------------- writing

export async function recordEntry(
  clinicId: string,
  productId: string,
  values: EntryValues,
  actorUserId: string,
): Promise<StockResult> {
  if (!UUID_PATTERN.test(productId)) return fail(PRODUCT_NOT_FOUND);
  try {
    return await inClinic(clinicId, async (tx): Promise<StockResult> => {
      const product = await lockProduct(tx, clinicId, productId);
      if (!product) return fail(PRODUCT_NOT_FOUND);
      const [row] = await tx
        .insert(stockMovements)
        .values({
          clinicId,
          productId,
          kind: "entry",
          quantity: values.quantity,
          note: values.note,
          createdByUserId: actorUserId,
        })
        .returning({ id: stockMovements.id });
      await addToStock(tx, clinicId, productId, values.quantity);
      await audit(tx, clinicId, actorUserId, "stock.entry", row!.id, {
        productId,
        quantity: values.quantity,
      });
      return { ok: true };
    });
  } catch (error) {
    throw unexpected(error);
  }
}

// A product used in a confirmed or completed appointment, optionally counted
// against a product the same person bought.
export async function recordUsage(
  clinicId: string,
  appointmentId: string,
  values: UsageValues,
  actorUserId: string,
): Promise<StockResult> {
  if (!UUID_PATTERN.test(appointmentId)) return fail(APPOINTMENT_NOT_FOUND);
  try {
    return await inClinic(clinicId, async (tx): Promise<StockResult> => {
      const [appointment] = await tx
        .select({
          patientId: appointments.patientId,
          status: appointments.status,
        })
        .from(appointments)
        .where(
          and(
            eq(appointments.id, appointmentId),
            eq(appointments.clinicId, clinicId),
          ),
        )
        .for("share");
      if (!appointment) return fail(APPOINTMENT_NOT_FOUND);
      if (!(USAGE_STATUSES as readonly string[]).includes(appointment.status)) {
        return fail(APPOINTMENT_STATUS);
      }

      if (values.saleItemId) {
        const [found] = await tx
          .select({ saleId: saleItems.saleId })
          .from(saleItems)
          .where(
            and(
              eq(saleItems.id, values.saleItemId),
              eq(saleItems.clinicId, clinicId),
            ),
          );
        if (!found) return fail(SALE_ITEM_INVALID);
        // Sale first, then the item: the order every sale change uses.
        const sale = await lockSale(tx, clinicId, found.saleId);
        const [item] = await tx
          .select({
            productId: saleItems.productId,
            sold: saleItems.sessions,
            movements: itemMovementsOf(),
          })
          .from(saleItems)
          .where(eq(saleItems.id, values.saleItemId))
          .for("update");
        if (
          !sale ||
          !item ||
          item.productId !== values.productId ||
          sale.patientId !== appointment.patientId
        ) {
          return fail(SALE_ITEM_INVALID);
        }
        if (sale.cancelledAt) return fail(SALE_CANCELLED);
        const remaining = Math.max(item.sold + item.movements, 0);
        if (values.quantity > remaining) {
          return fail(saleExceeded(sale.saleNumber, remaining));
        }
      }

      const product = await lockProduct(tx, clinicId, values.productId);
      if (!product) return fail(PRODUCT_NOT_FOUND);
      if (!product.isActive) return fail(PRODUCT_INACTIVE);
      if (product.stockQuantity < values.quantity) {
        return fail(insufficient(product.stockQuantity));
      }

      const [row] = await tx
        .insert(stockMovements)
        .values({
          clinicId,
          productId: values.productId,
          kind: "usage",
          quantity: -values.quantity,
          appointmentId,
          saleItemId: values.saleItemId,
          createdByUserId: actorUserId,
        })
        .returning({ id: stockMovements.id });
      await addToStock(tx, clinicId, values.productId, -values.quantity);
      await audit(tx, clinicId, actorUserId, "stock.usage", row!.id, {
        productId: values.productId,
        appointmentId,
        saleItemId: values.saleItemId,
        quantity: -values.quantity,
      });
      return { ok: true };
    });
  } catch (error) {
    throw unexpected(error);
  }
}

// "Dar baixa em tudo": one handover for each product item of the sale with
// units left. Either every item goes out or none does.
export async function handOverAll(
  clinicId: string,
  saleId: string,
  actorUserId: string,
): Promise<StockResult> {
  if (!UUID_PATTERN.test(saleId)) return fail(SALE_NOT_FOUND);
  try {
    return await inClinic(clinicId, async (tx): Promise<StockResult> => {
      const sale = await lockSale(tx, clinicId, saleId);
      if (!sale) return fail(SALE_NOT_FOUND);
      if (sale.cancelledAt) return fail(SALE_CANCELLED);

      const items = await tx
        .select({
          id: saleItems.id,
          productId: saleItems.productId,
          sold: saleItems.sessions,
          movements: itemMovementsOf(),
        })
        .from(saleItems)
        .where(
          and(eq(saleItems.saleId, saleId), isNotNull(saleItems.productId)),
        )
        .orderBy(asc(saleItems.sortOrder), asc(saleItems.id))
        .for("update");
      const open = items
        .map((item) => ({
          id: item.id,
          productId: item.productId!,
          quantity: item.sold + item.movements,
        }))
        .filter((item) => item.quantity > 0);
      if (open.length === 0) return fail(NOTHING_TO_HAND_OVER);

      const locked = await lockProducts(tx, clinicId, [
        ...new Set(open.map((item) => item.productId)),
      ]);
      const byId = new Map(locked.map((product) => [product.id, product]));
      // Checked in the order of the sale, before anything is written.
      const needed = new Map<string, number>();
      for (const item of open) {
        const product = byId.get(item.productId);
        if (!product) return fail(PRODUCT_NOT_FOUND);
        const total = (needed.get(item.productId) ?? 0) + item.quantity;
        if (total > product.stockQuantity) {
          return fail(insufficientNamed(product.name, product.stockQuantity));
        }
        needed.set(item.productId, total);
      }

      for (const item of open) {
        const [row] = await tx
          .insert(stockMovements)
          .values({
            clinicId,
            productId: item.productId,
            kind: "handover",
            quantity: -item.quantity,
            saleItemId: item.id,
            createdByUserId: actorUserId,
          })
          .returning({ id: stockMovements.id });
        await addToStock(tx, clinicId, item.productId, -item.quantity);
        await audit(tx, clinicId, actorUserId, "stock.handover", row!.id, {
          productId: item.productId,
          saleId,
          saleItemId: item.id,
          quantity: -item.quantity,
        });
      }
      return { ok: true };
    });
  } catch (error) {
    throw unexpected(error);
  }
}

// "Desfazer": a reversal with the opposite quantity and the same links. A
// movement is reversed at most once, and a reversal never is.
export async function reverseMovement(
  clinicId: string,
  movementId: string,
  actorUserId: string,
): Promise<StockResult> {
  if (!UUID_PATTERN.test(movementId)) return fail(MOVEMENT_NOT_FOUND);
  try {
    return await inClinic(clinicId, async (tx): Promise<StockResult> => {
      const [original] = await tx
        .select()
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.id, movementId),
            eq(stockMovements.clinicId, clinicId),
          ),
        );
      if (!original) return fail(MOVEMENT_NOT_FOUND);
      if (original.kind === "reversal") return fail(REVERSAL_NOT_REVERSIBLE);

      // The product row serializes every movement of the product: after it
      // is locked, a reversal made meanwhile is already visible.
      const product = await lockProduct(tx, clinicId, original.productId);
      if (!product) return fail(MOVEMENT_NOT_FOUND);
      const [existing] = await tx
        .select({ id: stockMovements.id })
        .from(stockMovements)
        .where(eq(stockMovements.reversesId, movementId))
        .limit(1);
      if (existing) return fail(ALREADY_REVERSED);

      const quantity = -original.quantity;
      if (product.stockQuantity + quantity < 0) {
        return fail(insufficient(product.stockQuantity));
      }

      const [row] = await tx
        .insert(stockMovements)
        .values({
          clinicId,
          productId: original.productId,
          kind: "reversal",
          quantity,
          appointmentId: original.appointmentId,
          saleItemId: original.saleItemId,
          reversesId: original.id,
          createdByUserId: actorUserId,
        })
        .returning({ id: stockMovements.id });
      await addToStock(tx, clinicId, original.productId, quantity);
      await audit(tx, clinicId, actorUserId, "stock.reversal", row!.id, {
        productId: original.productId,
        reversesId: original.id,
        quantity,
      });
      return { ok: true };
    });
  } catch (error) {
    // The last guard when two reversals race past the check.
    if (isUniqueViolation(error, "stock_movements_reverses_unique")) {
      return fail(ALREADY_REVERSED);
    }
    throw unexpected(error);
  }
}

// ---------------------------------------------------------------- reading

// Names of the people who made the movements. app_panel cannot read users,
// so the names come through app_platform, only for ids already read from
// this clinic's movements.
async function actorNames(ids: (string | null)[]) {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
  if (wanted.length === 0) return new Map<string, string>();
  const rows = await platformDb
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, wanted));
  return new Map(rows.map((row) => [row.id, row.name]));
}

export async function getProductStock(
  clinicId: string,
  productId: string,
): Promise<{ quantity: number; history: StockHistoryEntry[] } | null> {
  if (!UUID_PATTERN.test(productId)) return null;
  const found = await inClinic(clinicId, async (tx) => {
    const [product] = await tx
      .select({ quantity: products.stockQuantity })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.clinicId, clinicId)));
    if (!product) return null;
    const rows = await tx
      .select({
        id: stockMovements.id,
        kind: stockMovements.kind,
        quantity: stockMovements.quantity,
        createdAt: stockMovements.createdAt,
        createdByUserId: stockMovements.createdByUserId,
        note: stockMovements.note,
        appointmentId: stockMovements.appointmentId,
        startsAt: appointments.startsAt,
        patientName: patients.name,
        saleId: saleItems.saleId,
        saleNumber: quotes.number,
        reversed: reversedOf(),
      })
      .from(stockMovements)
      .leftJoin(appointments, eq(stockMovements.appointmentId, appointments.id))
      .leftJoin(patients, eq(appointments.patientId, patients.id))
      .leftJoin(saleItems, eq(stockMovements.saleItemId, saleItems.id))
      .leftJoin(sales, eq(saleItems.saleId, sales.id))
      .leftJoin(quotes, eq(sales.quoteId, quotes.id))
      .where(
        and(
          eq(stockMovements.clinicId, clinicId),
          eq(stockMovements.productId, productId),
        ),
      )
      .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
      .limit(HISTORY_LIMIT);
    return { quantity: product.quantity, rows };
  });
  if (!found) return null;

  const names = await actorNames(found.rows.map((row) => row.createdByUserId));
  return {
    quantity: found.quantity,
    history: found.rows.map((row): StockHistoryEntry => {
      let origin: StockHistoryEntry["origin"] = { type: "entry" };
      if (row.appointmentId && row.startsAt && row.patientName !== null) {
        origin = {
          type: "appointment",
          appointmentId: row.appointmentId,
          patientName: row.patientName,
          startsAt: row.startsAt,
        };
      } else if (row.saleId && row.saleNumber !== null) {
        origin = {
          type: "sale",
          saleId: row.saleId,
          saleNumber: row.saleNumber,
        };
      }
      return {
        id: row.id,
        kind: row.kind,
        quantity: row.quantity,
        createdAt: row.createdAt,
        actorName: row.createdByUserId
          ? (names.get(row.createdByUserId) ?? null)
          : null,
        note: row.note,
        origin,
        reversed: row.reversed,
      };
    }),
  };
}

// The products used in an appointment (not the reversals), newest first,
// with the quantity as a positive number.
export async function listAppointmentUsage(
  clinicId: string,
  appointmentId: string,
): Promise<AppointmentUsage[]> {
  if (!UUID_PATTERN.test(appointmentId)) return [];
  const rows = await inClinic(clinicId, (tx) =>
    tx
      .select({
        movementId: stockMovements.id,
        productName: products.name,
        quantity: stockMovements.quantity,
        saleNumber: quotes.number,
        reversed: reversedOf(),
      })
      .from(stockMovements)
      .innerJoin(products, eq(stockMovements.productId, products.id))
      .leftJoin(saleItems, eq(stockMovements.saleItemId, saleItems.id))
      .leftJoin(sales, eq(saleItems.saleId, sales.id))
      .leftJoin(quotes, eq(sales.quoteId, quotes.id))
      .where(
        and(
          eq(stockMovements.clinicId, clinicId),
          eq(stockMovements.appointmentId, appointmentId),
          eq(stockMovements.kind, "usage"),
        ),
      )
      .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id)),
  );
  return rows.map((row) => ({ ...row, quantity: -row.quantity }));
}

// Products a person bought and has not fully received, for the sale picker
// of the appointment. Cancelled sales never show; the oldest sale first.
export async function listOpenSaleItems(
  clinicId: string,
  patientId: string,
): Promise<OpenSaleItem[]> {
  if (!UUID_PATTERN.test(patientId)) return [];
  const rows = await inClinic(clinicId, (tx) =>
    tx
      .select({
        saleItemId: saleItems.id,
        saleId: sales.id,
        saleNumber: quotes.number,
        productId: saleItems.productId,
        productName: products.name,
        sold: saleItems.sessions,
        movements: itemMovementsOf(),
      })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .innerJoin(quotes, eq(sales.quoteId, quotes.id))
      .innerJoin(products, eq(saleItems.productId, products.id))
      .where(
        and(
          eq(saleItems.clinicId, clinicId),
          eq(sales.patientId, patientId),
          isNull(sales.cancelledAt),
        ),
      )
      .orderBy(
        asc(sales.createdAt),
        asc(quotes.number),
        asc(saleItems.sortOrder),
        asc(saleItems.id),
      ),
  );
  return rows
    .map((row) => ({
      saleItemId: row.saleItemId,
      saleId: row.saleId,
      saleNumber: row.saleNumber,
      productId: row.productId!,
      productName: row.productName,
      remaining: row.sold + row.movements,
    }))
    .filter((row) => row.remaining > 0);
}

// "Produtos da venda": for each product item, how much was sold and how much
// already went out (outs minus their reversals).
export async function saleProductProgress(
  clinicId: string,
  saleId: string,
): Promise<SaleProductProgress[]> {
  if (!UUID_PATTERN.test(saleId)) return [];
  const rows = await inClinic(clinicId, (tx) =>
    tx
      .select({
        saleItemId: saleItems.id,
        productName: products.name,
        sold: saleItems.sessions,
        movements: itemMovementsOf(),
      })
      .from(saleItems)
      .innerJoin(products, eq(saleItems.productId, products.id))
      .where(
        and(eq(saleItems.clinicId, clinicId), eq(saleItems.saleId, saleId)),
      )
      .orderBy(asc(saleItems.sortOrder), asc(saleItems.id)),
  );
  return rows.map((row) => {
    const done = 0 - row.movements;
    return {
      saleItemId: row.saleItemId,
      productName: row.productName,
      sold: row.sold,
      done,
      remaining: Math.max(row.sold - done, 0),
    };
  });
}
