import { describe, expect, it } from "vitest";

import { bookingButtonClass } from "./booking-button";

describe("bookingButtonClass", () => {
  it("uses the chosen shape in every style", () => {
    for (const theme of [{}, { buttonFill: "outline" as const }]) {
      expect(bookingButtonClass(theme)).toContain(
        "rounded-[var(--radius-button)]",
      );
      expect(bookingButtonClass(theme)).not.toContain("rounded-full");
    }
  });

  it("outline: contour and text in the readable variant of the color", () => {
    const css = bookingButtonClass({
      buttonFill: "outline",
      primaryColor: "#0a7d5a",
    });
    expect(css).toContain("border-2 border-primary-text");
    expect(css).toContain("text-primary-text");
    expect(css).not.toContain("bg-primary");
  });

  it("solid with a chosen color: the color in both themes", () => {
    const css = bookingButtonClass({ primaryColor: "#0a7d5a" });
    expect(css).toContain("bg-primary text-primary-foreground");
    expect(css).not.toContain("dark:bg-highlight");
  });

  it("solid without a color: Zemana purple, yellow in the dark theme", () => {
    for (const theme of [{}, { primaryColor: "azul" }]) {
      const css = bookingButtonClass(theme);
      expect(css).toContain("bg-primary text-primary-foreground");
      expect(css).toContain("dark:bg-highlight");
    }
  });
});
