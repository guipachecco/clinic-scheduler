import { DateTime } from "luxon";
import * as z from "zod";

import { localDayRange, localToUtc } from "./time";

// Form schemas and labels for business hours and time blocks. Imported by
// client components, so no database or server-only code here.

export const WEEKDAYS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
] as const;

export const TIME_BLOCK_TYPES = [
  { value: "day_off", label: "Folga" },
  { value: "vacation", label: "Férias" },
  { value: "holiday", label: "Feriado" },
  { value: "other", label: "Outro" },
] as const;

const TIME_MESSAGE = "Use horários de 5 em 5 minutos (HH:MM).";
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const timeOfDay = z
  .string()
  .regex(TIME_PATTERN, TIME_MESSAGE)
  .refine((value) => Number(value.slice(3)) % 5 === 0, TIME_MESSAGE);

const interval = z.object({ start: timeOfDay, end: timeOfDay });

export const businessHoursSchema = z
  .object({
    days: z.array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        intervals: z.array(interval).max(6),
      }),
    ),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<number>();
    value.days.forEach((day, d) => {
      if (seen.has(day.weekday)) {
        ctx.addIssue({
          code: "custom",
          path: ["days", d, "weekday"],
          message: "Dia da semana repetido.",
        });
      }
      seen.add(day.weekday);
      // Sort a copy, but report errors on the row the user typed.
      const sorted = day.intervals
        .map((item, original) => ({ item, original }))
        .sort((a, b) => a.item.start.localeCompare(b.item.start));
      sorted.forEach(({ item, original }, i) => {
        if (item.start >= item.end) {
          ctx.addIssue({
            code: "custom",
            path: ["days", d, "intervals", original, "start"],
            message: "O início deve ser antes do fim.",
          });
        }
        const previous = sorted[i - 1]?.item;
        if (previous && previous.end > item.start) {
          ctx.addIssue({
            code: "custom",
            path: ["days", d, "intervals", original, "start"],
            message: "Os intervalos do mesmo dia não podem se sobrepor.",
          });
        }
      });
    });
  })
  .transform((value) => ({
    days: value.days.map((day) => ({
      weekday: day.weekday,
      intervals: [...day.intervals].sort((a, b) =>
        a.start.localeCompare(b.start),
      ),
    })),
  }));

export type BusinessHoursInput = z.input<typeof businessHoursSchema>;
export type BusinessHoursValues = z.output<typeof businessHoursSchema>;

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.")
  .refine(
    (value) => DateTime.fromISO(value).isValid,
    "Informe uma data válida.",
  );

// Forms send "" for an empty optional input.
const optionalTime = z
  .string()
  .optional()
  .transform((value) => (value ? value : undefined));

export const timeBlockSchema = z
  .object({
    type: z.enum(["day_off", "vacation", "holiday", "other"], {
      error: "Escolha o tipo.",
    }),
    title: z
      .string()
      .trim()
      .max(80, "O título pode ter no máximo 80 caracteres.")
      .transform((value) => (value === "" ? null : value)),
    allDay: z
      .union([z.boolean(), z.literal("on")])
      .optional()
      .transform((value) => value === true || value === "on"),
    startDate: dateField,
    endDate: dateField,
    startTime: optionalTime,
    endTime: optionalTime,
  })
  .transform((value, ctx) => {
    const fail = (path: string, message: string) => {
      ctx.addIssue({ code: "custom", path: [path], message });
      return z.NEVER;
    };

    if (value.endDate < value.startDate) {
      return fail("endDate", "A data final não pode ser antes da inicial.");
    }

    let startsAt: Date;
    let endsAt: Date;
    if (value.allDay) {
      ({ startsAt, endsAt } = localDayRange(value.startDate, value.endDate));
    } else {
      if (!value.startTime || !TIME_PATTERN.test(value.startTime)) {
        return fail("startTime", "Informe o horário de início.");
      }
      if (!value.endTime || !TIME_PATTERN.test(value.endTime)) {
        return fail("endTime", "Informe o horário de fim.");
      }
      startsAt = localToUtc(value.startDate, value.startTime);
      endsAt = localToUtc(value.endDate, value.endTime);
      if (endsAt <= startsAt) {
        return fail("endTime", "O fim deve ser depois do início.");
      }
    }

    return {
      type: value.type,
      title: value.title,
      startsAt,
      endsAt,
      allDay: value.allDay,
    };
  });

export type TimeBlockInput = z.input<typeof timeBlockSchema>;
export type TimeBlockValues = z.output<typeof timeBlockSchema>;
