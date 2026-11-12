import type { Metadata } from "next";

import "@fontsource-variable/bricolage-grotesque/wdth.css";
import "./landing/landing.css";

import { JsonLd } from "./json-ld";
import { CookieNotice } from "./landing/cookie-notice/cookie-notice";
import { Features } from "./landing/features";
import { FinalCta } from "./landing/final-cta";
import { Hero } from "./landing/hero";
import { InsideSection } from "./landing/inside-section";
import { pricingFor } from "./landing/pricing";
import { PricingSection } from "./landing/pricing-section";
import { SiteFooter } from "./landing/site-footer";
import { SiteHeader } from "./landing/site-header";
import { ScrollStory } from "./landing/scroll-story";
import { SITE_URL } from "./site-url";

const TITLE = "Zemana — agenda online para profissionais de beleza e saúde";

// Built per request, never at module level: the starting price changes on the
// launch cut-off date and a module-level value would go stale.
function describe(now: Date): string {
  const { price } = pricingFor(now).plans[0];
  return `Agendamento pelo link, agenda, fichas das clientes, financeiro e uma página com avaliações e fidelidade. Planos a partir de ${price} por mês, com o 1º mês grátis.`;
}

export async function generateMetadata(): Promise<Metadata> {
  const description = describe(new Date());
  return {
    title: { absolute: TITLE },
    description,
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      siteName: "Zemana",
      title: TITLE,
      description,
    },
  };
}

// Tells search engines what Zemana is (structured data, schema.org).
function zemanaJsonLd(description: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "Zemana",
        url: `${SITE_URL}/`,
        logo: `${SITE_URL}/icon.png`,
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: "Zemana",
        url: `${SITE_URL}/`,
        inLanguage: "pt-BR",
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        name: "Zemana",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description,
        url: `${SITE_URL}/`,
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };
}

// The Zemana landing page. It renders static content only (no database): the
// session-aware header link is a client island, and the cookie notice only
// reads its own cookie.
export default function HomePage() {
  const jsonLd = zemanaJsonLd(describe(new Date()));
  return (
    <div className="flex flex-1 flex-col overflow-x-clip">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <ScrollStory />
        <Features />
        <InsideSection />
        <PricingSection />
        <FinalCta />
      </main>
      <SiteFooter />
      <JsonLd data={jsonLd} />
      <CookieNotice />
    </div>
  );
}
