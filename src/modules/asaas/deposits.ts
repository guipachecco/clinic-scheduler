import "server-only";

import { and, eq, gt, lte } from "drizzle-orm";
import { DateTime } from "luxon";

import { inClinic, type Tx } from "@/db/client";
import {
  appointments,
  asaasAccounts,
  asaasCustomers,
  asaasDeposits,
  auditLogs,
  clinics,
  services,
} from "@/db/schema";
import { logger } from "@/lib/logger";
import { lockAgenda } from "@/modules/appointments/appointments";

import { accountApiKey, asaasEnabled, depositApiKey } from "./accounts";
import {
  AsaasError,
  createCustomer,
  createPixPayment,
  deletePayment,
  type Fetch,
  getPixQrCode,
} from "./api";
import {
  type DepositStatus,
  depositFor,
  HOLD_MINUTES,
  isValidCpfCnpj,
} from "./rules";

// The Pix deposit of an online booking. Everything here runs as app_panel
// (inClinic): the client role has no access to the Asaas tables. The CPF is
// sent to Asaas once, when the patient's Asaas customer is created; only its
// last 4 digits are kept, and it never goes to a log or the audit trail. The
// QR image goes only to the patient who owns the deposit.

export type DepositView = {
  status: DepositStatus;
  amountCents: number;
  expiresAt: Date;
  pixPayload: string | null;
  qrImageBase64: string | null;
};

export type DepositQuote = {
  amountCents: number;
  needsCpf: boolean;
  cpfLast4: string | null;
};

export type StartFailure = "transient" | "permanent" | "cpf_invalid";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MINUTE = 60_000;

// Asaas codes that will not pass by trying again: the subaccount cannot take
// Pix charges (not approved, evaluation limit, blocked). Seen in the sandbox:
// invalid_billingType, invalid_action. Add others as they show up.
const PERMANENT_CODES = new Set(["invalid_billingType", "invalid_action"]);

// What a failed Asaas call means for the booking. 401/403 (key revoked,
// account blocked) count as permanent too.
export function classifyFailure(error: unknown): StartFailure {
  if (!(error instanceof AsaasError)) return "transient";
  if (error.status === 401 || error.status === 403) return "permanent";
  if (error.status !== 400) return "transient";
  if (error.codes.some((code) => PERMANENT_CODES.has(code))) {
    return "permanent";
  }
  if (error.codes.some((code) => /cpf|cnpj/i.test(code))) return "cpf_invalid";
  return "transient";
}

function failureCode(error: unknown): string {
  if (error instanceof AsaasError) {
    return error.codes[0] ?? `http_${error.status}`;
  }
  return "charge_failed";
}

const onlyDigits = (value: string) => value.replace(/\D/g, "");

// True when the CPF (or CNPJ) given at booking is valid, punctuation aside.
export function validCpf(cpf: string): boolean {
  return isValidCpfCnpj(onlyDigits(cpf));
}

// The deposit this booking would take, or null when it takes none: Asaas off,
// the clinic's deposit not active, or a service without a price.
export async function depositQuote(
  clinicId: string,
  serviceId: string,
  patientId: string,
): Promise<DepositQuote | null> {
  if (!asaasEnabled()) return null;
  if (!UUID_PATTERN.test(serviceId) || !UUID_PATTERN.test(patientId)) {
    return null;
  }
  return inClinic(clinicId, async (tx) => {
    const [account] = await tx
      .select({
        status: asaasAccounts.status,
        pixKeyReady: asaasAccounts.pixKeyReady,
        depositEnabled: asaasAccounts.depositEnabled,
      })
      .from(asaasAccounts)
      .where(eq(asaasAccounts.clinicId, clinicId));
    if (
      account?.status !== "approved" ||
      !account.pixKeyReady ||
      !account.depositEnabled
    ) {
      return null;
    }
    const [service] = await tx
      .select({
        priceCents: services.priceCents,
        priceDisplay: services.priceDisplay,
      })
      .from(services)
      .where(and(eq(services.id, serviceId), eq(services.clinicId, clinicId)));
    if (!service) return null;
    const amountCents = depositFor(service);
    if (amountCents === null) return null;
    const [customer] = await tx
      .select({ last4: asaasCustomers.cpfCnpjLast4 })
      .from(asaasCustomers)
      .where(
        and(
          eq(asaasCustomers.clinicId, clinicId),
          eq(asaasCustomers.patientId, patientId),
        ),
      );
    return {
      amountCents,
      needsCpf: !customer,
      cpfLast4: customer?.last4 ?? null,
    };
  });
}

