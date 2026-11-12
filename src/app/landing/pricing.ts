import { whatsappUrl } from "./quote-link";

export type PlanId = "agenda" | "completo";

// Launch prices end at 01/01/2027 00:00 in São Paulo (UTC-3).
export const LAUNCH_ENDS_AT = new Date("2027-01-01T03:00:00Z");

export type ShownPlan = {
  id: PlanId;
  name: string;
  audience: string;
  description: string;
  includes: string[];
  price: string;
  regularPrice: string | null;
  ctaLabel: string;
  ctaHref: string;
};

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

// Plain space instead of the no-break space Intl emits, so text compares simply.
export function formatBRL(cents: number): string {
  return brl.format(cents / 100).replace(/\u00a0/g, " ");
}

// Prices in cents.
const PLANS: {
  id: PlanId;
  name: string;
  audience: string;
  description: string;
  includes: string[];
  launchCents: number;
  regularCents: number;
}[] = [
  {
    id: "agenda",
    name: "Agenda",
    audience: "Pra quem atende com hora marcada",
    description:
      "Pra quem quer as clientes marcando sozinhas e a semana organizada.",
    includes: [
      "Página própria pra clientes marcarem",
      "Agenda da semana e do mês",
      "Cadastro das clientes",
      "Lembretes automáticos",
    ],
    launchCents: 2990,
    regularCents: 4990,
  },
  {
    id: "completo",
    name: "Completo",
    audience: "Pra quem vende pacote de sessões e parcela",
    description:
      "Pra quem também faz orçamento, vende pacote de sessões ou parcela.",
    includes: [
      "Tudo do Agenda",
      "Orçamentos",
      "Pacotes de sessões",
      "Pagamentos e parcelas",
    ],
    launchCents: 9900,
    regularCents: 14990,
  },
];

export function pricingFor(now: Date): { launch: boolean; plans: ShownPlan[] } {
  const launch = now < LAUNCH_ENDS_AT;
  return {
    launch,
    plans: PLANS.map((p) => ({
      id: p.id,
      name: p.name,
      audience: p.audience,
      description: p.description,
      includes: p.includes,
      price: formatBRL(launch ? p.launchCents : p.regularCents),
      regularPrice: launch ? formatBRL(p.regularCents) : null,
      ctaLabel: `Quero o ${p.name}`,
      ctaHref: whatsappUrl(`Oi! Quero o plano ${p.name} da Zemana.`),
    })),
  };
}
