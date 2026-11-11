"use client";

import { zodResolver } from "@hookform/resolvers/zod";
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
import { CLINIC_MODULES } from "@/modules/clinics/modules";
import {
  clinicFormSchema,
  type ClinicFormInput,
  type ClinicFormValues,
} from "@/modules/clinics/fields";
import { slugify } from "@/modules/services/fields";

import { createClinicAction } from "./actions";
import { ModulesFieldset } from "./modules-fieldset";

const SAVE_ERROR = "Não foi possível salvar. Tente novamente.";
const EMPTY: ClinicFormInput = {
  name: "",
  slug: "",
  businessType: "clinic",
  modules: [...CLINIC_MODULES],
};

// Creates a clinic. The address (slug) is suggested from the name until the
// user edits it.
export function ClinicForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const form = useForm<ClinicFormInput, unknown, ClinicFormValues>({
    resolver: zodResolver(clinicFormSchema),
    defaultValues: EMPTY,
  });
  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = form;

  const modules = useWatch({ control: form.control, name: "modules" });

  async function onSubmit() {
    setFormError(null);
    let result;
    try {
      result = await createClinicAction(getValues());
    } catch {
      setFormError(SAVE_ERROR);
      return;
    }
    if (result.ok) {
      reset(EMPTY);
      setSlugTouched(false);
      router.refresh();
      return;
    }
    const entries = Object.entries(result.fieldErrors);
    entries.forEach(([name, message], index) => {
      setError(
        name as keyof ClinicFormInput,
        { message },
        { shouldFocus: index === 0 },
      );
    });
    setFormError(
      result.formError ?? (entries.length === 0 ? SAVE_ERROR : null),
    );
  }

  const nameField = register("name", {
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!slugTouched) setValue("slug", slugify(event.target.value));
    },
  });
  const slugField = register("slug", {
    onChange: () => setSlugTouched(true),
  });

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="grid gap-4 md:grid-cols-2"
    >
      <div className="grid content-start gap-2">
        <Label htmlFor="clinica-nome">Nome da clínica</Label>
        <Input
          id="clinica-nome"
          autoComplete="off"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "clinica-nome-erro" : undefined}
          {...nameField}
        />
        <FieldError id="clinica-nome-erro" message={errors.name?.message} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor="clinica-endereco">Endereço da página</Label>
        <Input
          id="clinica-endereco"
          autoComplete="off"
          aria-invalid={Boolean(errors.slug)}
          aria-describedby={
            errors.slug ? "clinica-endereco-erro" : "clinica-endereco-dica"
          }
          {...slugField}
        />
        <p id="clinica-endereco-dica" className="text-sm text-muted-foreground">
          Vira o link e o QR code da clínica. Evite mudar depois de divulgar.
        </p>
        <FieldError id="clinica-endereco-erro" message={errors.slug?.message} />
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
      <div className="md:col-span-2">
        <ModulesFieldset
          value={modules ?? []}
          onChange={(next) => setValue("modules", next)}
        />
      </div>
      <div className="grid gap-3 md:col-span-2">
        <FormError message={formError} />
        <Button type="submit" disabled={isSubmitting} className="w-fit">
          {isSubmitting ? "Criando..." : "Criar clínica"}
        </Button>
      </div>
    </form>
  );
}
