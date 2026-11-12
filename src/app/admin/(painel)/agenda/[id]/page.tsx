import { DateTime } from "luxon";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getAppointment } from "@/modules/appointments/appointments";
import { CANCELLATION_REASON_LABELS } from "@/modules/appointments/fields";
import { moduleActive, requireAdmin } from "@/modules/auth/session";
import {
  getAppointmentBilling,
  RECEIVABLE_STATUSES,
} from "@/modules/finance/receipts";
import {
  findPaidSessionSale,
  findSessionInstallment,
  listPaymentMethods,
} from "@/modules/finance/sales";
import { listActiveProducts } from "@/modules/products/products";
import {
  CLINIC_TIME_ZONE,
  formatLocal,
  todayLocal,
} from "@/modules/schedule/time";
import { listActiveServices } from "@/modules/services/services";
import {
  listAppointmentUsage,
  listOpenSaleItems,
  saleProductProgress,
} from "@/modules/stock/stock";

import { AppointmentForm, type ServiceOption } from "../appointment-form";
import {
  ReceiptForm,
  ReverseReceiptButton,
} from "../../financeiro/receipt-forms";
import { formatDay, money } from "../../financeiro/ui";
import { PaymentForm } from "../../financeiro/vendas/[id]/sale-forms";
import { StatusBadge } from "../status-badge";

import { UndoUsageButton, UsageForm } from "./product-usage";
import { StatusActions } from "./status-actions";

// No patient data in the title: it would reach the browser history.
export const metadata: Metadata = { title: "Atendimento" };

const SOURCE_LABELS = { admin: "Painel", online: "Online" } as const;

export default async function AppointmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdmin();
  const { clinicId } = session;
  const { id } = await params;
  const appointment = await getAppointment(clinicId, id);
  if (!appointment) notFound();
  // A package session paid per session: its open installment, to receive now.
  // Otherwise a single appointment is received on the spot ("Receber").
  // With the finance module off there is no payment block at all.
  const [sessionInstallment, methods, billing] = moduleActive(
    session,
    "finance",
  )
    ? await Promise.all([
        findSessionInstallment(clinicId, appointment.id),
        listPaymentMethods(clinicId),
        getAppointmentBilling(clinicId, appointment.id),
      ])
    : [null, [], null];
  const financeOn = moduleActive(session, "finance");
  const productsOn = moduleActive(session, "products");
  // "Produtos usados": stock needs products; only confirmed or completed
  // appointments use products. The sale picker needs finance too.
  const usageOpen =
    productsOn &&
    (appointment.status === "confirmed" || appointment.status === "completed");
  const [usageProducts, usages, openItems] = usageOpen
    ? await Promise.all([
        listActiveProducts(clinicId),
        listAppointmentUsage(clinicId, appointment.id),
        financeOn ? listOpenSaleItems(clinicId, appointment.patientId) : [],
      ])
    : [[], [], []];
  // After a payment of this session installment, the sale may still have
  // products to hand over: point to them.
  const paidSaleId =
    financeOn && productsOn
      ? await findPaidSessionSale(clinicId, appointment.id)
      : null;
  const productsPending = paidSaleId
    ? (await saleProductProgress(clinicId, paidSaleId)).some(
        (item) => item.remaining > 0,
      )
    : false;
  const handOverLink =
    paidSaleId && productsPending ? (
      <p>
        <Link
          href={
            `/admin/financeiro/vendas/${paidSaleId}#produtos-da-venda` as Route
          }
          className="font-semibold text-primary underline underline-offset-4"
        >
          Dar baixa nos produtos da venda
        </Link>
      </p>
    ) : null;
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
          <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">
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
          <h2 id="pagamento" className="font-heading text-lg font-bold">
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
          {handOverLink}
        </section>
      ) : handOverLink ? (
        <section
          aria-labelledby="pagamento"
          className="grid gap-3 rounded-2xl border bg-card p-4"
        >
          <h2 id="pagamento" className="font-heading text-lg font-bold">
            Pagamento da sessão
          </h2>
          <p>Sessão paga.</p>
          {handOverLink}
        </section>
      ) : null}

      {billing?.receipt ? (
        <section
          aria-labelledby="pagamento"
          className="grid gap-3 rounded-2xl border bg-card p-4"
        >
          <h2 id="pagamento" className="font-heading text-lg font-bold">
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
          <h2 id="pagamento" className="font-heading text-lg font-bold">
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

      {usageOpen ? (
        <section
          aria-labelledby="produtos-usados"
          className="grid gap-4 rounded-2xl border bg-card p-4"
        >
          <h2 id="produtos-usados" className="font-heading text-lg font-bold">
            Produtos usados
          </h2>
          {usages.length > 0 ? (
            <ul className="grid gap-2">
              {usages.map((usage) => (
                <li
                  key={usage.movementId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2"
                >
                  <span
                    className={
                      usage.reversed
                        ? "text-muted-foreground line-through"
                        : undefined
                    }
                  >
                    {usage.productName} · {usage.quantity}
                    {usage.saleNumber !== null
                      ? ` · venda nº ${usage.saleNumber}`
                      : ""}
                  </span>
                  {usage.reversed ? (
                    <span className="text-sm text-muted-foreground">
                      Desfeita
                    </span>
                  ) : (
                    <UndoUsageButton
                      appointmentId={appointment.id}
                      movementId={usage.movementId}
                    />
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          <UsageForm
            appointmentId={appointment.id}
            products={usageProducts.map(({ id, name }) => ({ id, name }))}
            openItems={openItems.map(
              ({ saleItemId, saleNumber, productId, remaining }) => ({
                saleItemId,
                saleNumber,
                productId,
                remaining,
              }),
            )}
          />
        </section>
      ) : null}

      <section aria-labelledby="status" className="grid gap-4">
        <h2 id="status" className="font-heading text-lg font-bold">
          Status
        </h2>
        <StatusActions
          id={appointment.id}
          allowedTransitions={appointment.allowedTransitions}
        />
      </section>

      {appointment.editable ? (
        <section aria-labelledby="alterar" className="grid gap-4">
          <h2 id="alterar" className="font-heading text-lg font-bold">
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
