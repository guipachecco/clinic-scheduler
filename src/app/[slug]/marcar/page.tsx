import { DateTime } from "luxon";
import type { Metadata } from "next";

import { listBookableServices } from "@/modules/booking/booking";
import { requireClient } from "@/modules/clients/session";

import { ResendVerification } from "../resend-verification";
import { ClinicContacts, PageTitle, priceLabel, Unavailable } from "../ui";

import { BookingFlow, type ServiceOption } from "./booking-flow";

export const metadata: Metadata = { title: "Marcar horário" };

export default async function BookPage({
  params,
}: PageProps<"/[slug]/marcar">) {
  const { slug } = await params;
  const { ctx, clinic, user } = await requireClient(slug, `/${slug}/marcar`);
  if (!clinic.onlineBookingEnabled) return <Unavailable clinic={clinic} />;

  // She may sign in before confirming; booking waits for the confirmation.
  if (!user.emailVerified) {
    return (
      <>
        <PageTitle
          description={`Enviamos um link para ${user.email}. Abra o link do e-mail para poder marcar horários.`}
        >
          Confirme seu e-mail
        </PageTitle>
        <ResendVerification slug={clinic.slug} email={user.email} />
      </>
    );
  }

  const services: ServiceOption[] = (await listBookableServices(ctx)).map(
    (service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      durationMinutes: service.durationMinutes,
      price: priceLabel(service.priceDisplay, service.priceCents),
    }),
  );
  if (services.length === 0) {
    return (
      <>
        <PageTitle description="No momento não há serviços para marcar pela internet.">
          Marcar horário
        </PageTitle>
        <ClinicContacts clinic={clinic} />
      </>
    );
  }

  const today = DateTime.now().setZone(clinic.timezone).startOf("day");
  return (
    <>
      <PageTitle>Marcar horário</PageTitle>
      <BookingFlow
        slug={clinic.slug}
        services={services}
        today={today.toFormat("yyyy-MM-dd")}
        lastDay={today
          .plus({ days: clinic.maxAdvanceDays })
          .toFormat("yyyy-MM-dd")}
      />
    </>
  );
}