// Cancels a held appointment as the system. Only a 'requested' one: anything
// the owner already decided stays as it is. Returns whether it changed.
async function cancelHold(
  tx: Tx,
  clinicId: string,
  appointmentId: string,
  now: Date,
  code: string,
): Promise<boolean> {
  const changed = await tx
    .update(appointments)
    .set({
      status: "cancelled",
      cancelledAt: now,
      cancelledBy: "system",
      cancellationReason: "other",
    })
    .where(
      and(
        eq(appointments.id, appointmentId),
        eq(appointments.clinicId, clinicId),
        eq(appointments.status, "requested"),
      ),
    )
    .returning({ id: appointments.id });
  if (changed.length === 0) return false;
  await tx.insert(auditLogs).values({
    clinicId,
    actorType: "system",
    action: "appointment.status_changed",
    entityType: "appointment",
    entityId: appointmentId,
    changes: { from: "requested", to: "cancelled", reason: code },
  });
  return true;
}

// Expires the deposits whose hold ran out: the appointment is cancelled and
// the slot freed, then the charge is cancelled at Asaas (a failure there is
// ignored: a late payment is refunded by the webhook). Returns how many
// expired. Runs under the agenda lock, before any booking transaction.
export async function sweepExpiredDeposits(
  clinicId: string,
  now: Date = new Date(),
  fetchImpl: Fetch = fetch,
): Promise<number> {
  if (!asaasEnabled() || !UUID_PATTERN.test(clinicId)) return 0;
  // A cheap look first: the agenda lock is taken only when something is due,
  // so listing free slots does not queue behind other bookings.
  const [anyDue] = await inClinic(clinicId, (tx) =>
    tx
      .select({ id: asaasDeposits.id })
      .from(asaasDeposits)
      .where(
        and(
          eq(asaasDeposits.clinicId, clinicId),
          eq(asaasDeposits.status, "pending"),
          lte(asaasDeposits.expiresAt, now),
        ),
      )
      .limit(1),
  );
  if (!anyDue) return 0;
  const charges = await inClinic(clinicId, async (tx) => {
    await lockAgenda(tx, clinicId);
    const due = await tx
      .select({
        id: asaasDeposits.id,
        appointmentId: asaasDeposits.appointmentId,
        chargeId: asaasDeposits.chargeId,
        appointmentStatus: appointments.status,
      })
      .from(asaasDeposits)
      .innerJoin(
        appointments,
        and(
          eq(appointments.clinicId, asaasDeposits.clinicId),
          eq(appointments.id, asaasDeposits.appointmentId),
        ),
      )
      .where(
        and(
          eq(asaasDeposits.clinicId, clinicId),
          eq(asaasDeposits.status, "pending"),
          lte(asaasDeposits.expiresAt, now),
        ),
      )
      .for("update", { of: asaasDeposits });
    for (const deposit of due) {
      const held = deposit.appointmentStatus === "requested";
      if (held) {
        await cancelHold(
          tx,
          clinicId,
          deposit.appointmentId,
          now,
          "deposit_timeout",
        );
      }
      // An appointment the owner already cancelled or confirmed is not a
      // timeout: a late payment for it is refunded, never confirmed.
      await tx
        .update(asaasDeposits)
        .set(
          held
            ? { status: "expired", closeReason: "timeout", updatedAt: now }
            : {
                status: "closed",
                closeReason:
                  deposit.appointmentStatus === "cancelled"
                    ? "clinic_cancelled"
                    : "manual_confirm",
                updatedAt: now,
              },
        )
        .where(eq(asaasDeposits.id, deposit.id));
    }
    return due.map((deposit) => deposit.chargeId);
  });

  const ids = charges.filter((id): id is string => id !== null);
  if (ids.length > 0) {
    try {
      const apiKey = await accountApiKey(clinicId);
      if (apiKey) {
        for (const id of ids) {
          try {
            await deletePayment(apiKey, id, fetchImpl);
          } catch (error) {
            logger.warn("asaas: cobrança vencida não cancelada", {
              clinicId,
              code: failureCode(error),
            });
          }
        }
      }
    } catch {
      // The local expiry already happened; Asaas is best effort here.
    }
  }
  return charges.length;
}

