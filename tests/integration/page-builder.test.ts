import { and, asc, eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db, endPools } from "@/db/owner";
import { auditLogs, clinicPhotos, clinics, media, users } from "@/db/schema";
import { addClinicPhoto } from "@/modules/clinic-page/photos";
import { getClinicPage } from "@/modules/clinic-page/public";
import {
  discardDraft,
  getBuilderState,
  publishDraft,
  saveDraftPatch,
  uploadDraftImage,
} from "@/modules/page-builder/builder";

import { CLINIC, otherClinic } from "../helpers/clinic";

// The page builder's draft (src/modules/page-builder/builder.ts): nothing
// reaches the public page before "Publicar", and images that end up unused
// are deleted. Every record is fictitious.

let slug: string;
let actor: string;
let otherMedia: string;
// Page photos the clinic already had (other test files' data, kept as is).
let baseGallery: string[];
// Every media row these tests create, deleted by reset().
const created = new Set<string>();
let original: {
  businessType: "clinic" | "barbershop" | "nail_salon" | "other";
  logoMediaId: string | null;
  ownerPhotoMediaId: string | null;
  coverMediaId: string | null;
  theme: Record<string, unknown>;
  headline: string | null;
  about: string | null;
};

async function jpeg(width = 3000, height = 2000) {
  return sharp({
    create: { width, height, channels: 3, background: "#c0a080" },
  })
    .withMetadata({ exif: { IFD0: { Copyright: "gps-test" } } })
    .jpeg()
    .toBuffer();
}

async function upload(
  slot: "logo" | "ownerPhoto" | "cover" | "gallery",
  width = 1200,
  height = 800,
) {
  const result = await uploadDraftImage(CLINIC, slot, {
    bytes: await jpeg(width, height),
    mimeType: "image/jpeg",
  });
  if (!result.ok) throw new Error(result.formError);
  created.add(result.mediaId);
  return result.mediaId;
}

// A photo published straight from the photo screen; returns its media id.
async function addPhoto() {
  const added = await addClinicPhoto(
    CLINIC,
    { bytes: await jpeg(), mimeType: "image/jpeg" },
    { system: true },
  );
  if (!added.ok) throw new Error(added.formError);
  const [row] = await db
    .select({ mediaId: clinicPhotos.mediaId })
    .from(clinicPhotos)
    .where(eq(clinicPhotos.id, added.photoId));
  created.add(row!.mediaId);
  return row!.mediaId;
}

async function clinicRow() {
  const [row] = await db.select().from(clinics).where(eq(clinics.id, CLINIC));
  return row!;
}

async function mediaExists(id: string) {
  const rows = await db
    .select({ id: media.id })
    .from(media)
    .where(eq(media.id, id));
  return rows.length === 1;
}

// Back to the clinic as the file found it, without the images the file's
// media columns pointed at (so publishing never deletes them), and without
// the rows these tests created. Nothing else of the shared clinic is touched.
async function reset() {
  await db
    .update(clinics)
    .set({
      ...original,
      logoMediaId: null,
      ownerPhotoMediaId: null,
      coverMediaId: null,
      pageDraft: null,
    })
    .where(eq(clinics.id, CLINIC));
  const ids = [...created];
  if (ids.length > 0) {
    await db
      .delete(clinicPhotos)
      .where(
        and(
          eq(clinicPhotos.clinicId, CLINIC),
          inArray(clinicPhotos.mediaId, ids),
        ),
      );
    await db
      .delete(media)
      .where(and(eq(media.clinicId, CLINIC), inArray(media.id, ids)));
  }
  created.clear();
}

beforeAll(async () => {
  const row = await clinicRow();
  slug = row.slug;
  original = {
    businessType: row.businessType,
    logoMediaId: row.logoMediaId,
    ownerPhotoMediaId: row.ownerPhotoMediaId,
    coverMediaId: row.coverMediaId,
    theme: row.theme,
    headline: row.headline,
    about: row.about,
  };
  const photos = await db
    .select({ mediaId: clinicPhotos.mediaId })
    .from(clinicPhotos)
    .where(eq(clinicPhotos.clinicId, CLINIC))
    .orderBy(
      asc(clinicPhotos.position),
      asc(clinicPhotos.createdAt),
      asc(clinicPhotos.id),
    );
  baseGallery = photos.map((p) => p.mediaId);
  const other = await otherClinic("page-builder-rascunho-outra");
  const [foreign] = await db
    .insert(media)
    .values({
      clinicId: other,
      kind: "photo",
      mimeType: "image/png",
      data: Buffer.from([1, 2, 3]),
      byteSize: 3,
      width: 1,
      height: 1,
    })
    .returning({ id: media.id });
  otherMedia = foreign!.id;
  const [root] = await db
    .insert(users)
    .values({ name: "Root", email: "page-builder@example.com", role: "root" })
    .returning({ id: users.id });
  actor = root!.id;
});

