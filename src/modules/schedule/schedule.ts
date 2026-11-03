import "server-only";

import { and, asc, eq, gt, gte, inArray, lt, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  ACTIVE_APPOINTMENT_STATUSES,
  appointments,
  auditLogs,
  businessHours,
  timeBlocks,
} from "@/db/schema";

import type { BusinessHoursValues, TimeBlockValues } from "./fields";
import { nationalHolidays } from "./holidays";
import { formatLocal, localDayRange } from "./time";

// Data functions for business hours and time blocks. Times are local
// wall-clock for business hours and UTC instants for blocks. Block titles,
// appointment details and interval times never go to audit_logs or into error
// messages. The clinic time zone is the CLINIC_TIME_ZONE constant (see
// time.ts), not clinic_settings.timezone.

export type DayHours = {
  weekday: number;
  intervals: { start: string; end: string }[];
};

export type TimeBlockItem = {
  id: string;
  type: TimeBlockValues["type"];
  title: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  deletable: boolean;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Arbitrary constant so concurrent holiday runs serialize.
const HOLIDAYS_LOCK = 7_204_511;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Never lets driver details (which can echo values) out of this module.
function unexpected(message: string, error: unknown): Error {
  return new Error(message, { cause: error });
}

const SAVE_HOURS_FAILED = "Não foi possível salvar o expediente.";
const CREATE_BLOCK_FAILED = "Não foi possível criar o bloqueio.";
const DELETE_BLOCK_FAILED = "Não foi possível excluir o bloqueio.";
const HOLIDAYS_FAILED = "Não foi possível adicionar os feriados.";

const hhmm = (value: string) => value.slice(0, 5);

function emptyWeek(): DayHours[] {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    intervals: [],
  }));
}

async function readWeek(
  executor: Pick<Tx, "select"> = db,
): Promise<DayHours[]> {
  const rows = await executor
    .select()
    .from(businessHours)
    .orderBy(asc(businessHours.weekday), asc(businessHours.startTime));
  const week = emptyWeek();
  for (const row of rows) {
    week[row.weekday]?.intervals.push({
      start: hhmm(row.startTime),
      end: hhmm(row.endTime),
    });
  }
  return week;
}

// Always seven entries, Sunday (0) to Saturday (6). A day without intervals
// is closed.
export async function getBusinessHours(): Promise<DayHours[]> {
  return readWeek();
}

const sameDay = (a: DayHours, b: DayHours) =>
  JSON.stringify(a.intervals) === JSON.stringify(b.intervals);

// Replaces the whole week in one transaction. Weekdays missing from the
// input become closed. The audit entry lists only the changed weekdays.
export async function saveBusinessHours(
  values: BusinessHoursValues,
  actorUserId: string,
): Promise<{ ok: true }> {
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`lock table business_hours in exclusive mode`);
      const before = await readWeek(tx);
      const after = emptyWeek();
      for (const day of values.days) {
        after[day.weekday]!.intervals = day.intervals.map((i) => ({
          start: i.start,
          end: i.end,
        }));
      }

      const weekdays = after
        .filter((day, i) => !sameDay(day, before[i]!))
        .map((day) => day.weekday);

      await tx.delete(businessHours);
      const rows = after.flatMap((day) =>
        day.intervals.map((i) => ({
          weekday: day.weekday,
          startTime: i.start,
          endTime: i.end,
        })),
      );
      if (rows.length > 0) await tx.insert(businessHours).values(rows);

      if (weekdays.length > 0) {
        await tx.insert(auditLogs).values({
          actorType: "admin",
          actorUserId,
          action: "business_hours.updated",
          entityType: "business_hours",
          changes: { weekdays },
        });
      }
    });
    return { ok: true };
  } catch (error) {
    throw unexpected(SAVE_HOURS_FAILED, error);
  }
}

const blockColumns = {
  id: timeBlocks.id,
  type: timeBlocks.type,
  title: timeBlocks.title,
  startsAt: timeBlocks.startsAt,
  endsAt: timeBlocks.endsAt,
  allDay: timeBlocks.allDay,
};

// Blocks that end after `now`, ordered by start. Only blocks that start in
// the future can be deleted; past and ongoing ones stay as history.
export async function listUpcomingBlocks(
  now: Date = new Date(),
): Promise<TimeBlockItem[]> {
  const rows = await db
    .select(blockColumns)
    .from(timeBlocks)
    .where(gt(timeBlocks.endsAt, now))
    .orderBy(asc(timeBlocks.startsAt), asc(timeBlocks.id));
  return rows.map((row) => ({ ...row, deletable: row.startsAt > now }));
}

