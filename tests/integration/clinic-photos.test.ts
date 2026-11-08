import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, endPools } from "@/db/owner";
import { auditLogs, clinicPhotos, clinics, media, users } from "@/db/schema";
import {
  addClinicPhoto,
  listClinicPhotos,
  MAX_CLINIC_PHOTOS,
  removeClinicPhoto,
  reorderClinicPhotos,
} from "@/modules/clinic-page/photos";
import {
  getClinicPage,
  getClinicPhoto,
  getOwnerPhoto,
} from "@/modules/clinic-page/public";
import { saveOwnerPhoto } from "@/modules/branding/photo";

import { CLINIC, otherClinic } from "../helpers/clinic";

const SYSTEM = { system: true } as const;
let slug: string;
let other: string;
let actor: string;
const otherSlug = "fotos-outra-clinica";

async function jpeg(width = 3000, height = 2000) {
  return sharp({
    create: { width, height, channels: 3, background: "#c0a080" },
  })
    .withMetadata({ exif: { IFD0: { Copyright: "gps-test" } } })
    .jpeg()
    .toBuffer();
}

async function add(clinicId: string) {
  const result = await addClinicPhoto(
    clinicId,
    { bytes: await jpeg(), mimeType: "image/jpeg" },
    SYSTEM,
  );
  if (!result.ok) throw new Error(result.formError);
  return result.photoId;
}

async function clearPhotos() {
  const rows = await db
    .delete(clinicPhotos)
    .returning({ mediaId: clinicPhotos.mediaId });
  for (const row of rows) {
    await db.delete(media).where(eq(media.id, row.mediaId));
  }
}

beforeAll(async () => {
  const [row] = await db
    .select({ slug: clinics.slug })
    .from(clinics)
    .where(eq(clinics.id, CLINIC));
  slug = row!.slug;
  other = await otherClinic(otherSlug);
  const [root] = await db
    .insert(users)
    .values({ name: "Root", email: "clinic-photos@example.com", role: "root" })
    .returning({ id: users.id });
  actor = root!.id;
  await clearPhotos();
});

afterAll(async () => {
  await clearPhotos();
  await db
    .update(clinics)
    .set({ isActive: true })
    .where(eq(clinics.id, CLINIC));
  await endPools();
});

describe("clinic photos", () => {
  it("re-encodes to WebP without metadata, capped at 1600 px, and logs it", async () => {
    const id = await add(CLINIC);
    const photo = await getClinicPhoto(slug, id);
    expect(photo?.mimeType).toBe("image/webp");
    const meta = await sharp(photo!.data).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.width).toBe(1600);
    expect(meta.height).toBe(1067);
    const [log] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, id));
    expect(log).toMatchObject({
      action: "clinic.photo_added",
      actorType: "system",
      clinicId: CLINIC,
    });
  });

  it("lists photos in order on the public page and reorders them", async () => {
    const first = (await listClinicPhotos(CLINIC))[0]!.id;
    const second = await add(CLINIC);
    let page = await getClinicPage(slug);
    expect(page!.photos.map((p) => p.id)).toEqual([first, second]);
    expect(page!.photos[0]).toMatchObject({ width: 1600, height: 1067 });

    expect(await reorderClinicPhotos(CLINIC, [second, first], SYSTEM)).toBe(
      true,
    );
    page = await getClinicPage(slug);
    expect(page!.photos.map((p) => p.id)).toEqual([second, first]);

    // Missing, repeated or foreign ids are refused.
    expect(await reorderClinicPhotos(CLINIC, [second], SYSTEM)).toBe(false);
    expect(await reorderClinicPhotos(CLINIC, [second, second], SYSTEM)).toBe(
      false,
    );
  });

  it("never serves another clinic's photo or another media row", async () => {
    const foreign = await add(other);
    expect(await getClinicPhoto(slug, foreign)).toBeNull();
    expect(await getClinicPhoto(otherSlug, foreign)).not.toBeNull();
    expect((await getClinicPage(slug))!.photos.map((p) => p.id)).not.toContain(
      foreign,
    );
    expect(await removeClinicPhoto(CLINIC, foreign, SYSTEM)).toBe(false);
    const ids = (await listClinicPhotos(CLINIC)).map((p) => p.id);
    expect(
      await reorderClinicPhotos(CLINIC, [...ids.slice(1), foreign], SYSTEM),
    ).toBe(false);

    // The owner photo is a media row too, but not one of the page's photos.
    const owner = await saveOwnerPhoto(
      CLINIC,
      { bytes: await jpeg(400, 400), mimeType: "image/jpeg" },
      actor,
    );
    if (!owner.ok) throw new Error(owner.formError);
    expect(await getOwnerPhoto(slug)).not.toBeNull();
    expect(await getClinicPhoto(slug, owner.mediaId)).toBeNull();
    expect(await getClinicPhoto(slug, "not-a-uuid")).toBeNull();
  });

  it("a deactivated clinic shows no photos", async () => {
    const [id] = (await listClinicPhotos(CLINIC)).map((p) => p.id);
    await db
      .update(clinics)
      .set({ isActive: false })
      .where(eq(clinics.id, CLINIC));
    expect(await getClinicPhoto(slug, id!)).toBeNull();
    const result = await db.execute(
      sql`select * from client_clinic_photos(${CLINIC}::uuid)`,
    );
    expect(result.rows).toEqual([]);
    await db
      .update(clinics)
      .set({ isActive: true })
      .where(eq(clinics.id, CLINIC));
  });

  it("removing a photo deletes its image too", async () => {
    const [photo] = await listClinicPhotos(CLINIC);
    const [row] = await db
      .select({ mediaId: clinicPhotos.mediaId })
      .from(clinicPhotos)
      .where(eq(clinicPhotos.id, photo!.id));
    expect(await removeClinicPhoto(CLINIC, photo!.id, SYSTEM)).toBe(true);
    expect(
      await db.select().from(media).where(eq(media.id, row!.mediaId)),
    ).toEqual([]);
    expect(await getClinicPhoto(slug, photo!.id)).toBeNull();
  });

  it(`stops at ${MAX_CLINIC_PHOTOS} photos`, async () => {
    const count = (await listClinicPhotos(CLINIC)).length;
    const small = await jpeg(200, 200);
    for (let i = count; i < MAX_CLINIC_PHOTOS; i++) {
      const result = await addClinicPhoto(
        CLINIC,
        { bytes: small, mimeType: "image/jpeg" },
        SYSTEM,
      );
      expect(result.ok).toBe(true);
    }
    const over = await addClinicPhoto(
      CLINIC,
      { bytes: small, mimeType: "image/jpeg" },
      SYSTEM,
    );
    expect(over).toEqual({
      ok: false,
      formError: `A página pode ter no máximo ${MAX_CLINIC_PHOTOS} fotos.`,
    });
  });

  it("refuses files that are not images", async () => {
    const result = await addClinicPhoto(
      CLINIC,
      { bytes: Buffer.from("not an image"), mimeType: "image/jpeg" },
      SYSTEM,
    );
    expect(result.ok).toBe(false);
  });
});
