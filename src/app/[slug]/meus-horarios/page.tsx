import { DateTime } from "luxon";
import type { Metadata, Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { Status } from "@/modules/appointments/fields";
import {
  type DepositView,
  getDepositView,
  sweepExpiredDeposits,
} from "@/modules/asaas/deposits";
import {
  listMyAppointments,
  type MyAppointment,
} from "@/modules/booking/booking";
import { requireClient } from "@/modules/clients/session";
import { hasModule } from "@/modules/clinics/modules";

import { Icon } from "../icons";
import { PixCode } from "../marcar/pix-step";
import { clinicName, PageTitle, whatsappUrl } from "../ui";

export const metadata: Metadata = { title: "Meus horários" };

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

// What she sees of each status. The owner's cancellations read "Desmarcado".
const STATUS_TEXT: Record<Status, string> = {
  requested: "Aguardando confirmação",
  confirmed: "Confirmado",
  cancelled: "Desmarcado",
  completed: "Realizado",
  no_show: "Não compareceu",
};

// Her appointments in this clinic only: upcoming first, then past ones. No
// cancel or reschedule control: only the owner does that.
export default async function MyAppointmentsPage({
  params,
}: PageProps<"/[slug]/meus-horarios">) {
  const { slug } = await params;
  const { ctx, clinic } = await requireClient(slug, `/${slug}/meus-horarios`);
  // Holds whose Pix ran out are let go first (nothing runs without Asaas).
  await sweepExpiredDeposits(ctx.clinicId);
  const { upcoming: upcomingAll, past: pastAll } =
    await listMyAppointments(ctx);
  // Cancelled ones (upcoming or past) leave the lists and get their own.
  const upcoming = upcomingAll.filter((item) => item.status !== "cancelled");
  const past = pastAll.filter((item) => item.status !== "cancelled");
  const cancelled = [...upcomingAll, ...pastAll]
    .filter((item) => item.status === "cancelled")
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  // The Pix of the holds still waiting for their deposit, with the QR.
  const deposits = new Map<string, DepositView>();
  for (const item of upcoming) {
    if (item.status !== "requested") continue;
    const view = await getDepositView(
      ctx.clinicId,
      item.id,
      ctx.patientId,
      true,
    );
    if (view?.status === "pending") deposits.set(item.id, view);
  }
  const name = clinicName(clinic);
  // The reviews module off hides the "Avaliar" link.
  const reviewsOn = hasModule(clinic, "reviews");

  return (
    <>
      <PageTitle>Meus horários</PageTitle>
      <section aria-labelledby="proximos" className="grid gap-3">
        <h2 id="proximos" className="font-heading text-lg font-semibold">
          Próximos horários
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-muted-foreground">Nenhum horário marcado.</p>
        ) : (
          <AppointmentList
            items={upcoming}
            timezone={clinic.timezone}
            slug={clinic.slug}
            reviewsOn={reviewsOn}
            deposits={deposits}
          />
        )}
        <Button asChild size="lg" variant="outline">
          <Link href={`/${clinic.slug}/marcar`}>Marcar outro horário</Link>
        </Button>
      </section>

      <div className="grid gap-2 rounded-2xl border bg-card p-4">
        <p>Para desmarcar ou mudar, fale com {name}</p>
        {clinic.whatsappPhone ? (
          <a
            href={whatsappUrl(clinic.whatsappPhone)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary-text underline underline-offset-4"
          >
            Falar no WhatsApp
          </a>
        ) : null}
      </div>

      {past.length > 0 ? (
        <section aria-labelledby="anteriores" className="grid gap-3">
          <h2 id="anteriores" className="font-heading text-lg font-semibold">
            Horários anteriores
          </h2>
          <AppointmentList
            items={past}
            timezone={clinic.timezone}
            slug={clinic.slug}
            reviewsOn={reviewsOn}
          />
        </section>
      ) : null}

      {cancelled.length > 0 ? (
        <section aria-labelledby="desmarcados" className="grid gap-3">
          <h2 id="desmarcados" className="font-heading text-lg font-semibold">
            Desmarcados
          </h2>
          <AppointmentList
            items={cancelled}
            timezone={clinic.timezone}
            slug={clinic.slug}
            reviewsOn={reviewsOn}
          />
        </section>
      ) : null}
    </>
  );
}

function AppointmentList({
  items,
  timezone,
  slug,
  reviewsOn,
  deposits,
}: {
  items: MyAppointment[];
  timezone: string;
  slug: string;
  reviewsOn: boolean;
  deposits?: Map<string, DepositView>;
}) {
  return (
    <ul className="grid gap-2">
      {items.map((item) => {
        const start = DateTime.fromJSDate(item.startsAt, {
          zone: timezone,
        }).setLocale("pt-BR");
        const deposit = deposits?.get(item.id);
        return (
          <li
            key={item.id}
            className={
              item.status === "cancelled"
                ? "grid gap-1 rounded-2xl border bg-muted/50 px-4 py-3 text-muted-foreground"
                : "grid gap-1 rounded-2xl border bg-card px-4 py-3 shadow-sm"
            }
          >
            <span className="flex items-center gap-2 font-semibold break-words">
              <Icon
                name="calendar"
                className="size-4 shrink-0 text-primary-text"
              />
              {item.serviceName}
            </span>
            <span className="text-sm">
              {start.toFormat("cccc, d 'de' LLLL")}, às{" "}
              {start.toFormat("HH:mm")}
            </span>
            <span
              className={
                item.status === "cancelled"
                  ? "text-sm font-semibold text-destructive"
                  : "text-sm text-muted-foreground"
              }
            >
              {deposit
                ? "Aguardando pagamento do sinal"
                : STATUS_TEXT[item.status]}
            </span>
            {deposit?.pixPayload ? (
              <div className="mt-2 grid gap-2">
                <p className="text-sm">
                  Pague o sinal de {money.format(deposit.amountCents / 100)} até{" "}
                  {DateTime.fromJSDate(deposit.expiresAt, {
                    zone: timezone,
                  }).toFormat("HH:mm")}{" "}
                  para garantir o horário.
                </p>
                <PixCode
                  payload={deposit.pixPayload}
                  qrImageBase64={deposit.qrImageBase64}
                />
              </div>
            ) : deposit ? (
              <p className="mt-2 text-sm text-muted-foreground">
                O código do Pix não carregou agora. Recarregue a página em
                instantes; se continuar, fale com a clínica.
              </p>
            ) : null}
            {reviewsOn && item.status === "completed" ? (
              <Button
                asChild
                size="sm"
                variant="outline"
                className="mt-1 w-fit"
              >
                <Link href={`/${slug}/avaliar` as Route}>
                  <Icon name="star" />
                  Avaliar
                </Link>
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
