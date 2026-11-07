import { describe, expect, it } from "vitest";

import { safeNext } from "./safe-next";

const ID = "3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b";

describe("safeNext", () => {
  it("accepts clinic paths and the booking page with a service id", () => {
    expect(safeNext("clinica", "/clinica")).toBe("/clinica");
    expect(safeNext("clinica", "/clinica/marcar")).toBe("/clinica/marcar");
    expect(safeNext("clinica", `/clinica/marcar?servico=${ID}`)).toBe(
      `/clinica/marcar?servico=${ID}`,
    );
  });

  it("rejects other queries, other pages with a query and bad ids", () => {
    for (const next of [
      "/clinica/marcar?servico=abc",
      `/clinica/marcar?servico=${ID}&x=1`,
      `/clinica/marcar?x=${ID}`,
      `/clinica/perfil?servico=${ID}`,
      `/clinica/marcar?servico=${ID}#a`,
      `/clinica/marcar?servico=${ID}%0a`,
      "/clinica/marcar?",
      "/clinica?next=/outra",
    ]) {
      expect(safeNext("clinica", next)).toBeNull();
    }
  });

  it("rejects external, protocol-relative and encoded tricks", () => {
    for (const next of [
      "https://evil.test/clinica",
      "//evil.test",
      "/clinica//evil.test",
      "/outra/marcar",
      "/clinicax",
      "/clinica\evil",
      "/clinica/%2e%2e/x",
      `//clinica/marcar?servico=${ID}`,
      undefined,
      42,
    ]) {
      expect(safeNext("clinica", next)).toBeNull();
    }
  });
});
