"use client";

import type { MotionValue } from "motion/react";

import { DrawnPath } from "./drawn-path";
import { MARKS } from "./timeline";

// The giant X across the whole agenda: a chunky yellow stroke with a purple
// outline (the outline is the same path drawn wider underneath).
export function BigX({ progress }: { progress: MotionValue<number> }) {
  return (
    <g data-testid="big-x" aria-hidden="true">
      {[MARKS.x1, MARKS.x2].map((mark, index) => (
        <g key={index}>
          <DrawnPath
            mark={mark}
            progress={progress}
            stroke="#2a0081"
            strokeWidth={26}
          />
          <DrawnPath
            mark={mark}
            progress={progress}
            stroke="#f5c700"
            strokeWidth={15}
          />
        </g>
      ))}
    </g>
  );
}
