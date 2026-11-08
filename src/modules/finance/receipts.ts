import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { inClinic } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import {
  appointments,
  auditLogs,
  installments,
  paymentMethods,
  patients,
  receipts,
  sales,
  services,
} from "@/db/schema";

import type { ReceiptValues } from "./fields";
import type { SaleResult } from "./sales";

// Money received outside a sale (docs/superpowers/specs/
// 2026-11-08-entradas-avulsas-design.md): "Receber" on an appointment and
// "Nova entrada" in the finance area. Nothing is deleted: a receipt is
// reversed with a reason, stays struck through and stops counting.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Appointments that can be received: the client came or is coming.
export const RECEIVABLE_STATUSES = ["confirmed", "completed"] as const;

const fail = (formError: string): SaleResult => ({ ok: false, formError });

export type AppointmentReceipt = {
  id: string;
  amountCents: number;
  methodName: string;
  receivedOn: string;
};

export type AppointmentBilling = {
  // A session of a package: paid through its installment, never a receipt.
  inPackage: boolean;
  // The receipt that counts, once she received it.
  receipt: AppointmentReceipt | null;
  // The service's price today, to prefill "Receber" (null when it has none).
  servicePriceCents: number | null;
};

// How an appointment is paid, for its page in the panel.
export async function getAppointmentBilling(
  clinicId: string,
  appointmentId: string,
): Promise<AppointmentBilling | null> {
  if (!UUID.test(appointmentId)) return null;
  return inClinic(clinicId, async (tx) => {
    const [appointment] = await tx
      .select({ serviceId: appointments.serviceId })
      .from(appointments)
      .where(
        and(
          eq(appointments.id, appointmentId),
          eq(appointments.clinicId, clinicId),
        ),
      );
    if (!appointment) return null;
    const [session] = await tx
      .select({ id: installments.id })
      .from(installments)
      .innerJoin(sales, eq(sales.id, installments.saleId))
      .where(
        and(
          eq(installments.clinicId, clinicId),
          eq(installments.appointmentId, appointmentId),
          isNull(installments.cancelledAt),
          isNull(sales.cancelledAt),
        ),
      )
      .limit(1);
    const [receipt] = await tx
      .select({
        id: receipts.id,
        amountCents: receipts.amountCents,
        methodName: paymentMethods.name,
        receivedOn: receipts.receivedOn,
      })
      .from(receipts)
      .innerJoin(
        paymentMethods,
        eq(paymentMethods.id, receipts.paymentMethodId),
      )
      .where(
        and(
          eq(receipts.clinicId, clinicId),
          eq(receipts.appointmentId, appointmentId),
          isNull(receipts.reversedAt),
        ),
      )
      .orderBy(desc(receipts.createdAt))
      .limit(1);
    const [service] = await tx
      .select({ priceCents: services.priceCents })
      .from(services)
      .where(
        and(
          eq(services.id, appointment.serviceId),
          eq(services.clinicId, clinicId),
        ),
      );
    return {
      inPackage: Boolean(session),
      receipt: receipt ?? null,
      servicePriceCents: service?.priceCents ?? null,
    };
  });
}

