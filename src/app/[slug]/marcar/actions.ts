"use server";

import { DateTime } from "luxon";
import * as z from "zod";

import { logger } from "@/lib/logger";
import {
  bookOnline,
  listBookableServices,
  listDaysWithSlots,
  listFreeSlots,
} from "@/modules/booking/booking";
import { requireClient } from "@/modules/clients/session";

// The booking steps of /<slug>/marcar. Each action rebuilds who she is from
// the server session (requireClient); nothing the browser sends but the
// service, the month or day and the chosen start is used.

export type Confirmation = {
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

const serviceId = z.uuid();
const month = z.string().regex(/^\d{4}-\d{2}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const bookSchema = z.object({
  serviceId,
  startsAt: z.iso.datetime({ offset: true }),
});

const back = (slug: string) => `/${slug}/marcar`;

export async function loadDays(
  slug: string,
  service: unknown,
  monthValue: unknown,
): Promise<string[]> {
  const { ctx } = await requireClient(slug, back(slug));
  const id = serviceId.safeParse(service);
  const m = month.safeParse(monthValue);
  if (!id.success || !m.success) return [];
  return listDaysWithSlots(ctx, id.data, m.data);
}

export async function loadSlots(
  slug: string,
  service: unknown,
  day: unknown,
): Promise<string[]> {
  const { ctx } = await requireClient(slug, back(slug));
  const id = serviceId.safeParse(service);
  const d = date.safeParse(day);
  if (!id.success || !d.success) return [];
  return listFreeSlots(ctx, id.data, d.data);
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

  const service = (await listBookableServices(ctx)).find(
    (item) => item.id === parsed.data.serviceId,
  );
  const start = DateTime.fromISO(parsed.data.startsAt, {
    zone: clinic.timezone,
  }).setLocale("pt-BR");
  return {
    ok: true,
    confirmation: {
      serviceName: service?.name ?? "",
      dateLabel: start.toFormat("cccc, d 'de' LLLL 'de' yyyy"),
      timeLabel: start.toFormat("HH:mm"),
      durationMinutes: service?.durationMinutes ?? 0,
      address: clinic.address,
      mapsUrl: clinic.mapsUrl,
      preparationInstructions: service?.preparationInstructions ?? null,
    },
  };
}
