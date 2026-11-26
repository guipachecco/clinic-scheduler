import { describe, expect, it } from "vitest";

import {
  confirmedText,
  declinedText,
  firstName,
  manualReminderText,
  newOptInCode,
  optInCodeFrom,
  optInMessage,
  reminderAskText,
  replyChoice,
  reminderParams,
  reminderText,
  templateText,
  warmUpLimit,
  whatsappLink,
  whatsappNumber,
} from "./message";

// Fictitious names and numbers only.
const ZONE = "America/Sao_Paulo";

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
      "Olá, Maria! Lembrete da Clínica Teste: seu horário é " +
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

describe("the automatic reminder with opt-in", () => {
  const contact = {
    clinicName: "Clínica Teste",
    address: "Rua Fictícia, 100",
    mapsUrl: "https://maps.app.goo.gl/exemplo",
    clinicPhone: "+5547900000001",
  };

  it("asks for 1 or 2, by nickname, with no link", () => {
    const text = reminderAskText({
      patientName: "Maria Fictícia",
      nickname: "Mari",
      clinicName: "Clínica Teste",
      serviceName: "Limpeza de pele",
      timezone: ZONE,
      now: new Date("2026-11-18T13:00:00Z"),
      startsAt: new Date("2026-11-18T14:00:00Z"),
    });
    expect(text).toBe(
      [
        "Oi, Mari! 😊 Aqui é o lembrete da Clínica Teste.",
        "",
        "Seu horário de Limpeza de pele é hoje, quarta-feira (18/11), às 11:00.",
        "",
        "Responda *1* para confirmar ou *2* se não puder vir.",
      ].join("\n"),
    );
    expect(text).not.toMatch(/https?:/);
  });

  it("sends the address, map and contact only after the 1", () => {
    expect(confirmedText(contact)).toBe(
      [
        "Perfeito, confirmado! ✅ Te esperamos.",
        "",
        "📍 Rua Fictícia, 100",
        "🗺️ Como chegar: https://maps.app.goo.gl/exemplo",
        "",
        "Qualquer coisa, fale com a Clínica Teste: https://wa.me/5547900000001",
      ].join("\n"),
    );
    expect(declinedText({ ...contact, clinicPhone: null })).toContain(
      "entre em contato com a clínica",
    );
  });

  it("reads the activation code and the short answers", () => {
    const code = newOptInCode(() => 0);
    expect(code).toBe("AAAAAA");
    expect(optInCodeFrom(optInMessage("Clínica Teste", "K7P2Q9"))).toBe(
      "K7P2Q9",
    );
    expect(optInCodeFrom("oi, tudo bem?")).toBeNull();
    expect(replyChoice(" 1 ")).toBe("confirmed");
    expect(replyChoice("Sim!")).toBe("confirmed");
    expect(replyChoice("2")).toBe("declined");
    expect(replyChoice("1 hora depois?")).toBeNull();
  });

  it("warms the number up: 10, then 5 more a day, up to 150", () => {
    expect(warmUpLimit(0)).toBe(10);
    expect(warmUpLimit(3)).toBe(25);
    expect(warmUpLimit(100)).toBe(150);
  });
});
