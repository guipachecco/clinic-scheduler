import { describe, expect, it } from "vitest";

import {
  firstName,
  reminderParams,
  reminderText,
  templateText,
  tomorrowRange,
  whatsappNumber,
} from "./message";

// Fictitious names and numbers only.
const ZONE = "America/Sao_Paulo";

describe("tomorrowRange", () => {
  it("is the whole next day in the clinic's zone", () => {
    // 10h in Brasília (13:00 UTC) on Wednesday 18/11/2026.
    const { from, to } = tomorrowRange(new Date("2026-11-18T13:00:00Z"), ZONE);
    expect(from.toISOString()).toBe("2026-11-19T03:00:00.000Z");
    expect(to.toISOString()).toBe("2026-11-20T03:00:00.000Z");
  });

  it("uses the clinic's date, not UTC's, late at night", () => {
    // 22h30 in Brasília is already the 19th in UTC.
    const { from } = tomorrowRange(new Date("2026-11-19T01:30:00Z"), ZONE);
    expect(from.toISOString()).toBe("2026-11-19T03:00:00.000Z");
  });

  it("follows another zone", () => {
    const { from } = tomorrowRange(
      new Date("2026-11-18T13:00:00Z"),
      "America/Manaus",
    );
    expect(from.toISOString()).toBe("2026-11-19T04:00:00.000Z");
  });
});

describe("templateText", () => {
  it("drops line breaks, tabs and runs of spaces, which Meta refuses", () => {
    expect(templateText("Limpeza\nde  pele\t facial")).toBe(
      "Limpeza de pele facial",
    );
  });

  it("is never empty", () => {
    expect(templateText("   ")).toBe("-");
  });

  it("cuts long values", () => {
    const text = templateText("a".repeat(100), 10);
    expect(text).toHaveLength(10);
    expect(text.endsWith("…")).toBe(true);
  });
});

describe("reminderParams", () => {
  it("fills the five template variables in order", () => {
    const params = reminderParams({
      patientName: "  Maria  Souza Lima ",
      clinicName: "Clínica Teste",
      serviceName: "Design de sobrancelha",
      startsAt: new Date("2026-11-19T17:30:00Z"),
      timezone: ZONE,
    });
    expect(params).toEqual([
      "Maria",
      "Clínica Teste",
      "quinta-feira, 19/11",
      "14:30",
      "Design de sobrancelha",
    ]);
    expect(reminderText(params)).toBe(
      "Olá, Maria! Lembrete da Clínica Teste: seu horário é amanhã, " +
        "quinta-feira, 19/11, às 14:30 (Design de sobrancelha). " +
        "Se não puder ir, avise a clínica com antecedência.",
    );
  });
});

describe("firstName", () => {
  it("takes the first word", () => {
    expect(firstName("Ana Paula")).toBe("Ana");
  });
});

describe("whatsappNumber", () => {
  it("drops the plus of an E.164 number", () => {
    expect(whatsappNumber("+5511987654321")).toBe("5511987654321");
  });

  it("refuses anything else", () => {
    expect(whatsappNumber("11987654321")).toBeNull();
    expect(whatsappNumber("+55 11 98765-4321")).toBeNull();
  });
});
