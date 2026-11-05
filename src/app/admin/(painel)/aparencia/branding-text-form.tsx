"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ClinicWordmark } from "@/components/clinic-wordmark";
import { FieldError, FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { saveBrandingTextAction, type BrandingActionResult } from "./actions";

export function BrandingTextForm({
  displayName,
  areaLabel,
}: {
  displayName: string;
  areaLabel: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [area, setArea] = useState(areaLabel ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    let result: BrandingActionResult;
    try {
      result = await saveBrandingTextAction({
        displayName: name,
        areaLabel: area,
      });
    } catch {
      result = {
        ok: false,
        formError: "Não foi possível salvar. Tente novamente.",
      };
    }
    setSaving(false);
    if (result.ok) {
      setErrors({});
      setFormError(null);
      setSaved(true);
      router.refresh();
      return;
    }
    setErrors(result.fieldErrors ?? {});
    setFormError(result.formError ?? "Confira os campos destacados.");
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid content-start gap-1">
          <Label htmlFor="aparencia-nome">Nome</Label>
          <Input
            id="aparencia-nome"
            value={name}
            maxLength={40}
            aria-invalid={Boolean(errors.displayName)}
            onChange={(event) => setName(event.target.value)}
          />
          <FieldError id="aparencia-nome-erro" message={errors.displayName} />
        </div>
        <div className="grid content-start gap-1">
          <Label htmlFor="aparencia-area">Área</Label>
          <Input
            id="aparencia-area"
            value={area}
            maxLength={40}
            aria-invalid={Boolean(errors.areaLabel)}
            onChange={(event) => setArea(event.target.value)}
          />
          <FieldError id="aparencia-area-erro" message={errors.areaLabel} />
        </div>
      </div>
      <div className="w-fit max-w-full rounded-xl bg-brand p-4 text-brand-foreground">
        <ClinicWordmark
          displayName={name.trim() || displayName}
          areaLabel={area.trim() || null}
        />
      </div>
      <div className="grid gap-2">
        <FormError message={formError} />
        {saved ? (
          <p role="status" className="text-sm text-muted-foreground">
            Salvo.
          </p>
        ) : null}
        <Button type="submit" disabled={saving} className="w-fit">
          {saving ? "Salvando..." : "Salvar nome e área"}
        </Button>
      </div>
    </form>
  );
}
