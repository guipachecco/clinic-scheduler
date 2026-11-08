import type { Metadata } from "next";
import Link from "next/link";
import { DateTime } from "luxon";

import { ACTIVE_APPOINTMENT_STATUSES } from "@/db/schema";
import {
  listAppointmentsInRange,
  listRequestedFrom,
} from "@/modules/appointments/appointments";
import { requireAdmin } from "@/modules/auth/session";
import { getClinicTimezone } from "@/modules/clinic-page/panel";
import { getDayAgenda, getWeekMarks } from "@/modules/dashboard/dashboard";
import {
  getBusinessHours,
  getSlotStepMinutes,
  type DayHours,
} from "@/modules/schedule/schedule";
import { localDayRange, todayLocal } from "@/modules/schedule/time";
import { listActiveServices } from "@/modules/services/services";

import { AgendaCalendar, type BusinessHoursInterval } from "./agenda-calendar";
import { AgendaSidePanel, toRequestedListItems } from "./agenda-side-panel";
import { PhoneAgenda } from "./phone/phone-agenda";

export const metadata: Metadata = { title: "Agenda" };

// With no business hours set, the grid shows 07:00 to 20:00.
const DEFAULT_MIN_TIME = "07:00";
const DEFAULT_MAX_TIME = "20:00";

// "HH:MM" strings compare correctly as text.
function gridRange(days: DayHours[]) {
  const intervals = days.flatMap((day) => day.intervals);
  const starts = intervals.map((interval) => interval.start).sort();
  const ends = intervals.map((interval) => interval.end).sort();
  return {
    slotMinTime: starts[0] ?? DEFAULT_MIN_TIME,
    slotMaxTime: ends.at(-1) ?? DEFAULT_MAX_TIME,
  };
}

function toBusinessHours(days: DayHours[]): BusinessHoursInterval[] {
  return days.flatMap((day) =>
    day.intervals.map((interval) => ({
      daysOfWeek: [day.weekday],
      startTime: interval.start,
      endTime: interval.end,
    })),
  );
}

const isActive = (status: string) =>
  (ACTIVE_APPOINTMENT_STATUSES as readonly string[]).includes(status);

// `?dia` must be a real yyyy-mm-dd date; anything else means today.
function chosenDay(dia: string | string[] | undefined, today: string) {
  if (typeof dia !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return today;
  const parsed = DateTime.fromISO(dia, { zone: "utc" });
  return parsed.isValid && parsed.toISODate() === dia ? dia : today;
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string | string[] }>;
}) {
  const { clinicId } = await requireAdmin();
  const { dia } = await searchParams;
  const now = new Date();
  const zone = await getClinicTimezone(clinicId);
  const date = chosenDay(dia, todayLocal(zone));
  const monday = DateTime.fromISO(date, { zone }).startOf("week").toISODate()!;
  const today = todayLocal();
  const { startsAt, endsAt } = localDayRange(today, today);
  const [
    days,
    slotStepMinutes,
    services,
    requested,
    todayEvents,
    dayAgenda,
    marks,
  ] = await Promise.all([
    getBusinessHours(clinicId),
    getSlotStepMinutes(clinicId),
    listActiveServices(clinicId),
    listRequestedFrom(clinicId, now),
    listAppointmentsInRange(clinicId, {
      from: startsAt,
      to: endsAt,
      includeCancelled: false,
    }),
    getDayAgenda(clinicId, date, now),
    getWeekMarks(clinicId, monday, 7),
  ]);
  const hasServices = services.length > 0;

  const servicesNotice = hasServices ? null : (
    <p className="rounded-lg border bg-card p-4 text-sm">
      Cadastre ao menos um serviço ativo para agendar.{" "}
      <Link
        href="/admin/servicos"
        className="font-semibold text-primary underline underline-offset-4"
      >
        Serviços
      </Link>
    </p>
  );

  return (
    // data-layout="wide" lets the panel layout drop its narrow max width.
    <div data-layout="wide" className="grid gap-5">
      {/* Phone: the chosen day as a list. */}
      <div className="md:hidden">
        <PhoneAgenda
          agenda={dayAgenda}
          marks={marks}
          requested={toRequestedListItems(requested, now)}
          now={now}
          canCreate={hasServices}
        />
      </div>
      {/* Computer: the calendar with its side panel. */}
      <div className="hidden md:block">
        <AgendaCalendar
          {...gridRange(days)}
          slotStepMinutes={slotStepMinutes}
          businessHours={toBusinessHours(days)}
          canCreate={hasServices}
          notice={servicesNotice}
          aside={
            <AgendaSidePanel
              now={now}
              requested={requested}
              today={todayEvents.filter((event) => isActive(event.status))}
            />
          }
        />
      </div>
    </div>
  );
}
