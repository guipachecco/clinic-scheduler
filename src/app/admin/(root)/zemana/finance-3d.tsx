"use client";

import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import { formatCents } from "@/modules/services/fields";

// The 3D pieces of root's "Financeiro": a balance card that tilts with the
// pointer, money that counts up, and an isometric bar chart of the last
// months that grows in. The server HTML already shows the final values;
// motion only starts after mount and is skipped under prefers-reduced-motion.

// Pointer position over an element, as springy tilt angles.
function useTilt(max: number) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [max, -max]), {
    stiffness: 180,
    damping: 18,
  });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-max, max]), {
    stiffness: 180,
    damping: 18,
  });
  const handlers = reduce
    ? {}
    : {
        onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
          const box = event.currentTarget.getBoundingClientRect();
          x.set((event.clientX - box.left) / box.width - 0.5);
          y.set((event.clientY - box.top) / box.height - 0.5);
        },
        onPointerLeave: () => {
          x.set(0);
          y.set(0);
        },
      };
  return { rotateX, rotateY, handlers };
}

// Money counting up from zero to cents, written straight into the node.
export function CountUp({
  cents,
  className,
}: {
  cents: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const node = ref.current;
    if (!node || reduce) return;
    const controls = animate(0, cents, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (value) => {
        node.textContent = formatCents(Math.round(value));
      },
    });
    return () => controls.stop();
  }, [cents, reduce]);
  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {formatCents(cents)}
    </span>
  );
}

// The month's balance: a purple slab that tilts toward the pointer, with the
// numbers floating above it (translateZ).
export function BalanceCard({
  monthName,
  balanceCents,
  receivedCents,
  paidCents,
}: {
  monthName: string;
  balanceCents: number;
  receivedCents: number;
  paidCents: number;
}) {
  const { rotateX, rotateY, handlers } = useTilt(9);
  const total = receivedCents + paidCents;
  const inShare = total === 0 ? 0.5 : receivedCents / total;
  return (
    <div className="[perspective:1100px]" {...handlers}>
      <motion.section
        aria-label={`Saldo de ${monthName}`}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="relative grid min-h-64 content-between gap-6 overflow-hidden bg-brand p-6 text-brand-foreground shadow-[0_30px_60px_-30px_rgb(42_0_129/0.7)] md:p-8"
      >
        {/* Depth: a yellow block and a pink plate behind the numbers. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-10 -right-10 size-48 bg-highlight opacity-90"
          style={{ transform: "translateZ(-40px) rotate(12deg)" }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-16 left-1/3 h-32 w-72 bg-brand-accent opacity-25"
          style={{ transform: "translateZ(-20px) rotate(-6deg)" }}
        />
        <div
          className="relative grid gap-1"
          style={{ transform: "translateZ(50px)" }}
        >
          <span className="text-xs font-semibold tracking-[0.2em] uppercase opacity-80">
            Saldo · {monthName}
          </span>
          <CountUp
            cents={balanceCents}
            className="font-heading text-5xl font-extrabold md:text-6xl"
          />
          <span className="text-sm opacity-80">entrou menos paguei</span>
        </div>
        <div
          className="relative grid gap-3"
          style={{ transform: "translateZ(30px)" }}
        >
          {/* Share of the month's money: in (yellow) vs out (pink). */}
          <div
            className="flex h-3 w-full overflow-hidden bg-brand-muted"
            role="img"
            aria-label={`Entrou ${formatCents(receivedCents)}, paguei ${formatCents(paidCents)}`}
          >
            <motion.div
              className="h-full bg-highlight"
              initial={false}
              animate={{ width: `${inShare * 100}%` }}
              transition={{ type: "spring", stiffness: 90, damping: 16 }}
            />
            <div className="h-full flex-1 bg-brand-accent" />
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              <span className="size-2.5 bg-highlight" aria-hidden="true" />
              Entrou <CountUp cents={receivedCents} className="font-bold" />
            </span>
            <span className="flex items-center gap-2">
              <span className="size-2.5 bg-brand-accent" aria-hidden="true" />
              Paguei <CountUp cents={paidCents} className="font-bold" />
            </span>
          </div>
        </div>
      </motion.section>
    </div>
  );
}

