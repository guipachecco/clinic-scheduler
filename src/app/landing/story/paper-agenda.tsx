"use client";

import { motion, type MotionValue, useTransform } from "motion/react";
import { useId } from "react";

import { BigX } from "./big-x";
import { DrawnPath } from "./drawn-path";
import { Pencil } from "./pencil";
import { ENTRIES, type Entry, MARKS, VIEW } from "./timeline";

const GRAPHITE = "#3d3654";
const LINES = [130, 182, 234, 286, 338, 390, 442];
const RINGS = [44, 78, 112, 146, 180, 214, 248, 282, 316];

// Overshoots a little and settles, like something dropped on the desk.
const dropEase = (t: number) => {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};

// A handwritten entry: real SVG text, uncovered left to right as the pencil
// writes it.
function WrittenEntry({
  entry,
  progress,
}: {
  entry: Entry;
  progress: MotionValue<number>;
}) {
  const clipId = `story-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const width = useTransform(
    progress,
    [entry.start, entry.end],
    [0, entry.width + 10],
  );
  return (
    <g>
      <clipPath id={clipId}>
        <motion.rect
          x={entry.x - 6}
          y={entry.y - 32}
          height={44}
          width={width}
        />
      </clipPath>
      <text
        x={entry.x}
        y={entry.y}
        textLength={entry.width}
        lengthAdjust="spacingAndGlyphs"
        clipPath={`url(#${clipId})`}
        fill={GRAPHITE}
        fontSize={25}
        className="font-heading font-semibold italic"
        style={{ fontStretch: "82%" }}
      >
        {entry.text}
      </text>
    </g>
  );
}

// The post-it that drops onto the page halfway through the mess.
function PostIt({ progress }: { progress: MotionValue<number> }) {
  const drop = useTransform(progress, [0.38, 0.45], [0, 1], { ease: dropEase });
  const y = useTransform(drop, [0, 1], [-420, 0]);
  const rotate = useTransform(drop, [0, 1], [24, -7]);
  const opacity = useTransform(progress, [0.37, 0.38], [0, 1]);
  return (
    <motion.g style={{ y, rotate, opacity }}>
      <rect
        x="40"
        y="404"
        width="112"
        height="76"
        fill="#2a0081"
        transform="translate(5 5)"
      />
      <rect
        x="40"
        y="404"
        width="112"
        height="76"
        fill="#ffd3f0"
        stroke="#2a0081"
        strokeWidth="3"
      />
      <rect
        x="76"
        y="398"
        width="40"
        height="12"
        fill="#b7e7fc"
        opacity="0.85"
      />
      <text
        x="52"
        y="436"
        fill="#2a0081"
        fontSize="17"
        className="font-heading font-bold italic"
      >
        confirmar
      </text>
      <text
        x="52"
        y="460"
        fill="#2a0081"
        fontSize="17"
        className="font-heading font-bold italic"
      >
        todas!!
      </text>
    </motion.g>
  );
}

// The client's message buzzing on a little phone in the corner.
function Buzz({
  progress,
  shown,
  buzzing,
}: {
  progress: MotionValue<number>;
  shown: boolean;
  buzzing: boolean;
}) {
  const opacity = useTransform(progress, [0.52, 0.56], [0, 1]);
  const scale = useTransform(progress, [0.52, 0.57], [0.5, 1], {
    ease: dropEase,
  });
  return (
    <motion.div
      className="absolute top-[4%] right-[3%] flex w-[50%] items-start justify-end gap-1.5"
      aria-hidden={!shown}
      style={{ opacity, scale, transformOrigin: "100% 0%" }}
    >
      <p className="mt-1 rounded-2xl rounded-tr-sm border-[2.5px] border-[#2a0081] bg-[#b7e7fc] px-2.5 py-1.5 font-heading text-[0.8rem] leading-tight font-bold text-[#2a0081] shadow-[3px_3px_0_0_#2a0081]">
        tem horário amanhã?
      </p>
      <motion.div
        aria-hidden="true"
        className="relative h-12 w-7 shrink-0 rounded-[0.55rem] border-[2.5px] border-[#2a0081] bg-[#f5c700]"
        animate={
          buzzing
            ? { rotate: [0, -14, 12, -10, 8, 0], x: [0, -2, 2, -2, 2, 0] }
            : { rotate: 0, x: 0 }
        }
        transition={
          buzzing
            ? { duration: 0.5, repeat: Infinity, repeatDelay: 0.9 }
            : { duration: 0.2 }
        }
      >
        <span className="absolute inset-x-1 top-1.5 bottom-2.5 rounded-sm bg-white" />
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          className="absolute -top-2 -left-3 size-4 text-white"
        >
          <path d="M20 4 14 10M22 11h-5M13 2v5" />
        </svg>
      </motion.div>
    </motion.div>
  );
}

