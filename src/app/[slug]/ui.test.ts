import { describe, expect, it } from "vitest";

import { mapsLink } from "./ui";

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
