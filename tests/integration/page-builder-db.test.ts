import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { clientDb, inClinic } from "@/db/client";
import { findPgError } from "@/db/errors";
import { db, endPools } from "@/db/owner";
import { clinics, media } from "@/db/schema";

import { CLINIC, otherClinic } from "../helpers/clinic";

// The page builder's columns (migration 0025): the draft is private to the
// panel, the cover must be the clinic's own image, and clients only reach the
// published pieces. Every record is fictitious.

let other: string;
let otherMedia: string;
let ownMedia: string;

async function pgErrorCode(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return findPgError(error)?.code;
  }
  return "no error";
}

async function addMedia(clinicId: string) {
  const [row] = await db
    .insert(media)
    .values({
      clinicId,
      kind: "photo",
      mimeType: "image/png",
      data: Buffer.from([1, 2, 3]),
      byteSize: 3,
      width: 1,
      height: 1,
    })
    .returning({ id: media.id });
  return row!.id;
}

beforeAll(async () => {
  other = await otherClinic("page-builder-outra");
  otherMedia = await addMedia(other);
  ownMedia = await addMedia(CLINIC);
});

afterAll(async () => {
  await db
    .update(clinics)
    .set({ coverMediaId: null, isActive: true })
    .where(eq(clinics.id, CLINIC));
  await endPools();
});

describe("page builder columns", () => {
  it("client cannot read page_draft", async () => {
    const code = await pgErrorCode(
      clientDb.execute(sql`select page_draft from clinics`),
    );
    expect(code).toBe("42501");
  });

  it("client reads business_type, theme, logo and cover columns", async () => {
    await clientDb.execute(
      sql`select business_type, theme, logo_media_id, cover_media_id from clinics`,
    );
  });

  it("panel cannot write another clinic's page_draft", async () => {
    const updated = await inClinic(CLINIC, (tx) =>
      tx
        .update(clinics)
        .set({ pageDraft: { step: 1 } })
        .where(eq(clinics.id, other))
        .returning({ id: clinics.id }),
    );
    expect(updated).toHaveLength(0);
  });

  it("panel writes its own page_draft, business type and cover", async () => {
    const updated = await inClinic(CLINIC, (tx) =>
      tx
        .update(clinics)
        .set({
          pageDraft: { step: 1 },
          businessType: "barbershop",
          coverMediaId: ownMedia,
        })
        .where(eq(clinics.id, CLINIC))
        .returning({ id: clinics.id }),
    );
    expect(updated).toHaveLength(1);
    await db
      .update(clinics)
      .set({ pageDraft: null, businessType: "clinic", coverMediaId: null })
      .where(eq(clinics.id, CLINIC));
  });

  it("rejects a page_draft over 16 KiB", async () => {
    const code = await pgErrorCode(
      inClinic(CLINIC, (tx) =>
        tx
          .update(clinics)
          .set({ pageDraft: { blob: "x".repeat(20000) } })
          .where(eq(clinics.id, CLINIC)),
      ),
    );
    expect(code).toBe("23514");
  });

  it("cover must be a media of the same clinic", async () => {
    const code = await pgErrorCode(
      inClinic(CLINIC, (tx) =>
        tx
          .update(clinics)
          .set({ coverMediaId: otherMedia })
          .where(eq(clinics.id, CLINIC)),
      ),
    );
    expect(code).toBe("23503");
  });

  it("client_clinic_logo and client_clinic_cover return the image of an active clinic", async () => {
    await db
      .update(clinics)
      .set({ logoMediaId: ownMedia, coverMediaId: ownMedia })
      .where(eq(clinics.id, CLINIC));
    try {
      const cover = await clientDb.execute(
        sql`select mime_type from client_clinic_cover(${CLINIC}::uuid)`,
      );
      const logo = await clientDb.execute(
        sql`select mime_type from client_clinic_logo(${CLINIC}::uuid)`,
      );
      expect(cover.rows).toHaveLength(1);
      expect(logo.rows).toHaveLength(1);
    } finally {
      await db
        .update(clinics)
        .set({ logoMediaId: null, coverMediaId: null })
        .where(eq(clinics.id, CLINIC));
    }
  });

  it("client_clinic_cover returns nothing for an inactive clinic", async () => {
    await db
      .update(clinics)
      .set({ coverMediaId: ownMedia, isActive: false })
      .where(eq(clinics.id, CLINIC));
    try {
      const cover = await clientDb.execute(
        sql`select mime_type from client_clinic_cover(${CLINIC}::uuid)`,
      );
      const logo = await clientDb.execute(
        sql`select mime_type from client_clinic_logo(${CLINIC}::uuid)`,
      );
      expect(cover.rows).toHaveLength(0);
      expect(logo.rows).toHaveLength(0);
    } finally {
      await db
        .update(clinics)
        .set({ coverMediaId: null, isActive: true })
        .where(eq(clinics.id, CLINIC));
    }
  });
});
