import { describe, expect, it } from "vitest";
import {
  ANSWERS_MAX_BYTES,
  answeredSections,
  answersSchema,
  copyAnswers,
} from "./fields";
import {
  CURRENT_TEMPLATE_ID,
  getTemplate,
  TEMPLATES,
  type AnamnesisTemplate,
} from "./template";

const t = TEMPLATES["integrativa-ads-v1"];

describe("anamnesis template", () => {
  it("exposes the current template", () => {
    expect(CURRENT_TEMPLATE_ID).toBe("integrativa-ads-v1");
    expect(getTemplate(CURRENT_TEMPLATE_ID)).toBe(t);
    expect(getTemplate("nope")).toBeNull();
  });

  it("template ids are unique", () => {
    const sections = t.sections.map((s) => s.id);
    const questions = t.sections.flatMap((s) => s.questions.map((q) => q.id));
    expect(new Set(sections).size).toBe(sections.length);
    expect(new Set(questions).size).toBe(questions.length);
  });

  it("has the 14 sections in order", () => {
    expect(t.sections.map((s) => s.id)).toEqual([
      "identificacao",
      "queixas",
      "analise",
      "historia",
      "antecedentes",
      "gestacional",
      "setenios",
      "desencadeadores",
      "clinicos",
      "pregressas",
      "habitos",
      "lazer",
      "diagnostico",
      "protocolos",
    ]);
  });

  it("diagnosis and protocols are not copied", () => {
    for (const s of t.sections) {
      expect(s.copy).toBe(!["diagnostico", "protocolos"].includes(s.id));
    }
  });

  it("setênios include 49 or more", () => {
    const s = t.sections.find((x) => x.id === "setenios")!;
    expect(s.questions).toHaveLength(8);
    expect(s.questions[7].label.startsWith("49 anos ou mais")).toBe(true);
  });

  it("bristol is a 1-7 choice", () => {
    const q = t.sections
      .flatMap((s) => s.questions)
      .find((x) => x.id === "clinicos_bristol")!;
    expect(q.type).toBe("single");
    if (q.type !== "single") throw new Error("unreachable");
    expect(q.options.map((o) => o.value)).toEqual([
      "1", "2", "3", "4", "5", "6", "7",
    ]);
  });

  it("uses the agreed ids and option values", () => {
    const all = t.sections.flatMap((s) => s.questions);
    for (const id of [
      "identificacao_profissao",
      "identificacao_atuacao",
      "queixas_principais",
      "gestacional_parto_tipo",
      "pregressas_doencas",
      "pregressas_outras",
      "setenios_0_7",
      "diagnostico_estado_geral",
    ]) {
      expect(all.some((q) => q.id === id), id).toBe(true);
    }
    const parto = all.find((q) => q.id === "gestacional_parto_tipo")!;
    expect(parto.type).toBe("multi");
    if (parto.type === "multi") {
      expect(parto.options.map((o) => o.value)).toContain("forceps");
    }
  });
});

describe("answersSchema", () => {
  const schema = answersSchema(t);

  it("rejects unknown question", () => {
    expect(schema.safeParse({ nope: "x" }).success).toBe(false);
  });

  it("rejects wrong types", () => {
    expect(schema.safeParse({ queixas_principais: ["a"] }).success).toBe(false);
    expect(schema.safeParse({ pregressas_doencas: "diabetes" }).success).toBe(
      false,
    );
  });

  it("rejects option outside the list", () => {
    expect(schema.safeParse({ identificacao_atuacao: "zzz" }).success).toBe(
      false,
    );
    expect(
      schema.safeParse({ pregressas_doencas: ["diabetes", "zzz"] }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ identificacao_atuacao: "clt" }).success,
    ).toBe(true);
  });

  it("enforces limits", () => {
    expect(
      schema.safeParse({ identificacao_profissao: "a".repeat(201) }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ identificacao_profissao: "a".repeat(200) }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ queixas_principais: "a".repeat(5001) }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ queixas_principais: "a".repeat(5000) }).success,
    ).toBe(true);
  });

  it("drops empty answers", () => {
    const r = schema.safeParse({ queixas_principais: "", pregressas_doencas: [] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({});
  });

  it("exports a byte cap", () => {
    expect(ANSWERS_MAX_BYTES).toBe(200_000);
  });
});

describe("copyAnswers", () => {
  it("skips diagnosis and protocols", () => {
    const out = copyAnswers(
      { queixas_principais: "dor", diagnostico_estado_geral: "ok" },
      t,
      t,
    );
    expect(out).toEqual({ queixas_principais: "dor" });
  });

  it("drops questions missing from the new version", () => {
    const to: AnamnesisTemplate = {
      id: "fake",
      title: "Fake",
      sections: [
        {
          id: "queixas",
          title: "Q",
          copy: true,
          questions: [{ id: "queixas_principais", label: "x", type: "long" }],
        },
      ],
    };
    const out = copyAnswers(
      { queixas_principais: "dor", queixas_duracao: "1 mês" },
      t,
      to,
    );
    expect(out).toEqual({ queixas_principais: "dor" });
  });

  it("drops questions whose type changed", () => {
    const to: AnamnesisTemplate = {
      id: "fake",
      title: "Fake",
      sections: [
        {
          id: "queixas",
          title: "Q",
          copy: true,
          questions: [
            {
              id: "queixas_principais",
              label: "x",
              type: "multi",
              options: [{ value: "a", label: "A" }],
            },
          ],
        },
      ],
    };
    expect(copyAnswers({ queixas_principais: "dor" }, t, to)).toEqual({});
  });
});

describe("copyAnswers options", () => {
  const to: AnamnesisTemplate = {
    id: "fake",
    title: "Fake",
    sections: [
      {
        id: "s",
        title: "S",
        copy: true,
        questions: [
          {
            id: "pregressas_doencas",
            label: "x",
            type: "multi",
            options: [{ value: "diabetes", label: "D" }],
          },
          {
            id: "identificacao_atuacao",
            label: "y",
            type: "single",
            options: [{ value: "clt", label: "C" }],
          },
        ],
      },
    ],
  };

  it("drops option values that no longer exist", () => {
    const out = copyAnswers(
      {
        pregressas_doencas: ["diabetes", "cancer"],
        identificacao_atuacao: "clinica",
      },
      t,
      to,
    );
    expect(out).toEqual({ pregressas_doencas: ["diabetes"] });
  });

  it("keeps answers whose options all still exist", () => {
    const out = copyAnswers(
      { pregressas_doencas: ["diabetes"], identificacao_atuacao: "clt" },
      t,
      to,
    );
    expect(out).toEqual({
      pregressas_doencas: ["diabetes"],
      identificacao_atuacao: "clt",
    });
  });
});

describe("answeredSections", () => {
  it("hides empty sections and maps labels", () => {
    const out = answeredSections(t, {
      pregressas_doencas: ["diabetes", "hipertensao"],
    });
    expect(out).toHaveLength(1);
    expect(out[0].section.id).toBe("pregressas");
    expect(out[0].items).toHaveLength(1);
    expect(out[0].items[0].text).toBe("Diabetes, Hipertensão");
  });
});
