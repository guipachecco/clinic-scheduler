import { describe, expect, test } from "vitest";

import { formatBRL, pricingFor } from "./pricing";

describe("pricingFor", () => {
  test("launch prices until 31/12/2026 23:59 in São Paulo", () => {
    const r = pricingFor(new Date("2027-01-01T02:59:00Z"));
    expect(r.launch).toBe(true);
    expect(r.plans.map((p) => [p.name, p.price, p.regularPrice])).toEqual([
      ["Agenda", "R$ 29,90", "R$ 49,90"],
      ["Completo", "R$ 99,00", "R$ 149,90"],
    ]);
  });
  test("regular prices from 01/01/2027 00:00 in São Paulo", () => {
    const r = pricingFor(new Date("2027-01-01T03:00:00Z"));
    expect(r.launch).toBe(false);
    expect(r.plans.map((p) => [p.price, p.regularPrice])).toEqual([
      ["R$ 49,90", null],
      ["R$ 149,90", null],
    ]);
  });
  test("each plan opens WhatsApp naming the plan", () => {
    const [agenda, completo] = pricingFor(new Date("2026-11-12")).plans;
    expect(agenda!.ctaLabel).toBe("Quero o Agenda");
    expect(decodeURIComponent(completo!.ctaHref)).toBe(
      "https://wa.me/5547991037244?text=Oi! Quero o plano Completo da Zemana.",
    );
  });
  test("audience and includes copy is pinned", () => {
    const [agenda, completo] = pricingFor(new Date("2026-11-12")).plans;
    expect([agenda!.audience, agenda!.includes]).toEqual([
      "Atende por horário",
      [
        "Agenda e fichas das clientes",
        "Seu link de agendamento",
        "Página com avaliações e fidelidade",
      ],
    ]);
    expect([completo!.audience, completo!.includes]).toEqual([
      "Vende pacote ou parcela",
      [
        "Tudo do Agenda",
        "Orçamento, pacotes e parcelas",
        "Caixa e valores a receber",
        "Anamnese e produtos",
      ],
    ]);
  });
  test("audiences name a way of working, not a profession", () => {
    const text = JSON.stringify(
      pricingFor(new Date("2026-11-12")),
    ).toLowerCase();
    for (const word of ["manicure", "clínica", "massoterap", "acupunt"]) {
      expect(text).not.toContain(word);
    }
  });
});
test("formatBRL", () => {
  expect(formatBRL(2990)).toBe("R$ 29,90");
  expect(formatBRL(9900)).toBe("R$ 99,00");
});
