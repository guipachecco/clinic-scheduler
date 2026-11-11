import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { inClinic, type Tx } from "@/db/client";
import { findPgError } from "@/db/errors";
import { auditLogs, clinicPhotos, clinics, media } from "@/db/schema";
import { MAX_CLINIC_PHOTOS } from "@/modules/clinic-page/limits";
import { reencodeImage } from "@/modules/media/reencode";

import {
  draftMediaIds,
  mergeDraft,
  mergePatch,
  type PageDraft,
  pageDraftSchema,
  parseDraft,
  type PublishedPage,
} from "./draft";

// The step-by-step page builder of the panel. Everything the owner does is
// saved in clinics.page_draft; the public page only changes on publishDraft.
// Images sent while editing are stored in media right away, but no published
// column points at them until then. Publishing and discarding delete the
// images that ended up unused, looking only at the ids the draft names.

const IMAGE_SLOTS = {
  logo: { field: "logoMediaId", kind: "logo", maxSide: 800, quality: 85 },
  ownerPhoto: {
    field: "ownerPhotoMediaId",
    kind: "photo",
    maxSide: 800,
    quality: 85,
  },
  cover: { field: "coverMediaId", kind: "photo", maxSide: 1600, quality: 80 },
  gallery: { field: "gallery", kind: "photo", maxSide: 1600, quality: 80 },
} as const;

export type DraftImageSlot = keyof typeof IMAGE_SLOTS;

const PUBLISHED_FIELDS = [
  "businessType",
  "logoMediaId",
  "ownerPhotoMediaId",
  "coverMediaId",
  "theme",
  "headline",
  "about",
  "gallery",
] as const satisfies readonly (keyof PublishedPage)[];

const MISSING_MEDIA = "Imagem não encontrada. Envie a imagem de novo.";
const TOO_LARGE = "O rascunho ficou grande demais.";
const PG_CHECK_VIOLATION = "23514";