beforeEach(reset);

afterAll(async () => {
  await reset();
  await db
    .update(clinics)
    .set({ ...original, pageDraft: null })
    .where(eq(clinics.id, CLINIC));
  await db.delete(media).where(eq(media.id, otherMedia));
  await endPools();
});

describe("page builder draft", () => {
  it("draft does not change the public page", async () => {
    const before = await getClinicPage(slug);
    await upload("cover");
    expect(await saveDraftPatch(CLINIC, { headline: "Nova" })).toEqual({
      ok: true,
    });
    expect(await getClinicPage(slug)).toEqual(before);

    const state = await getBuilderState(CLINIC);
    expect(state.hasDraft).toBe(true);
    expect(state.draft.headline).toBe("Nova");
    expect(state.draft.coverMediaId).toBeTruthy();
  });

  it("publish copies fields, rewrites the gallery and clears the draft", async () => {
    const kept = await addPhoto();

    // A new gallery image starts from the published gallery.
    const fresh = await upload("gallery");
    let state = await getBuilderState(CLINIC);
    expect(state.draft.gallery).toEqual([...baseGallery, kept, fresh]);
    expect(state.galleryMedia.map((m) => m.id).sort()).toEqual(
      [...baseGallery, kept, fresh].sort(),
    );

    const removed = await upload("gallery");
    const cover = await upload("cover");
    expect(
      await saveDraftPatch(CLINIC, {
        businessType: "barbershop",
        headline: "Publicada",
        theme: { fontId: "oswald", primaryColor: "#123456" },
        gallery: [fresh, ...baseGallery, kept],
      }),
    ).toEqual({ ok: true });

    const result = await publishDraft(CLINIC, actor);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed.sort()).toEqual(
      ["businessType", "coverMediaId", "gallery", "headline", "theme"].sort(),
    );

    const row = await clinicRow();
    expect(row).toMatchObject({
      businessType: "barbershop",
      headline: "Publicada",
      coverMediaId: cover,
      pageDraft: null,
    });
    expect(row.theme).toMatchObject({
      ...original.theme,
      fontId: "oswald",
      primaryColor: "#123456",
    });

    const photos = await db
      .select({
        mediaId: clinicPhotos.mediaId,
        position: clinicPhotos.position,
      })
      .from(clinicPhotos)
      .where(eq(clinicPhotos.clinicId, CLINIC))
      .orderBy(asc(clinicPhotos.position));
    expect(photos).toEqual(
      [fresh, ...baseGallery, kept].map((mediaId, position) => ({
        mediaId,
        position,
      })),
    );
    // The draft image left out of the gallery is gone.
    expect(await mediaExists(removed)).toBe(false);

    const page = await getClinicPage(slug);
    expect(page!.headline).toBe("Publicada");

    const [log] = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.clinicId, CLINIC),
          eq(auditLogs.action, "clinic.page_published"),
        ),
      );
    expect(log).toMatchObject({ actorType: "admin", actorUserId: actor });
    expect((log!.changes as { fields: string[] }).fields.sort()).toEqual(
      result.changed,
    );

    state = await getBuilderState(CLINIC);
    expect(state.hasDraft).toBe(false);
    expect(state.draft).toEqual({});
    expect(state.published.gallery).toEqual([fresh, ...baseGallery, kept]);
  });

  it("publish removes a gallery photo left out of the list", async () => {
    const leaving = await addPhoto();
    expect(await saveDraftPatch(CLINIC, { gallery: baseGallery })).toEqual({
      ok: true,
    });
    expect(await publishDraft(CLINIC, actor)).toEqual({
      ok: true,
      changed: ["gallery"],
    });
    const left = await db
      .select({ mediaId: clinicPhotos.mediaId })
      .from(clinicPhotos)
      .where(eq(clinicPhotos.clinicId, CLINIC))
      .orderBy(asc(clinicPhotos.position));
    expect(left.map((p) => p.mediaId)).toEqual(baseGallery);
    expect(await mediaExists(leaving)).toBe(false);
  });

  it("publish deletes the replaced logo media", async () => {
    const first = await upload("logo");
    await publishDraft(CLINIC, actor);
    expect((await clinicRow()).logoMediaId).toBe(first);

    const second = await upload("logo");
    const result = await publishDraft(CLINIC, actor);
    expect(result).toEqual({ ok: true, changed: ["logoMediaId"] });
    expect((await clinicRow()).logoMediaId).toBe(second);
    expect(await mediaExists(first)).toBe(false);
    const [stored] = await db
      .select({ kind: media.kind })
      .from(media)
      .where(eq(media.id, second));
    expect(stored!.kind).toBe("logo");
  });

  it("replacing a draft image deletes the previous draft one", async () => {
    const first = await upload("cover");
    const second = await upload("cover");
    expect(await mediaExists(first)).toBe(false);
    expect((await getBuilderState(CLINIC)).draft.coverMediaId).toBe(second);
  });

  it("publish refuses a media id from another clinic", async () => {
    expect(await saveDraftPatch(CLINIC, { coverMediaId: otherMedia })).toEqual({
      ok: false,
      formError: expect.any(String),
    });

    // Even when it reaches the stored draft some other way.
    await db
      .update(clinics)
      .set({ pageDraft: { coverMediaId: otherMedia, headline: "Outra" } })
      .where(eq(clinics.id, CLINIC));
    const result = await publishDraft(CLINIC, actor);
    expect(result.ok).toBe(false);
    const row = await clinicRow();
    expect(row.coverMediaId).toBeNull();
    expect(row.headline).toBe(original.headline);
    expect(await mediaExists(otherMedia)).toBe(true);
  });

  it("refuses an invalid patch", async () => {
    expect(
      await saveDraftPatch(CLINIC, {
        theme: { primaryColor: "azul" },
      } as never),
    ).toEqual({ ok: false, formError: expect.any(String) });
    expect((await clinicRow()).pageDraft).toBeNull();
  });

  it("publishing twice is a no-op the second time", async () => {
    await saveDraftPatch(CLINIC, { headline: "Duas vezes" });
    const first = await publishDraft(CLINIC, actor);
    expect(first).toEqual({ ok: true, changed: ["headline"] });
    const logs = async () =>
      db
        .select({ id: auditLogs.id })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.clinicId, CLINIC),
            eq(auditLogs.action, "clinic.page_published"),
          ),
        );
    const count = (await logs()).length;
    expect(await publishDraft(CLINIC, actor)).toEqual({
      ok: true,
      changed: [],
    });
    expect((await logs()).length).toBe(count);
    expect((await clinicRow()).headline).toBe("Duas vezes");
  });

  it("discard keeps the published logo and deletes the draft one", async () => {
    const published = await upload("logo");
    await publishDraft(CLINIC, actor);
    const drafted = await upload("logo");
    await saveDraftPatch(CLINIC, { headline: "Descartada" });

    expect(await discardDraft(CLINIC, actor)).toEqual({ ok: true });
    const row = await clinicRow();
    expect(row.logoMediaId).toBe(published);
    expect(row.pageDraft).toBeNull();
    expect(row.headline).toBe(original.headline);
    expect(await mediaExists(published)).toBe(true);
    expect(await mediaExists(drafted)).toBe(false);
    const [log] = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.clinicId, CLINIC),
          eq(auditLogs.action, "clinic.page_draft_discarded"),
        ),
      );
    expect(log).toMatchObject({ actorType: "admin", actorUserId: actor });
  });

  it("builder state ignores an invalid stored draft", async () => {
    await db
      .update(clinics)
      .set({ pageDraft: { theme: { primaryColor: 1 } } })
      .where(eq(clinics.id, CLINIC));
    const state = await getBuilderState(CLINIC);
    expect(state.hasDraft).toBe(true);
    expect(state.draft).toEqual({ theme: {} });
    expect(state.slug).toBe(slug);
  });

  it("upload strips EXIF", async () => {
    const id = await upload("cover", 3000, 2000);
    const [stored] = await db
      .select({ data: media.data, mimeType: media.mimeType, kind: media.kind })
      .from(media)
      .where(eq(media.id, id));
    expect(stored).toMatchObject({ mimeType: "image/webp", kind: "photo" });
    const meta = await sharp(stored!.data).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.width).toBe(1600);
    expect(meta.height).toBe(1067);

    const logo = await upload("logo", 3000, 2000);
    const [small] = await db
      .select({ width: media.width })
      .from(media)
      .where(eq(media.id, logo));
    expect(small!.width).toBe(800);
  });
});
