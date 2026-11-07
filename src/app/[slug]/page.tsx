import { DateTime } from "luxon";
import { notFound } from "next/navigation";

import { canReview, getClinicPage } from "@/modules/clinic-page/public";
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

// She can review once a completed appointment exists; only a signed-in client
// with a record in this clinic can.
async function clientCanReview(slug: string, clinicId: string) {
  const user = await getClientUser();
  if (!user) return false;
  const context = await getClientContext(slug, user.id);
  if (!context?.patientId) return false;
  return canReview({
    clinicId,
    patientId: context.patientId,
    userId: user.id,
    emailVerified: user.emailVerified,
  });
}

// The clinic link's home: photos area and owner, tabs (services, photos,
// loyalty, products, about) and the sections below them.
export default async function ClinicHomePage({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const clinic = await requireClinic(slug);
  const page = await getClinicPage(slug);
  if (!page) notFound();
  const mayReview = await clientCanReview(slug, clinic.id);

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
      content: <LoyaltyTab loyalty={page.loyalty} />,
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
