import { describe, expect, it } from "vitest";

import { easterSunday, nationalHolidays } from "./holidays";

describe("easterSunday", () => {
  it("computes Easter", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2030)).toBe("2030-04-21");
  });
});

describe("nationalHolidays", () => {
  const list = nationalHolidays(2026);

  it("has ten holidays in date order", () => {
    expect(list).toHaveLength(10);
    const dates = list.map((h) => h.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("includes Good Friday and Consciência Negra", () => {
    expect(list).toContainEqual({
      date: "2026-04-03",
      name: "Sexta-feira Santa",
    });
    expect(list.map((h) => h.date)).toContain("2026-11-20");
  });
});
