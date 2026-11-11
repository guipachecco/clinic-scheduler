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
    expect(text).toContain("(11) 98765-4321");
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
