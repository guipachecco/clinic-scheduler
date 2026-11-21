import { describe, expect, it } from "vitest";

import {
  firstName,
  manualReminderText,
  reminderParams,
  reminderText,
  templateText,
  tomorrowRange,
  whatsappLink,
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

describe("manualReminderText", () => {
  const base = {
    patientName: "Maria Fictícia",
    clinicName: "Clínica Teste",
    serviceName: "Limpeza de pele",
    timezone: ZONE,
    // Wednesday 18/11/2026, 10h in Brasília.
    now: new Date("2026-11-18T13:00:00Z"),
  };

  it("says amanhã, with the address and the clinic's map link", () => {
    expect(
      manualReminderText({
        ...base,
        startsAt: new Date("2026-11-19T17:30:00Z"),
        address: "Rua Fictícia, 100 - Centro",
        mapsUrl: "https://maps.app.goo.gl/exemplo",
      }),
    ).toBe(
      [
        "Olá, Maria! 😊",
        "Passando aqui para lembrar do seu horário amanhã, quinta-feira (19/11), às 14:30 — Limpeza de pele, na Clínica Teste.",
        "",
        "📍 Rua Fictícia, 100 - Centro",
        "🗺️ Como chegar: https://maps.app.goo.gl/exemplo",
        "",
        "Se não puder vir, é só avisar por aqui. Até lá! 💜",
      ].join("\n"),
    );
  });

  it("searches the address on Google Maps without a map link", () => {
    expect(
      manualReminderText({
        ...base,
        startsAt: new Date("2026-11-19T17:30:00Z"),
        address: "Rua Fictícia, 100",
      }),
    ).toContain(
      "🗺️ Como chegar: https://www.google.com/maps/search/?api=1&query=Rua%20Fict%C3%ADcia%2C%20100",
    );
  });

  it("leaves the place out without an address", () => {
    const text = manualReminderText({
      ...base,
      startsAt: new Date("2026-11-19T17:30:00Z"),
    });
    expect(text).not.toContain("📍");
    expect(text).not.toContain("Como chegar");
  });

  it("says hoje for the same day and the date further ahead", () => {
    expect(
      manualReminderText({
        ...base,
        startsAt: new Date("2026-11-18T20:00:00Z"),
      }),
    ).toContain("seu horário hoje, quarta-feira (18/11), às 17:00");
    expect(
      manualReminderText({
        ...base,
        startsAt: new Date("2026-11-21T12:00:00Z"),
      }),
    ).toContain("seu horário do dia 21/11 (sábado), às 09:00");
  });

  it("counts days in the clinic's zone, late at night", () => {
    // 22h30 on the 18th in Brasília (already the 19th in UTC).
    expect(
      manualReminderText({
        ...base,
        now: new Date("2026-11-19T01:30:00Z"),
        startsAt: new Date("2026-11-19T12:00:00Z"),
      }),
    ).toContain("amanhã");
  });
});

describe("whatsappLink", () => {
  it("opens the conversation with the text encoded", () => {
    expect(whatsappLink("+5511900000001", "Olá, Maria! 14:30 (pele)")).toBe(
      "https://api.whatsapp.com/send?phone=5511900000001&text=Ol%C3%A1%2C%20Maria!%2014%3A30%20(pele)",
    );
  });

  it("keeps emoji (wa.me would turn them into U+FFFD)", () => {
    expect(whatsappLink("+5511900000001", "Até lá! 💜")).toContain(
      "%F0%9F%92%9C",
    );
  });

  it("is null for a number out of E.164", () => {
    expect(whatsappLink("11900000001", "Olá")).toBeNull();
  });
});