// The paper agenda filling up with handwriting, crossed out by the giant X.
// `progress` runs 0 to 1 through the whole scene; at 1 everything is drawn.
export function PaperAgenda({
  progress,
  live,
  bubbleShown = true,
  buzzing = false,
}: {
  progress: MotionValue<number>;
  // Scroll-driven version: shows the pencil.
  live: boolean;
  // Whether the message bubble is on screen (hidden from screen readers
  // otherwise), and whether its phone is shaking.
  bubbleShown?: boolean;
  buzzing?: boolean;
}) {
  return (
    <div className="relative aspect-[360/500] w-full">
      <svg
        viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
        className="absolute inset-0 size-full overflow-visible"
        role="img"
        aria-label="Agenda de papel de terça cheia de rabisco: Ana 14h, Bia 14h com duas interrogações e circulado, Carla 15h riscado, um remarcar com seta para Duda 16h, Fê 15h rabiscado e um post-it escrito confirmar todas. Um X enorme risca a página inteira."
      >
        <g aria-hidden="true">
          <rect
            x="22"
            y="32"
            width="320"
            height="462"
            rx="14"
            fill="#f5c700"
            stroke="#2a0081"
            strokeWidth="3"
          />
          <rect
            x="14"
            y="24"
            width="320"
            height="462"
            rx="14"
            fill="#fffdf5"
            stroke="#2a0081"
            strokeWidth="3"
          />
          {LINES.map((y) => (
            <path
              key={y}
              d={`M30 ${y}H318`}
              stroke="#8fd3f4"
              strokeWidth="1.6"
            />
          ))}
          <path d="M82 104V478" stroke="#ff9bd5" strokeWidth="2" />
          {RINGS.map((x) => (
            <rect
              key={x}
              x={x - 4}
              y="12"
              width="8"
              height="24"
              rx="4"
              fill="#b7e7fc"
              stroke="#2a0081"
              strokeWidth="2.5"
            />
          ))}
        </g>
        <text
          x="34"
          y="80"
          fill="#2a0081"
          fontSize="34"
          className="font-heading font-extrabold uppercase"
          style={{ fontStretch: "75%" }}
        >
          Terça
        </text>
        {Object.values(ENTRIES).map((entry) => (
          <WrittenEntry key={entry.text} entry={entry} progress={progress} />
        ))}
        <g aria-hidden="true">
          <DrawnPath
            mark={MARKS.circle}
            progress={progress}
            stroke="#e0007a"
            strokeWidth={3}
          />
          <DrawnPath
            mark={MARKS.strike}
            progress={progress}
            stroke={GRAPHITE}
            strokeWidth={3.5}
          />
          <DrawnPath
            mark={MARKS.arrow}
            progress={progress}
            stroke={GRAPHITE}
            strokeWidth={3}
          />
          <DrawnPath
            mark={MARKS.arrowHead}
            progress={progress}
            stroke={GRAPHITE}
            strokeWidth={3}
          />
          <DrawnPath
            mark={MARKS.scribble}
            progress={progress}
            stroke={GRAPHITE}
            strokeWidth={3.5}
          />
        </g>
        <PostIt progress={progress} />
        <BigX progress={progress} />
        {live && <Pencil progress={progress} />}
      </svg>
      <Buzz progress={progress} shown={bubbleShown} buzzing={buzzing} />
    </div>
  );
}
