import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, endPools } from "@/db/client";
import {
  appointments,
  auditLogs,
  patients,
  serviceCategories,
  services,
  timeBlocks,
  users,
} from "@/db/schema";
import { timeBlockSchema } from "@/modules/schedule/fields";
import {
  addNationalHolidays,
  createTimeBlock,
  deleteTimeBlock,
  findBlocksAndHours,
  getBusinessHours,
  listUpcomingBlocks,
  saveBusinessHours,
} from "@/modules/schedule/schedule";

import { CLINIC } from "../helpers/clinic";

// Every record here is fictitious and exists only during the test.

let actorId: string;
let patientId: string;
let serviceId: string;

const MINUTE = 60_000;
const NOW = new Date("2026-11-03T12:00:00Z");

function block(overrides: Record<string, unknown> = {}) {
  return timeBlockSchema.parse({
    type: "day_off",
    title: "Folga",
    allDay: "on",
    startDate: "2026-12-10",
    endDate: "2026-12-10",
    ...overrides,
  });
}

async function appointment(
  start: string,
  options: {
    minutes?: number;
    bufferAfter?: number;
    status?: "confirmed" | "cancelled";
  } = {},
) {
  const { minutes = 60, bufferAfter = 0, status = "confirmed" } = options;
  const startsAt = new Date(start);
  const endsAt = new Date(startsAt.getTime() + minutes * MINUTE);
  await db.insert(appointments).values({
    clinicId: CLINIC,
    patientId,
    serviceId,
    serviceName: "Serviço fictício",
    serviceDurationMinutes: minutes,
    startsAt,
    endsAt,
    occupiedFrom: startsAt,
    occupiedUntil: new Date(endsAt.getTime() + bufferAfter * MINUTE),
    source: "online",
    status,
    ...(status === "cancelled"
      ? { cancelledAt: new Date(), cancelledBy: "clinic" as const }
      : {}),
  });
}

beforeEach(async () => {
  await db.execute(
    sql`truncate table audit_logs, time_blocks, business_hours, appointments, patients, services, service_categories, users cascade`,
  );
  const [user] = await db
    .insert(users)
    .values({
      name: "Admin",
      email: "admin@example.com",
      role: "admin",
      clinicId: CLINIC,
    })
    .returning();
  actorId = user!.id;
  const [category] = await db
    .insert(serviceCategories)
    .values({
      clinicId: CLINIC,
      name: "Categoria fictícia",
      slug: "categoria-ficticia",
    })
    .returning();
  const [service] = await db
    .insert(services)
    .values({
      clinicId: CLINIC,
      categoryId: category!.id,
      name: "Serviço fictício",
      slug: "servico-ficticio",
      durationMinutes: 60,
    })
    .returning();
  const [patient] = await db
    .insert(patients)
    .values({
      clinicId: CLINIC,
      name: "Paciente Fictício",
      nameNormalized: "paciente ficticio",
      phone: "+5500000000000",
    })
    .returning();
  serviceId = service!.id;
  patientId = patient!.id;
});

afterAll(async () => {
  await endPools();
});

