import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { asClient, clientDb, inClinic } from "@/db/client";
import { db, endPools } from "@/db/owner";
import { findPgError } from "@/db/errors";
import {
  appointments,
  asaasAccounts,
  asaasDeposits,
  patients,
  serviceCategories,
  services,
} from "@/db/schema";

import { CLINIC, otherClinic } from "../helpers/clinic";

// Every record here is fictitious. The Asaas tables (migration 0036) belong to
// the panel of one clinic; clients never touch them.

let clinicB: string;
let patientA: string;
let apptA: string;
let apptA2: string;

async function pgCode(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return findPgError(error)?.code;
  }
  return undefined;
}

async function appointmentFor(patientId: string, startHour: number) {
  const [service] = await db.select().from(services).limit(1);
  const startsAt = new Date(Date.UTC(2027, 0, 10, startHour));
  const endsAt = new Date(startsAt.getTime() + 3600_000);
  const [row] = await db
    .insert(appointments)
    .values({
      clinicId: CLINIC,
      patientId,
      serviceId: service!.id,
      serviceName: service!.name,
      serviceDurationMinutes: 60,
      startsAt,
      endsAt,
      occupiedFrom: startsAt,
      occupiedUntil: endsAt,
      source: "admin",
    })
    .returning({ id: appointments.id });
  return row!.id;
}

function deposit(appointmentId: string, extra: Record<string, unknown> = {}) {
  return {
    clinicId: CLINIC,
    appointmentId,
    patientId: patientA,
    amountCents: 1500,
    expiresAt: new Date("2027-01-01T00:30:00Z"),
    ...extra,
  };
}

beforeEach(async () => {
  clinicB = await otherClinic();
  await db.execute(
    sql`truncate table asaas_deposits, asaas_customers, asaas_accounts, appointment_services, appointments, patients, services, service_categories cascade`,
  );
  const [category] = await db
    .insert(serviceCategories)
    .values({ clinicId: CLINIC, name: "Rosto", slug: "rosto" })
    .returning();
  await db.insert(services).values({
    clinicId: CLINIC,
    categoryId: category!.id,
    name: "Limpeza de pele",
    slug: "limpeza-de-pele",
    durationMinutes: 60,
    priceCents: 10000,
    priceDisplay: "fixed",
    isActive: true,
  });
  const [patient] = await db
    .insert(patients)
    .values({
      clinicId: CLINIC,
      name: "Bia Fictícia",
      nameNormalized: "bia ficticia",
      phone: "+5547999990003",
    })
    .returning();
  patientA = patient!.id;
  apptA = await appointmentFor(patientA, 10);
  apptA2 = await appointmentFor(patientA, 12);
});

afterAll(endPools);

