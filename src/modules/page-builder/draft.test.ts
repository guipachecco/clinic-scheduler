import { describe, expect, it } from "vitest";

import {
  draftMediaIds,
  mergeDraft,
  mergePatch,
  pageDraftSchema,
  parseDraft,
  type PublishedPage,
  STEP_IDS,
} from "./draft";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

const published: PublishedPage = {
  businessType: "clinic",
  logoMediaId: A,
  ownerPhotoMediaId: null,
  coverMediaId: null,
  theme: { primaryColor: "#7c3aed" },
  headline: "Antiga",
  about: null,
  gallery: [B],
};

describe("parseDraft", () => {
  it("drops invalid fields one by one", () => {
    expect(
      parseDraft({ theme: { primaryColor: "azul" }, headline: "Oi" }),
    ).toEqual({ theme: {}, headline: "Oi" });
  });

  it("returns an empty draft for anything that is not an object", () => {
    expect(parseDraft("lixo")).toEqual({});
    expect(parseDraft(null)).toEqual({});
    expect(parseDraft([1, 2])).toEqual({});
  });

  it("keeps valid fields, null included", () => {
    expect(
      parseDraft({
        businessType: "barbershop",
        logoMediaId: null,
        coverMediaId: "não-é-uuid",
        theme: { fontId: "oswald", buttonShape: "triângulo" },
        gallery: [A, B],
      }),
    ).toEqual({
      businessType: "barbershop",
      logoMediaId: null,
      theme: { fontId: "oswald" },
      gallery: [A, B],
    });
  });
});

describe("pageDraftSchema", () => {
  it("rejects a repeated gallery image", () => {
    expect(pageDraftSchema.safeParse({ gallery: [A, A] }).success).toBe(false);
  });

  it("rejects an unknown font", () => {
    expect(
      pageDraftSchema.safeParse({ theme: { fontId: "comic" } }).success,
    ).toBe(false);
  });
});

describe("pageDraftSchema messages", () => {
  it.each([
    [{ businessType: "padaria" }, "Tipo de negócio inválido."],
    [{ theme: { buttonShape: "x" } }, "Formato de botão inválido."],
    [{ theme: { buttonFill: "x" } }, "Preenchimento de botão inválido."],
    [{ theme: { fontId: "comic" } }, "Fonte inválida."],
    [{ theme: { primaryColor: 1 } }, "Cor inválida."],
    [{ theme: "azul" }, "Estilo inválido."],
    [{ headline: 5 }, "Texto inválido."],
    [{ gallery: "x" }, "Fotos inválidas."],
    [{ logoMediaId: 3 }, "Imagem inválida."],
    ["lixo", "Rascunho inválido."],
  ])("%j → %s", (input, message) => {
    const result = pageDraftSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.message).toBe(message);
  });
});

describe("mergeDraft", () => {
  it("keeps the published logo when the draft does not touch it", () => {
    expect(mergeDraft(published, {}).logoMediaId).toBe(A);
  });

  it("removes the logo when the draft sets it to null", () => {
    expect(mergeDraft(published, { logoMediaId: null }).logoMediaId).toBe(null);
  });

  it("merges the theme field by field", () => {
    expect(
      mergeDraft(published, { theme: { fontId: "oswald" } }).theme,
    ).toEqual({ primaryColor: "#7c3aed", fontId: "oswald" });
  });

  it("replaces the gallery only when the draft has one", () => {
    expect(mergeDraft(published, {}).gallery).toEqual([B]);
    expect(mergeDraft(published, { gallery: [C] }).gallery).toEqual([C]);
  });
});

describe("mergePatch", () => {
  it("overrides keys, keeps null and merges the theme", () => {
    expect(
      mergePatch(
        { headline: "Oi", theme: { primaryColor: "#000000" }, coverMediaId: A },
        { coverMediaId: null, theme: { fontId: "oswald" } },
      ),
    ).toEqual({
      headline: "Oi",
      coverMediaId: null,
      theme: { primaryColor: "#000000", fontId: "oswald" },
    });
  });
});

describe("draftMediaIds", () => {
  it("lists every image the draft points at, once", () => {
    expect(
      draftMediaIds({
        logoMediaId: A,
        ownerPhotoMediaId: null,
        coverMediaId: B,
        gallery: [B, C],
      }).sort(),
    ).toEqual([A, B, C]);
  });
});

it("lists the wizard steps in order", () => {
  expect(STEP_IDS[0]).toBe("tipo");
  expect(STEP_IDS.at(-1)).toBe("publicar");
});
