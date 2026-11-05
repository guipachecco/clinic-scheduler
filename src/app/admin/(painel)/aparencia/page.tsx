import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/modules/auth/session";
import { getClinicBranding } from "@/modules/branding/branding";

import { BrandingTextForm } from "./branding-text-form";
import { PalettePicker } from "./palette-picker";
import { PhotoForm } from "./photo-form";

export const metadata: Metadata = { title: "Aparência" };

export default async function AppearancePage() {
  const { clinicId, user } = await requireAdmin();
  const branding = await getClinicBranding(clinicId);
  if (!branding) notFound();

  return (
    <div className="grid gap-8">
      <h1 className="font-heading text-2xl font-bold">Aparência</h1>

      <section className="grid gap-3" aria-labelledby="aparencia-cores">
        <h2 id="aparencia-cores" className="text-lg font-semibold">
          Cores
        </h2>
        {branding.usesBrandImages ? (
          <p className="rounded-xl border bg-card p-4">
            <strong>Marca própria.</strong> Esta clínica usa as cores e o logo
            da própria marca.
          </p>
        ) : (
          <PalettePicker
            palettes={branding.offered}
            currentId={branding.palette.id}
          />
        )}
      </section>

      {branding.usesBrandImages ? null : (
        <section className="grid gap-3" aria-labelledby="aparencia-nome-area">
          <h2 id="aparencia-nome-area" className="text-lg font-semibold">
            Nome e área
          </h2>
          <BrandingTextForm
            displayName={branding.displayName}
            areaLabel={branding.areaLabel}
          />
        </section>
      )}

      <section className="grid gap-3" aria-labelledby="aparencia-foto-titulo">
        <h2 id="aparencia-foto-titulo" className="text-lg font-semibold">
          Foto
        </h2>
        <PhotoForm
          photoId={branding.ownerPhotoMediaId}
          initial={user.name.trim().charAt(0).toUpperCase()}
        />
      </section>
    </div>
  );
}
