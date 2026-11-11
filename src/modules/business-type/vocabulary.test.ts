import { describe, expect, it } from "vitest";

import { businessType } from "@/db/schema/clinic";
import { HEX_COLOR } from "@/modules/branding/derive";

import {
  BUSINESS_TYPES,
  BUSINESS_TYPE_LABELS,
  STARTER_STYLE,
  vocabulary,
} from "./vocabulary";

describe("vocabulary", () => {
  it("BUSINESS_TYPES espelha o enum do banco", () => {
    expect([...BUSINESS_TYPES]).toEqual([...businessType.enumValues]);
  });

  it("tem rótulo para cada tipo", () => {
    for (const t of BUSINESS_TYPES)
      expect(BUSINESS_TYPE_LABELS[t]).toBeTruthy();
  });

  it("clínica fala paciente", () => {
    expect(vocabulary("clinic").newPerson).toBe("Novo paciente");
    expect(vocabulary("clinic").people).toBe("pacientes");
  });

  it("demais tipos falam cliente", () => {
    expect(vocabulary("barbershop").People).toBe("Clientes");
    expect(vocabulary("other").person).toBe("cliente");
  });

  it("estilo inicial tem cor válida", () => {
    for (const t of BUSINESS_TYPES) {
      expect(STARTER_STYLE[t].primaryColor).toMatch(HEX_COLOR);
    }
  });
});
