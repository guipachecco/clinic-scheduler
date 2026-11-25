"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { reminderLeadLabel } from "@/modules/reminders/lead";

import { Icon } from "../icons";

import type { Confirmation } from "./actions";

// The screen after booking. With a paid Pix it opens with the Zemana "approved"
// moment: a purple stage, a yellow seal that springs in while the check draws
// itself, confetti in the brand colours bursting out and a tilted "Pix
// aprovado" sticker; then the details rise in. Without a deposit the same
// stage plays, with the "Horário marcado" sticker.
//
// The server never renders it (it only exists after a client action), so the
// confetti positions are fixed below instead of random per render. Under
// prefers-reduced-motion everything is shown in its final place at once.

const PURPLE = "#2a0081";
const YELLOW = "#f5c700";
const PINK = "#ffd3f0";
const SKY = "#b7e7fc";
const RASPBERRY = "#ba1650";

type Piece = {
  x: number;
  y: number;
  rotate: number;
  color: string;
  shape: "dot" | "bar" | "star" | "ring";
  delay: number;
};

const COLORS = [YELLOW, PINK, SKY, YELLOW, RASPBERRY, PINK];
const SHAPES: Piece["shape"][] = ["dot", "bar", "star", "ring", "bar", "dot"];

// 22 pieces around the seal, at two distances, slightly out of step.
const PIECES: Piece[] = Array.from({ length: 22 }, (_, index) => {
  const angle = (index / 22) * Math.PI * 2 + (index % 2 ? 0.14 : -0.08);
  const distance = index % 3 === 0 ? 150 : index % 3 === 1 ? 118 : 182;
  return {
    x: Math.round(Math.cos(angle) * distance * 1.35),
    y: Math.round(Math.sin(angle) * distance * 0.78),
    rotate: ((index * 47) % 260) - 130,
    color: COLORS[index % COLORS.length]!,
    shape: SHAPES[index % SHAPES.length]!,
    delay: 0.32 + (index % 5) * 0.035,
  };
});

function Shape({ piece }: { piece: Piece }) {
  switch (piece.shape) {
    case "dot":
      return (
        <span
          className="block size-3 rounded-full"
          style={{ background: piece.color }}
        />
      );
    case "bar":
      return (
        <span
          className="block h-2 w-5 rounded-full"
          style={{ background: piece.color }}
        />
      );
    case "ring":
      return (
        <span
          className="block size-4 rounded-full border-[3px]"
          style={{ borderColor: piece.color }}
        />
      );
    case "star":
      return (
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
          <path
            d="M12 1.5l2.6 7.1 7.4.3-5.8 4.7 2 7.2L12 16.6l-6.2 4.2 2-7.2L2 8.9l7.4-.3z"
            fill={piece.color}
          />
        </svg>
      );
  }
}

function Stage({ sticker, still }: { sticker: string; still: boolean }) {
  // `initial={false}` starts each element in its final state.
  const from = <T,>(value: T) => (still ? false : value);

  return (
    <div
      aria-hidden="true"
      className="relative isolate grid h-60 place-items-center overflow-hidden sm:h-64"
      style={{ background: PURPLE }}
    >
      {/* Slow sunburst behind the seal. */}
      <motion.div
        className="absolute top-1/2 left-1/2 size-[44rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background: `repeating-conic-gradient(from 0deg, ${YELLOW}22 0deg 9deg, transparent 9deg 24deg)`,
        }}
        initial={from({ scale: 0.2, opacity: 0, rotate: -30 })}
        animate={
          still
            ? { scale: 1, opacity: 1 }
            : { scale: 1, opacity: 1, rotate: 330 }
        }
        transition={{
          scale: { duration: 0.7, ease: [0.2, 0.9, 0.3, 1.2] },
          opacity: { duration: 0.4 },
          rotate: { duration: 40, ease: "linear", repeat: Infinity },
        }}
      />

      {/* Pulse rings that leave the seal. */}
      {still
        ? null
        : [0, 1].map((ring) => (
            <motion.span
              key={ring}
              className="absolute size-32 rounded-full border-4"
              style={{ borderColor: YELLOW }}
              initial={{ scale: 0.7, opacity: 0.9 }}
              animate={{ scale: 2.6, opacity: 0 }}
              transition={{
                duration: 1.1,
                delay: 0.35 + ring * 0.35,
                ease: "easeOut",
              }}
            />
          ))}

      {/* Confetti. */}
      {PIECES.map((piece, index) => (
        <motion.span
          key={index}
          className="absolute top-1/2 left-1/2 -mt-2 -ml-2"
          initial={from({ x: 0, y: 0, scale: 0, rotate: 0, opacity: 1 })}
          animate={{
            x: piece.x,
            y: piece.y,
            scale: 1,
            rotate: piece.rotate,
            opacity: still ? 0.9 : [1, 1, 0.9],
          }}
          transition={{
            type: "spring",
            stiffness: 140,
            damping: 14,
            delay: piece.delay,
          }}
        >
          <Shape piece={piece} />
        </motion.span>
      ))}

      {/* The seal and its check. */}
      <motion.div
        className="relative grid size-32 place-items-center rounded-full shadow-[0_0_0_8px_rgba(245,199,0,0.25),0_18px_40px_rgba(0,0,0,0.35)]"
        style={{ background: YELLOW }}
        initial={from({ scale: 0, rotate: -120 })}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 13, delay: 0.1 }}
      >
        <svg viewBox="0 0 64 64" className="size-20">
          <motion.path
            d="M16 33.5l10.5 10.5L48 21"
            fill="none"
            stroke={PURPLE}
            strokeWidth={8}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={from({ pathLength: 0 })}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45, delay: 0.45, ease: "easeOut" }}
          />
        </svg>
      </motion.div>

      {/* The sticker, slapped on with a bounce. */}
      <motion.span
        className="absolute bottom-5 rounded-full border-2 px-4 py-1 font-heading text-sm font-extrabold tracking-wider uppercase shadow-[3px_3px_0_rgba(0,0,0,0.25)]"
        style={{ background: PINK, borderColor: PURPLE, color: PURPLE }}
        initial={from({ y: 40, scale: 0.4, rotate: 12, opacity: 0 })}
        animate={{ y: 0, scale: 1, rotate: -5, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 12, delay: 0.9 }}
      >
        {sticker}
      </motion.span>
    </div>
  );
}