describe("asaas tables", () => {
  it("app_panel of clinic A cannot read clinic B's asaas_accounts / deposits", async () => {
    await db.insert(asaasAccounts).values({
      clinicId: clinicB,
      accountId: "acc-b",
      walletId: "wallet-b",
      apiKeyEnc: "enc",
      status: "approved",
    });
    await db.insert(asaasAccounts).values({
      clinicId: CLINIC,
      accountId: "acc-a",
      walletId: "wallet-a",
      apiKeyEnc: "enc",
      status: "pending",
    });
    await db.insert(asaasDeposits).values(deposit(apptA));

    const seenA = await inClinic(CLINIC, (tx) =>
      tx.select().from(asaasAccounts),
    );
    expect(seenA.map((r) => r.accountId)).toEqual(["acc-a"]);
    const seenB = await inClinic(clinicB, async (tx) => ({
      accounts: await tx.select().from(asaasAccounts),
      deposits: await tx.select().from(asaasDeposits),
    }));
    expect(seenB.accounts.map((r) => r.accountId)).toEqual(["acc-b"]);
    expect(seenB.deposits).toEqual([]);
  });

  it("a wallet connects to one clinic only", async () => {
    await db.insert(asaasAccounts).values({
      clinicId: CLINIC,
      accountId: "acc-a",
      walletId: "wal-x",
      apiKeyEnc: "enc",
      status: "approved",
    });
    const code = await pgCode(
      db.insert(asaasAccounts).values({
        clinicId: clinicB,
        accountId: "acc-b",
        walletId: "wal-x",
        apiKeyEnc: "enc",
        status: "approved",
      }),
    );
    expect(code).toBe("23505");
  });

  it("accepts the disconnected status and no account id", async () => {
    await db.insert(asaasAccounts).values({
      clinicId: CLINIC,
      accountId: null,
      accountName: null,
      walletId: "wal-y",
      apiKeyEnc: "enc",
      status: "approved",
    });
    await db
      .update(asaasAccounts)
      .set({ status: "disconnected" })
      .where(sql`clinic_id = ${CLINIC}`);
    const [row] = await db.select().from(asaasAccounts);
    expect(row!.status).toBe("disconnected");
    expect(row!.accountId).toBeNull();
  });

  it("app_client has no access to asaas tables", async () => {
    for (const table of [
      "asaas_accounts",
      "asaas_customers",
      "asaas_deposits",
    ]) {
      const code = await pgCode(
        asClient(
          { clinicId: CLINIC, patientId: patientA, userId: patientA },
          (tx) => tx.execute(sql.raw(`select * from ${table}`)),
        ),
      );
      expect(code).toBe("42501");
    }
    expect(clientDb).toBeDefined();
  });

  it("asaas_deposit_clinic returns the clinic only for an existing deposit", async () => {
    const [row] = await db
      .insert(asaasDeposits)
      .values(deposit(apptA))
      .returning({ id: asaasDeposits.id });
    const lookup = (id: string) =>
      inClinic(clinicB, async (tx) => {
        const r = await tx.execute<{ c: string | null }>(
          sql`select asaas_deposit_clinic(${id}::uuid) as c`,
        );
        return r.rows[0]!.c;
      });
    expect(await lookup(row!.id)).toBe(CLINIC);
    expect(await lookup("00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("asaas SECURITY DEFINER functions pin search_path to public, pg_temp", async () => {
    const functions = await db.execute<{
      proname: string;
      secdef: boolean;
      config: string[] | null;
    }>(sql`
      select p.proname, p.prosecdef as secdef, p.proconfig as config
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('asaas_deposit_clinic', 'asaas_deposit_active')
      order by 1
    `);
    expect(functions.rows).toEqual([
      {
        proname: "asaas_deposit_active",
        secdef: true,
        config: ["search_path=public, pg_temp"],
      },
      {
        proname: "asaas_deposit_clinic",
        secdef: true,
        config: ["search_path=public, pg_temp"],
      },
    ]);
  });

  it("app_panel may move a deposit's and a customer's patient_id, and delete a customer", async () => {
    await db.insert(asaasDeposits).values(deposit(apptA));
    await inClinic(CLINIC, (tx) =>
      tx.execute(
        sql`update asaas_deposits set patient_id = patient_id, updated_at = now()`,
      ),
    );
    await inClinic(CLINIC, (tx) =>
      tx.execute(sql`delete from asaas_customers where false`),
    );
  });

  it("one deposit per appointment", async () => {
    await db.insert(asaasDeposits).values(deposit(apptA));
    expect(await pgCode(db.insert(asaasDeposits).values(deposit(apptA)))).toBe(
      "23505",
    );
    await db.insert(asaasDeposits).values(deposit(apptA2));
  });

  it("paid deposit requires payment_id", async () => {
    expect(
      await pgCode(
        db.insert(asaasDeposits).values(deposit(apptA, { status: "paid" })),
      ),
    ).toBe("23514");
  });

  it("app_panel may update only status columns of a deposit", async () => {
    await db.insert(asaasDeposits).values(deposit(apptA));
    const code = await pgCode(
      inClinic(CLINIC, (tx) =>
        tx.execute(sql`update asaas_deposits set amount_cents = 1`),
      ),
    );
    expect(code).toBe("42501");
    await inClinic(CLINIC, (tx) =>
      tx.execute(
        sql`update asaas_deposits set charge_id = 'pay_123', updated_at = now()`,
      ),
    );
    await inClinic(CLINIC, (tx) =>
      tx.execute(
        sql`update asaas_deposits set status = 'closed', close_reason = 'timeout', updated_at = now()`,
      ),
    );
  });

  it("pending deposit cannot carry a payment_id", async () => {
    expect(
      await pgCode(
        db.insert(asaasDeposits).values(
          deposit(apptA, {
            paymentId: "00000000-0000-4000-8000-000000000001",
          }),
        ),
      ),
    ).toBe("23514");
  });

  it("close_reason only with expired or closed", async () => {
    expect(
      await pgCode(
        db
          .insert(asaasDeposits)
          .values(deposit(apptA, { closeReason: "timeout" })),
      ),
    ).toBe("23514");
  });
});
