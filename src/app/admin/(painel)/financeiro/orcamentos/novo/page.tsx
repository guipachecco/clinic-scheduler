import { DateTime } from "luxon";
import type { Metadata } from "next";

import { requireModule } from "@/modules/auth/session";
import { DEFAULT_QUOTE_VALIDITY_DAYS } from "@/modules/finance/fields";
import { getPatient } from "@/modules/patients/patients";
import { CLINIC_TIME_ZONE } from "@/modules/schedule/time";

import { FinanceTabs, PageTitle } from "../../ui";
import { QuoteForm } from "../quote-form";
import { quoteServiceOptions } from "../services";

export const metadata: Metadata = { title: "Novo orçamento" };

// `paciente` (an opaque id, from the patient record) preselects the patient.
export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ paciente?: string }>;
}) {
  const { clinicId } = await requireModule("finance");
  const { paciente } = await searchParams;
  const [services, patient] = await Promise.all([
    quoteServiceOptions(clinicId),
    typeof paciente === "string" ? getPatient(clinicId, paciente) : null,
  ]);
  const validUntil = DateTime.now()
    .setZone(CLINIC_TIME_ZONE)
    .plus({ days: DEFAULT_QUOTE_VALIDITY_DAYS })
    .toFormat("yyyy-MM-dd");

  return (
    <div className="grid max-w-4xl gap-6">
      <PageTitle title="Novo orçamento" />
      <FinanceTabs current="/admin/financeiro/orcamentos" />
      {services.length === 0 ? (
        <p className="rounded-lg border bg-card p-4 text-sm">
          Cadastre ao menos um serviço ativo para fazer orçamentos.
        </p>
      ) : (
        <QuoteForm
          services={services}
          quoteId={null}
          initialPatient={
            patient && !patient.anonymizedAt
              ? { id: patient.id, name: patient.name }
              : null
          }
          defaults={{
            validUntil,
            discount: "",
            notes: "",
            items: [
              { serviceId: "", sessions: "1", unitPrice: "", discount: "" },
            ],
          }}
        />
      )}
    </div>
  );
}
