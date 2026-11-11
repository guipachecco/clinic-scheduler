import { describe, expect, it } from "vitest";

import { STARTER_STYLE } from "@/modules/business-type/vocabulary";
import type { PublishedPage } from "@/modules/page-builder/draft";

import {
  businessTypePatch,
  changedLabels,
  moveItem,
  normalizeColor,
  stepFromParam,
  stepHref,
} from "./wizard";

const published: PublishedPage = {
  businessType: "clinic",
  logoMediaId: null,
  ownerPhotoMediaId: null,
  coverMediaId: null,
  theme: {},
  headline: null,
  about: null,
  gallery: [],
};

describe("stepFromParam", () => {
  it("accepts the step ids and falls back to the first step", () => {
    expect(stepFromParam("cor")).toBe("cor");
    expect(stepFromParam("publicar")).toBe("publicar");
    expect(stepFromParam(undefined)).toBe("tipo");
    expect(stepFromParam("x")).toBe("tipo");
    expect(stepFromParam(["cor", "logo"])).toBe("tipo");
    expect(stepHref("galeria")).toBe("/admin/pagina/montar?passo=galeria");
  });
});

describe("businessTypePatch", () => {
  it("suggests the starting style when nothing was chosen", () => {
    expect(businessTypePatch("barbershop", published, {})).toEqual({
      businessType: "barbershop",
      theme: STARTER_STYLE.barbershop,
    });
  });

  it("keeps what the page or the draft already chose", () => {
    const page = { ...published, theme: { primaryColor: "#123456" } };
    expect(
      businessTypePatch("nail_salon", page, { theme: { fontId: "oswald" } }),
    ).toEqual({
      businessType: "nail_salon",
      theme: { buttonShape: STARTER_STYLE.nail_salon.buttonShape },
    });
    const all = {
      ...published,
      theme: {
        primaryColor: "#123456",
        fontId: "dmsans",
        buttonShape: "square" as const,
      },
    };
    expect(businessTypePatch("other", all, {})).toEqual({
      businessType: "other",
    });
  });
});

describe("changedLabels", () => {
  it("lists only the fields that differ", () => {
    expect(changedLabels(published, published)).toEqual([]);
    expect(
      changedLabels(published, {
        ...published,
        headline: "Oi",
        theme: { primaryColor: "#0a7d5a" },
        gallery: ["a"],
      }),
    ).toEqual(["Cor, botões ou fonte", "Frase de apresentação", "Galeria"]);
  });
});

describe("moveItem", () => {
  it("swaps with the neighbour and ignores moves past the ends", () => {
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });
});

describe("normalizeColor", () => {
  it("reads the usual ways of typing a color", () => {
    expect(normalizeColor(" #0A7D5A ")).toBe("#0a7d5a");
    expect(normalizeColor("0a7d5a")).toBe("#0a7d5a");
    expect(normalizeColor("verde")).toBe("verde");
  });
});
