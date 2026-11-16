import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, endPools } from "@/db/owner";
import { auditLogs, clinics, media, users } from "@/db/schema";
import {
  getClinicMedia,
  removeOwnerPhoto,
  saveOwnerPhoto,
} from "@/modules/branding/photo";
import {
  discardDraft,
  getBuilderState,
  saveDraftPatch,
  uploadDraftImage,
} from "@/modules/page-builder/builder";

import { CLINIC, otherClinic } from "../helpers/clinic";

let actor: string;

async function jpeg() {
  return sharp({
    create: { width: 1200, height: 600, channels: 3, background: "#888" },
  })
    .withMetadata({
      orientation: 6,
      exif: { IFD0: { Copyright: "gps-test" } },
    })
    .jpeg()
    .toBuffer();
}

async function photoId(clinicId: string) {
  const [row] = await db
    .select({ id: clinics.ownerPhotoMediaId })
    .from(clinics)
    .where(eq(clinics.id, clinicId));
  return row!.id;
}

beforeAll(async () => {
  const [root] = await db
    .insert(users)
    .values({ name: "Root", email: "photo@example.com", role: "root" })
    .returning({ id: users.id });
  actor = root!.id;
});

afterAll(async () => {
  await endPools();
});

describe("owner photo", () => {
  it("strips metadata and keeps the photo upright", async () => {
    const result = await saveOwnerPhoto(
      CLINIC,
      { bytes: await jpeg(), mimeType: "image/jpeg" },
      actor,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stored = await getClinicMedia(CLINIC, result.mediaId);
    expect(stored?.mimeType).toBe("image/webp");
    const meta = await sharp(stored!.data).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.width).toBeLessThanOrEqual(800);
    expect(meta.height!).toBeGreaterThan(meta.width!);
    expect(await photoId(CLINIC)).toBe(result.mediaId);
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "clinic.owner_photo_changed"));
    expect(logs.length).toBeGreaterThan(0);
  });

  it("replacing deletes the previous photo row", async () => {
    const before = await photoId(CLINIC);
    const result = await saveOwnerPhoto(
      CLINIC,
      { bytes: await jpeg(), mimeType: "image/jpeg" },
      actor,
    );
    expect(result.ok).toBe(true);
    const rows = await db.select().from(media).where(eq(media.id, before!));
    expect(rows).toHaveLength(0);
  });

  it("refuses a big or wrong file", async () => {
    const big = await saveOwnerPhoto(
      CLINIC,
      { bytes: Buffer.alloc(10 * 1024 * 1024 + 1), mimeType: "image/jpeg" },
      actor,
    );
    expect(big.ok).toBe(false);
    const gif = await saveOwnerPhoto(
      CLINIC,
      { bytes: await jpeg(), mimeType: "image/gif" },
      actor,
    );
    expect(gif.ok).toBe(false);
    const svg = await saveOwnerPhoto(
      CLINIC,
      {
        bytes: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
        ),
        mimeType: "image/png",
      },
      actor,
    );
    expect(svg.ok).toBe(false);
    const garbage = await saveOwnerPhoto(
      CLINIC,
      { bytes: Buffer.from("not an image"), mimeType: "image/png" },
      actor,
    );
    expect(garbage.ok).toBe(false);
  });

  it("another clinic cannot read it", async () => {
    const other = await otherClinic();
    const id = (await photoId(CLINIC))!;
    expect(await getClinicMedia(other, id)).toBeNull();
    expect(await getClinicMedia(CLINIC, id)).not.toBeNull();
  });

  it("drops the page draft's pending photo, keeping the rest of the draft", async () => {
    const pending = await uploadDraftImage(CLINIC, "ownerPhoto", {
      bytes: await jpeg(),
      mimeType: "image/jpeg",
    });
    expect(pending.ok).toBe(true);
    if (!pending.ok) return;
    await saveDraftPatch(CLINIC, { headline: "Rascunho" });

    const saved = await saveOwnerPhoto(
      CLINIC,
      { bytes: await jpeg(), mimeType: "image/jpeg" },
      actor,
    );
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const state = await getBuilderState(CLINIC);
    expect(state.draft).toEqual({ headline: "Rascunho" });
    expect(state.published.ownerPhotoMediaId).toBe(saved.mediaId);
    expect(
      await db.select().from(media).where(eq(media.id, pending.mediaId)),
    ).toHaveLength(0);

    // A draft that only removed the photo leaves no draft behind.
    await discardDraft(CLINIC, actor);
    await saveDraftPatch(CLINIC, { ownerPhotoMediaId: null });
    await removeOwnerPhoto(CLINIC, actor);
    expect((await getBuilderState(CLINIC)).hasDraft).toBe(false);
    expect(await photoId(CLINIC)).toBeNull();
    await saveOwnerPhoto(
      CLINIC,
      { bytes: await jpeg(), mimeType: "image/jpeg" },
      actor,
    );
  });

  it("removing clears the column and the row, and is a no-op without photo", async () => {
    const id = (await photoId(CLINIC))!;
    expect(await removeOwnerPhoto(CLINIC, actor)).toEqual({ ok: true });
    expect(await photoId(CLINIC)).toBeNull();
    expect(await db.select().from(media).where(eq(media.id, id))).toHaveLength(
      0,
    );
    expect(await removeOwnerPhoto(CLINIC, actor)).toEqual({ ok: true });
  });
});
