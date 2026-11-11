import { describe, expect, it } from "vitest";

import { buttonRadius } from "./buttons";
import { fontFamily, FONTS, pageStyleVars } from "./fonts";

describe("page style", () => {
  it("usa Bricolage por padrão", () => {
    expect(fontFamily(undefined)).toContain("Bricolage");
  });

  it("resolve cada fonte pelo id", () => {
    for (const f of FONTS) expect(fontFamily(f.id)).toBe(f.family);
  });

  it("mapeia o formato do botão para o raio", () => {
    expect(buttonRadius("square")).toBe("0.25rem");
    expect(buttonRadius("rounded")).toBe("0.75rem");
    expect(buttonRadius("pill")).toBe("9999px");
    expect(buttonRadius(undefined)).toBe("9999px");
  });

  it("gera as variáveis CSS do tema", () => {
    expect(pageStyleVars({ fontId: "oswald", buttonShape: "rounded" })).toEqual(
      {
        "--font-heading": '"Oswald Variable"',
        "--radius-button": "0.75rem",
      },
    );
  });
});
