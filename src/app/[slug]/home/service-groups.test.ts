import { describe, expect, it } from "vitest";

import { durationLabel, groupByCategory } from "./service-groups";

describe("durationLabel", () => {
  it.each([
    [45, "45 min"],
    [60, "1h"],
    [90, "1h30"],
    [150, "2h30"],
    [125, "2h05"],
  ])("%i minutes -> %s", (minutes, label) => {
    expect(durationLabel(minutes)).toBe(label);
  });
});

const maos = { id: "c1", name: "Mãos" };
const pes = { id: "c2", name: "Pés" };

describe("groupByCategory", () => {
  it("keeps the order and puts each service under its category", () => {
    const groups = groupByCategory([
      { id: "s1", category: maos },
      { id: "s2", category: maos },
      { id: "s3", category: pes },
    ]);
    expect(groups.map((g) => [g.name, g.services.map((s) => s.id)])).toEqual([
      ["Mãos", ["s1", "s2"]],
      ["Pés", ["s3"]],
    ]);
  });

  it("gives one group when every service is in the same category", () => {
    expect(
      groupByCategory([
        { id: "s1", category: maos },
        { id: "s2", category: maos },
      ]),
    ).toHaveLength(1);
  });

  it("gives no group without services", () => {
    expect(groupByCategory([])).toEqual([]);
  });
});
