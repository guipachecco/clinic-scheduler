import type { Metadata } from "next";

import "@fontsource-variable/bricolage-grotesque/wdth.css";
import "./landing/landing.css";

import { JsonLd } from "./json-ld";
import { Features } from "./landing/features";
import { FinalCta } from "./landing/final-cta";
import { Hero } from "./landing/hero";
import { SiteFooter } from "./landing/site-footer";
import { SiteHeader } from "./landing/site-header";
import { ScrollStory } from "./landing/scroll-story";
import { SITE_URL } from "./site-url";

const TITLE = "Zemana — agenda online para profissionais de beleza e saúde";
const DESCRIPTION =
  "Agendamento pelo link da clínica, agenda, fichas das clientes, financeiro e uma página com avaliações e fidelidade. Peça seu orçamento pelo WhatsApp.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Zemana",
    title: TITLE,
    description: DESCRIPTION,
  },
};

// Tells search engines what Zemana is (structured data, schema.org).
const ZEMANA_JSON_LD = {
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
      description: DESCRIPTION,
      url: `${SITE_URL}/`,
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

// The Zemana landing page. It renders static content only (no database, no
// cookies): the session-aware header link is a client island.
export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col overflow-x-clip">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <ScrollStory />
        <Features />
        <FinalCta />
      </main>
      <SiteFooter />
      <JsonLd data={ZEMANA_JSON_LD} />
    </div>
  );
}