describe("business hours", () => {
  it("returns seven closed days when nothing is saved", async () => {
    const week = await getBusinessHours(CLINIC);
    expect(week.map((d) => d.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(week.every((d) => d.intervals.length === 0)).toBe(true);
  });

  it("round-trips the week and replaces it on a second save", async () => {
    await saveBusinessHours(
      CLINIC,
      {
        days: [
          {
            weekday: 1,
            intervals: [
              { start: "08:00", end: "12:00" },
              { start: "14:00", end: "18:00" },
            ],
          },
          { weekday: 2, intervals: [{ start: "09:00", end: "17:00" }] },
        ],
      },
      actorId,
    );
    const week = await getBusinessHours(CLINIC);
    expect(week[1]!.intervals).toEqual([
      { start: "08:00", end: "12:00" },
      { start: "14:00", end: "18:00" },
    ]);
    expect(week[2]!.intervals).toEqual([{ start: "09:00", end: "17:00" }]);
    expect(week[0]!.intervals).toEqual([]);

    await saveBusinessHours(
      CLINIC,
      { days: [{ weekday: 3, intervals: [{ start: "10:00", end: "11:00" }] }] },
      actorId,
    );
    const again = await getBusinessHours(CLINIC);
    expect(again[1]!.intervals).toEqual([]);
    expect(again[3]!.intervals).toEqual([{ start: "10:00", end: "11:00" }]);
  });

  it("writes no audit row when the week is unchanged", async () => {
    const week = {
      days: [{ weekday: 1, intervals: [{ start: "08:00", end: "12:00" }] }],
    };
    await saveBusinessHours(CLINIC, week, actorId);
    await db.delete(auditLogs);
    await saveBusinessHours(CLINIC, week, actorId);
    expect(await db.select().from(auditLogs)).toHaveLength(0);
  });

  it("audits only the changed weekdays, without times", async () => {
    await saveBusinessHours(
      CLINIC,
      { days: [{ weekday: 1, intervals: [{ start: "08:00", end: "12:00" }] }] },
      actorId,
    );
    await db.delete(auditLogs);
    await saveBusinessHours(
      CLINIC,
      {
        days: [
          { weekday: 1, intervals: [{ start: "08:00", end: "12:00" }] },
          { weekday: 5, intervals: [{ start: "08:00", end: "12:00" }] },
        ],
      },
      actorId,
    );
    const logs = await db.select().from(auditLogs);
    expect(logs).toHaveLength(1);
    expect(logs[0]!.action).toBe("business_hours.updated");
    expect(logs[0]!.changes).toEqual({ weekdays: [5] });
  });
});

describe("time blocks", () => {
  it("reports confirmed appointments in range and ignores cancelled", async () => {
    await appointment("2026-12-10T13:00:00Z");
    await appointment("2026-12-10T16:00:00Z", { status: "cancelled" });
    const r = await createTimeBlock(CLINIC, block(), actorId);
    expect(r.ok).toBe(true);
    expect(r.conflicts).toEqual(["10/12 10:00"]);
    expect(await db.select().from(timeBlocks)).toHaveLength(1);
  });

  it("counts an appointment whose occupied_until crosses into the block", async () => {
    // Starts 22:30 local on the 9th, ends 23:30; the buffer runs past
    // local midnight (03:00Z), into the block.
    await appointment("2026-12-10T01:30:00Z", { minutes: 60, bufferAfter: 60 });
    const r = await createTimeBlock(CLINIC, block(), actorId);
    expect(r.conflicts).toEqual(["09/12 22:30"]);
  });

  it("does not count appointments outside the range", async () => {
    await appointment("2026-12-11T13:00:00Z");
    const r = await createTimeBlock(CLINIC, block(), actorId);
    expect(r.conflicts).toEqual([]);
  });

  it("audits creation without the title", async () => {
    const r = await createTimeBlock(
      CLINIC,
      block({ title: "Segredo" }),
      actorId,
    );
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, r.id));
    expect(logs[0]!.action).toBe("time_block.created");
    expect(JSON.stringify(logs[0]!.changes ?? {})).not.toContain("Segredo");
  });

  it("deletes a future block and audits it", async () => {
    const r = await createTimeBlock(CLINIC, block(), actorId);
    expect(await deleteTimeBlock(CLINIC, r.id, actorId, NOW)).toEqual({
      ok: true,
    });
    expect(await db.select().from(timeBlocks)).toHaveLength(0);
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "time_block.deleted"));
    expect(logs).toHaveLength(1);
    expect(logs[0]!.entityId).toBe(r.id);
    expect(logs[0]!.changes).toBeNull();
  });

  it("refuses to delete an ongoing block", async () => {
    const r = await createTimeBlock(CLINIC, block(), actorId);
    const during = new Date("2026-12-10T15:00:00Z");
    expect(await deleteTimeBlock(CLINIC, r.id, actorId, during)).toEqual({
      ok: false,
      reason: "not_deletable",
    });
    expect(await db.select().from(timeBlocks)).toHaveLength(1);
  });

  it("returns not_found for unknown or malformed ids", async () => {
    expect(
      await deleteTimeBlock(
        CLINIC,
        "00000000-0000-4000-8000-000000000000",
        actorId,
        NOW,
      ),
    ).toEqual({ ok: false, reason: "not_found" });
    expect(await deleteTimeBlock(CLINIC, "nope", actorId, NOW)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("lists upcoming blocks, hiding ended ones and flagging deletable", async () => {
    await createTimeBlock(
      CLINIC,
      block({ startDate: "2026-10-01", endDate: "2026-10-01" }),
      actorId,
    );
    await createTimeBlock(
      CLINIC,
      block({ startDate: "2026-11-03", endDate: "2026-11-03" }),
      actorId,
    );
    await createTimeBlock(CLINIC, block(), actorId);
    const list = await listUpcomingBlocks(CLINIC, NOW);
    expect(list).toHaveLength(2);
    expect(list[0]!.deletable).toBe(false);
    expect(list[1]!.deletable).toBe(true);
  });
});

describe("national holidays", () => {
  it("creates ten, then none on a second run", async () => {
    expect(await addNationalHolidays(CLINIC, 2026, actorId)).toEqual({
      ok: true,
      created: 10,
    });
    expect(await addNationalHolidays(CLINIC, 2026, actorId)).toEqual({
      ok: true,
      created: 0,
    });
    const rows = await db.select().from(timeBlocks);
    expect(rows).toHaveLength(10);
    expect(rows.every((r) => r.type === "holiday" && r.allDay)).toBe(true);
  });

  it("audits the count and year, and skips the audit row when nothing is created", async () => {
    await addNationalHolidays(CLINIC, 2026, actorId);
    const first = await db.select().from(auditLogs);
    expect(first).toHaveLength(1);
    expect(first[0]!.action).toBe("time_block.holidays_added");
    expect(first[0]!.changes).toEqual({ count: 10, year: 2026 });

    await addNationalHolidays(CLINIC, 2026, actorId);
    expect(await db.select().from(auditLogs)).toHaveLength(1);
  });

  it("skips a date that already has a holiday block", async () => {
    await createTimeBlock(
      CLINIC,
      block({
        type: "holiday",
        title: "Natal da clínica",
        startDate: "2026-12-25",
        endDate: "2026-12-25",
      }),
      actorId,
    );
    expect(await addNationalHolidays(CLINIC, 2026, actorId)).toEqual({
      ok: true,
      created: 9,
    });
  });
});

describe("findBlocksAndHours", () => {
  it("returns blocks intersecting the range and the business hours", async () => {
    await saveBusinessHours(
      CLINIC,
      { days: [{ weekday: 1, intervals: [{ start: "08:00", end: "12:00" }] }] },
      actorId,
    );
    await createTimeBlock(CLINIC, block(), actorId);
    await createTimeBlock(
      CLINIC,
      block({ startDate: "2027-01-10", endDate: "2027-01-10" }),
      actorId,
    );
    const r = await findBlocksAndHours(CLINIC, {
      from: new Date("2026-12-09T00:00:00Z"),
      to: new Date("2026-12-12T00:00:00Z"),
    });
    expect(r.blocks).toHaveLength(1);
    expect(r.hours[1]!.intervals).toHaveLength(1);
  });
});
