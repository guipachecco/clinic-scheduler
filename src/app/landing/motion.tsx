"use client";

import { motion, useReducedMotion } from "motion/react";

// The landing page's small animations. Every element marked `data-motion` is
// forced static by landing.css under prefers-reduced-motion, so the page reads
// the same before JavaScript knows the preference; useReducedMotion() also
// stops the endless loops there.

// The hero logo: drops in with a springy bounce, then floats gently.
export function BouncingLogo({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      data-motion=""
      initial={{ y: -60, scale: 0.7, rotate: -12 }}
      animate={{ y: 0, scale: 1, rotate: -4 }}
      transition={{ type: "spring", stiffness: 320, damping: 11, delay: 0.15 }}
    >
      <motion.div
        data-motion=""
        animate={reduce ? undefined : { y: [0, -10, 0] }}
        transition={{
          duration: 2.6,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1.2,
        }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

// A circle of text that turns slowly around the hero logo.
export function SpinningRing({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      data-motion=""
      className="absolute inset-0"
      animate={reduce ? undefined : { rotate: 360 }}
      transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
    >
      {children}
    </motion.div>
  );
}

// Rises into place the first time it scrolls into view.
export function RiseIn({
  children,
  delay = 0,
  className,
  testId,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  testId?: string;
}) {
  return (
    <motion.div
      data-motion=""
      data-testid={testId}
      className={className}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ type: "spring", stiffness: 240, damping: 20, delay }}
    >
      {children}
    </motion.div>
  );
}
