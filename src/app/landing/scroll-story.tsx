"use client";

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { useRef, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

import { PaperAgenda } from "./story/paper-agenda";
import { PhoneApp } from "./story/phone-app";
import { Stamp } from "./story/stamp";
import { displayClass, Sticker, TornEdge } from "./ui";

// Steps 2 to 4 of the story. A pencil fills a paper agenda with names,
// rasuras and arrows as the page scrolls, a giant X crosses it all out, the
// "PROBLEMA RESOLVIDO" stamp springs in, and the paper gives way to a phone
// with the app.
//
// The server HTML (and the page without JavaScript, or with reduced motion)
// shows the finished scenes stacked and still. Only after mount, when motion
// is allowed, the scroll-driven stage takes their place.

const noopSubscribe = () => () => {};

function useMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

const CAPTIONS = {
  before: "Antes: caderno e rasura",
  enough: "Chega de rasura!",
  after: "Com a Zemana",
};

export function ScrollStory() {
  const mounted = useMounted();
  const reduce = useReducedMotion();
  const live = mounted && !reduce;

  return (
    <section
      id="como-funciona"
      className="relative scroll-mt-4 bg-[#2a0081] text-white"
    >
      <TornEdge className="text-[#2a0081]" />
      <div className="mx-auto w-full max-w-6xl px-4 pt-20 sm:px-6 lg:pt-28">
        <Sticker className="rotate-2 bg-[#b7e7fc]">Antes da Zemana</Sticker>
        <h2
          className={`${displayClass} mt-6 max-w-4xl text-[clamp(3rem,14vw,7.5rem)] text-[#f5c700]`}
        >
          Caderno, rasura e “tem horário amanhã?”
        </h2>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/90">
          A agenda de papel enche de rabisco, o mesmo horário vai pra duas
          clientes e o WhatsApp não para de vibrar. A Zemana põe ordem nisso.
        </p>
      </div>
      {live ? <LiveStory /> : <StillStory />}
    </section>
  );
}

function Caption({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Sticker className={cn("bg-[#f5c700] text-base", className)}>
      {children}
    </Sticker>
  );
}

// The finished scenes, stacked: the crossed-out agenda with the stamp, then
// the phone.
function StillStory() {
  const done = useMotionValue(1);
  return (
    <div
      data-testid="scroll-story"
      data-mode="static"
      className="mx-auto grid w-full max-w-6xl gap-16 px-4 pt-14 pb-28 sm:px-6 md:grid-cols-2 md:items-start lg:pb-36"
    >
      <figure className="mx-auto w-full max-w-[26rem]">
        <figcaption className="mb-6">
          <Caption className="-rotate-2">{CAPTIONS.before}</Caption>
        </figcaption>
        <div className="relative">
          <PaperAgenda progress={done} live={false} />
          <div
            data-testid="story-stamp"
            className="absolute inset-0 grid place-items-center"
          >
            <Stamp />
          </div>
        </div>
      </figure>
      <figure className="mx-auto flex w-full max-w-[26rem] flex-col items-center">
        <figcaption className="mb-6 self-start">
          <Caption className="rotate-2 bg-[#ffd3f0]">{CAPTIONS.after}</Caption>
        </figcaption>
        <PhoneApp />
      </figure>
    </div>
  );
}

// The scroll-driven stage: pinned while its tall wrapper scrolls past.
function LiveStory() {
  const target = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target,
    offset: ["start start", "end end"],
  });
  // A light spring so the pencil glides instead of ticking with each wheel step.
  const story = useSpring(scrollYProgress, {
    stiffness: 180,
    damping: 32,
    restDelta: 0.0005,
  });

  // Scene timings on the story's progress.
  const paper = useTransform(story, [0.02, 0.72], [0, 1]);

  const stampHit = useSpring(useTransform(story, [0.73, 0.745], [0, 1]), {
    stiffness: 520,
    damping: 15,
  });
  const stampScale = useTransform(stampHit, [0, 1], [2.6, 1], {
    clamp: false,
  });
  const stampOpacity = useTransform(stampHit, [0, 0.35], [0, 1]);
  const stampMove = useTransform(story, [0.79, 0.87], [0, 1]);
  const stampX = useTransform(stampMove, [0, 1], ["0%", "-24%"]);
  const stampY = useTransform(stampMove, [0, 1], ["0%", "-42%"]);
  const stampShrink = useTransform(stampMove, [0, 1], [1, 0.56]);

  const paperOut = useTransform(story, [0.78, 0.86], [0, 1]);
  const paperX = useTransform(paperOut, [0, 1], ["0%", "-140%"]);
  const paperRotate = useTransform(paperOut, [0, 1], [0, -16]);

  const phoneIn = useSpring(useTransform(story, [0.81, 0.83], [0, 1]), {
    stiffness: 260,
    damping: 17,
  });
  const phoneY = useTransform(phoneIn, [0, 1], ["150%", "0%"], {
    clamp: false,
  });
  const phoneOpacity = useTransform(phoneIn, [0, 0.05], [0, 1]);
  const phoneRotate = useTransform(phoneIn, [0, 1], [14, -3], {
    clamp: false,
  });

  const before = useTransform(story, [0, 0.64, 0.68], [1, 1, 0]);
  const enough = useTransform(story, [0.66, 0.7, 0.79, 0.82], [0, 1, 1, 0]);
  const after = useTransform(story, [0.81, 0.85], [0, 1]);

  return (
    <div
      ref={target}
      data-testid="scroll-story"
      data-mode="scroll"
      className="relative h-[440svh]"
    >
      <div className="sticky top-0 flex h-svh flex-col items-center justify-center gap-5 overflow-hidden px-4 pb-6">
        <div className="relative grid h-12 w-full max-w-[26rem] place-items-center">
          <motion.div className="absolute" style={{ opacity: before }}>
            <Caption className="-rotate-2">{CAPTIONS.before}</Caption>
          </motion.div>
          <motion.div className="absolute" style={{ opacity: enough }}>
            <Caption className="rotate-1 bg-[#b7e7fc]">
              {CAPTIONS.enough}
            </Caption>
          </motion.div>
          <motion.div className="absolute" style={{ opacity: after }}>
            <Caption className="rotate-2 bg-[#ffd3f0]">
              {CAPTIONS.after}
            </Caption>
          </motion.div>
        </div>
        <div className="relative w-[min(86vw,26rem,56svh)]">
          <motion.div style={{ x: paperX, rotate: paperRotate }}>
            <PaperAgenda progress={paper} live />
          </motion.div>
          <motion.div
            className="absolute inset-0 grid place-items-center"
            style={{ y: phoneY, rotate: phoneRotate, opacity: phoneOpacity }}
          >
            <PhoneApp />
          </motion.div>
          <motion.div
            className="pointer-events-none absolute inset-0 grid place-items-center"
            style={{ x: stampX, y: stampY, scale: stampShrink }}
          >
            <motion.div
              data-testid="story-stamp"
              style={{ scale: stampScale, opacity: stampOpacity }}
            >
              <Stamp />
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
