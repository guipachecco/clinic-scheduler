"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FieldError, FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AMENITIES,
  AMENITY_LABELS,
  type Amenity,
} from "@/modules/clinic-page/fields";

import { savePageAction } from "./actions";

const SAVE_ERROR = "Não foi possível salvar. Tente novamente.";

export type PageFormDefaults = {
  headline: string;
  about: string;
  whatsappPhone: string;
  contactEmail: string;
  address: string;
  mapsUrl: string;
  instagram: string;
  amenities: Amenity[];
  onlineBookingEnabled: boolean;
};

export function PageForm({ defaults }: { defaults: PageFormDefaults }) {
  const router = useRouter();
  const [values, setValues] = useState(defaults);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  function set<K extends keyof PageFormDefaults>(
    key: K,
    value: PageFormDefaults[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function toggleAmenity(key: Amenity, checked: boolean) {
    set(
      "amenities",
      checked
        ? [...values.amenities, key]
        : values.amenities.filter((item) => item !== key),
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    setErrors({});
    setSaved(false);
    try {
      const result = await savePageAction(values);
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setErrors(result.fieldErrors);
        const hasFieldErrors = Object.keys(result.fieldErrors).length > 0;
        setFormError(result.formError ?? (hasFieldErrors ? null : SAVE_ERROR));
      }
    } catch {
      setFormError(SAVE_ERROR);
    } finally {
      setPending(false);
    }
  }

  function field(
    id: keyof Omit<PageFormDefaults, "amenities" | "onlineBookingEnabled">,
    label: string,
    options: { help?: string; type?: string; multiline?: boolean } = {},
  ) {
    const error = errors[id];
    const describedBy =
      [options.help ? `${id}-ajuda` : null, error ? `${id}-erro` : null]
        .filter(Boolean)
        .join(" ") || undefined;
    const common = {
      id,
      value: values[id],
      "aria-invalid": Boolean(error),
      "aria-describedby": describedBy,
    };
    return (
      <div className="grid gap-2">
        <Label htmlFor={id}>{label}</Label>
        {options.multiline ? (
          <Textarea
            {...common}
            onChange={(event) => set(id, event.target.value)}
          />
        ) : (
          <Input
            {...common}
            type={options.type ?? "text"}
            onChange={(event) => set(id, event.target.value)}
          />
        )}
        {options.help ? (
          <p id={`${id}-ajuda`} className="text-sm text-muted-foreground">
            {options.help}
          </p>
        ) : null}
        <FieldError id={`${id}-erro`} message={error} />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      {field("headline", "Frase de apresentação")}
      {field("about", "Sobre a clínica", { multiline: true })}
      {field("whatsappPhone", "WhatsApp", { type: "tel" })}
      {field("contactEmail", "E-mail de contato", { type: "email" })}
      {field("address", "Endereço")}
      {field("mapsUrl", "Link do mapa", {
        help: "Cole o link do Google Maps (começa com https://)",
      })}
      {field("instagram", "Instagram", {
        help: "Pode colar o link do perfil ou o @",
      })}

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">Comodidades</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {AMENITIES.map((key) => (
            <label
              key={key}
              className="flex min-h-11 items-center gap-3 rounded-lg border bg-card px-3 text-sm"
            >
              <input
                type="checkbox"
                className="size-5 accent-primary"
                checked={values.amenities.includes(key)}
                onChange={(event) => toggleAmenity(key, event.target.checked)}
              />
              {AMENITY_LABELS[key]}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex min-h-11 items-center gap-3 rounded-lg border bg-card px-3 text-sm font-medium">
        <input
          type="checkbox"
          className="size-5 accent-primary"
          checked={values.onlineBookingEnabled}
          onChange={(event) =>
            set("onlineBookingEnabled", event.target.checked)
          }
        />
        Aceitar agendamentos online
      </label>

      <FormError message={formError} />
      <p role="status" className="text-sm font-medium text-primary">
        {saved ? "Página salva." : ""}
      </p>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Salvando..." : "Salvar página"}
      </Button>
    </form>
  );
}
