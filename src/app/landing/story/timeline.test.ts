import { describe, expect, it } from "vitest";

import { ENTRIES, MARKS, pathData, pencilAt } from "./timeline";

describe("story timeline", () => {
  it("strokes happen one after another, inside 0..1", () => {
    const windows = [...Object.values(ENTRIES), ...Object.values(MARKS)].sort(
      (a, b) => a.start - b.start,
    );
    for (const [i, window] of windows.entries()) {
      expect(window.start).toBeGreaterThanOrEqual(0);
      expect(window.end).toBeLessThanOrEqual(1);
      expect(window.end).toBeGreaterThan(window.start);
      const next = windows[i + 1];
      if (next) expect(next.start).toBeGreaterThanOrEqual(window.end);
    }
  });

  it("the pencil starts and ends the X at its corners", () => {
    expect(pencilAt(MARKS.x1.start)).toEqual({ x: 26, y: 34 });
    expect(pencilAt(MARKS.x1.end)).toEqual({ x: 336, y: 474 });
    expect(pencilAt(MARKS.x2.end)).toEqual({ x: 24, y: 478 });
  });

  it("the pencil writes along each entry", () => {
    const { ana } = ENTRIES;
    expect(pencilAt(ana.start).x).toBe(ana.x);
    expect(pencilAt(ana.end).x).toBeCloseTo(ana.x + ana.width);
  });

  it("the pencil moves smoothly and leaves the paper at the end", () => {
    let previous = pencilAt(0);
    for (let step = 1; step <= 1000; step++) {
      const point = pencilAt(step / 1000);
      const jump = Math.hypot(point.x - previous.x, point.y - previous.y);
      expect(jump).toBeLessThan(40);
      previous = point;
    }
    expect(pencilAt(1).x).toBeGreaterThan(360);
  });

  it("builds SVG path data from the segments", () => {
    expect(pathData(MARKS.strike.segments)).toMatch(/^M90 221C/);
  });
});
