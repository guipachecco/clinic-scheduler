"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { FieldError, FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  BUSINESS_TYPE_LABELS,
  BUSINESS_TYPES,
} from "@/modules/business-type/vocabulary";
import {
  clinicEditSchema,
  type ClinicEditInput,
  type ClinicEditValues,
} from "@/modules/clinics/fields";
import type { ClinicModule } from "@/modules/clinics/modules";

import { updateClinicAction } from "../actions";
import { ModulesFieldset } from "../modules-fieldset";

const SAVE_ERROR = "Não foi possível salvar. Tente novamente.";

export function ClinicEditForm({
  id,
  defaults,
}: {
  id: string;
  defaults: ClinicEditValues;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const form = useForm<ClinicEditInput, unknown, ClinicEditValues>({
    resolver: zodResolver(clinicEditSchema),
    defaultValues: defaults,
  });
  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = form;
  const modules = useWatch({ control: form.control, name: "modules" }) as
    ClinicModule[] | undefined;

  async function onSubmit() {
    setFormError(null);
    setSaved(false);
    let result;
    try {
      result = await updateClinicAction(id, getValues());
    } catch {
      setFormError(SAVE_ERROR);
      return;
    }
    if (result.ok) {
      setSaved(true);
      router.refresh();
      return;
    }
    const entries = Object.entries(result.fieldErrors);
    entries.forEach(([name, message], index) => {
      setError(
        name as keyof ClinicEditInput,
        { message },
        { shouldFocus: index === 0 },
      );
    });
    setFormError(
      result.formError ?? (entries.length === 0 ? SAVE_ERROR : null),
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
      <div className="grid content-start gap-2">
        <Label htmlFor="clinica-nome">Nome da clínica</Label>
        <Input
          id="clinica-nome"
          autoComplete="off"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "clinica-nome-erro" : undefined}
          {...register("name")}
        />
        <FieldError id="clinica-nome-erro" message={errors.name?.message} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor="clinica-tipo">Tipo de negócio</Label>
        <NativeSelect
          id="clinica-tipo"
          aria-invalid={Boolean(errors.businessType)}
          aria-describedby={
            errors.businessType ? "clinica-tipo-erro" : undefined
          }
          {...register("businessType")}
        >
          {BUSINESS_TYPES.map((type) => (
            <option key={type} value={type}>
              {BUSINESS_TYPE_LABELS[type]}
            </option>
          ))}
        </NativeSelect>
        <FieldError
          id="clinica-tipo-erro"
          message={errors.businessType?.message}
        />
      </div>
      <ModulesFieldset
        value={modules ?? []}
        onChange={(next) => {
          setSaved(false);
          setValue("modules", next, { shouldDirty: true });
        }}
      />
      <FormError message={formError} />
      {saved ? (
        <p role="status" className="text-sm font-medium text-primary">
          Alterações salvas.
        </p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Salvando..." : "Salvar"}
        </Button>
        <Button asChild variant="outline">
          <Link href={"/admin/clinicas" as Route}>Voltar</Link>
        </Button>
      </div>
    </form>
  );
}
