"use server";

import { DateTime } from "luxon";
import * as z from "zod";

import { logger } from "@/lib/logger";
import {
  bookOnline,
  listBookableServices,
  listDaysWithSlots,
  listFreeSlots,
  MAX_SERVICES_PER_VISIT,
} from "@/modules/booking/booking";
import { requireClient } from "@/modules/clients/session";

// The booking steps of /<slug>/marcar. Each action rebuilds who she is from
// the server session (requireClient); nothing the browser sends but the
// services, the month or day and the chosen start is used.

export type Confirmation = {
  // Every service of the visit, joined by " + ".
  serviceName: string;
  dateLabel: string;
  timeLabel: string;
  durationMinutes: number;
  address: string | null;
  mapsUrl: string | null;
  preparationInstructions: string | null;
};

export type BookResult =
  | { ok: true; confirmation: Confirmation }
  | { ok: false; reason: "taken" | "limit" | "unavailable" | "unverified" };

// The services of one visit: at least one, none twice.
const serviceIds = z
  .array(z.uuid())
  .min(1)
  .max(MAX_SERVICES_PER_VISIT)
  .refine((ids) => new Set(ids).size === ids.length);
const month = z.string().regex(/^\d{4}-\d{2}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const bookSchema = z.object({
  serviceIds,
  startsAt: z.iso.datetime({ offset: true }),
});

const back = (slug: string) => `/${slug}/marcar`;

export async function loadDays(
  slug: string,
  services: unknown,
  monthValue: unknown,
): Promise<string[]> {
  const { ctx } = await requireClient(slug, back(slug));
  const ids = serviceIds.safeParse(services);
  const m = month.safeParse(monthValue);
  if (!ids.success || !m.success) return [];
  return listDaysWithSlots(ctx, ids.data, m.data);
}

export async function loadSlots(
  slug: string,
  services: unknown,
  day: unknown,
): Promise<string[]> {
  const { ctx } = await requireClient(slug, back(slug));
  const ids = serviceIds.safeParse(services);
  const d = date.safeParse(day);
  if (!ids.success || !d.success) return [];
  return listFreeSlots(ctx, ids.data, d.data);
}

export async function book(slug: string, input: unknown): Promise<BookResult> {
  const { ctx, clinic } = await requireClient(slug, back(slug));
  const parsed = bookSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "unavailable" };

  let result;
  try {
    result = await bookOnline(ctx, parsed.data);
  } catch (error) {
    logger.error("online booking failed", { error });
    return { ok: false, reason: "unavailable" };
  }
  if (!result.ok) return result;

  // In the clinic's order, like the appointment's own name.
  const booked = (await listBookableServices(ctx)).filter((item) =>
    parsed.data.serviceIds.includes(item.id),
  );
  const several = booked.length > 1;
  const preparation = booked
    .filter((item) => item.preparationInstructions)
    .map((item) =>
      several
        ? `${item.name}: ${item.preparationInstructions}`
        : item.preparationInstructions,
    )
    .join("\n\n");
  const start = DateTime.fromISO(parsed.data.startsAt, {
    zone: clinic.timezone,
  }).setLocale("pt-BR");
  return {
    ok: true,
    confirmation: {
      serviceName: booked.map((item) => item.name).join(" + "),
      dateLabel: start.toFormat("cccc, d 'de' LLLL 'de' yyyy"),
      timeLabel: start.toFormat("HH:mm"),
      durationMinutes: booked.reduce(
        (sum, item) => sum + item.durationMinutes,
        0,
      ),
      address: clinic.address,
      mapsUrl: clinic.mapsUrl,
      preparationInstructions: preparation || null,
    },
  };
}
