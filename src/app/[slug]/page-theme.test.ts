import { describe, expect, it } from "vitest";

import { pageStyleCss, pageThemeCss } from "./page-theme";

describe("pageThemeCss", () => {
  it("is empty without a chosen color", () => {
    expect(pageThemeCss({}, ".clinic-page")).toBe("");
  });

  it("is empty for a color that is not #rrggbb", () => {
    expect(
      pageThemeCss({ primaryColor: "red;}body{color:red" }, ".clinic-page"),
    ).toBe("");
    expect(pageThemeCss({ primaryColor: "#0a7d5" }, ".clinic-page")).toBe("");
  });

  it("reads an uppercase color as its lowercase form", () => {
    expect(pageThemeCss({ primaryColor: "#0A7D5A" }, ".clinic-page")).toContain(
      "--primary:#0a7d5a",
    );
  });

  it("scopes the palette of the color to the page, in both themes", () => {
    const css = pageThemeCss({ primaryColor: "#0a7d5a" }, ".clinic-page");
    expect(css).toContain(".clinic-page{");
    expect(css).toContain("--primary:#0a7d5a");
    expect(css).toContain(".dark .clinic-page{");
    expect(css).toContain("--primary-text:");
    expect(css).not.toContain(":root");
  });
});

describe("pageStyleCss", () => {
  it("sets the heading font and the button radius on the page", () => {
    const css = pageStyleCss(
      { fontId: "playfair", buttonShape: "square" },
      ".clinic-page",
    );
    expect(css).toContain(".clinic-page{");
    expect(css).toContain('--font-heading:"Playfair Display Variable"');
    expect(css).toContain("--radius-button:0.25rem");
  });

  it("keeps the defaults without choices", () => {
    const css = pageStyleCss({}, ".clinic-page");
    expect(css).toContain('--font-heading:"Bricolage Grotesque Variable"');
    expect(css).toContain("--radius-button:9999px");
  });
});
