import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { auditLogs, clinics } from "@/db/schema";

import { type Palette, palettesForClinic, resolvePalette } from "./palettes";

// Visual identity of a clinic: palette, display name, area and owner photo.
// Every function takes the clinicId first and stays inside that clinic.

export type ClinicBranding = {
  clinicId: string;
  slug: string;
  name: string;
  displayName: string;
  areaLabel: string | null;
  palette: Palette;
  offered: Palette[];
  ownerPhotoMediaId: string | null;
};

export async function getClinicBranding(
  clinicId: string,
): Promise<ClinicBranding | null> {
  const [row] = await db
    .select({
      slug: clinics.slug,
      name: clinics.name,
      displayName: clinics.displayName,
      areaLabel: clinics.areaLabel,
      theme: clinics.theme,
      ownerPhotoMediaId: clinics.ownerPhotoMediaId,
    })
    .from(clinics)
    .where(eq(clinics.id, clinicId))
    .limit(1);
  if (!row) return null;
  return {
    clinicId,
    slug: row.slug,
    name: row.name,
    displayName: row.displayName ?? row.name,
    areaLabel: row.areaLabel,
    palette: resolvePalette(row.slug, row.theme.paletteId),
    offered: palettesForClinic(row.slug),
    ownerPhotoMediaId: row.ownerPhotoMediaId,
  };
}

export async function setClinicPalette(
  clinicId: string,
  paletteId: string,
  actorUserId: string,
): Promise<{ ok: true } | { ok: false; formError: string }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ slug: clinics.slug, theme: clinics.theme })
      .from(clinics)
      .where(eq(clinics.id, clinicId))
      .for("update")
      .limit(1);
    if (!row) return { ok: false, formError: "Clínica não encontrada." };
    if (!palettesForClinic(row.slug).some((p) => p.id === paletteId)) {
      return { ok: false, formError: "Escolha uma das paletas disponíveis." };
    }
    const from = resolvePalette(row.slug, row.theme.paletteId).id;
    await tx
      .update(clinics)
      .set({ theme: { ...row.theme, paletteId } })
      .where(eq(clinics.id, clinicId));
    await tx.insert(auditLogs).values({
      clinicId,
      actorType: "admin",
      actorUserId,
      action: "clinic.palette_changed",
      entityType: "clinic",
      entityId: clinicId,
      changes: { from, to: paletteId },
    });
    return { ok: true };
  });
}

export async function updateBrandingText(
  clinicId: string,
  values: { displayName: string | null; areaLabel: string | null },
  actorUserId: string,
): Promise<{ ok: true }> {
  await db.transaction(async (tx) => {
    await tx
      .update(clinics)
      .set({ displayName: values.displayName, areaLabel: values.areaLabel })
      .where(eq(clinics.id, clinicId));
    await tx.insert(auditLogs).values({
      clinicId,
      actorType: "admin",
      actorUserId,
      action: "clinic.branding_updated",
      entityType: "clinic",
      entityId: clinicId,
      changes: { fields: ["displayName", "areaLabel"] },
    });
  });
  return { ok: true };
}
