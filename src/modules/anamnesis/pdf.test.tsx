import { extractText, getDocumentProxy } from "unpdf";
import { describe, expect, it } from "vitest";

import { renderAnamnesisPdf, type PdfHeader, type PdfPatient } from "./pdf";
import { TEMPLATES } from "./template";
import type { Answers } from "./fields";

const template = TEMPLATES["integrativa-ads-v1"];

const header: PdfHeader = {
  clinicName: "Clínica Greice Teste",
  professionalName: "Greice Souza",
  professionalRegistration: "CRP 06/123456",
  address: "Rua das Flores, 100",
  whatsappPhone: "+5511912345678",
  contactEmail: "contato@example.com",
  logo: null,
};

const patient: PdfPatient = {
  name: "Maria da Silva",
  birthDate: "1990-05-20",
  age: 36,
  phone: "+5511987654321",
  landlinePhone: null,
  email: "maria@example.com",
};

async function render(answers: Answers, overrides: Partial<PdfPatient> = {}) {
  const buffer = await renderAnamnesisPdf({
    header,
    patient: { ...patient, ...overrides },
    takenOn: "2026-11-10",
    template,
    answers,
  });
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  return { buffer, text, totalPages };
}

describe("anamnesis pdf", () => {
  it("is a PDF with header, patient and only answered sections", async () => {
    const { buffer, text } = await render({
      queixas_principais: "Dor de cabeça",
    });
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(text).toContain("Clínica Greice Teste");
    expect(text).toContain("Anamnese Integrativa");
    expect(text).toContain("Maria da Silva");
    expect(text).toContain("10/11/2026");
    expect(text).toContain("Queixas e sintomas");
    expect(text).not.toContain("História de vida");
  });

  it("identification comes from the record", async () => {
    const { text } = await render({ queixas_principais: "x" });
    expect(text).toContain("Celular / WhatsApp: (11) 98765-4321");
    expect(text).not.toContain("Telefone fixo");
  });

  it("the landline has its own line", async () => {
    const { text } = await render(
      { queixas_principais: "x" },
      { phone: null, landlinePhone: "+551133334444" },
    );
    expect(text).toContain("Telefone fixo: (11) 3333-4444");
    expect(text).not.toContain("Celular / WhatsApp");
  });

  it("characters outside the font are dropped, accents kept", async () => {
    const { text } = await render(
      {
        queixas_principais:
          "Dor de cabeça\u{1F915}\u2009forte\u2764\uFE0F — “sempre” • às vezes…\u{1F468}\u200D\u{1F469}\u200D\u{1F467}",
        // A decomposed accent (a + combining acute) is composed.
        queixas_duracao: "Ha\u0301 dois anos",
        // Only emoji: left out like an empty answer.
        queixas_agrava_melhora: "\u{1F600}\u{1F600}",
      },
      { name: "Maria\u{1F338} Conceição" },
    );
    expect(text).toContain("Dor de cabeça forte — “sempre” • às vezes…");
    expect(text).toContain("Há dois anos");
    expect(text).toContain("Maria Conceição");
    expect(text).not.toContain("O que agrava ou melhora?");
    expect(text).not.toMatch(/\p{Extended_Pictographic}|\u200D|\uFE0F/u);
  });

  it("accents survive", async () => {
    const { text } = await render({
      gestacional_concepcao: "Gestação tranquila",
      gestacional_parto_tipo: ["forceps"],
    });
    expect(text).toContain("Gestação");
    expect(text).toContain("Fórceps");
  });

  it("long answers break across pages", async () => {
    const long = "palavra ".repeat(620) + "FIMDOTEXTO";
    const { text, totalPages } = await render({ queixas_principais: long });
    expect(totalPages).toBeGreaterThanOrEqual(2);
    expect(text).toContain("FIMDOTEXTO");
  });

  it("ends with signature lines and page numbers", async () => {
    const { text } = await render({ queixas_principais: "x" });
    expect(text).toContain("Assinatura da paciente");
    expect(text).toContain("Assinatura da profissional");
    expect(text).toContain("página 1 de");
  });

  it("no post-graduation header", async () => {
    const { text } = await render({ queixas_principais: "x" });
    expect(text).not.toContain("Programa de atendimento");
    expect(text).not.toContain("Coordenador");
  });
});
