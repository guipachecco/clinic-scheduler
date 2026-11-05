import type { Metadata, Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/modules/auth/session";
import { getBusinessHours } from "@/modules/schedule/schedule";

import { BusinessHoursForm } from "./business-hours-form";

export const metadata: Metadata = { title: "Expediente" };

export default async function BusinessHoursPage() {
  const { clinicId } = await requireAdmin();
  const days = await getBusinessHours(clinicId);

  return (
    <div className="grid max-w-3xl gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Expediente
        </h1>
        <Button asChild variant="outline">
          <Link href={"/admin/expediente/bloqueios" as Route}>
            Bloqueios e feriados
          </Link>
        </Button>
      </header>
      <p className="text-sm text-muted-foreground">
        Informe os horários de atendimento de cada dia da semana. Um dia sem
        intervalos fica fechado.
      </p>
      <BusinessHoursForm initialDays={days} />
    </div>
  );
}
