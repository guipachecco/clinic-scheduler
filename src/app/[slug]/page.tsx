import { DateTime } from "luxon";
import { notFound } from "next/navigation";

import {
  canReview,
  getClinicPage,
  getLoyaltyProgress,
} from "@/modules/clinic-page/public";
import { getClientContext } from "@/modules/clients/context";
import { getClientUser, requireClinic } from "@/modules/clients/session";

import { Hero } from "./home/hero";
import {
  AboutTab,
  Amenities,
  Contacts,
  Hours,
  Location,
  LoyaltyTab,
  PaymentMethods,
  PhotosTab,
  ProductsTab,
  Reviews,
  ServicesTab,
} from "./home/sections";
import { Tabs, type TabItem } from "./home/tabs";

// What the page shows only to a signed-in client with a record in this
// clinic: whether she can review and her loyalty card. Both are read as her.
async function clientExtras(
  slug: string,
  clinicId: string,
  loyaltyVisits: number | null,
) {
  const none = { mayReview: false, progress: null };
  const user = await getClientUser();
  if (!user) return none;
  const context = await getClientContext(slug, user.id);
  if (!context?.patientId) return none;
  const ctx = {
    clinicId,
    patientId: context.patientId,
    userId: user.id,
    emailVerified: user.emailVerified,
  };
  const [mayReview, progress] = await Promise.all([
    canReview(ctx),
    loyaltyVisits ? getLoyaltyProgress(ctx, loyaltyVisits) : null,
  ]);
  return { mayReview, progress };
}

// The clinic link's home: photos area and owner, tabs (services, photos,
// loyalty, products, about) and the sections below them.
export default async function ClinicHomePage({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const clinic = await requireClinic(slug);
  const page = await getClinicPage(slug);
  if (!page) notFound();
  const { mayReview, progress } = await clientExtras(
    slug,
    clinic.id,
    page.loyalty?.visits ?? null,
  );

  const now = new Date();
  const today = DateTime.fromJSDate(now, { zone: page.timezone }).weekday % 7;

  const tabs: TabItem[] = [
    { id: "servicos", label: "Serviços", content: <ServicesTab page={page} /> },
    { id: "fotos", label: "Fotos", content: <PhotosTab /> },
  ];
  if (page.loyalty) {
    tabs.push({
      id: "fidelidade",
      label: "Fidelidade",
      content: (
        <LoyaltyTab slug={slug} loyalty={page.loyalty} progress={progress} />
      ),
    });
  }
  if (page.products.length > 0) {
    tabs.push({
      id: "produtos",
      label: "Produtos",
      content: <ProductsTab products={page.products} />,
    });
  }
  tabs.push({ id: "sobre", label: "Sobre", content: <AboutTab page={page} /> });

  return (
    <>
      <Hero page={page} now={now} />
      <Tabs tabs={tabs} />
      <Amenities amenities={page.amenities} />
      <Reviews page={page} canReview={mayReview} />
      <Location page={page} />
      <Hours page={page} today={today} />
      <PaymentMethods methods={page.paymentMethods} />
      <Contacts page={page} />
    </>
  );
}
