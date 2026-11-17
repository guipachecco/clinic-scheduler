"use server";

import { DateTime } from "luxon";
import * as z from "zod";

import { logger } from "@/lib/logger";
import {
  depositQuote,
  type DepositView,
  getDepositView,
} from "@/modules/asaas/deposits";
import {
  bookOnline,
  listBookableServices,
  listDaysWithSlots,
  listFreeSlots,
} from "@/modules/booking/booking";
import { requireClient } from "@/modules/clients/session";

// The booking steps of /<slug>/marcar. Each action rebuilds who she is from
// the server session (requireClient); nothing the browser sends but the
// service, the month or day, the chosen start and the CPF for the deposit is
// used. The CPF goes straight to bookOnline and is never logged.

export type Confirmation = {
  serviceName: string;
  dateLabel: string;
  timeLabel: string;
  durationMinutes: number;
  address: string | null;
  mapsUrl: string | null;
  preparationInstructions: string | null;
};

// The Pix deposit as the browser gets it. The QR image and the code only go
// to the patient who owns the deposit.
export type DepositPayload = {
  appointmentId: string;
  status: DepositView["status"];
  amountCents: number;
  expiresAt: string;
  pixPayload: string | null;
  qrImageBase64: string | null;
};

export type BookResult =
  | {
      ok: true;
      confirmation: Confirmation;
      deposit: DepositPayload | null;
    }
  | {
      ok: false;
      reason:
        "taken" | "unavailable" | "unverified" | "cpf_required" | "cpf_invalid";
    };

// What the confirm sheet shows before booking; null when no deposit.
export type DepositOffer = {
  amountCents: number;
  // The rest to pay on the day, when the price is fixed.
  restCents: number | null;
  needsCpf: boolean;
  cpfLast4: string | null;
};

const serviceId = z.uuid();
const month = z.string().regex(/^\d{4}-\d{2}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const bookSchema = z.object({
  serviceId,
  startsAt: z.iso.datetime({ offset: true }),
  cpf: z.string().max(20).optional(),
});
const appointmentId = z.uuid();

function payload(id: string, view: DepositView): DepositPayload {
  return {
    appointmentId: id,
    status: view.status,
    amountCents: view.amountCents,
    expiresAt: view.expiresAt.toISOString(),
    pixPayload: view.pixPayload,
    qrImageBase64: view.qrImageBase64,
  };
}

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

export async function loadDepositOffer(
  slug: string,
  service: unknown,
): Promise<DepositOffer | null> {
  const { ctx } = await requireClient(slug, back(slug));
  const id = serviceId.safeParse(service);
  if (!id.success) return null;
  const quote = await depositQuote(ctx.clinicId, id.data, ctx.patientId);
  if (!quote) return null;
  const item = (await listBookableServices(ctx)).find(
    (entry) => entry.id === id.data,
  );
  const rest =
    item?.priceDisplay === "fixed" && item.priceCents !== null
      ? item.priceCents - quote.amountCents
      : null;
  return { ...quote, restCents: rest };
}

// Polled by the Pix step: the status of her own deposit. Who she is comes
// from the session, never from the browser.
export async function pollDeposit(
  slug: string,
  appointment: unknown,
): Promise<{ status: DepositView["status"]; expiresAt: string } | null> {
  const { ctx } = await requireClient(slug, back(slug));
  const id = appointmentId.safeParse(appointment);
  if (!id.success) return null;
  const view = await getDepositView(ctx.clinicId, id.data, ctx.patientId);
  return view
    ? { status: view.status, expiresAt: view.expiresAt.toISOString() }
    : null;
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
  const deposit = result.deposit
    ? payload(result.appointmentId, result.deposit)
    : null;

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
    deposit,
  };
}
