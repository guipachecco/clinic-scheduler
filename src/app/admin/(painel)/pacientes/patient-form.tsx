"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm, useWatch, type UseFormReturn } from "react-hook-form";

import { FieldError, FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  GENDERS,
  patientFormSchema,
  REFERRAL_SOURCES,
  todayInClinic,
  type PatientFormInput,
  type PatientFormValues,
} from "@/modules/patients/fields";

import { createPatientAction, updatePatientAction } from "./actions";

const EMPTY: PatientFormInput = {
  name: "",
  nickname: "",
  cpf: "",
  rg: "",
  phone: "",
  landlinePhone: "",
  email: "",
  birthDate: "",
  gender: "",
  referralSource: "",
  referredBy: "",
  notes: "",
};

const SAVE_ERROR = "Não foi possível salvar. Tente novamente.";

type Props =
  { mode: "create" } | { mode: "edit"; id: string; defaults: PatientFormInput };

type PatientFormApi = UseFormReturn<
  PatientFormInput,
  unknown,
  PatientFormValues
>;

type TextField = {
  name: keyof PatientFormInput;
  label: string;
  type?: string;
  inputMode?: "tel" | "numeric" | "email";
  hint?: string;
};

function TextInput({
  field,
  form,
}: {
  field: TextField;
  form: PatientFormApi;
}) {
  const error = form.formState.errors[field.name]?.message;
  const errorId = `${field.name}-error`;
  const hintId = `${field.name}-hint`;
  const describedBy =
    [field.hint ? hintId : null, error ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={field.name}>{field.label}</Label>
      <Input
        id={field.name}
        type={field.type ?? "text"}
        autoComplete="off"
        inputMode={field.inputMode}
        max={field.type === "date" ? todayInClinic() : undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        {...form.register(field.name)}
      />
      {field.hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {field.hint}
        </p>
      ) : null}
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export function PatientForm(props: Props) {
  const defaults = props.mode === "edit" ? props.defaults : EMPTY;
  const [formError, setFormError] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  const form = useForm<PatientFormInput, unknown, PatientFormValues>({
    resolver: zodResolver(patientFormSchema),
    defaultValues: defaults,
  });
  const {
    register,
    handleSubmit,
    getValues,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = form;

  const isReferral =
    useWatch({ control: form.control, name: "referralSource" }) === "referral";
  useEffect(() => {
    if (!isReferral) setValue("referredBy", "");
  }, [isReferral, setValue]);

  async function onSubmit() {
    setFormError(null);
    setExistingId(null);
    // Raw text goes to the server, which parses it again with the same schema.
    const input = getValues();
    let result;
    try {
      result =
        props.mode === "edit"
          ? await updatePatientAction(props.id, input)
          : await createPatientAction(input);
    } catch {
      setFormError(SAVE_ERROR);
      return;
    }
    // On success the action redirects, so a returned value is always a failure.
    if (!result) return;
    const entries = Object.entries(result.fieldErrors);
    entries.forEach(([name, message], index) => {
      // Focus goes to the first field with a server error.
      setError(
        name as keyof PatientFormInput,
        { message },
        { shouldFocus: index === 0 },
      );
    });
    setExistingId(result.existingPatientId ?? null);
    setFormError(
      result.formError ?? (entries.length === 0 ? SAVE_ERROR : null),
    );
  }

  const idle =
    props.mode === "edit" ? "Salvar alterações" : "Cadastrar paciente";
  const referralError = errors.referralSource?.message;
  const notesError = errors.notes?.message;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2">
        <TextInput
          form={form}
          field={{ name: "name", label: "Nome completo" }}
        />
        <TextInput form={form} field={{ name: "nickname", label: "Apelido" }} />
        <TextInput
          form={form}
          field={{
            name: "phone",
            label: "WhatsApp",
            type: "tel",
            inputMode: "tel",
            hint: "Com DDD, por exemplo (48) 99999-0000.",
          }}
        />
        <TextInput
          form={form}
          field={{
            name: "landlinePhone",
            label: "Telefone fixo",
            type: "tel",
            inputMode: "tel",
          }}
        />
        <TextInput
          form={form}
          field={{
            name: "birthDate",
            label: "Data de nascimento",
            type: "date",
          }}
        />
        <div className="grid content-start gap-2">
          <Label htmlFor="gender">Gênero</Label>
          <NativeSelect
            id="gender"
            aria-invalid={Boolean(errors.gender)}
            aria-describedby={errors.gender ? "gender-error" : undefined}
            {...register("gender")}
          >
            <option value="">Não informado</option>
            {GENDERS.map((gender) => (
              <option key={gender.value} value={gender.value}>
                {gender.label}
              </option>
            ))}
          </NativeSelect>
          <FieldError id="gender-error" message={errors.gender?.message} />
        </div>
        <TextInput
          form={form}
          field={{ name: "cpf", label: "CPF", inputMode: "numeric" }}
        />
        <TextInput form={form} field={{ name: "rg", label: "RG" }} />
        <TextInput
          form={form}
          field={{
            name: "email",
            label: "E-mail",
            type: "email",
            inputMode: "email",
          }}
        />
        <div className="grid content-start gap-2">
          <Label htmlFor="referralSource">Como conheceu</Label>
          <NativeSelect
            id="referralSource"
            aria-invalid={Boolean(referralError)}
            aria-describedby={
              referralError ? "referralSource-error" : undefined
            }
            {...register("referralSource")}
          >
            <option value="">Não informado</option>
            {REFERRAL_SOURCES.map((source) => (
              <option key={source.value} value={source.value}>
                {source.label}
              </option>
            ))}
          </NativeSelect>
          <FieldError id="referralSource-error" message={referralError} />
        </div>
        {isReferral ? (
          <TextInput
            form={form}
            field={{ name: "referredBy", label: "Indicado por" }}
          />
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="notes">Observações</Label>
        <Textarea
          id="notes"
          aria-invalid={Boolean(notesError)}
          aria-describedby={
            notesError ? "notes-hint notes-error" : "notes-hint"
          }
          {...register("notes")}
        />
        <p id="notes-hint" className="text-sm text-muted-foreground">
          Não registre informações de saúde aqui
        </p>
        <FieldError id="notes-error" message={notesError} />
      </div>

      {existingId ? (
        <div role="alert" className="grid gap-1 text-sm">
          <p className="text-destructive">
            Já existe um paciente com estes dados.
          </p>
          <Link
            href={`/admin/pacientes/${existingId}` as Route}
            className="font-medium text-primary underline underline-offset-4"
          >
            Ver cadastro existente
          </Link>
        </div>
      ) : null}
      <FormError message={formError} />
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Salvando..." : idle}
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/pacientes">Voltar à lista</Link>
        </Button>
      </div>
    </form>
  );
}