export function BookingDone({
  slug,
  confirmation,
  serviceName,
  paid,
}: {
  slug: string;
  confirmation: Confirmation;
  serviceName: string;
  // Paid Pix deposit: "Pix aprovado" and "Horário confirmado".
  paid: boolean;
}) {
  const reduce = useReducedMotion() ?? false;
  const heading = useRef<HTMLHeadingElement>(null);
  const title = paid ? "Horário confirmado!" : "Horário marcado!";

  useEffect(() => {
    // The step changed under her: move the reading position to the result.
    heading.current?.focus({ preventScroll: true });
    // A short "tchu-tchu" on phones that support it.
    if (!reduce && typeof navigator.vibrate === "function") {
      navigator.vibrate([24, 60, 40]);
    }
  }, [reduce]);

  const rise = (order: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.4, delay: 1.05 + order * 0.08 },
        };

  return (
    <section
      aria-labelledby="horario-marcado"
      className="grid overflow-hidden rounded-3xl border bg-card lg:mx-auto lg:w-full lg:max-w-xl"
    >
      <Stage sticker={paid ? "Pix aprovado" : "Tudo certo"} still={reduce} />

      <div className="grid gap-5 p-5 lg:p-8">
        <motion.div className="grid gap-1 text-center" {...rise(0)}>
          <h2
            id="horario-marcado"
            ref={heading}
            tabIndex={-1}
            className="font-heading text-2xl font-extrabold tracking-tight outline-none lg:text-3xl"
          >
            {title}
          </h2>
          <p role="status" className="text-muted-foreground">
            {paid
              ? "Recebemos o sinal pelo Pix. Seu horário está garantido."
              : "Seu horário está reservado. Te esperamos!"}
          </p>
        </motion.div>

        <motion.dl
          className="grid gap-3 rounded-2xl bg-muted p-4 sm:grid-cols-2"
          {...rise(1)}
        >
          <Detail icon="check" label="Serviço" wide>
            {serviceName}
          </Detail>
          <Detail icon="calendar" label="Dia">
            <span className="capitalize">{confirmation.dateLabel}</span>
          </Detail>
          <Detail icon="clock" label="Horário">
            {confirmation.timeLabel}
          </Detail>
          {confirmation.address ? (
            <Detail icon="map" label="Endereço" wide>
              {confirmation.address}
              {confirmation.mapsUrl ? (
                <>
                  {" "}
                  <a
                    href={confirmation.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-primary-text underline underline-offset-4"
                  >
                    Ver no mapa
                  </a>
                </>
              ) : null}
            </Detail>
          ) : null}
        </motion.dl>

        {confirmation.whatsappReminder ? (
          <motion.p className="flex items-center gap-2 text-sm" {...rise(2)}>
            <Icon
              name="whatsapp"
              className="size-5 shrink-0 text-primary-text"
            />
            Vamos te lembrar pelo WhatsApp{" "}
            {reminderLeadLabel(confirmation.reminderLeadMinutes)}.
          </motion.p>
        ) : null}

        {confirmation.preparationInstructions ? (
          <motion.div
            className="grid gap-1 rounded-2xl border p-4"
            {...rise(3)}
          >
            <p className="text-sm font-semibold">Como se preparar</p>
            <p className="text-sm whitespace-pre-line">
              {confirmation.preparationInstructions}
            </p>
          </motion.div>
        ) : null}

        <motion.div {...rise(4)} className="grid">
          <Button asChild size="lg">
            <Link href={`/${slug}/meus-horarios`}>Ver meus horários</Link>
          </Button>
        </motion.div>
      </div>
    </section>
  );
}

function Detail({
  icon,
  label,
  wide,
  children,
}: {
  icon: "check" | "calendar" | "clock" | "map";
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex items-start gap-3 ${wide ? "sm:col-span-2" : ""}`}>
      <Icon name={icon} className="mt-0.5 size-5 shrink-0 text-primary-text" />
      <div className="min-w-0">
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="font-semibold break-words">{children}</dd>
      </div>
    </div>
  );
}
