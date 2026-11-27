import { DateTime } from "luxon";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/icon";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { getAppointment } from "@/modules/appointments/appointments";
import {
  CANCELLATION_REASON_LABELS,
  serviceLabel,
} from "@/modules/appointments/fields";
import {
  previewCancellation,
  sweepBeforePanel,
} from "@/modules/asaas/deposits";
import { depositMinutesLeft, type DepositStatus } from "@/modules/asaas/rules";
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
import { listActiveProfessionals } from "@/modules/professionals/professionals";
import {
  CLINIC_TIME_ZONE,
  formatLocal,
  todayLocal,
} from "@/modules/schedule/time";
import { reminderLeadLabel } from "@/modules/reminders/lead";
import { whatsappRemindersAvailable } from "@/modules/reminders/whatsapp";
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

// The Pix deposit of an online booking, in the header. An expired or closed
// one took no money: nothing to say.
const DEPOSIT_TEXTS: Partial<
  Record<DepositStatus, (amount: string) => string>
> = {
  pending: (amount) => `Sinal de ${amount} aguardando o Pix da cliente.`,
  paid: (amount) => `Sinal pago ${amount}.`,
  kept: (amount) => `Sinal de ${amount} ficou com a clínica.`,
  refunded: (amount) => `Sinal de ${amount} devolvido à cliente.`,
};

