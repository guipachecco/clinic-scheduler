import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { inClinic } from "@/db/client";
import { auditLogs, clinicPhotos, media } from "@/db/schema";
import { reencodeImage } from "@/modules/media/reencode";

import { MAX_CLINIC_PHOTOS } from "./limits";

export { MAX_CLINIC_PHOTOS };

// Photos of the clinic's space and work for its public page, managed as
// app_panel inside the clinic (the panel screen and the terminal command use
// the same functions). The first photo by position is the page's cover.

// Large enough for a full-screen view on a phone, small enough to stay around
// 150-250 KB as WebP.
const MAX_SIDE = 1600;
const QUALITY = 80;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PanelClinicPhoto = {
  id: string;
  position: number;
  width: number;
  height: number;
  byteSize: number;
};

// Who made the change, for the audit log: a panel user, or the system when it
// comes from the terminal command.
export type PhotoActor = { userId: string } | { system: true };

function auditActor(actor: PhotoActor) {
  return "userId" in actor
    ? { actorType: "admin" as const, actorUserId: actor.userId }
    : { actorType: "system" as const, actorUserId: null };
}

export async function listClinicPhotos(
  clinicId: string,
): Promise<PanelClinicPhoto[]> {
  return inClinic(clinicId, (tx) =>
    tx
      .select({
        id: clinicPhotos.id,
        position: clinicPhotos.position,
        width: media.width,
        height: media.height,
        byteSize: media.byteSize,
      })
      .from(clinicPhotos)
      .innerJoin(
        media,
        and(
          eq(media.clinicId, clinicPhotos.clinicId),
          eq(media.id, clinicPhotos.mediaId),
        ),
      )
      .where(eq(clinicPhotos.clinicId, clinicId))
      .orderBy(
        asc(clinicPhotos.position),
        asc(clinicPhotos.createdAt),
        asc(clinicPhotos.id),
      ),
  );
}

// Adds a photo at the end of the clinic's list.
export async function addClinicPhoto(
  clinicId: string,
  input: { bytes: Buffer; mimeType: string },
  actor: PhotoActor,
): Promise<{ ok: true; photoId: string } | { ok: false; formError: string }> {
  const encoded = await reencodeImage(input, {
    maxSide: MAX_SIDE,
    quality: QUALITY,
  });
  if (!encoded.ok) return encoded;
  const { image } = encoded;

  return inClinic(clinicId, async (tx) => {
    // Serializes concurrent adds of the same clinic, so positions and the
    // limit stay right.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('clinic_photos'), hashtext(${clinicId}))`,
    );
    const [stats] = await tx
      .select({
        count: sql<number>`count(*)::int`,
        next: sql<number>`coalesce(max(${clinicPhotos.position}) + 1, 0)::int`,
      })
      .from(clinicPhotos)
      .where(eq(clinicPhotos.clinicId, clinicId));
    if (stats!.count >= MAX_CLINIC_PHOTOS) {
      return {
        ok: false,
        formError: `A página pode ter no máximo ${MAX_CLINIC_PHOTOS} fotos.`,
      };
    }

    const [created] = await tx
      .insert(media)
      .values({
        clinicId,
        kind: "photo",
        mimeType: "image/webp",
        data: image.data,
        byteSize: image.data.length,
        width: image.width,
        height: image.height,
      })
      .returning({ id: media.id });
    const [photo] = await tx
      .insert(clinicPhotos)
      .values({ clinicId, mediaId: created!.id, position: stats!.next })
      .returning({ id: clinicPhotos.id });
    await tx.insert(auditLogs).values({
      clinicId,
      ...auditActor(actor),
      action: "clinic.photo_added",
      entityType: "clinic_photo",
      entityId: photo!.id,
      changes: { position: stats!.next },
    });
    return { ok: true, photoId: photo!.id };
  });
}

// Removes a photo and its image. False when the clinic has no such photo.
export async function removeClinicPhoto(
  clinicId: string,
  photoId: string,
  actor: PhotoActor,
): Promise<boolean> {
  if (!UUID.test(photoId)) return false;
  return inClinic(clinicId, async (tx) => {
    const [removed] = await tx
      .delete(clinicPhotos)
      .where(
        and(eq(clinicPhotos.id, photoId), eq(clinicPhotos.clinicId, clinicId)),
      )
      .returning({ mediaId: clinicPhotos.mediaId });
    if (!removed) return false;
    await tx
      .delete(media)
      .where(and(eq(media.id, removed.mediaId), eq(media.clinicId, clinicId)));
    await tx.insert(auditLogs).values({
      clinicId,
      ...auditActor(actor),
      action: "clinic.photo_removed",
      entityType: "clinic_photo",
      entityId: photoId,
      changes: {},
    });
    return true;
  });
}

// Puts the clinic's photos in the given order (every one of its photo ids,
// each once). False when the list does not match the clinic's photos.
export async function reorderClinicPhotos(
  clinicId: string,
  orderedIds: string[],
  actor: PhotoActor,
): Promise<boolean> {
  return inClinic(clinicId, async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('clinic_photos'), hashtext(${clinicId}))`,
    );
    const current = await tx
      .select({ id: clinicPhotos.id })
      .from(clinicPhotos)
      .where(eq(clinicPhotos.clinicId, clinicId));
    const known = new Set(current.map((row) => row.id));
    if (
      orderedIds.length !== known.size ||
      new Set(orderedIds).size !== orderedIds.length ||
      !orderedIds.every((id) => known.has(id))
    ) {
      return false;
    }
    for (const [position, id] of orderedIds.entries()) {
      await tx
        .update(clinicPhotos)
        .set({ position })
        .where(
          and(eq(clinicPhotos.id, id), eq(clinicPhotos.clinicId, clinicId)),
        );
    }
    await tx.insert(auditLogs).values({
      clinicId,
      ...auditActor(actor),
      action: "clinic.photos_reordered",
      entityType: "clinic",
      entityId: clinicId,
      changes: { count: orderedIds.length },
    });
    return true;
  });
}