export async function createReceipt(
  clinicId: string,
  values: ReceiptValues,
  actorUserId: string,
): Promise<SaleResult> {
  try {
    return await inClinic(clinicId, async (tx): Promise<SaleResult> => {
      let description = values.description;
      let patientId = values.patientId;

      if (values.appointmentId) {
        // A session of a package paid per session is received on its
        // installment (paid or not), never twice.
        const [session] = await tx
          .select({ id: installments.id })
          .from(installments)
          .innerJoin(sales, eq(sales.id, installments.saleId))
          .where(
            and(
              eq(installments.clinicId, clinicId),
              eq(installments.appointmentId, values.appointmentId),
              isNull(installments.cancelledAt),
              isNull(sales.cancelledAt),
            ),
          )
          .limit(1);
        if (session) {
          return fail(
            "Este atendimento é sessão de um pacote: receba pela parcela dele.",
          );
        }
        const [appointment] = await tx
          .select({
            patientId: appointments.patientId,
            serviceName: appointments.serviceName,
            customLabel: appointments.customLabel,
            status: appointments.status,
          })
          .from(appointments)
          .where(
            and(
              eq(appointments.id, values.appointmentId),
              eq(appointments.clinicId, clinicId),
            ),
          )
          .for("update");
        if (!appointment) return fail("Atendimento não encontrado.");
        if (
          !(RECEIVABLE_STATUSES as readonly string[]).includes(
            appointment.status,
          )
        ) {
          return fail(
            "Só dá para receber um atendimento confirmado ou concluído.",
          );
        }
        // The appointment decides who and what was paid.
        patientId = appointment.patientId;
        description = (appointment.customLabel ?? appointment.serviceName)
          .trim()
          .slice(0, 80);
      } else if (!description) {
        return {
          ok: false,
          fieldErrors: { description: "Diga o que foi pago." },
        };
      }

      if (patientId) {
        const [patient] = await tx
          .select({ id: patients.id })
          .from(patients)
          .where(
            and(eq(patients.id, patientId), eq(patients.clinicId, clinicId)),
          );
        if (!patient) {
          return {
            ok: false,
            fieldErrors: { patientId: "Cliente não encontrada." },
          };
        }
      }

      const [method] = await tx
        .select({ id: paymentMethods.id })
        .from(paymentMethods)
        .where(
          and(
            eq(paymentMethods.id, values.paymentMethodId),
            eq(paymentMethods.clinicId, clinicId),
            eq(paymentMethods.isActive, true),
          ),
        );
      if (!method) {
        return {
          ok: false,
          fieldErrors: { paymentMethodId: "Escolha a forma de pagamento." },
        };
      }

      const [row] = await tx
        .insert(receipts)
        .values({
          clinicId,
          appointmentId: values.appointmentId,
          patientId,
          description,
          amountCents: values.amount,
          paymentMethodId: method.id,
          receivedOn: values.receivedOn,
          notes: values.notes,
          createdByUserId: actorUserId,
        })
        .returning({ id: receipts.id });
      await tx.insert(auditLogs).values({
        clinicId,
        actorType: "admin",
        actorUserId,
        action: "receipt.created",
        entityType: "receipt",
        entityId: row!.id,
        changes: {
          appointmentId: values.appointmentId,
          amountCents: values.amount,
          receivedOn: values.receivedOn,
        },
      });
      return { ok: true, id: row!.id };
    });
  } catch (error) {
    // Two "Receber" at once on the same appointment: one wins.
    if (isUniqueViolation(error)) {
      return fail("Este atendimento já foi recebido.");
    }
    throw error;
  }
}

// The receipt stays, struck through, and stops counting. The cash report
// shows the reversal on the day it was made. An appointment can be received
// again after its receipt is reversed.
export async function reverseReceipt(
  clinicId: string,
  receiptId: string,
  reason: string,
  actorUserId: string,
  now: Date = new Date(),
): Promise<SaleResult> {
  if (!UUID.test(receiptId)) return fail("Entrada não encontrada.");
  return inClinic(clinicId, async (tx): Promise<SaleResult> => {
    const [receipt] = await tx
      .select({
        id: receipts.id,
        reversedAt: receipts.reversedAt,
        amountCents: receipts.amountCents,
        appointmentId: receipts.appointmentId,
      })
      .from(receipts)
      .where(and(eq(receipts.id, receiptId), eq(receipts.clinicId, clinicId)))
      .for("update");
    if (!receipt) return fail("Entrada não encontrada.");
    if (receipt.reversedAt) return fail("Esta entrada já foi estornada.");
    await tx
      .update(receipts)
      .set({
        reversedAt: now,
        reversedByUserId: actorUserId,
        reversalReason: reason,
      })
      .where(eq(receipts.id, receiptId));
    await tx.insert(auditLogs).values({
      clinicId,
      actorType: "admin",
      actorUserId,
      action: "receipt.reversed",
      entityType: "receipt",
      entityId: receiptId,
      changes: {
        appointmentId: receipt.appointmentId,
        amountCents: receipt.amountCents,
      },
    });
    return { ok: true, id: receiptId };
  });
}
