import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { moduleActive, requireAdmin } from "@/modules/auth/session";
import { getClinicPageSettings } from "@/modules/clinic-page/panel";
import { getBuilderState } from "@/modules/page-builder/builder";
import { formatStoredPhone } from "@/modules/patients/fields";

import { LoyaltyForm } from "./loyalty-form";
import { PageForm } from "./page-form";

export const metadata: Metadata = { title: "Minha página" };

export default async function ClinicPageSettingsPage() {
  const session = await requireAdmin();
  const { clinicId } = session;
  const productsOn = moduleActive(session, "products");
  const reviewsOn = moduleActive(session, "reviews");
  const loyaltyOn = moduleActive(session, "loyalty");
  // The builder state throws for a missing clinic, so it waits for the check.
  const settings = await getClinicPageSettings(clinicId);
  if (!settings) notFound();
  const builder = await getBuilderState(clinicId);

  return (
    <div className="grid max-w-3xl gap-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">
          Minha página
        </h1>
        {productsOn || reviewsOn ? (
          <div className="flex flex-wrap gap-2">
            {productsOn ? (
              <Button asChild variant="outline">
                <Link href={"/admin/produtos" as Route}>Produtos</Link>
              </Button>
            ) : null}
            {reviewsOn ? (
              <Button asChild variant="outline">
                <Link href={"/admin/pagina/avaliacoes" as Route}>
                  Avaliações
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      <section
        aria-labelledby="montar"
        className="grid gap-3 rounded-2xl border bg-card p-5 shadow-sm"
      >
        <h2 id="montar" className="font-heading text-lg font-bold">
          Monte a cara da sua página
        </h2>
        <p className="text-sm text-muted-foreground">
          {builder.hasDraft
            ? "Você tem mudanças guardadas que ainda não estão no ar."
            : "Logo, fotos, cor, botões, letra e apresentação, um passo de cada vez. Nada muda para os clientes até você publicar."}
        </p>
        <Button asChild className="min-h-11 w-fit">
          <Link href={"/admin/pagina/montar" as Route}>
            {builder.hasDraft ? "Continuar rascunho" : "Começar"}
          </Link>
        </Button>
      </section>

      <section aria-labelledby="dados" className="grid gap-4">
        <h2 id="dados" className="font-heading text-lg font-bold">
          Dados da página
        </h2>
        <PageForm
          defaults={{
            whatsappPhone: formatStoredPhone(settings.whatsappPhone),
            contactEmail: settings.contactEmail ?? "",
            address: settings.address ?? "",
            mapsUrl: settings.mapsUrl ?? "",
            instagram: settings.instagramHandle ?? "",
            amenities: settings.amenities,
            onlineBookingEnabled: settings.onlineBookingEnabled,
          }}
          showOnlineBooking={moduleActive(session, "online_booking")}
        />
      </section>

      {loyaltyOn ? (
        <section aria-labelledby="fidelidade" className="grid gap-4">
          <h2 id="fidelidade" className="font-heading text-lg font-bold">
            Cartão fidelidade
          </h2>
          <p className="text-sm text-muted-foreground">
            A cliente ganha um prêmio a cada número de visitas concluídas.
          </p>
          <LoyaltyForm
            defaults={{
              enabled: settings.loyaltyEnabled,
              visits: String(settings.loyaltyVisits),
              reward: settings.loyaltyReward ?? "",
            }}
          />
        </section>
      ) : null}
    </div>
  );
}
