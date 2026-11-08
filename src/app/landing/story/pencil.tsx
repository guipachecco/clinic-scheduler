"use client";

import { motion, type MotionValue, useTransform } from "motion/react";

import { pencilAt } from "./timeline";

// The pencil. Its tip sits at the group's origin and follows the stroke being
// drawn; the body leans up and to the right.
export function Pencil({ progress }: { progress: MotionValue<number> }) {
  const x = useTransform(progress, (t) => pencilAt(t).x);
  const y = useTransform(progress, (t) => pencilAt(t).y);
  return (
    <motion.g aria-hidden="true" style={{ x, y }}>
      <g
        transform="rotate(-38) scale(0.9)"
        stroke="#2a0081"
        strokeWidth="3"
        strokeLinejoin="round"
      >
        {/* Hard offset shadow, like the page's stickers. */}
        <path
          d="M4 6 26 -2h100v16H26Z"
          fill="#2a0081"
          stroke="none"
          opacity="0.35"
        />
        <path d="M0 0 24-9v18Z" fill="#ffe7b8" />
        <path d="M0 0 8-3v6Z" fill="#2a0081" />
        <rect x="24" y="-9" width="96" height="18" fill="#f5c700" />
        <path d="M24 -3h96M24 3h96" strokeWidth="1.5" opacity="0.5" />
        <rect x="120" y="-9" width="12" height="18" fill="#b7e7fc" />
        <path d="M132 -9h8a9 9 0 0 1 0 18h-8Z" fill="#ffd3f0" />
      </g>
    </motion.g>
  );
}
