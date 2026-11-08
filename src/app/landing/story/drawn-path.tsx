"use client";

import { motion, type MotionValue, useTransform } from "motion/react";

import { type Mark, pathData } from "./timeline";

// A pencil stroke whose drawn length follows the paper's progress through the
// mark's [start, end] window. Hidden until it starts, so round line caps never
// leave a dot behind.
export function DrawnPath({
  mark,
  progress,
  stroke,
  strokeWidth,
}: {
  mark: Mark;
  progress: MotionValue<number>;
  stroke: string;
  strokeWidth: number;
}) {
  const pathLength = useTransform(progress, [mark.start, mark.end], [0, 1]);
  const opacity = useTransform(pathLength, [0, 0.02], [0, 1]);
  return (
    <motion.path
      d={pathData(mark.segments)}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ pathLength, opacity }}
    />
  );
}
