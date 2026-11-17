import type { Metadata, Route } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { requireRoot } from "@/modules/auth/session";
import { listClinics } from "@/modules/clinics/clinics";
import {
  CLINIC_MODULE_LABELS,
  CLINIC_MODULES,
  type ClinicModule,
} from "@/modules/clinics/modules";
import { getClinicUsage } from "@/modules/platform/monitoring";

import { ModuleSwitch } from "./module-switch";

export const metadata: Metadata = { title: "Recursos" };

// What each optional module turns on, in a few words.
const MODULE_HINTS: Record<ClinicModule, string> = {
  products: "Produtos e estoque",
  finance: "Vendas, caixa, orçamentos e despesas",
  online_booking: "Clientes marcam pela página",
  loyalty: "Cartão fidelidade",
  anamnesis: "Fichas de anamnese (precisa de modelo)",
  reviews: "Avaliações na página",
};

// Every clinic has these; they are not switches.
const BASE_FEATURES = [
  "Agenda",
  "Clientes",
  "Serviços",
  "Expediente",
  "Equipe",
  "Minha página",
];

function Flag({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold",
        on
          ? "bg-status-confirmed text-status-confirmed-foreground"
          : "bg-muted text-muted-foreground",
      )}
    >
      <span aria-hidden="true">{on ? "●" : "○"}</span>
      {label}
    </span>
  );
}

// Root only: which modules each clinic has, switched in place, plus the
// connections that depend on the owner (payments, anamnesis model).
export default async function ResourcesPage() {
  await requireRoot();
  const [clinics, usage] = await Promise.all([listClinics(), getClinicUsage()]);
  const moduleTotals = Object.fromEntries(
    CLINIC_MODULES.map((key) => [
      key,
      clinics.filter((clinic) => clinic.modules.includes(key)).length,
    ]),
  ) as Record<ClinicModule, number>;

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        title="Recursos"
        eyebrow={`${clinics.length} ${clinics.length === 1 ? "clínica" : "clínicas"}`}
      >
        <Link
          href={"/admin/clinicas" as Route}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-brand underline-offset-4 hover:underline dark:text-foreground"
        >
          Nova clínica
        </Link>
      </PageHeader>

      <p className="max-w-3xl text-muted-foreground">
        Ligue ou desligue os módulos de cada clínica. Desligar não apaga nada: o
        menu e as telas somem, e os dados voltam quando o módulo é ligado de
        novo. Toda clínica tem sempre{" "}
        <span className="font-medium text-foreground">
          {BASE_FEATURES.join(", ")}
        </span>
        .
      </p>

      {/* Totals per module: how many clinics have each one. */}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {CLINIC_MODULES.map((key) => (
          <li
            key={key}
            className="grid min-w-0 gap-0.5 rounded-2xl border bg-card px-3 py-2.5 shadow-xs"
          >
            <span className="font-heading text-xl font-extrabold">
              {moduleTotals[key]}
              <span className="text-sm font-semibold text-muted-foreground">
                /{clinics.length}
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              {CLINIC_MODULE_LABELS[key]}
            </span>
          </li>
        ))}
      </ul>

      {clinics.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhuma clínica ainda.
        </p>
      ) : null}

      {/* Computer: one row per clinic, one column per module. */}
      <div className="hidden overflow-hidden rounded-2xl border bg-card shadow-xs lg:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Módulos de cada clínica</caption>
          <thead className="bg-brand text-brand-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-semibold">
                Clínica
              </th>
              {CLINIC_MODULES.map((key) => (
                <th
                  key={key}
                  scope="col"
                  className="px-2 py-3 text-center font-semibold"
                  title={MODULE_HINTS[key]}
                >
                  {CLINIC_MODULE_LABELS[key]}
                </th>
              ))}
              <th scope="col" className="px-4 py-3 text-left font-semibold">
                Conexões
              </th>
            </tr>
          </thead>
          <tbody>
            {clinics.map((clinic) => {
              const use = usage.get(clinic.id);
              return (
                <tr key={clinic.id} className="border-t align-middle">
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    <Link
                      href={`/admin/clinicas/${clinic.id}` as Route}
                      className="font-semibold break-words underline-offset-4 hover:underline"
                    >
                      {clinic.name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      /{clinic.slug}
                      {clinic.isActive ? "" : " · desativada"}
                    </span>
                  </th>
                  {CLINIC_MODULES.map((key) => (
                    <td key={key} className="px-2 py-2 text-center">
                      <ModuleSwitch
                        compact
                        clinicId={clinic.id}
                        clinicName={clinic.name}
                        module={key}
                        label={CLINIC_MODULE_LABELS[key]}
                        on={clinic.modules.includes(key)}
                      />
                    </td>
                  ))}
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Flag on={use?.asaas ?? false} label="Pix" />
                      <Flag on={use?.mercadoPago ?? false} label="MP" />
                      <Flag
                        on={use?.anamnesisTemplate ?? false}
                        label="Anamnese"
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phone and tablet: one card per clinic. */}
      <ul className="grid gap-3 md:grid-cols-2 lg:hidden">
        {clinics.map((clinic) => {
          const use = usage.get(clinic.id);
          return (
            <li
              key={clinic.id}
              className="grid gap-3 rounded-2xl border bg-card p-4 shadow-xs"
            >
              <div className="min-w-0">
                <Link
                  href={`/admin/clinicas/${clinic.id}` as Route}
                  className="font-semibold break-words underline-offset-4 hover:underline"
                >
                  {clinic.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  /{clinic.slug}
                  {clinic.isActive ? "" : " · desativada"}
                </p>
              </div>
              <div className="grid divide-y rounded-xl border">
                {CLINIC_MODULES.map((key) => (
                  <ModuleSwitch
                    key={key}
                    clinicId={clinic.id}
                    clinicName={clinic.name}
                    module={key}
                    label={CLINIC_MODULE_LABELS[key]}
                    on={clinic.modules.includes(key)}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                <Flag on={use?.asaas ?? false} label="Sinal Pix" />
                <Flag on={use?.mercadoPago ?? false} label="Mercado Pago" />
                <Flag
                  on={use?.anamnesisTemplate ?? false}
                  label="Modelo de anamnese"
                />
              </div>
            </li>
          );
        })}
      </ul>

      <dl className="grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
        {CLINIC_MODULES.map((key) => (
          <div key={key} className="flex gap-1.5">
            <dt className="font-medium text-foreground">
              {CLINIC_MODULE_LABELS[key]}:
            </dt>
            <dd>{MODULE_HINTS[key]}</dd>
          </div>
        ))}
        <div className="flex gap-1.5">
          <dt className="font-medium text-foreground">Conexões:</dt>
          <dd>
            ligadas pela dona (Sinal Pix pelo Asaas, Mercado Pago) ou por você
            (modelo de anamnese)
          </dd>
        </div>
      </dl>
    </div>
  );
}
