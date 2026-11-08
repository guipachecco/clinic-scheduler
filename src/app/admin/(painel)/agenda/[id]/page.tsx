import { DateTime } from "luxon";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getAppointment } from "@/modules/appointments/appointments";
import { CANCELLATION_REASON_LABELS } from "@/modules/appointments/fields";
import { requireAdmin } from "@/modules/auth/session";
import {
  getAppointmentBilling,
  RECEIVABLE_STATUSES,
} from "@/modules/finance/receipts";
import {
  findSessionInstallment,
  listPaymentMethods,
} from "@/modules/finance/sales";
import {
  CLINIC_TIME_ZONE,
  formatLocal,
  todayLocal,
} from "@/modules/schedule/time";
import { listActiveServices } from "@/modules/services/services";

import { AppointmentForm, type ServiceOption } from "../appointment-form";
import {
  ReceiptForm,
  ReverseReceiptButton,
} from "../../financeiro/receipt-forms";
import { formatDay, money } from "../../financeiro/ui";
import { PaymentForm } from "../../financeiro/vendas/[id]/sale-forms";
import { StatusBadge } from "../status-badge";

import { StatusActions } from "./status-actions";

// No patient data in the title: it would reach the browser history.
export const metadata: Metadata = { title: "Atendimento" };

const SOURCE_LABELS = { admin: "Painel", online: "Online" } as const;

export default async function AppointmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { clinicId } = await requireAdmin();
  const { id } = await params;
  const appointment = await getAppointment(clinicId, id);
  if (!appointment) notFound();
  // A package session paid per session: its open installment, to receive now.
  // Otherwise a single appointment is received on the spot ("Receber").
  const [sessionInstallment, methods, billing] = await Promise.all([
    findSessionInstallment(clinicId, appointment.id),
    listPaymentMethods(clinicId),
    getAppointmentBilling(clinicId, appointment.id),
  ]);
  const receivable =
    !sessionInstallment &&
    billing !== null &&
    !billing.inPackage &&
    (RECEIVABLE_STATUSES as readonly string[]).includes(appointment.status);

  const serviceText = appointment.customLabel
    ? `${appointment.customLabel} (${appointment.serviceName})`
    : appointment.serviceName;

  let services: ServiceOption[] = [];
  if (appointment.editable) {
    services = (await listActiveServices(clinicId)).map(
      ({ id, name, categoryName, durationMinutes, isFlexible }) => ({
        id,
        name,
        categoryName,
        durationMinutes,
        isFlexible,
      }),
    );
    // The current service stays selectable on edit, even if now inactive.
    if (!services.some((service) => service.id === appointment.serviceId)) {
      services.unshift({
        id: appointment.serviceId,
        name: `${appointment.serviceName} (inativo)`,
        categoryName: "Serviço atual",
        durationMinutes: appointment.durationMinutes,
        isFlexible: appointment.isFlexible,
      });
    }
  }

  return (
    <div className="grid max-w-3xl gap-8">
      <header className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Atendimento
          </h1>
          <StatusBadge status={appointment.status} />
        </div>
        <div className="grid gap-1">
          <p className="text-lg font-medium">
            {formatLocal(appointment.startsAt, "dd/MM/yyyy")},{" "}
            <span>
              {formatLocal(appointment.startsAt, "HH:mm")}–
              {formatLocal(appointment.endsAt, "HH:mm")}
            </span>
          </p>
          <p>Duração: {appointment.durationMinutes} min</p>
          <p>Serviço: {serviceText}</p>
          <p>
            Paciente:{" "}
            <Link
              href={`/admin/pacientes/${appointment.patientId}` as Route}
              className="font-semibold text-primary underline underline-offset-4"
            >
              {appointment.patientName}
            </Link>
          </p>
          <p>Origem: {SOURCE_LABELS[appointment.source]}</p>
          {appointment.status === "cancelled" &&
          appointment.cancellationReason ? (
            <p>
              Motivo:{" "}
              {CANCELLATION_REASON_LABELS[appointment.cancellationReason]}
            </p>
          ) : null}
        </div>
      </header>

      {sessionInstallment ? (
        <section
          aria-labelledby="pagamento"
          className="grid gap-3 rounded-2xl border bg-card p-4"
        >
          <h2 id="pagamento" className="font-heading text-lg font-semibold">
            Pagamento da sessão
          </h2>
          <p>
            Falta receber {money(sessionInstallment.outstandingCents)}.{" "}
            <Link
              href={
                `/admin/financeiro/vendas/${sessionInstallment.saleId}` as Route
              }
              className="underline underline-offset-2"
            >
              Ver a venda
            </Link>
          </p>
          <PaymentForm
            installmentId={sessionInstallment.installmentId}
            outstandingCents={sessionInstallment.outstandingCents}
            methods={methods}
            today={todayLocal()}
            label="Receber agora"
          />
        </section>
      ) : null}

      {billing?.receipt ? (
        <section
          aria-labelledby="pagamento"
          className="grid gap-3 rounded-2xl border bg-card p-4"
        >
          <h2 id="pagamento" className="font-heading text-lg font-semibold">
            Pagamento
          </h2>
          <p>
            Recebido: {money(billing.receipt.amountCents)} no{" "}
            {billing.receipt.methodName} em{" "}
            {formatDay(billing.receipt.receivedOn)}.
          </p>
          <ReverseReceiptButton receiptId={billing.receipt.id} />
        </section>
      ) : receivable ? (
        <section
          aria-labelledby="pagamento"
          className="grid gap-3 rounded-2xl border bg-card p-4"
        >
          <h2 id="pagamento" className="font-heading text-lg font-semibold">
            Pagamento
          </h2>
          <p className="text-sm text-muted-foreground">
            Ainda não recebido. Confira o valor e a forma de pagamento.
          </p>
          <ReceiptForm
            appointmentId={appointment.id}
            defaultAmountCents={billing?.servicePriceCents}
            methods={methods}
            today={todayLocal()}
          />
        </section>
      ) : null}

      <section aria-labelledby="status" className="grid gap-4">
        <h2 id="status" className="font-heading text-lg font-semibold">
          Status
        </h2>
        <StatusActions
          id={appointment.id}
          allowedTransitions={appointment.allowedTransitions}
        />
      </section>

      {appointment.editable ? (
        <section aria-labelledby="alterar" className="grid gap-4">
          <h2 id="alterar" className="font-heading text-lg font-semibold">
            Alterar agendamento
          </h2>
          <AppointmentForm
            mode="edit"
            id={appointment.id}
            patientName={appointment.patientName}
            services={services}
            defaults={{
              patientId: appointment.patientId,
              serviceId: appointment.serviceId,
              customLabel: appointment.customLabel ?? "",
              date: DateTime.fromJSDate(appointment.startsAt, {
                zone: CLINIC_TIME_ZONE,
              }).toFormat("yyyy-MM-dd"),
              startTime: formatLocal(appointment.startsAt, "HH:mm"),
              durationMinutes: String(appointment.durationMinutes),
              // Ignored on update; the schema only needs a UUID here.
              idempotencyKey: appointment.id,
              acknowledgeWarnings: false,
            }}
          />
        </section>
      ) : (
        <Button asChild variant="outline" className="w-fit">
          <Link href={"/admin/agenda" as Route}>Voltar à agenda</Link>
        </Button>
      )}
    </div>
  );
}
