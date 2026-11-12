import { describe, expect, it } from "vitest";

import { resetPasswordEmail, verificationEmail } from "./templates";

// Fictitious values only.
const base = {
  baseUrl: "https://zemana.example.test",
  url: "https://zemana.example.test/nova-senha?token=abc",
  userName: "Maria Souza",
};

describe("resetPasswordEmail", () => {
  it("names the clinic when the link is tied to one", () => {
    const email = resetPasswordEmail({ ...base, clinicName: "Clínica Sol" });
    expect(email.subject).toBe("Troque sua senha - Clínica Sol");
    expect(email.text).toContain("Clínica Sol");
  });

  it("speaks as Zemana without a clinic", () => {
    const email = resetPasswordEmail({ ...base, clinicName: null });
    expect(email.subject).toBe("Troque sua senha da Zemana");
    expect(email.text).toContain(base.url);
    expect(email.text).not.toContain("para marcar em");
    expect(email.html).toContain(base.url);
  });
});

describe("greeting", () => {
  it("greets by the full name", () => {
    for (const email of [
      verificationEmail({ ...base, clinicName: null }),
      resetPasswordEmail({ ...base, clinicName: null }),
    ]) {
      expect(email.text).toContain("Olá, Maria Souza!");
      expect(email.html).toContain("Olá, Maria Souza!");
    }
  });

  it("tidies the spaces and falls back without a name", () => {
    const spaced = verificationEmail({
      ...base,
      userName: "  Maria   de  Souza ",
      clinicName: null,
    });
    expect(spaced.text).toContain("Olá, Maria de Souza!");
    const unnamed = verificationEmail({
      ...base,
      userName: "   ",
      clinicName: null,
    });
    expect(unnamed.text.startsWith("Olá!")).toBe(true);
  });
});
