import { describe, expect, it } from "vitest";

import {
  accountReady,
  cancellationOutcome,
  depositFor,
  depositMinutesLeft,
  isValidCpfCnpj,
  lateArrival,
} from "./rules";

describe("depositFor", () => {
  it("cobra 15% do preço, arredondado para cima ao centavo", () => {
    expect(depositFor({ priceCents: 8000, priceDisplay: "fixed" })).toBe(1200);
    expect(depositFor({ priceCents: 8001, priceDisplay: "fixed" })).toBe(1201); // 1200,15 -> para cima
  });

  it("vale para serviço 'a partir de'", () => {
    expect(depositFor({ priceCents: 8000, priceDisplay: "starting_at" })).toBe(
      1200,
    );
  });

  it("não há sinal sem preço fixo ou a partir de", () => {
    expect(
      depositFor({ priceCents: null, priceDisplay: "on_request" }),
    ).toBeNull();
    expect(depositFor({ priceCents: 8000, priceDisplay: "hidden" })).toBeNull();
  });

  it("não há sinal abaixo do mínimo (500 centavos)", () => {
    expect(depositFor({ priceCents: 3000, priceDisplay: "fixed" })).toBeNull(); // 450 < 500
  });

  it("aceita exatamente o mínimo e arredonda antes de comparar", () => {
    // 3333 * 15% = 499,95 -> 500 (exatamente o mínimo, cobra)
    expect(depositFor({ priceCents: 3333, priceDisplay: "fixed" })).toBe(500);
    // 3334 * 15% = 500,10 -> 501
    expect(depositFor({ priceCents: 3334, priceDisplay: "fixed" })).toBe(501);
  });
});

describe("cancellationOutcome", () => {
  const start = new Date("2026-11-20T17:00:00Z");

  it("cliente com mais de 24h devolve", () => {
    expect(
      cancellationOutcome({
        by: "patient",
        startsAt: start,
        now: new Date("2026-11-19T16:59:59Z"),
      }),
    ).toBe("refund");
  });

  it("cliente com exatamente 24h fica com o sinal", () => {
    expect(
      cancellationOutcome({
        by: "patient",
        startsAt: start,
        now: new Date("2026-11-19T17:00:00Z"),
      }),
    ).toBe("keep");
  });

  it("cliente com menos de 24h fica com o sinal", () => {
    expect(
      cancellationOutcome({
        by: "patient",
        startsAt: start,
        now: new Date("2026-11-19T18:00:00Z"),
      }),
    ).toBe("keep");
  });

  it("clínica sempre devolve", () => {
    expect(
      cancellationOutcome({
        by: "clinic",
        startsAt: start,
        now: new Date("2026-11-20T16:00:00Z"),
      }),
    ).toBe("refund");
  });
});

describe("lateArrival", () => {
  it("pagamento tardio com horário livre confirma", () => {
    expect(
      lateArrival({ status: "pending", closeReason: null, slotFree: true }),
    ).toBe("confirm");
    expect(
      lateArrival({
        status: "expired",
        closeReason: "timeout",
        slotFree: true,
      }),
    ).toBe("confirm");
  });

  it("pagamento tardio com horário ocupado devolve", () => {
    expect(
      lateArrival({ status: "pending", closeReason: null, slotFree: false }),
    ).toBe("refund");
    expect(
      lateArrival({
        status: "expired",
        closeReason: "timeout",
        slotFree: false,
      }),
    ).toBe("refund");
  });

  it("sinal fechado por motivo que não é o tempo devolve", () => {
    expect(
      lateArrival({
        status: "expired",
        closeReason: "charge_failed",
        slotFree: true,
      }),
    ).toBe("refund");
    expect(
      lateArrival({
        status: "closed",
        closeReason: "clinic_cancelled",
        slotFree: true,
      }),
    ).toBe("refund");
    expect(
      lateArrival({
        status: "closed",
        closeReason: "manual_confirm",
        slotFree: true,
      }),
    ).toBe("refund");
  });

  it("segundo pagamento devolve", () => {
    expect(
      lateArrival({ status: "paid", closeReason: null, slotFree: true }),
    ).toBe("refund");
  });

  it("sinal já devolvido ou mantido é ignorado", () => {
    expect(
      lateArrival({ status: "refunded", closeReason: null, slotFree: true }),
    ).toBe("ignore");
    expect(
      lateArrival({ status: "kept", closeReason: null, slotFree: true }),
    ).toBe("ignore");
  });
});

describe("isValidCpfCnpj", () => {
  it("aceita CPF válido", () => {
    expect(isValidCpfCnpj("52998224725")).toBe(true);
  });

  it("rejeita CPF com dígitos repetidos", () => {
    expect(isValidCpfCnpj("11111111111")).toBe(false);
  });

  it("rejeita CPF com dígito verificador errado", () => {
    expect(isValidCpfCnpj("52998224724")).toBe(false);
  });

  it("aceita CNPJ válido", () => {
    expect(isValidCpfCnpj("11222333000181")).toBe(true);
  });

  it("rejeita CNPJ com dígito verificador errado", () => {
    expect(isValidCpfCnpj("11222333000182")).toBe(false);
  });

  it("rejeita CNPJ com dígitos repetidos", () => {
    expect(isValidCpfCnpj("00000000000000")).toBe(false);
  });

  it("rejeita tamanhos diferentes de 11 e 14, e texto com máscara", () => {
    expect(isValidCpfCnpj("")).toBe(false);
    expect(isValidCpfCnpj("1234567890")).toBe(false);
    expect(isValidCpfCnpj("529.982.247-25")).toBe(false);
  });
});

describe("accountReady", () => {
  it("só aprovada está pronta", () => {
    expect(accountReady({ general: "APPROVED" })).toBe(true);
    expect(accountReady({ general: "PENDING" })).toBe(false);
    expect(accountReady({ general: "REJECTED" })).toBe(false);
  });
});

describe("depositMinutesLeft", () => {
  const expiresAt = new Date("2033-03-01T12:30:00Z");
  it("arredonda para cima e nunca fica negativo", () => {
    expect(
      depositMinutesLeft(expiresAt, new Date("2033-03-01T12:00:00Z")),
    ).toBe(30);
    expect(
      depositMinutesLeft(expiresAt, new Date("2033-03-01T12:29:01Z")),
    ).toBe(1);
    expect(depositMinutesLeft(expiresAt, expiresAt)).toBe(0);
    expect(
      depositMinutesLeft(expiresAt, new Date("2033-03-01T13:00:00Z")),
    ).toBe(0);
  });
});
