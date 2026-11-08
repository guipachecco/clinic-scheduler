"use client";

import { inView, motion, useAnimate, useReducedMotion } from "motion/react";
import { useEffect } from "react";

// The landing page's small animations. The server HTML always shows every
// element in its final, still place (so the page reads fine without
// JavaScript or before hydration); entrances only start after mount. Elements
// marked `data-motion` are also forced still by landing.css under
// prefers-reduced-motion, and useReducedMotion() skips the animations there.

// The hero logo: drops in with a springy bounce once mounted, then floats.
export function BouncingLogo({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const [scope, animate] = useAnimate<HTMLDivElement>();

  useEffect(() => {
    if (reduce || !scope.current) return;
    const controls = animate(
      scope.current,
      { y: [-60, 0], scale: [0.7, 1], rotate: [-12, -4] },
      { type: "spring", stiffness: 320, damping: 11, delay: 0.15 },
    );
    return () => controls.stop();
  }, [reduce, animate, scope]);

  return (
    <motion.div
      ref={scope}
      data-motion=""
      initial={false}
      animate={{ y: 0, scale: 1, rotate: -4 }}
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

// Rises into place the first time it scrolls into view. Rendered visible; only
// once mounted, and only if it is still below the fold, it is hidden and then
// animated in, so nothing already on screen ever disappears.
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
  const reduce = useReducedMotion();
  const [scope, animate] = useAnimate<HTMLDivElement>();

  useEffect(() => {
    const element = scope.current;
    if (reduce || !element) return;
    if (element.getBoundingClientRect().top < window.innerHeight) return;
    animate(element, { opacity: 0, y: 40 }, { duration: 0 });
    const stop = inView(
      element,
      () => {
        animate(
          element,
          { opacity: 1, y: 0 },
          { type: "spring", stiffness: 240, damping: 20, delay },
        );
        stop();
      },
      { amount: 0.2 },
    );
    return () => {
      stop();
      // Leave the card visible if the effect is torn down mid-way.
      animate(element, { opacity: 1, y: 0 }, { duration: 0 });
    };
  }, [reduce, animate, scope, delay]);

  return (
    <div ref={scope} data-motion="" data-testid={testId} className={className}>
      {children}
    </div>
  );
}
