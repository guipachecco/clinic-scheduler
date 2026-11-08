import type { Metadata } from "next";

import "@fontsource-variable/bricolage-grotesque/wdth.css";
import "./landing/landing.css";

import { Features } from "./landing/features";
import { FinalCta } from "./landing/final-cta";
import { Hero } from "./landing/hero";
import { SiteFooter } from "./landing/site-footer";
import { SiteHeader } from "./landing/site-header";
import { ScrollStory } from "./landing/scroll-story";

const TITLE = "Zemana — agenda online para profissionais de beleza e saúde";
const DESCRIPTION =
  "Agendamento pelo link da clínica, agenda, fichas das clientes, financeiro e uma página com avaliações e fidelidade. Peça seu orçamento pelo WhatsApp.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Zemana",
    title: TITLE,
    description: DESCRIPTION,
  },
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
    </div>
  );
}
