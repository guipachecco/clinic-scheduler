import type { Metadata } from "next";
import Link from "next/link";

import { ACTIVE_APPOINTMENT_STATUSES } from "@/db/schema";
import {
  listAppointmentsInRange,
  listRequestedFrom,
} from "@/modules/appointments/appointments";
import { asaasEnabled, getAccountView } from "@/modules/asaas/accounts";
import { sweepBeforePanel } from "@/modules/asaas/deposits";
import { requireAdmin } from "@/modules/auth/session";
import { listActiveProfessionals } from "@/modules/professionals/professionals";
import {
  getBusinessHours,
  getSlotStepMinutes,
  type DayHours,
} from "@/modules/schedule/schedule";
import { localDayRange, todayLocal } from "@/modules/schedule/time";
import { listActiveServices } from "@/modules/services/services";

import { AgendaCalendar, type BusinessHoursInterval } from "./agenda-calendar";
import { AgendaSidePanel } from "./agenda-side-panel";

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

export default async function AgendaPage() {
  const { clinicId } = await requireAdmin();
  const now = new Date();
  const today = todayLocal();
  const { startsAt, endsAt } = localDayRange(today, today);
  // Expired Pix holds free their slots before the agenda is read.
  await sweepBeforePanel(clinicId);
  const [
    days,
    slotStepMinutes,
    services,
    requested,
    todayEvents,
    professionals,
  ] = await Promise.all([
    getBusinessHours(clinicId),
    getSlotStepMinutes(clinicId),
    listActiveServices(clinicId),
    listRequestedFrom(clinicId, now),
    listAppointmentsInRange(
      clinicId,
      { from: startsAt, to: endsAt, includeCancelled: false },
      now,
    ),
    listActiveProfessionals(clinicId),
  ]);
  const asaasView = asaasEnabled() ? await getAccountView(clinicId) : null;
  const asaasDisconnected = asaasView?.status === "disconnected";
  const asaasError = asaasView?.lastError ?? null;
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

  // Stays until Asaas accepts a charge again (lastError back to null).
  const asaasNotice = asaasDisconnected ? (
    <p
      role="status"
      className="rounded-lg border border-destructive/40 bg-card p-4 text-sm text-destructive"
    >
      Sua conta do Asaas desconectou. O sinal foi desligado e as marcações
      seguem sem sinal. Gere uma chave nova no Asaas e cole aqui.{" "}
      <Link
        href="/admin/financeiro/sinal-pix"
        className="font-semibold text-primary underline underline-offset-4"
      >
        Conectar conta
      </Link>
    </p>
  ) : asaasError ? (
    <p
      role="status"
      className="rounded-lg border border-destructive/40 bg-card p-4 text-sm text-destructive"
    >
      O Asaas recusou o sinal: {asaasError}. Os agendamentos online estão
      entrando sem sinal.{" "}
      <Link
        href="/admin/financeiro/sinal-pix"
        className="font-semibold text-primary underline underline-offset-4"
      >
        Ver recebimentos
      </Link>
    </p>
  ) : null;

  return (
    // data-layout="wide" lets the panel layout drop its narrow max width.
    // Computers open on the week, phones on the day's time grid.
    <div data-layout="wide" className="grid gap-5">
      <AgendaCalendar
        {...gridRange(days)}
        slotStepMinutes={slotStepMinutes}
        businessHours={toBusinessHours(days)}
        canCreate={hasServices}
        showProfessional={professionals.length > 1}
        notice={
          asaasNotice || servicesNotice ? (
            <div className="grid gap-3">
              {asaasNotice}
              {servicesNotice}
            </div>
          ) : null
        }
        aside={
          <AgendaSidePanel
            now={now}
            requested={requested}
            today={todayEvents.filter((event) => isActive(event.status))}
          />
        }
      />
    </div>
  );
}
