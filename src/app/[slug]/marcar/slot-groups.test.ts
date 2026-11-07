import { describe, expect, it } from "vitest";

import { groupSlots } from "./slot-groups";

const at = (time: string) => `2026-11-10T${time}:00-03:00`;

describe("groupSlots", () => {
  it("splits at 12:00 and 18:00 by the slot's own HH:mm", () => {
    const groups = groupSlots([
      at("09:00"),
      at("12:00"),
      at("17:50"),
      at("18:00"),
    ]);
    expect(groups.map((group) => [group.period, group.label])).toEqual([
      ["manha", "Manhã"],
      ["tarde", "Tarde"],
      ["noite", "Noite"],
    ]);
    expect(groups.map((group) => group.slots.length)).toEqual([1, 2, 1]);
  });

  it("omits empty groups", () => {
    const groups = groupSlots([at("13:00")]);
    expect(groups.map((group) => group.period)).toEqual(["tarde"]);
  });

  it("returns nothing for no slots", () => {
    expect(groupSlots([])).toEqual([]);
  });
});