export type MonthBar = {
  month: string;
  label: string;
  inCents: number;
  outCents: number;
};

const DEPTH = 12;
const CHART_HEIGHT = 200;

// One isometric block: front face, lit top and shaded side (skewed
// parallelograms), growing from the floor.
function Block({
  height,
  delay,
  tone,
  title,
}: {
  height: number;
  delay: number;
  tone: "in" | "out";
  title: string;
}) {
  const reduce = useReducedMotion();
  const color = tone === "in" ? "var(--highlight)" : "var(--primary)";
  return (
    <motion.div
      title={title}
      className="relative w-5 sm:w-7"
      initial={reduce ? false : { height: 0 }}
      animate={{ height }}
      transition={{ type: "spring", stiffness: 70, damping: 13, delay }}
      style={{ height }}
    >
      <div className="absolute inset-0" style={{ background: color }} />
      <div
        className="absolute left-0 w-full origin-bottom-left"
        style={{
          top: -DEPTH,
          height: DEPTH,
          transform: "skewX(-45deg)",
          background: `color-mix(in oklab, ${color}, white 38%)`,
        }}
      />
      <div
        className="absolute top-0 h-full origin-top-left"
        style={{
          left: "100%",
          width: DEPTH,
          transform: "skewY(-45deg)",
          background: `color-mix(in oklab, ${color}, black 32%)`,
        }}
      />
    </motion.div>
  );
}

// Money in and out per month as 3D blocks on a perspective floor; the whole
// scene leans with the pointer.
export function MonthBars3D({ bars }: { bars: MonthBar[] }) {
  const { rotateX, rotateY, handlers } = useTilt(6);
  const max = Math.max(1, ...bars.flatMap((b) => [b.inCents, b.outCents]));
  const scale = (cents: number) =>
    cents === 0 ? 2 : Math.max(6, (cents / max) * CHART_HEIGHT);
  return (
    <div className="[perspective:1200px]" {...handlers}>
      <motion.div
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="relative pt-6"
      >
        {/* The floor: a grid laid back in perspective under the blocks. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-6 h-24 origin-bottom opacity-70"
          style={{
            transform: "rotateX(72deg)",
            backgroundImage:
              "linear-gradient(to right, color-mix(in oklab, var(--primary), transparent 80%) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--primary), transparent 80%) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            maskImage: "linear-gradient(to top, black, transparent)",
          }}
        />
        <ol
          aria-hidden="true"
          className="relative grid items-end gap-2"
          style={{
            gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))`,
            height: CHART_HEIGHT + DEPTH + 28,
          }}
        >
          {bars.map((bar, index) => (
            <li key={bar.month} className="grid justify-items-center gap-2">
              <div className="flex items-end gap-3 pr-3">
                <Block
                  tone="in"
                  height={scale(bar.inCents)}
                  delay={0.08 * index}
                  title={`${bar.label}: entrou ${formatCents(bar.inCents)}`}
                />
                <Block
                  tone="out"
                  height={scale(bar.outCents)}
                  delay={0.08 * index + 0.05}
                  title={`${bar.label}: paguei ${formatCents(bar.outCents)}`}
                />
              </div>
              <span className="text-xs font-semibold text-muted-foreground uppercase">
                {bar.label}
              </span>
            </li>
          ))}
        </ol>
      </motion.div>
      {/* The same numbers for screen readers. */}
      <table className="sr-only">
        <caption>Entrou e paguei por mês</caption>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            <th scope="col">Entrou</th>
            <th scope="col">Paguei</th>
          </tr>
        </thead>
        <tbody>
          {bars.map((bar) => (
            <tr key={bar.month}>
              <th scope="row">{bar.label}</th>
              <td>{formatCents(bar.inCents)}</td>
              <td>{formatCents(bar.outCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