// Creating a block never cancels anything. Active appointments that overlap
// it are reported as local start times (dd/MM HH:mm), without patient data.
export async function createTimeBlock(
  values: TimeBlockValues,
  actorUserId: string,
): Promise<{ ok: true; id: string; conflicts: string[] }> {
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(timeBlocks)
        .values({ ...values, createdByUserId: actorUserId })
        .returning({ id: timeBlocks.id });

      const clashing = await tx
        .select({ startsAt: appointments.startsAt })
        .from(appointments)
        .where(
          and(
            inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
            lt(appointments.occupiedFrom, values.endsAt),
            gt(appointments.occupiedUntil, values.startsAt),
          ),
        )
        .orderBy(asc(appointments.startsAt));
      const conflicts = clashing.map((a) =>
        formatLocal(a.startsAt, "dd/MM HH:mm"),
      );

      await tx.insert(auditLogs).values({
        actorType: "admin",
        actorUserId,
        action: "time_block.created",
        entityType: "time_block",
        entityId: row!.id,
        changes: {
          type: values.type,
          allDay: values.allDay,
          conflicts: conflicts.length,
        },
      });
      return { ok: true as const, id: row!.id, conflicts };
    });
  } catch (error) {
    throw unexpected(CREATE_BLOCK_FAILED, error);
  }
}

export async function deleteTimeBlock(
  id: string,
  actorUserId: string,
  now: Date = new Date(),
): Promise<
  { ok: true } | { ok: false; reason: "not_found" | "not_deletable" }
> {
  if (!UUID_PATTERN.test(id)) return { ok: false, reason: "not_found" };
  try {
    return await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ startsAt: timeBlocks.startsAt })
        .from(timeBlocks)
        .where(eq(timeBlocks.id, id))
        .for("update");
      if (!current) return { ok: false as const, reason: "not_found" as const };
      if (current.startsAt <= now) {
        return { ok: false as const, reason: "not_deletable" as const };
      }
      await tx.delete(timeBlocks).where(eq(timeBlocks.id, id));
      await tx.insert(auditLogs).values({
        actorType: "admin",
        actorUserId,
        action: "time_block.deleted",
        entityType: "time_block",
        entityId: id,
      });
      return { ok: true as const };
    });
  } catch (error) {
    throw unexpected(DELETE_BLOCK_FAILED, error);
  }
}

// Creates the national holidays of `year` as all-day "holiday" blocks. A
// holiday is skipped when a holiday block already starts on that local date.
export async function addNationalHolidays(
  year: number,
  actorUserId: string,
): Promise<{ ok: true; created: number }> {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${HOLIDAYS_LOCK})`);
      let created = 0;
      for (const holiday of nationalHolidays(year)) {
        const { startsAt, endsAt } = localDayRange(holiday.date, holiday.date);
        const [existing] = await tx
          .select({ id: timeBlocks.id })
          .from(timeBlocks)
          .where(
            and(
              eq(timeBlocks.type, "holiday"),
              gte(timeBlocks.startsAt, startsAt),
              lt(timeBlocks.startsAt, endsAt),
            ),
          )
          .limit(1);
        if (existing) continue;
        await tx.insert(timeBlocks).values({
          type: "holiday",
          title: holiday.name,
          startsAt,
          endsAt,
          allDay: true,
          createdByUserId: actorUserId,
        });
        created += 1;
      }
      if (created > 0) {
        await tx.insert(auditLogs).values({
          actorType: "admin",
          actorUserId,
          action: "time_block.holidays_added",
          entityType: "time_block",
          changes: { count: created, year },
        });
      }
      return { ok: true as const, created };
    });
  } catch (error) {
    throw unexpected(HOLIDAYS_FAILED, error);
  }
}

// For the availability engine: blocks that intersect the range, plus the
// weekly business hours.
export async function findBlocksAndHours(
  range: {
    from: Date;
    to: Date;
  },
  now: Date = new Date(),
): Promise<{ blocks: TimeBlockItem[]; hours: DayHours[] }> {
  const rows = await db
    .select(blockColumns)
    .from(timeBlocks)
    .where(
      and(lt(timeBlocks.startsAt, range.to), gt(timeBlocks.endsAt, range.from)),
    )
    .orderBy(asc(timeBlocks.startsAt), asc(timeBlocks.id));
  return {
    blocks: rows.map((row) => ({ ...row, deletable: row.startsAt > now })),
    hours: await readWeek(),
  };
}
