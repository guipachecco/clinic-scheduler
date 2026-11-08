import "server-only";

import { and, eq } from "drizzle-orm";

import { inClinic } from "@/db/client";
import { auditLogs, clinics, media } from "@/db/schema";
import { reencodeImage } from "@/modules/media/reencode";

// Owner photo of a clinic. Uploads are re-encoded (EXIF and other metadata
// dropped, orientation applied, longest side capped) before being stored.

const MAX_SIDE = 800;

// actorUserId is the panel user, or null when the terminal command
// (scripts/photos.ts) sets it, logged as the system.
export async function saveOwnerPhoto(
  clinicId: string,
  input: { bytes: Buffer; mimeType: string },
  actorUserId: string | null,
): Promise<{ ok: true; mediaId: string } | { ok: false; formError: string }> {
  const encoded = await reencodeImage(input, {
    maxSide: MAX_SIDE,
    quality: 85,
  });
  if (!encoded.ok) return encoded;
  const output = {
    data: encoded.image.data,
    info: { width: encoded.image.width, height: encoded.image.height },
  };

  return inClinic(clinicId, async (tx) => {
    const [clinic] = await tx
      .select({ previous: clinics.ownerPhotoMediaId })
      .from(clinics)
      .where(eq(clinics.id, clinicId))
      .for("update")
      .limit(1);
    if (!clinic) return { ok: false, formError: "Clínica não encontrada." };

    const [created] = await tx
      .insert(media)
      .values({
        clinicId,
        kind: "photo",
        mimeType: "image/webp",
        data: output.data,
        byteSize: output.data.length,
        width: output.info.width,
        height: output.info.height,
      })
      .returning({ id: media.id });
    await tx
      .update(clinics)
      .set({ ownerPhotoMediaId: created!.id })
      .where(eq(clinics.id, clinicId));
    if (clinic.previous) {
      await tx
        .delete(media)
        .where(
          and(eq(media.id, clinic.previous), eq(media.clinicId, clinicId)),
        );
    }
    await tx.insert(auditLogs).values({
      clinicId,
      actorType: actorUserId ? "admin" : "system",
      actorUserId,
      action: "clinic.owner_photo_changed",
      entityType: "clinic",
      entityId: clinicId,
      changes: { replaced: clinic.previous !== null },
    });
    return { ok: true, mediaId: created!.id };
  });
}

export async function removeOwnerPhoto(
  clinicId: string,
  actorUserId: string,
): Promise<{ ok: true }> {
  await inClinic(clinicId, async (tx) => {
    const [clinic] = await tx
      .select({ previous: clinics.ownerPhotoMediaId })
      .from(clinics)
      .where(eq(clinics.id, clinicId))
      .for("update")
      .limit(1);
    if (!clinic?.previous) return;
    await tx
      .update(clinics)
      .set({ ownerPhotoMediaId: null })
      .where(eq(clinics.id, clinicId));
    await tx
      .delete(media)
      .where(and(eq(media.id, clinic.previous), eq(media.clinicId, clinicId)));
    await tx.insert(auditLogs).values({
      clinicId,
      actorType: "admin",
      actorUserId,
      action: "clinic.owner_photo_removed",
      entityType: "clinic",
      entityId: clinicId,
      changes: {},
    });
  });
  return { ok: true };
}

export async function getClinicMedia(
  clinicId: string,
  mediaId: string,
): Promise<{ mimeType: string; data: Buffer } | null> {
  const [row] = await inClinic(clinicId, (tx) =>
    tx
      .select({ mimeType: media.mimeType, data: media.data })
      .from(media)
      .where(and(eq(media.id, mediaId), eq(media.clinicId, clinicId)))
      .limit(1),
  );
  return row ?? null;
}