export default async function AppointmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdmin();
  const { clinicId } = session;
  const { id } = await params;
  // An expired Pix hold is cancelled before the page shows it.
  await sweepBeforePanel(clinicId);
  const now = new Date();
  const appointment = await getAppointment(clinicId, id, now);
  const reminderAvailable = whatsappRemindersAvailable();
  if (!appointment) notFound();
  const { deposit } = appointment;
  // Held for a Pix deposit: "Aguardando sinal · N min" instead of "Solicitado".
  const holdMinutes =
    appointment.status === "requested" && deposit?.status === "pending"
      ? depositMinutesLeft(deposit.expiresAt, now)
      : undefined;
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
  // An online booking with a deposit sale is paid through that sale, never
  // with a separate receipt.
  const hasDepositSale =
    deposit?.status === "paid" || deposit?.status === "kept";
  const receivable =
    !sessionInstallment &&
    !hasDepositSale &&
    billing !== null &&
    !billing.inPackage &&
    (RECEIVABLE_STATUSES as readonly string[]).includes(appointment.status);
  // A paid deposit with the rest still open shows in "Pagamento da sessão",
  // right above "Receber agora"; otherwise in the header.
  const depositWithRest = deposit?.status === "paid" && sessionInstallment;
  const depositText =
    deposit && !depositWithRest
      ? (DEPOSIT_TEXTS[deposit.status]?.(money(deposit.amountCents)) ?? null)
      : null;
  // A paid deposit: cancelling asks who called it off and says what happens
  // to the deposit (the clinic always refunds; the patient only more than
  // 24h before).
  const cancelPreview =
    deposit?.status === "paid" &&
    appointment.allowedTransitions.includes("cancelled")
      ? await previewCancellation(clinicId, appointment.id, "patient", now)
      : null;
  const depositCancel = cancelPreview?.hasPaidDeposit
    ? {
        amount: money(cancelPreview.amountCents),
        patientRefunds: cancelPreview.outcome === "refund",
      }
    : undefined;

  const extraNames = appointment.extras.map((extra) => extra.name);
  const serviceText = serviceLabel(
    appointment.customLabel
      ? `${appointment.customLabel} (${appointment.serviceName})`
      : appointment.serviceName,
    extraNames,
  );

  // With a team of one, nothing about professionals is shown.
  const professionals = await listActiveProfessionals(clinicId);
  const showProfessional =
    professionals.length > 1 ||
    !professionals.some((p) => p.id === appointment.professionalId);
  // Her current professional stays selectable on edit, even if inactive.
  const professionalChoices = professionals.some(
    (p) => p.id === appointment.professionalId,
  )
    ? professionals
    : [
        {
          id: appointment.professionalId,
          name: `${appointment.professionalName} (inativa)`,
        },
        ...professionals,
      ];

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
        durationMinutes: appointment.serviceDurationMinutes,
        isFlexible: appointment.isFlexible,
      });
    }
    // Extras that are no longer bookable stay selectable too.
    const offered = new Set(services.map((service) => service.id));
    for (const extra of appointment.extras) {
      if (offered.has(extra.serviceId)) continue;
      services.push({
        id: extra.serviceId,
        name: `${extra.name} (inativo)`,
        categoryName: "Serviço atual",
        durationMinutes: extra.durationMinutes,
        isFlexible: false,
      });
    }
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <header className="relative grid gap-6 overflow-hidden rounded-2xl border bg-card p-5 shadow-sm md:p-7">
        {/* A soft glow of the identity colors in the corner. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-highlight/10 blur-3xl"
        />
        <div className="relative grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">
              Atendimento
            </h1>
            <StatusBadge
              status={appointment.status}
              depositMinutesLeft={holdMinutes}
            />
          </div>
          <p className="flex flex-wrap items-center gap-x-5 gap-y-2 text-lg font-semibold">
            <span className="inline-flex items-center gap-2">
              <Icon name="calendar" className="text-primary-text" />
              {formatLocal(appointment.startsAt, "dd/MM/yyyy")},
            </span>{" "}
            <span className="inline-flex items-center gap-2">
              <Icon name="clock" className="text-primary-text" />
              {formatLocal(appointment.startsAt, "HH:mm")}–
              {formatLocal(appointment.endsAt, "HH:mm")}
            </span>
          </p>
        </div>
        <div className="relative grid gap-x-6 gap-y-4 border-t pt-5 sm:grid-cols-2 md:grid-cols-3">
          <Fact label="Paciente">
            <Link
              href={`/admin/pacientes/${appointment.patientId}` as Route}
              className="font-semibold text-primary-text underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
            >
              {appointment.patientName}
            </Link>
          </Fact>
          <Fact label="Serviço">{serviceText}</Fact>
          <Fact label="Duração">{appointment.durationMinutes} min</Fact>
          {showProfessional ? (
            <Fact label="Profissional">{appointment.professionalName}</Fact>
          ) : null}
          <Fact label="Origem">{SOURCE_LABELS[appointment.source]}</Fact>
          {appointment.whatsappReminder ? (
            <Fact label="Lembrete por WhatsApp">
              {appointment.reminderSent
                ? "enviado"
                : reminderLeadLabel(appointment.reminderLeadMinutes)}
            </Fact>
          ) : null}
          {appointment.patientReply ? (
            <Fact label="Resposta da cliente">
              {appointment.patientReply === "confirmed"
                ? "Confirmou pelo WhatsApp ✅"
                : "Avisou que não pode vir"}
            </Fact>
          ) : null}
          {appointment.status === "cancelled" &&
          appointment.cancellationReason ? (
            <Fact label="Motivo">
              {CANCELLATION_REASON_LABELS[appointment.cancellationReason]}
            </Fact>
          ) : null}
        </div>
        {appointment.extras.length > 0 ? (
          <div className="relative grid gap-2">
            <h2
              id="procedimentos"
              className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
            >
              Procedimentos
            </h2>
            <ul
              aria-labelledby="procedimentos"
              className="flex flex-wrap gap-2"
            >
              <li className="rounded-full bg-muted px-3 py-1 text-sm">
                {appointment.serviceName} · {appointment.serviceDurationMinutes}{" "}
                min
              </li>
              {appointment.extras.map((extra) => (
                <li
                  key={extra.serviceId}
                  className="rounded-full bg-muted px-3 py-1 text-sm"
                >
                  {extra.name} · {extra.durationMinutes} min
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {depositText ? (
          <p className="relative rounded-xl bg-muted px-4 py-3 text-sm font-medium">
            {depositText}
          </p>
        ) : null}
      </header>

      {sessionInstallment ? (
        <SectionCard id="pagamento" title="Pagamento da sessão" icon="wallet">
          <p>
            {depositWithRest
              ? `Sinal pago ${money(deposit.amountCents)} · Falta ${money(sessionInstallment.outstandingCents)}.`
              : `Falta receber ${money(sessionInstallment.outstandingCents)}.`}{" "}
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
        </SectionCard>
      ) : handOverLink ? (
        <SectionCard id="sessao-paga" title="Pagamento da sessão" icon="wallet">
          <p>Sessão paga.</p>
          {handOverLink}
        </SectionCard>
      ) : null}

      {billing?.receipt ? (
        <SectionCard id="pagamento" title="Pagamento" icon="wallet">
          <p>
            Recebido: {money(billing.receipt.amountCents)} no{" "}
            {billing.receipt.methodName} em{" "}
            {formatDay(billing.receipt.receivedOn)}.
          </p>
          <ReverseReceiptButton receiptId={billing.receipt.id} />
        </SectionCard>
      ) : receivable ? (
        <SectionCard
          id="pagamento"
          title="Pagamento"
          icon="wallet"
          description="Ainda não recebido. Confira o valor e a forma de pagamento."
        >
          <ReceiptForm
            appointmentId={appointment.id}
            defaultAmountCents={billing?.servicePriceCents}
            methods={methods}
            today={todayLocal()}
          />
        </SectionCard>
      ) : null}

      {usageOpen ? (
        <SectionCard
          id="produtos-usados"
          title="Produtos usados"
          icon="box"
          description="O que saiu do estoque neste atendimento."
        >
          {usages.length > 0 ? (
            <ul className="grid gap-2">
              {usages.map((usage) => (
                <li
                  key={usage.movementId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/40 px-4 py-3"
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
        </SectionCard>
      ) : null}

      <SectionCard id="status" title="Status" icon="pulse">
        <StatusActions
          id={appointment.id}
          allowedTransitions={appointment.allowedTransitions}
          depositPending={holdMinutes !== undefined}
          depositCancel={depositCancel}
        />
      </SectionCard>

      {appointment.editable ? (
        <SectionCard
          id="alterar"
          title="Alterar agendamento"
          icon="pencil"
          description="Troque o serviço, a data ou o horário."
        >
          <AppointmentForm
            mode="edit"
            id={appointment.id}
            patientName={appointment.patientName}
            services={services}
            professionals={professionalChoices}
            allowExtras={!appointment.inPackage}
            reminderAvailable={reminderAvailable}
            defaults={{
              patientId: appointment.patientId,
              serviceId: appointment.serviceId,
              extraServiceIds: appointment.extras.map(
                (extra) => extra.serviceId,
              ),
              professionalId:
                professionalChoices.length > 1
                  ? appointment.professionalId
                  : "",
              customLabel: appointment.customLabel ?? "",
              date: DateTime.fromJSDate(appointment.startsAt, {
                zone: CLINIC_TIME_ZONE,
              }).toFormat("yyyy-MM-dd"),
              startTime: formatLocal(appointment.startsAt, "HH:mm"),
              durationMinutes: String(appointment.durationMinutes),
              // Ignored on update; the schema only needs a UUID here.
              idempotencyKey: appointment.id,
              acknowledgeWarnings: false,
              ...(reminderAvailable
                ? {
                    whatsappReminder: appointment.whatsappReminder,
                    reminderLeadMinutes: appointment.reminderLeadMinutes,
                  }
                : {}),
            }}
          />
        </SectionCard>
      ) : (
        <Button asChild variant="outline" className="w-fit">
          <Link href={"/admin/agenda" as Route}>Voltar à agenda</Link>
        </Button>
      )}
    </div>
  );
}

// One fact of the appointment: a small label over its value. The colon stays
// in the text (screen readers and tests read "Serviço: X") but not on screen.
function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <p className="grid min-w-0 content-start gap-1">
      <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
        <span className="sr-only">:</span>
      </span>{" "}
      <span className="break-words">{children}</span>
    </p>
  );
}
