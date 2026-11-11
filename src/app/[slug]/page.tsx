import { DateTime } from "luxon";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JsonLd } from "@/app/json-ld";
import { SITE_URL } from "@/app/site-url";
import {
  canReview,
  getLoyaltyProgress,
  type ClinicPage,
} from "@/modules/clinic-page/public";
import { getClientContext } from "@/modules/clients/context";
import { getClientUser, requireClinic } from "@/modules/clients/session";

import { coverImage, Hero } from "./home/hero";
import {
  AboutTab,
  Amenities,
  BookingBar,
  Contacts,
  hasAbout,
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
import { loadClinicPage as loadPage } from "./load-page";
import { clinicName, instagramUrl } from "./ui";

// What a search result and a shared link show: the owner's headline, else the
// start of her "about" text, else a sentence built from the clinic's name.
function describe(page: ClinicPage): string {
  const name = clinicName(page);
  const text = page.headline?.trim() || page.about?.trim();
  if (!text) {
    const area = page.areaLabel ? ` (${page.areaLabel})` : "";
    return `Veja os serviços, horários e avaliações de ${name}${area} e agende online.`;
  }
  const flat = text.replace(/\s+/g, " ");
  return flat.length > 160 ? `${flat.slice(0, 157).trimEnd()}...` : flat;
}

export async function generateMetadata({
  params,
}: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadPage(slug);
  if (!page) return {};
  const description = describe(page);
  const cover = coverImage(page);
  return {
    description,
    alternates: { canonical: `/${page.slug}` },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      siteName: "Zemana",
      title: clinicName(page),
      description,
      // The cover (or the first photo) makes the shared link show the
      // space; without either the Zemana image of the root layout stays.
      ...(cover
        ? {
            images: [
              {
                url: cover.src,
                width: cover.width,
                height: cover.height,
                alt: `Espaço de ${clinicName(page)}`,
              },
            ],
          }
        : {}),
    },
  };
}

// Structured data for search engines: the clinic as a local business.
// Ratings are left out on purpose: Google does not show self-published review
// stars for a business on its own page.
function clinicJsonLd(page: ClinicPage) {
  const url = `${SITE_URL}/${page.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${url}#business`,
    name: clinicName(page),
    url,
    description: describe(page),
    ...(page.address ? { address: page.address } : {}),
    ...(page.whatsappPhone ? { telephone: page.whatsappPhone } : {}),
    ...(page.cover || page.photos.length > 0 || page.hasOwnerPhoto
      ? {
          image: [
            ...(page.cover ? [`${url}/capa`] : []),
            ...page.photos
              .slice(0, 3)
              .map((photo) => `${url}/fotos/${photo.id}`),
            ...(page.hasOwnerPhoto ? [`${url}/foto`] : []),
          ],
        }
      : {}),
    ...(page.instagramHandle
      ? { sameAs: [instagramUrl(page.instagramHandle)] }
      : {}),
  };
}

// What the page shows only to a signed-in client with a record in this
// clinic: whether she can review and her loyalty card. Both are read as her.
async function clientExtras(
  slug: string,
  clinicId: string,
  loyaltyVisits: number | null,
) {
  const none = { mayReview: false, progress: null, needsRecord: false };
  const user = await getClientUser();
  if (!user) return none;
  const context = await getClientContext(slug, user.id);
  // Signed in without a record in this clinic: she completes the signup.
  if (!context?.patientId) return { ...none, needsRecord: Boolean(context) };
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
  return { mayReview, progress, needsRecord: false };
}

// The clinic link's home: photos area and owner, tabs (services, photos,
// loyalty, products, about) and the sections below them.
export default async function ClinicHomePage({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const clinic = await requireClinic(slug);
  const page = await loadPage(slug);
  if (!page) notFound();
  const { mayReview, progress, needsRecord } = await clientExtras(
    slug,
    clinic.id,
    page.loyalty?.visits ?? null,
  );

  const now = new Date();
  const today = DateTime.fromJSDate(now, { zone: page.timezone }).weekday % 7;

  // Only the Fotos tab may be empty: the others appear when they have content.
  const tabs: TabItem[] = [];
  if (page.services.length > 0) {
    tabs.push({
      id: "servicos",
      label: "Serviços",
      content: <ServicesTab page={page} />,
    });
  }
  tabs.push({
    id: "fotos",
    label: "Fotos",
    content: <PhotosTab page={page} />,
  });
  if (page.loyalty) {
    tabs.push({
      id: "fidelidade",
      label: "Fidelidade",
      content: (
        <LoyaltyTab
          slug={slug}
          loyalty={page.loyalty}
          progress={progress}
          needsRecord={needsRecord}
        />
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
  if (hasAbout(page)) {
    tabs.push({
      id: "sobre",
      label: "Sobre",
      content: <AboutTab page={page} />,
    });
  }

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
      <BookingBar page={page} />
      <JsonLd data={clinicJsonLd(page)} />
    </>
  );
}
