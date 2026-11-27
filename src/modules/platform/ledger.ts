import "server-only";

import { asc, eq, isNull, or, sql } from "drizzle-orm";

import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { platformDb } from "@/db/client";
import { zemanaLedger } from "@/db/schema";

// Zemana's own money (zemana_ledger), typed in by root on "Financeiro".

export type NewLedgerEntry = {
  direction: "in" | "out";
  description: string;
  amountCents: number;
  dueOn: string;
  paidOn: string | null;
  clinicId: string | null;
};

// Everything still open plus what was due or paid in the month ("YYYY-MM").
export async function listLedger(month: string) {
  const monthOf = (column: AnyPgColumn) =>
    sql`to_char(${column}, 'YYYY-MM') = ${month}`;
  return platformDb
    .select()
    .from(zemanaLedger)
    .where(
      or(
        isNull(zemanaLedger.paidOn),
        monthOf(zemanaLedger.paidOn),
        monthOf(zemanaLedger.dueOn),
      ),
    )
    .orderBy(asc(zemanaLedger.dueOn), asc(zemanaLedger.createdAt));
}

export async function addLedgerEntry(entry: NewLedgerEntry) {
  await platformDb.insert(zemanaLedger).values(entry);
}

export async function setLedgerPaid(id: string, paidOn: string | null) {
  await platformDb
    .update(zemanaLedger)
    .set({ paidOn })
    .where(eq(zemanaLedger.id, id));
}

export async function deleteLedgerEntry(id: string) {
  await platformDb.delete(zemanaLedger).where(eq(zemanaLedger.id, id));
}
