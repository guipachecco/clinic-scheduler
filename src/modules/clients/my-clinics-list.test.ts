import { describe, expect, it } from "vitest";

import {
  clinicSearchText,
  matchesClinicSearch,
  orderMyClinics,
} from "./my-clinics-list";

const day = (n: number) => new Date(Date.UTC(2026, 10, n, 12));

function clinic(
  slug: string,
  name: string,
  { next, last }: { next?: number; last?: number } = {},
) {
  return {
    slug,
    name,
    nextAppointment: next === undefined ? null : { startsAt: day(next) },
    lastVisitAt: last === undefined ? null : day(last),
  };
}

describe("orderMyClinics", () => {
  it("puts the soonest appointment first, then the latest visit, then the name", () => {
    const list = [
      clinic("zeta", "Zeta"),
      clinic("visit-old", "Antiga", { last: 1 }),
      clinic("next-late", "Depois", { next: 20, last: 10 }),
      clinic("alfa", "Alfa"),
      clinic("visit-new", "Recente", { last: 9 }),
      clinic("next-soon", "Logo", { next: 15 }),
    ];
    expect(orderMyClinics(list).map((c) => c.slug)).toEqual([
      "next-soon",
      "next-late",
      "visit-new",
      "visit-old",
      "alfa",
      "zeta",
    ]);
  });

  it("breaks ties by name with accents and then by slug", () => {
    const list = [
      clinic("b", "Ótica"),
      clinic("c", "Estética", { next: 3 }),
      clinic("a", "Estética", { next: 3 }),
      clinic("d", "Oásis"),
    ];
    expect(orderMyClinics(list).map((c) => c.slug)).toEqual([
      "a",
      "c",
      "d",
      "b",
    ]);
  });

  it("does not change the list it receives", () => {
    const list = [clinic("b", "B"), clinic("a", "A")];
    orderMyClinics(list);
    expect(list.map((c) => c.slug)).toEqual(["b", "a"]);
  });
});

describe("matchesClinicSearch", () => {
  const text = clinicSearchText({
    slug: "studio-karina-centro",
    name: "Studio Karina",
    areaLabel: "Estética",
    address: "Rua das Flores, 120 — Joinville",
  });

  it("ignores accents, case and extra spaces", () => {
    expect(matchesClinicSearch(text, "  ESTETICA ")).toBe(true);
    expect(matchesClinicSearch(text, "karína")).toBe(true);
  });

  it("looks in the address and the slug", () => {
    expect(matchesClinicSearch(text, "joinville")).toBe(true);
    expect(matchesClinicSearch(text, "karina-centro")).toBe(true);
  });

  it("needs every word, in any order", () => {
    expect(matchesClinicSearch(text, "joinville studio")).toBe(true);
    expect(matchesClinicSearch(text, "studio blumenau")).toBe(false);
  });

  it("matches everything with an empty query", () => {
    expect(matchesClinicSearch(text, "")).toBe(true);
    expect(matchesClinicSearch(text, "   ")).toBe(true);
  });

  it("skips a missing area and address", () => {
    expect(
      clinicSearchText({
        slug: "x",
        name: "Clínica X",
        areaLabel: null,
        address: null,
      }),
    ).toBe("clinica x x");
  });
});
