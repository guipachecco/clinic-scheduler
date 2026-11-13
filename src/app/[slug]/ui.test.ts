import { describe, expect, it } from "vitest";

import { mapsLink, visitPriceLabel } from "./ui";

describe("mapsLink", () => {
  it("prefers the clinic's own map link", () => {
    expect(
      mapsLink({ mapsUrl: "https://maps.app.goo.gl/abc", address: "Rua A, 1" }),
    ).toBe("https://maps.app.goo.gl/abc");
  });

  it("falls back to a Google Maps search of the address", () => {
    expect(mapsLink({ mapsUrl: null, address: "Rua A, 1 - São Paulo" })).toBe(
      "https://www.google.com/maps/search/?api=1&query=Rua%20A%2C%201%20-%20S%C3%A3o%20Paulo",
    );
  });

  it("is null with neither", () => {
    expect(mapsLink({ mapsUrl: null, address: null })).toBeNull();
  });
});

describe("visitPriceLabel", () => {
  // Intl separates "R$" and the number with a non-breaking space.
  const text = (value: string | null) => value?.replace(/\s/g, " ") ?? null;

  it("keeps a single service's own label", () => {
    expect(
      text(visitPriceLabel([{ display: "starting_at", cents: 5_000 }])),
    ).toBe("A partir de R$ 50,00");
    expect(visitPriceLabel([{ display: "hidden", cents: null }])).toBeNull();
    expect(visitPriceLabel([])).toBeNull();
  });

  it("adds up fixed prices", () => {
    expect(
      text(
        visitPriceLabel([
          { display: "fixed", cents: 12_000 },
          { display: "fixed", cents: 5_000 },
        ]),
      ),
    ).toBe("R$ 170,00");
  });

  it("is a floor when a price is open or not shown", () => {
    for (const other of [
      { display: "starting_at", cents: 5_000 },
      { display: "on_request", cents: null },
      { display: "hidden", cents: null },
    ] as const) {
      expect(
        text(visitPriceLabel([{ display: "fixed", cents: 12_000 }, other])),
      ).toMatch(/^A partir de R\$ 1[27]0,00$/);
    }
  });

  it("shows no total when no service shows a price", () => {
    expect(
      visitPriceLabel([
        { display: "on_request", cents: null },
        { display: "hidden", cents: null },
      ]),
    ).toBe("Sob consulta");
    expect(
      visitPriceLabel([
        { display: "hidden", cents: null },
        { display: "hidden", cents: null },
      ]),
    ).toBeNull();
  });
});