function view(
  row: { status: DepositStatus; amountCents: number; expiresAt: Date },
  qr: { payload: string; encodedImage: string } | null,
  now: Date,
): DepositView {
  const lapsed = row.status === "pending" && row.expiresAt <= now;
  return {
    status: lapsed ? "expired" : row.status,
    amountCents: row.amountCents,
    expiresAt: row.expiresAt,
    pixPayload: qr?.payload ?? null,
    qrImageBase64: qr?.encodedImage ?? null,
  };
}

async function readQr(
  clinicId: string,
  chargeId: string,
  fetchImpl: Fetch,
): Promise<{ payload: string; encodedImage: string } | null> {
  try {
    const apiKey = await accountApiKey(clinicId);
    if (!apiKey) return null;
    return await getPixQrCode(apiKey, chargeId, fetchImpl);
  } catch (error) {
    logger.warn("asaas: QR do Pix indisponível", {
      clinicId,
      code: failureCode(error),
    });
    return null;
  }
}

async function closeFailed(clinicId: string, depositId: string, now: Date) {
  await inClinic(clinicId, (tx) =>
    tx
      .update(asaasDeposits)
      .set({ status: "closed", closeReason: "charge_failed", updatedAt: now })
      .where(
        and(
          eq(asaasDeposits.id, depositId),
          eq(asaasDeposits.clinicId, clinicId),
          eq(asaasDeposits.status, "pending"),
        ),
      ),
  );
}

// The patient's Asaas customer in this clinic, created once. The CPF goes to
// Asaas only; the row keeps its last 4 digits.
async function ensureCustomer(
  clinicId: string,
  apiKey: string,
  input: { patientId: string; patientName: string; cpf?: string },
  fetchImpl: Fetch,
): Promise<{ ok: true; customerId: string } | { ok: false; error: unknown }> {
  const existing = async () => {
    const [row] = await inClinic(clinicId, (tx) =>
      tx
        .select({ customerId: asaasCustomers.customerId })
        .from(asaasCustomers)
        .where(
          and(
            eq(asaasCustomers.clinicId, clinicId),
            eq(asaasCustomers.patientId, input.patientId),
          ),
        ),
    );
    return row?.customerId ?? null;
  };
  const found = await existing();
  if (found) return { ok: true, customerId: found };

  const digits = onlyDigits(input.cpf ?? "");
  if (!isValidCpfCnpj(digits)) {
    return {
      ok: false,
      error: new AsaasError("CPF inválido.", 400, ["invalid_cpfCnpj"]),
    };
  }
  let created: { id: string };
  try {
    created = await createCustomer(
      apiKey,
      {
        name: input.patientName,
        cpfCnpj: digits,
        externalReference: input.patientId,
      },
      fetchImpl,
    );
  } catch (error) {
    return { ok: false, error };
  }
  await inClinic(clinicId, (tx) =>
    tx
      .insert(asaasCustomers)
      .values({
        clinicId,
        patientId: input.patientId,
        customerId: created.id,
        cpfCnpjLast4: digits.slice(-4),
      })
      .onConflictDoNothing({
        target: [asaasCustomers.clinicId, asaasCustomers.patientId],
      }),
  );
  // A concurrent first booking may have saved its own customer: use that one.
  return { ok: true, customerId: (await existing()) ?? created.id };
}

