import "server-only";

import { and, eq } from "drizzle-orm";
import sharp, { type OutputInfo } from "sharp";

import { db } from "@/db/client";
import { auditLogs, clinics, media } from "@/db/schema";

// Owner photo of a clinic. Uploads are re-encoded (EXIF and other metadata
// dropped, orientation applied, longest side capped) before being stored.

const MAX_INPUT_BYTES = 10 * 1024 * 1024;
// The media table checks byte_size <= 2 MB; the re-encoded WebP is far smaller.
const MAX_STORED_BYTES = 2 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;
const DECODED_FORMATS = ["jpeg", "png", "webp"];
const MAX_SIDE = 800;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

export async function saveOwnerPhoto(
  clinicId: string,
  input: { bytes: Buffer; mimeType: string },
  actorUserId: string,
): Promise<{ ok: true; mediaId: string } | { ok: false; formError: string }> {
  if (!ALLOWED_MIME.includes(input.mimeType)) {
    return { ok: false, formError: "Envie uma imagem JPEG, PNG ou WebP." };
  }
  if (input.bytes.length === 0 || input.bytes.length > MAX_INPUT_BYTES) {
    return { ok: false, formError: "A foto deve ter no máximo 10 MB." };
  }

  let output: { data: Buffer; info: OutputInfo };
  try {
    const source = sharp(input.bytes, { limitInputPixels: MAX_INPUT_PIXELS });
    const { format } = await source.metadata();
    if (!format || !DECODED_FORMATS.includes(format)) {
      return { ok: false, formError: "Envie uma imagem JPEG, PNG ou WebP." };
    }
    output = await source
      .rotate()
      .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    return { ok: false, formError: "Não foi possível ler essa imagem." };
  }

  if (output.data.length > MAX_STORED_BYTES) {
    return {
      ok: false,
      formError: "Não foi possível reduzir essa foto. Tente uma menor.",
    };
  }

  return db.transaction(async (tx) => {
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
      actorType: "admin",
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
  await db.transaction(async (tx) => {
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
  const [row] = await db
    .select({ mimeType: media.mimeType, data: media.data })
    .from(media)
    .where(and(eq(media.id, mediaId), eq(media.clinicId, clinicId)))
    .limit(1);
  return row ?? null;
}
