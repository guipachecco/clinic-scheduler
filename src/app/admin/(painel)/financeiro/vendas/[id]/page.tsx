import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { STATUS_LABELS, type Status } from "@/modules/appointments/fields";
import { requireModule } from "@/modules/auth/session";
import { PAYMENT_PLAN_LABELS } from "@/modules/finance/fields";
import { getSale, listPaymentMethods } from "@/modules/finance/sales";
import {
  getConnection,
  mercadoPagoConfig,
} from "@/modules/mercado-pago/accounts";
import { listSaleCharges } from "@/modules/mercado-pago/charges";
import { getPatient } from "@/modules/patients/patients";
import { formatLocal, todayLocal } from "@/modules/schedule/time";
import { listCatalog } from "@/modules/services/services";

import { FinanceTabs, formatDay, money, PageTitle, StateBadge } from "../../ui";

import { ChargeLink } from "./charge-link";
import {
  CancelSaleForm,
  PaymentForm,
  ReverseButton,
  ReviseForm,
  ScheduleForm,
} from "./sale-forms";

// No patient data in the title: it would reach the browser history.
export const metadata: Metadata = { title: "Venda" };

export default async function SalePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { clinicId, clinic } = await requireModule("finance");
  const { id } = await params;
  const today = todayLocal();
  const [sale, methods, catalog, connection] = await Promise.all([
    getSale(clinicId, id, today),
    listPaymentMethods(clinicId),
    listCatalog(clinicId),
    mercadoPagoConfig() ? getConnection(clinicId) : null,
  ]);
  if (!sale) notFound();
  const [charges, patient] = connection
    ? await Promise.all([
        listSaleCharges(clinicId, sale.id),
        getPatient(clinicId, sale.patientId),
      ])
    : [[], null];
  const phone = patient?.phone?.replace(/\D/g, "") || null;
  const openLink = (installmentId: string, outstandingCents: number) => {
    const charge = charges.find((c) => c.installmentId === installmentId);
    return charge?.usable && charge.amountCents === outstandingCents
      ? {
          checkoutUrl: charge.checkoutUrl,
          amountCents: charge.amountCents,
          expiresAt: charge.expiresAt.toISOString(),
        }
      : null;
  };
  const conflicts = charges.filter((c) => c.status === "conflict");
  const catalogServices = catalog.flatMap((c) =>
    c.services.map((s) => ({ ...s, categoryActive: c.isActive })),
  );
  const duration = (serviceId: string) =>
    catalogServices.find((s) => s.id === serviceId)?.durationMinutes ?? 60;
  const active = sale.cancelledAt === null;
  // Products are never scheduled nor revised: only services have sessions.
  const serviceItems = sale.items.flatMap((item) =>
    item.kind === "service" && item.serviceId
      ? [{ ...item, serviceId: item.serviceId }]
      : [],
  );
  const hasProducts = serviceItems.length < sale.items.length;
  const openInstallments = sale.installments.filter(
    (i) => i.state !== "cancelled" && i.paidCents === 0,
  ).length;

  return (
    <div className="grid max-w-4xl gap-8">
      <div className="grid gap-4">
        <PageTitle title={`Venda do orçamento nº ${sale.quoteNumber}`} />
        <FinanceTabs current="/admin/financeiro/vendas" />
        <div className="grid gap-1">
          <p>
            Paciente:{" "}
            <Link
              href={`/admin/pacientes/${sale.patientId}` as Route}
              className="font-medium underline underline-offset-2"
            >
              {sale.patientName}
            </Link>
          </p>
          <p>Pagamento: {PAYMENT_PLAN_LABELS[sale.paymentPlan]}</p>
          <p>
            <Link
              href={`/admin/financeiro/orcamentos/${sale.quoteId}` as Route}
              className="underline underline-offset-2"
            >
              Ver o orçamento
            </Link>
          </p>
          {!active ? (
            <p className="font-medium text-destructive">
              Cancelada em {formatLocal(sale.cancelledAt!, "dd/MM/yyyy")}:{" "}
              {sale.cancellationReason}
            </p>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="font-heading text-xl font-semibold tabular-nums">
              {money(sale.totalCents)}
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">Pago</p>
            <p className="font-heading text-xl font-semibold tabular-nums">
              {money(sale.paidCents)}
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">Falta pagar</p>
            <p className="font-heading text-xl font-semibold tabular-nums">
              {money(sale.outstandingCents)}
            </p>
          </div>
        </div>
      </div>

      <section aria-labelledby="sessoes" className="grid gap-3">
        <h2 id="sessoes" className="font-heading text-lg font-bold">
          {hasProducts ? "Itens da venda" : "Serviços e sessões"}
        </h2>
        <ul className="grid gap-3">
          {sale.items.map((item) => (
            <li
              key={item.id}
              className="grid gap-2 rounded-2xl border bg-card p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{item.serviceName}</p>
                <p className="tabular-nums">{money(item.totalCents)}</p>
              </div>
              {item.kind === "product" ? (
                <p className="text-sm text-muted-foreground">
                  Quantidade {item.sessions}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {item.sessions} contratadas · {item.used} agendadas ou feitas
                  · {item.done} feitas · {item.remaining} a agendar
                </p>
              )}
              {item.appointments.length > 0 ? (
                <ul className="grid gap-1 text-sm">
                  {item.appointments.map((a) => (
                    <li key={a.id}>
                      <Link
                        href={`/admin/agenda/${a.id}` as Route}
                        className="underline underline-offset-2"
                      >
                        {formatLocal(a.startsAt, "dd/MM/yyyy")} às{" "}
                        {formatLocal(a.startsAt, "HH:mm")}
                      </Link>{" "}
                      · {STATUS_LABELS[a.status as Status] ?? a.status}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
        {active && serviceItems.length > 0 ? (
          <details className="rounded-2xl border bg-card p-4">
            <summary className="cursor-pointer font-medium">
              Agendar sessões
            </summary>
            <div className="mt-4">
              <ScheduleForm
                today={today}
                items={serviceItems
                  .filter((item) => item.remaining > 0)
                  .map((item) => ({
                    id: item.id,
                    serviceName: item.serviceName,
                    remaining: item.remaining,
                    durationMinutes: duration(item.serviceId),
                  }))}
              />
            </div>
          </details>
        ) : null}
      </section>

      <section aria-labelledby="parcelas" className="grid gap-3">
        <h2 id="parcelas" className="font-heading text-lg font-bold">
          Parcelas
        </h2>
        {conflicts.length > 0 ? (
          <p
            role="alert"
            className="rounded-xl border border-destructive/40 bg-card p-3 text-sm font-medium text-destructive"
          >
            A paciente pagou pelo Mercado Pago uma parcela que já estava paga ou
            foi cancelada aqui (
            {conflicts
              .map(
                (c) =>
                  `parcela ${sale.installments.find((p) => p.id === c.installmentId)?.number ?? "?"}, ${money(c.amountCents)}`,
              )
              .join("; ")}
            ). Devolva o valor pelo app do Mercado Pago.
          </p>
        ) : null}
        {sale.installments.length === 0 ? (
          <p className="text-muted-foreground">
            Nenhuma parcela (venda sem valor).
          </p>
        ) : (
          <ul className="grid gap-2">
            {sale.installments.map((part) => (
              <li
                key={part.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="font-medium">Parcela {part.number}</span>{" "}
                  <span className="text-muted-foreground">
                    ·{" "}
                    {part.dueDate
                      ? `vence ${formatDay(part.dueDate)}`
                      : part.saleItemId
                        ? "sessão ainda não agendada"
                        : "sem vencimento"}
                    {part.paidCents > 0 && part.state !== "paid"
                      ? ` · pago ${money(part.paidCents)}`
                      : ""}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <StateBadge state={part.state} />
                  <span className="font-semibold tabular-nums">
                    {money(part.amountCents)}
                  </span>
                </span>
                {active &&
                (part.state === "open" ||
                  part.state === "partial" ||
                  part.state === "overdue") ? (
                  <div className="flex w-full flex-wrap items-center justify-end gap-2">
                    {connection ? (
                      <ChargeLink
                        installmentId={part.id}
                        installmentNumber={part.number}
                        clinicName={clinic.name}
                        phone={phone}
                        existing={openLink(
                          part.id,
                          part.amountCents - part.paidCents,
                        )}
                      />
                    ) : null}
                    <PaymentForm
                      installmentId={part.id}
                      outstandingCents={part.amountCents - part.paidCents}
                      methods={methods}
                      today={today}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="pagamentos" className="grid gap-3">
        <h2 id="pagamentos" className="font-heading text-lg font-bold">
          Pagamentos
        </h2>
        {sale.payments.length === 0 ? (
          <p className="text-muted-foreground">Nenhum pagamento registrado.</p>
        ) : (
          <ul className="grid gap-2">
            {sale.payments.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3"
              >
                <span
                  className={
                    p.reversedAt
                      ? "text-muted-foreground line-through"
                      : undefined
                  }
                >
                  {formatDay(p.paidOn)} · parcela {p.installmentNumber} ·{" "}
                  {p.methodName}
                  {p.notes ? ` · ${p.notes}` : ""}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <span
                    className={
                      p.reversedAt
                        ? "text-muted-foreground tabular-nums line-through"
                        : "font-semibold tabular-nums"
                    }
                  >
                    {money(p.amountCents)}
                  </span>
                  {p.reversedAt ? (
                    <span className="text-sm text-muted-foreground">
                      Estornado: {p.reversalReason}
                    </span>
                  ) : (
                    <ReverseButton paymentId={p.id} />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {active ? (
        <section aria-labelledby="alterar" className="grid gap-3">
          <h2 id="alterar" className="font-heading text-lg font-bold">
            Alterar a venda
          </h2>
          <div className="rounded-2xl border bg-card p-4">
            <ReviseForm
              saleId={sale.id}
              perSession={sale.paymentPlan === "per_session"}
              openInstallments={openInstallments}
              items={serviceItems.map((item) => ({
                id: item.id,
                serviceName: item.serviceName,
                sessionPriceCents:
                  item.sessions > 0
                    ? Math.floor(item.totalCents / item.sessions)
                    : 0,
              }))}
              services={catalogServices
                .filter((s) => s.isActive && s.categoryActive && !s.isFlexible)
                .map((s) => ({
                  id: s.id,
                  name: s.name,
                  priceCents: s.priceCents,
                }))}
            />
          </div>
        </section>
      ) : null}

      {sale.revisions.length > 0 ? (
        <section aria-labelledby="historico" className="grid gap-3">
          <h2 id="historico" className="font-heading text-lg font-bold">
            Alterações
          </h2>
          <ol className="grid gap-2">
            {sale.revisions.map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border bg-card px-4 py-3 text-sm"
              >
                <p className="font-medium">
                  {formatLocal(r.createdAt, "dd/MM HH:mm")} · {r.reason}
                </p>
                <p className="text-muted-foreground">
                  Total: {money(r.before.totalCents)} →{" "}
                  {money(r.after.totalCents)} · sessões:{" "}
                  {r.before.items.reduce((s, i) => s + i.sessions, 0)} →{" "}
                  {r.after.items.reduce((s, i) => s + i.sessions, 0)}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {active ? (
        <details className="rounded-2xl border bg-card p-4">
          <summary className="cursor-pointer font-medium">
            Cancelar a venda
          </summary>
          <div className="mt-4">
            <CancelSaleForm saleId={sale.id} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
