import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/modules/auth/session";
import { getClinicPageSettings } from "@/modules/clinic-page/panel";
import { formatStoredPhone } from "@/modules/patients/fields";

import { LoyaltyForm } from "./loyalty-form";
import { PageForm } from "./page-form";

export const metadata: Metadata = { title: "Minha página" };

export default async function ClinicPageSettingsPage() {
  const { clinicId } = await requireAdmin();
  const settings = await getClinicPageSettings(clinicId);
  if (!settings) notFound();

  return (
    <div className="grid max-w-3xl gap-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">
          Minha página
        </h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={"/admin/pagina/produtos" as Route}>Produtos</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={"/admin/pagina/avaliacoes" as Route}>Avaliações</Link>
          </Button>
        </div>
      </header>

      <section aria-labelledby="dados" className="grid gap-4">
        <h2 id="dados" className="font-heading text-lg font-bold">
          Dados da página
        </h2>
        <PageForm
          defaults={{
            headline: settings.headline ?? "",
            about: settings.about ?? "",
            whatsappPhone: formatStoredPhone(settings.whatsappPhone),
            contactEmail: settings.contactEmail ?? "",
            address: settings.address ?? "",
            mapsUrl: settings.mapsUrl ?? "",
            instagram: settings.instagramHandle ?? "",
            amenities: settings.amenities,
            onlineBookingEnabled: settings.onlineBookingEnabled,
          }}
        />
      </section>

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
    </div>
  );
}
