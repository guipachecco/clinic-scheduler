import "server-only";

import { and, asc, desc, eq, gte, lt } from "drizzle-orm";

import { db } from "@/db/client";
import {
  auditLogs,
  expenseCategories,
  expenses,
  paymentMethods,
} from "@/db/schema";

import type { ExpenseValues } from "./fields";

// Expenses of one clinic. A wrong entry is cancelled with a reason, never
// deleted; the cash report shows the cancellation on the day it was made.

export type ExpenseResult =
  | { ok: true; id: string }
  | { ok: false; formError?: string; fieldErrors?: Record<string, string> };

export type ExpenseItem = {
  id: string;
  spentOn: string;
  amountCents: number;
  categoryName: string;
  methodName: string;
  description: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listExpenseCategories(clinicId: string) {
  return db
    .select({ id: expenseCategories.id, name: expenseCategories.name })
    .from(expenseCategories)
    .where(
      and(
        eq(expenseCategories.clinicId, clinicId),
        eq(expenseCategories.isActive, true),
      ),
    )
    .orderBy(asc(expenseCategories.sortOrder), asc(expenseCategories.name));
}

export async function createExpense(
  clinicId: string,
  values: ExpenseValues,
  actorUserId: string,
): Promise<ExpenseResult> {
  return db.transaction(async (tx): Promise<ExpenseResult> => {
    const [category] = await tx
      .select({ id: expenseCategories.id })
      .from(expenseCategories)
      .where(
        and(
          eq(expenseCategories.id, values.categoryId),
          eq(expenseCategories.clinicId, clinicId),
        ),
      );
    if (!category) {
      return { ok: false, fieldErrors: { categoryId: "Escolha a categoria." } };
    }
    const [method] = await tx
      .select({ id: paymentMethods.id })
      .from(paymentMethods)
      .where(
        and(
          eq(paymentMethods.id, values.paymentMethodId),
          eq(paymentMethods.clinicId, clinicId),
        ),
      );
    if (!method) {
      return {
        ok: false,
        fieldErrors: { paymentMethodId: "Escolha a forma de pagamento." },
      };
    }
    const [row] = await tx
      .insert(expenses)
      .values({
        clinicId,
        spentOn: values.spentOn,
        amountCents: values.amount,
        categoryId: category.id,
        paymentMethodId: method.id,
        description: values.description,
        createdByUserId: actorUserId,
      })
      .returning({ id: expenses.id });
    await tx.insert(auditLogs).values({
      clinicId,
      actorType: "admin",
      actorUserId,
      action: "expense.created",
      entityType: "expense",
      entityId: row!.id,
      changes: { amountCents: values.amount, spentOn: values.spentOn },
    });
    return { ok: true, id: row!.id };
  });
}

export async function cancelExpense(
  clinicId: string,
  id: string,
  reason: string,
  actorUserId: string,
  now: Date = new Date(),
): Promise<ExpenseResult> {
  if (!UUID_PATTERN.test(id)) {
    return { ok: false, formError: "Despesa não encontrada." };
  }
  return db.transaction(async (tx): Promise<ExpenseResult> => {
    const [current] = await tx
      .select({ cancelledAt: expenses.cancelledAt })
      .from(expenses)
      .where(and(eq(expenses.id, id), eq(expenses.clinicId, clinicId)))
      .for("update");
    if (!current) return { ok: false, formError: "Despesa não encontrada." };
    if (current.cancelledAt) {
      return { ok: false, formError: "Esta despesa já foi cancelada." };
    }
    await tx
      .update(expenses)
      .set({
        cancelledAt: now,
        cancelledByUserId: actorUserId,
        cancellationReason: reason,
      })
      .where(eq(expenses.id, id));
    await tx.insert(auditLogs).values({
      clinicId,
      actorType: "admin",
      actorUserId,
      action: "expense.cancelled",
      entityType: "expense",
      entityId: id,
    });
    return { ok: true, id };
  });
}

// Expenses whose date falls in [from, to), newest first.
export async function listExpenses(
  clinicId: string,
  range: { from: string; to: string },
): Promise<ExpenseItem[]> {
  return db
    .select({
      id: expenses.id,
      spentOn: expenses.spentOn,
      amountCents: expenses.amountCents,
      categoryName: expenseCategories.name,
      methodName: paymentMethods.name,
      description: expenses.description,
      cancelledAt: expenses.cancelledAt,
      cancellationReason: expenses.cancellationReason,
    })
    .from(expenses)
    .innerJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .innerJoin(paymentMethods, eq(expenses.paymentMethodId, paymentMethods.id))
    .where(
      and(
        eq(expenses.clinicId, clinicId),
        gte(expenses.spentOn, range.from),
        lt(expenses.spentOn, range.to),
      ),
    )
    .orderBy(desc(expenses.spentOn), desc(expenses.createdAt));
}
