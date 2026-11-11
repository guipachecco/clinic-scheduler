import { describe, expect, it } from "vitest";

import {
  CLINIC_MODULES,
  CLINIC_MODULE_LABELS,
  MODULE_OFF_ERROR,
  hasModule,
  modulesSchema,
} from "./modules";

describe("módulos da clínica", () => {
  it("hasModule diz se o módulo está ligado", () => {
    expect(hasModule({ modules: ["finance"] }, "finance")).toBe(true);
    expect(hasModule({ modules: [] }, "products")).toBe(false);
  });

  it("modulesSchema remove repetições e ordena pelo catálogo", () => {
    expect(modulesSchema.parse(["reviews", "products", "products"])).toEqual([
      "products",
      "reviews",
    ]);
  });

  it("aceita a lista vazia", () => {
    expect(modulesSchema.parse([])).toEqual([]);
  });

  it("recusa módulo desconhecido", () => {
    expect(modulesSchema.safeParse(["estoque"]).success).toBe(false);
  });

  it("tem rótulo para cada módulo, na mesma ordem", () => {
    expect(Object.keys(CLINIC_MODULE_LABELS)).toEqual([...CLINIC_MODULES]);
  });

  it("expõe a mensagem de módulo desligado", () => {
    expect(MODULE_OFF_ERROR).toBe(
      "Este recurso não está ativo para a clínica.",
    );
  });
});