// Opens the deposit of a held appointment: the pending row first (its id is
// the charge's externalReference), then the Asaas customer, the Pix charge
// and its QR. A second call for the same appointment reuses the pending
// deposit instead of charging twice. On failure the row is closed
// ("charge_failed") and the caller undoes or confirms the booking.
export async function startDeposit(
  clinicId: string,
  input: {
    appointmentId: string;
    patientId: string;
    patientName: string;
    serviceName: string;
    amountCents: number;
    cpf?: string;
  },
  now: Date = new Date(),
  fetchImpl: Fetch = fetch,
): Promise<
  | { ok: true; deposit: DepositView }
  | { ok: false; reason: StartFailure; code: string }
> {
  const apiKey = await depositApiKey(clinicId);
  if (!apiKey) return { ok: false, reason: "transient", code: "inactive" };

  const opened = await inClinic(clinicId, async (tx) => {
    const [inserted] = await tx
      .insert(asaasDeposits)
      .values({
        clinicId,
        appointmentId: input.appointmentId,
        patientId: input.patientId,
        amountCents: input.amountCents,
        status: "pending",
        expiresAt: new Date(now.getTime() + HOLD_MINUTES * MINUTE),
      })
      .onConflictDoNothing({ target: asaasDeposits.appointmentId })
      .returning();
    if (inserted) return { row: inserted, fresh: true };
    const [current] = await tx
      .select()
      .from(asaasDeposits)
      .where(
        and(
          eq(asaasDeposits.clinicId, clinicId),
          eq(asaasDeposits.appointmentId, input.appointmentId),
        ),
      );
    return { row: current!, fresh: false };
  });

  if (!opened.fresh) {
    const { row } = opened;
    if (row.status === "pending" && row.chargeId && row.expiresAt > now) {
      const qr = await readQr(clinicId, row.chargeId, fetchImpl);
      return { ok: true, deposit: view(row, qr, now) };
    }
    return { ok: false, reason: "transient", code: "deposit_closed" };
  }

  const deposit = opened.row;
  const fail = async (error: unknown) => {
    await closeFailed(clinicId, deposit.id, now);
    return {
      ok: false as const,
      reason: classifyFailure(error),
      code: failureCode(error),
    };
  };

  const customer = await ensureCustomer(clinicId, apiKey, input, fetchImpl);
  if (!customer.ok) return fail(customer.error);

  const [clinic] = await inClinic(clinicId, (tx) =>
    tx
      .select({ timezone: clinics.timezone })
      .from(clinics)
      .where(eq(clinics.id, clinicId)),
  );
  const dueDate = DateTime.fromJSDate(now, {
    zone: clinic?.timezone ?? "America/Sao_Paulo",
  }).toFormat("yyyy-MM-dd");

  let chargeId: string;
  try {
    const charge = await createPixPayment(
      apiKey,
      {
        customer: customer.customerId,
        valueCents: input.amountCents,
        dueDate,
        externalReference: deposit.id,
        description: `Sinal · ${input.serviceName}`,
      },
      fetchImpl,
    );
    chargeId = charge.id;
  } catch (error) {
    return fail(error);
  }

  await inClinic(clinicId, (tx) =>
    tx
      .update(asaasDeposits)
      .set({ chargeId, updatedAt: now })
      .where(
        and(
          eq(asaasDeposits.id, deposit.id),
          eq(asaasDeposits.clinicId, clinicId),
        ),
      ),
  );
  const qr = await readQr(clinicId, chargeId, fetchImpl);
  return { ok: true, deposit: view(deposit, qr, now) };
}

