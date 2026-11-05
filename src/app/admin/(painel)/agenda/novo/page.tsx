import { DateTime } from "luxon";
import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/modules/auth/session";
import { getPatient } from "@/modules/patients/patients";
import { CLINIC_TIME_ZONE } from "@/modules/schedule/time";
import { listActiveServices } from "@/modules/services/services";

import { AppointmentForm, type ServiceOption } from "../appointment-form";

export const metadata: Metadata = { title: "Novo agendamento" };

const INICIO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

// `inicio` (a clinic wall-clock time, from a calendar click) when valid,
// rounded down to the 5-minute step, else the next full hour.
function startDefaults(inicio: string | string[] | undefined) {
  if (typeof inicio === "string" && INICIO_PATTERN.test(inicio)) {
    const parsed = DateTime.fromISO(inicio, { zone: CLINIC_TIME_ZONE });
    if (parsed.isValid) {
      // The form takes 5-minute steps; 10:07 becomes 10:05.
      const local = parsed.minus({ minutes: parsed.minute % 5 });
      return {
        date: local.toFormat("yyyy-MM-dd"),
        startTime: local.toFormat("HH:mm"),
      };
    }
  }
  const next = DateTime.now()
    .setZone(CLINIC_TIME_ZONE)
    .plus({ hours: 1 })
    .startOf("hour");
  return {
    date: next.toFormat("yyyy-MM-dd"),
    startTime: next.toFormat("HH:mm"),
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// `paciente` (an opaque id, from the patient record) preselects the patient
// when it exists and is not anonymized. The name is resolved here.
async function initialPatient(
  clinicId: string,
  paciente: string | string[] | undefined,
) {
  if (typeof paciente !== "string" || !UUID_PATTERN.test(paciente)) {
    return null;
  }
  const patient = await getPatient(clinicId, paciente);
  if (!patient || patient.anonymizedAt) return null;
  return { id: patient.id, name: patient.name };
}

const toOption = ({
  id,
  name,
  categoryName,
  durationMinutes,
  isFlexible,
}: ServiceOption): ServiceOption => ({
  id,
  name,
  categoryName,
  durationMinutes,
  isFlexible,
});

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{
    inicio?: string | string[];
    paciente?: string | string[];
  }>;
}) {
  const { clinicId } = await requireAdmin();
  const [{ inicio, paciente }, services] = await Promise.all([
    searchParams,
    listActiveServices(clinicId),
  ]);
  const patient = await initialPatient(clinicId, paciente);

  return (
    <div className="grid max-w-3xl gap-6">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        Novo agendamento
      </h1>
      {services.length === 0 ? (
        <p className="rounded-lg border bg-card p-4 text-sm">
          Cadastre ao menos um serviço ativo para agendar.{" "}
          <Link
            href="/admin/servicos"
            className="font-semibold text-primary underline underline-offset-4"
          >
            Serviços
          </Link>
        </p>
      ) : (
        <AppointmentForm
          mode="create"
          services={services.map(toOption)}
          {...startDefaults(inicio)}
          initialPatient={patient}
        />
      )}
    </div>
  );
}
