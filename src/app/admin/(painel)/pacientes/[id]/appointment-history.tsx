import type { Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  listPatientAppointments,
  type PatientAppointmentItem,
} from "@/modules/appointments/appointments";
import { requireAdmin } from "@/modules/auth/session";
import { formatLocal } from "@/modules/schedule/time";

import { StatusBadge } from "../../agenda/status-badge";

function AppointmentList({
  items,
  empty,
}: {
  items: PatientAppointmentItem[];
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`/admin/agenda/${item.id}` as Route}
            className="grid gap-2 rounded-lg border bg-card px-4 py-3 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-4"
          >
            <span className="font-medium">
              {formatLocal(item.startsAt, "dd/MM/yyyy")}{" "}
              {formatLocal(item.startsAt, "HH:mm")}
            </span>
            <span>{item.customLabel ?? item.serviceName}</span>
            <StatusBadge status={item.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

// The next and the latest appointments. Anonymized patients keep their
// history but cannot get new appointments.
export async function AppointmentHistory({
  patientId,
  canSchedule,
}: {
  patientId: string;
  canSchedule: boolean;
}) {
  const { clinicId } = await requireAdmin();
  const { upcoming, past } = await listPatientAppointments(clinicId, patientId);
  return (
    <section aria-labelledby="atendimentos" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="atendimentos" className="font-heading text-lg font-bold">
          Atendimentos
        </h2>
        {canSchedule ? (
          <Button asChild variant="outline">
            {/* An opaque id, as in this record's own URL. */}
            <Link href={`/admin/agenda/novo?paciente=${patientId}` as Route}>
              Novo agendamento
            </Link>
          </Button>
        ) : null}
      </div>
      <div className="grid gap-2">
        <h3 className="font-medium">Próximos</h3>
        <AppointmentList items={upcoming} empty="Nenhum atendimento futuro." />
      </div>
      <div className="grid gap-2">
        <h3 className="font-medium">Anteriores</h3>
        <AppointmentList items={past} empty="Nenhum atendimento anterior." />
      </div>
    </section>
  );
}