// The deposit of one of her appointments, or null when it is not hers (or
// has none). The QR is read from Asaas only when asked and still pending.
export async function getDepositView(
  clinicId: string,
  appointmentId: string,
  patientId: string,
  withQr = false,
  fetchImpl: Fetch = fetch,
): Promise<DepositView | null> {
  if (
    !asaasEnabled() ||
    !UUID_PATTERN.test(clinicId) ||
    !UUID_PATTERN.test(appointmentId) ||
    !UUID_PATTERN.test(patientId)
  ) {
    return null;
  }
  const [row] = await inClinic(clinicId, (tx) =>
    tx
      .select({
        status: asaasDeposits.status,
        amountCents: asaasDeposits.amountCents,
        expiresAt: asaasDeposits.expiresAt,
        chargeId: asaasDeposits.chargeId,
      })
      .from(asaasDeposits)
      .where(
        and(
          eq(asaasDeposits.clinicId, clinicId),
          eq(asaasDeposits.appointmentId, appointmentId),
          eq(asaasDeposits.patientId, patientId),
        ),
      ),
  );
  if (!row) return null;
  const now = new Date();
  const showQr =
    withQr && row.status === "pending" && row.expiresAt > now && row.chargeId;
  const qr = showQr ? await readQr(clinicId, row.chargeId!, fetchImpl) : null;
  return view(row, qr, now);
}

// Her held appointment for this service and start, with a deposit still
// pending: a second click on the same slot gets it back instead of "taken".
export async function findPendingHold(
  clinicId: string,
  patientId: string,
  serviceId: string,
  startsAt: Date,
  now: Date = new Date(),
): Promise<string | null> {
  if (!asaasEnabled() || !UUID_PATTERN.test(serviceId)) return null;
  const [row] = await inClinic(clinicId, (tx) =>
    tx
      .select({ id: appointments.id })
      .from(asaasDeposits)
      .innerJoin(
        appointments,
        and(
          eq(appointments.clinicId, asaasDeposits.clinicId),
          eq(appointments.id, asaasDeposits.appointmentId),
        ),
      )
      .where(
        and(
          eq(asaasDeposits.clinicId, clinicId),
          eq(asaasDeposits.patientId, patientId),
          eq(asaasDeposits.status, "pending"),
          gt(asaasDeposits.expiresAt, now),
          eq(appointments.patientId, patientId),
          eq(appointments.serviceId, serviceId),
          eq(appointments.startsAt, startsAt),
          eq(appointments.status, "requested"),
        ),
      ),
  );
  return row?.id ?? null;
}

// Undoes a booking whose deposit could not be opened.
export async function undoHold(
  clinicId: string,
  appointmentId: string,
  now: Date = new Date(),
): Promise<void> {
  await inClinic(clinicId, async (tx) => {
    await lockAgenda(tx, clinicId);
    await cancelHold(tx, clinicId, appointmentId, now, "deposit_failed");
  });
}

// Asaas refused for a reason that will not pass: the booking goes ahead
// without a deposit, as before the clinic turned it on.
export async function confirmWithoutDeposit(
  clinicId: string,
  appointmentId: string,
  now: Date = new Date(),
): Promise<void> {
  await inClinic(clinicId, async (tx) => {
    await lockAgenda(tx, clinicId);
    const changed = await tx
      .update(appointments)
      .set({ status: "confirmed", confirmedAt: now })
      .where(
        and(
          eq(appointments.id, appointmentId),
          eq(appointments.clinicId, clinicId),
          eq(appointments.status, "requested"),
        ),
      )
      .returning({ id: appointments.id });
    if (changed.length === 0) return;
    await tx.insert(auditLogs).values({
      clinicId,
      actorType: "system",
      action: "appointment.status_changed",
      entityType: "appointment",
      entityId: appointmentId,
      changes: {
        from: "requested",
        to: "confirmed",
        reason: "deposit_refused",
      },
    });
  });
}