// Same key as src/modules/clinic-page/photos.ts, so publishing and the photo
// screen never rewrite the list at the same time.
async function lockPhotos(tx: Tx, clinicId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext('clinic_photos'), hashtext(${clinicId}))`,
  );
}

// The clinic row, locked for the rest of the transaction when `lock` is set.
async function readClinic(tx: Tx, clinicId: string, lock: boolean) {
  const query = tx
    .select({
      slug: clinics.slug,
      name: clinics.name,
      displayName: clinics.displayName,
      businessType: clinics.businessType,
      logoMediaId: clinics.logoMediaId,
      ownerPhotoMediaId: clinics.ownerPhotoMediaId,
      coverMediaId: clinics.coverMediaId,
      theme: clinics.theme,
      headline: clinics.headline,
      about: clinics.about,
      pageDraft: clinics.pageDraft,
    })
    .from(clinics)
    .where(eq(clinics.id, clinicId))
    .limit(1);
  // "no key update" still lets photos.ts insert clinic_photos rows (their
  // foreign key takes "key share" on this row) while it is held.
  const [row] = lock ? await query.for("no key update") : await query;
  return row;
}

async function readGallery(tx: Tx, clinicId: string) {
  const rows = await tx
    .select({ id: clinicPhotos.id, mediaId: clinicPhotos.mediaId })
    .from(clinicPhotos)
    .where(eq(clinicPhotos.clinicId, clinicId))
    .orderBy(
      asc(clinicPhotos.position),
      asc(clinicPhotos.createdAt),
      asc(clinicPhotos.id),
    );
  return rows;
}

function publishedFrom(
  row: NonNullable<Awaited<ReturnType<typeof readClinic>>>,
  gallery: string[],
): PublishedPage {
  return {
    businessType: row.businessType,
    logoMediaId: row.logoMediaId,
    ownerPhotoMediaId: row.ownerPhotoMediaId,
    coverMediaId: row.coverMediaId,
    theme: row.theme,
    headline: row.headline,
    about: row.about,
    gallery,
  };
}

// True when every id is a media row of this clinic.
async function allMediaOfClinic(tx: Tx, clinicId: string, ids: string[]) {
  if (ids.length === 0) return true;
  const rows = await tx
    .select({ id: media.id })
    .from(media)
    .where(and(eq(media.clinicId, clinicId), inArray(media.id, ids)));
  return rows.length === new Set(ids).size;
}

// Deletes the given images that no published column and no page photo point
// at any more (and that `keep` does not list).
async function deleteUnusedMedia(
  tx: Tx,
  clinicId: string,
  candidates: string[],
  keep: string[] = [],
) {
  const ids = [...new Set(candidates)].filter((id) => !keep.includes(id));
  if (ids.length === 0) return;
  const [row] = await tx
    .select({
      logo: clinics.logoMediaId,
      owner: clinics.ownerPhotoMediaId,
      cover: clinics.coverMediaId,
    })
    .from(clinics)
    .where(eq(clinics.id, clinicId))
    .limit(1);
  const photos = await tx
    .select({ mediaId: clinicPhotos.mediaId })
    .from(clinicPhotos)
    .where(
      and(
        eq(clinicPhotos.clinicId, clinicId),
        inArray(clinicPhotos.mediaId, ids),
      ),
    );
  const used = new Set<string | null>([
    row?.logo ?? null,
    row?.owner ?? null,
    row?.cover ?? null,
    ...photos.map((p) => p.mediaId),
  ]);
  const unused = ids.filter((id) => !used.has(id));
  if (unused.length === 0) return;
  await tx
    .delete(media)
    .where(and(eq(media.clinicId, clinicId), inArray(media.id, unused)));
}

async function writeDraft(tx: Tx, clinicId: string, draft: PageDraft | null) {
  await tx
    .update(clinics)
    .set({ pageDraft: draft })
    .where(eq(clinics.id, clinicId));
}

function isDraftTooLarge(error: unknown) {
  const pgError = findPgError(error);
  return (
    pgError?.code === PG_CHECK_VIOLATION &&
    pgError.constraint === "clinics_page_draft_size_check"
  );
}

// Turns the draft size check into a form error for the owner.
async function catchDraftTooLarge<T>(
  fn: () => Promise<T>,
): Promise<T | { ok: false; formError: string }> {
  try {
    return await fn();
  } catch (error) {
    if (isDraftTooLarge(error)) return { ok: false, formError: TOO_LARGE };
    throw error;
  }
}

export type BuilderState = {
  slug: string;
  name: string;
  // The name the public page shows (display name, else the name).
  pageName: string;
  published: PublishedPage;
  draft: PageDraft;
  hasDraft: boolean;
  galleryMedia: { id: string; width: number; height: number }[];
};

export async function getBuilderState(clinicId: string): Promise<BuilderState> {
  return inClinic(clinicId, async (tx) => {
    const row = await readClinic(tx, clinicId, false);
    if (!row) throw new Error("Clínica não encontrada.");
    const gallery = (await readGallery(tx, clinicId)).map((p) => p.mediaId);
    const draft = parseDraft(row.pageDraft);
    const ids = [...new Set([...gallery, ...(draft.gallery ?? [])])];
    const sizes =
      ids.length === 0
        ? []
        : await tx
            .select({ id: media.id, width: media.width, height: media.height })
            .from(media)
            .where(and(eq(media.clinicId, clinicId), inArray(media.id, ids)));
    const byId = new Map(sizes.map((m) => [m.id, m]));
    return {
      slug: row.slug,
      name: row.name,
      pageName: row.displayName ?? row.name,
      published: publishedFrom(row, gallery),
      draft,
      hasDraft: row.pageDraft !== null,
      galleryMedia: ids.flatMap((id) => byId.get(id) ?? []),
    };
  });
}

// Saves a change of one or more steps on top of the current draft. Images the
// change leaves out of the draft are deleted unless the page uses them.
export async function saveDraftPatch(
  clinicId: string,
  patch: PageDraft,
): Promise<{ ok: true } | { ok: false; formError: string }> {
  const parsed = pageDraftSchema.safeParse(patch);
  if (!parsed.success) {
    return {
      ok: false,
      formError: parsed.error.issues[0]?.message ?? "Rascunho inválido.",
    };
  }
  return catchDraftTooLarge(() =>
    inClinic(clinicId, async (tx) => {
      const row = await readClinic(tx, clinicId, true);
      if (!row) return { ok: false, formError: "Clínica não encontrada." };
      if (!(await allMediaOfClinic(tx, clinicId, draftMediaIds(parsed.data)))) {
        return { ok: false, formError: MISSING_MEDIA };
      }
      const current = parseDraft(row.pageDraft);
      const next = mergePatch(current, parsed.data);
      await writeDraft(tx, clinicId, next);
      // Images the patch took out of the draft would be named nowhere any
      // more, so publish and discard could not clean them up later.
      await deleteUnusedMedia(
        tx,
        clinicId,
        draftMediaIds(current),
        draftMediaIds(next),
      );
      return { ok: true };
    }),
  );
}

// Stores an image for one step of the draft. The gallery gets it at the end;
// the other slots replace the draft's previous image, which is deleted unless
// the published page still uses it.
export async function uploadDraftImage(
  clinicId: string,
  slot: DraftImageSlot,
  input: { bytes: Buffer; mimeType: string },
): Promise<{ ok: true; mediaId: string } | { ok: false; formError: string }> {
  const config = IMAGE_SLOTS[slot];
  const encoded = await reencodeImage(input, {
    maxSide: config.maxSide,
    quality: config.quality,
  });
  if (!encoded.ok) return encoded;
  const { image } = encoded;

  return catchDraftTooLarge(() =>
    inClinic(clinicId, async (tx) => {
      const row = await readClinic(tx, clinicId, true);
      if (!row) return { ok: false, formError: "Clínica não encontrada." };
      const draft = parseDraft(row.pageDraft);

      let gallery: string[] = [];
      if (config.field === "gallery") {
        gallery =
          draft.gallery ??
          (await readGallery(tx, clinicId)).map((p) => p.mediaId);
        if (gallery.length >= MAX_CLINIC_PHOTOS) {
          return {
            ok: false,
            formError: `A página pode ter no máximo ${MAX_CLINIC_PHOTOS} fotos.`,
          };
        }
      }

      const [created] = await tx
        .insert(media)
        .values({
          clinicId,
          kind: config.kind,
          mimeType: "image/webp",
          data: image.data,
          byteSize: image.data.length,
          width: image.width,
          height: image.height,
        })
        .returning({ id: media.id });
      const mediaId = created!.id;

      if (config.field === "gallery") {
        await writeDraft(tx, clinicId, {
          ...draft,
          gallery: [...gallery, mediaId],
        });
        return { ok: true, mediaId };
      }

      const previous = draft[config.field];
      const next: PageDraft = { ...draft, [config.field]: mediaId };
      await writeDraft(tx, clinicId, next);
      if (previous) {
        await deleteUnusedMedia(tx, clinicId, [previous], draftMediaIds(next));
      }
      return { ok: true, mediaId };
    }),
  );
}

function sameValue(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Puts the draft on the public page in one transaction and clears it.
export async function publishDraft(
  clinicId: string,
  actorUserId: string,
): Promise<{ ok: true; changed: string[] } | { ok: false; formError: string }> {
  return inClinic(clinicId, async (tx) => {
    // Photo lock first, then the row: the same order as photos.ts, whose
    // writes touch the clinic row only after taking the photo lock.
    await lockPhotos(tx, clinicId);
    const row = await readClinic(tx, clinicId, true);
    if (!row) return { ok: false, formError: "Clínica não encontrada." };
    if (row.pageDraft === null) return { ok: true, changed: [] };

    const photos = await readGallery(tx, clinicId);
    const published = publishedFrom(
      row,
      photos.map((p) => p.mediaId),
    );
    const draft = parseDraft(row.pageDraft);
    const ids = draftMediaIds(draft);
    if (!(await allMediaOfClinic(tx, clinicId, ids))) {
      return { ok: false, formError: MISSING_MEDIA };
    }

    const next = mergeDraft(published, draft);
    const changed = PUBLISHED_FIELDS.filter(
      (field) => !sameValue(published[field], next[field]),
    );

    await tx
      .update(clinics)
      .set({
        businessType: next.businessType,
        logoMediaId: next.logoMediaId,
        ownerPhotoMediaId: next.ownerPhotoMediaId,
        coverMediaId: next.coverMediaId,
        theme: next.theme,
        headline: next.headline,
        about: next.about,
        pageDraft: null,
      })
      .where(eq(clinics.id, clinicId));

    const removedPhotos: string[] = [];
    if (changed.includes("gallery")) {
      const wanted = new Set(next.gallery);
      const leaving = photos.filter((p) => !wanted.has(p.mediaId));
      if (leaving.length > 0) {
        await tx.delete(clinicPhotos).where(
          and(
            eq(clinicPhotos.clinicId, clinicId),
            inArray(
              clinicPhotos.id,
              leaving.map((p) => p.id),
            ),
          ),
        );
        removedPhotos.push(...leaving.map((p) => p.mediaId));
      }
      const existing = new Map(photos.map((p) => [p.mediaId, p.id]));
      for (const [position, mediaId] of next.gallery.entries()) {
        const photoId = existing.get(mediaId);
        if (photoId) {
          await tx
            .update(clinicPhotos)
            .set({ position })
            .where(
              and(
                eq(clinicPhotos.id, photoId),
                eq(clinicPhotos.clinicId, clinicId),
              ),
            );
        } else {
          await tx.insert(clinicPhotos).values({ clinicId, mediaId, position });
        }
      }
    }

    // Replaced images, photos taken off the page and draft images left
    // unused. deleteUnusedMedia keeps whatever the page now points at.
    await deleteUnusedMedia(tx, clinicId, [
      ...[
        published.logoMediaId,
        published.ownerPhotoMediaId,
        published.coverMediaId,
      ].filter((id): id is string => id !== null),
      ...removedPhotos,
      ...ids,
    ]);

    await tx.insert(auditLogs).values({
      clinicId,
      actorType: "admin",
      actorUserId,
      action: "clinic.page_published",
      entityType: "clinic",
      entityId: clinicId,
      changes: { fields: changed },
    });
    return { ok: true, changed };
  });
}

// Drops the draft and the images only it used.
export async function discardDraft(
  clinicId: string,
  actorUserId: string,
): Promise<{ ok: true }> {
  await inClinic(clinicId, async (tx) => {
    const row = await readClinic(tx, clinicId, true);
    if (!row || row.pageDraft === null) return;
    const ids = draftMediaIds(parseDraft(row.pageDraft));
    await writeDraft(tx, clinicId, null);
    await deleteUnusedMedia(tx, clinicId, ids);
    await tx.insert(auditLogs).values({
      clinicId,
      actorType: "admin",
      actorUserId,
      action: "clinic.page_draft_discarded",
      entityType: "clinic",
      entityId: clinicId,
      changes: {},
    });
  });
  return { ok: true };
}
