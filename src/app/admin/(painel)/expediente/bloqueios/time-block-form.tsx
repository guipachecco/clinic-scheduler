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
  timeBlockSchema,
  TIME_BLOCK_TYPES,
  type TimeBlockInput,
  type TimeBlockValues,
} from "@/modules/schedule/fields";

import { createTimeBlockAction } from "../actions";

const SAVE_ERROR = "Não foi possível salvar. Tente novamente.";
const CONFLICT_WARNING =
  "Estes atendimentos continuam marcados; remarque ou cancele se precisar.";

export function TimeBlockForm({ today }: { today: string }) {
  const router = useRouter();
  const empty: TimeBlockInput = {
    type: "day_off",
    title: "",
    allDay: true,
    startDate: today,
    endDate: today,
    startTime: "",
    endTime: "",
  };
  const [formError, setFormError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<string[] | null>(null);
  const form = useForm<TimeBlockInput, unknown, TimeBlockValues>({
    resolver: zodResolver(timeBlockSchema),
    defaultValues: empty,
  });
  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    setError,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = form;
  const allDay = useWatch({ control, name: "allDay" });

  async function onSubmit() {
    setFormError(null);
    setConflicts(null);
    let result;
    try {
      result = await createTimeBlockAction(getValues());
    } catch {
      setFormError(SAVE_ERROR);
      return;
    }
    if (result.ok) {
      reset(empty);
      setConflicts(result.conflicts);
      router.refresh();
      return;
    }
    const entries = Object.entries(result.fieldErrors);
    entries.forEach(([name, message], index) => {
      setError(
        name as keyof TimeBlockInput,
        { message },
        { shouldFocus: index === 0 },
      );
    });
    setFormError(
      result.formError ?? (entries.length === 0 ? SAVE_ERROR : null),
    );
  }

  const startDate = register("startDate");
  const err = (name: keyof TimeBlockInput) => errors[name]?.message;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="grid gap-4 md:grid-cols-2"
    >
      <div className="grid content-start gap-2">
        <Label htmlFor="bloqueio-tipo">Tipo</Label>
        <NativeSelect
          id="bloqueio-tipo"
          aria-invalid={Boolean(err("type"))}
          aria-describedby={err("type") ? "bloqueio-tipo-erro" : undefined}
          {...register("type")}
        >
          {TIME_BLOCK_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </NativeSelect>
        <FieldError id="bloqueio-tipo-erro" message={err("type")} />
      </div>
      <label
        htmlFor="bloqueio-dia-inteiro"
        className="flex h-11 items-center gap-3 self-end text-sm"
      >
        <input
          id="bloqueio-dia-inteiro"
          type="checkbox"
          className="size-5 accent-primary"
          {...register("allDay")}
        />
        Dia inteiro
      </label>
      <div className="grid content-start gap-2">
        <Label htmlFor="bloqueio-data-inicial">Data inicial</Label>
        <Input
          id="bloqueio-data-inicial"
          type="date"
          aria-invalid={Boolean(err("startDate"))}
          aria-describedby={
            err("startDate") ? "bloqueio-data-inicial-erro" : undefined
          }
          {...startDate}
          onChange={(event) => {
            // The end date follows the start date until another is picked.
            const previous = getValues("startDate");
            const end = getValues("endDate");
            if (!end || end === previous || end < event.target.value) {
              setValue("endDate", event.target.value);
            }
            return startDate.onChange(event);
          }}
        />
        <FieldError
          id="bloqueio-data-inicial-erro"
          message={err("startDate")}
        />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor="bloqueio-data-final">Data final</Label>
        <Input
          id="bloqueio-data-final"
          type="date"
          aria-invalid={Boolean(err("endDate"))}
          aria-describedby={
            err("endDate") ? "bloqueio-data-final-erro" : undefined
          }
          {...register("endDate")}
        />
        <FieldError id="bloqueio-data-final-erro" message={err("endDate")} />
      </div>
      {allDay ? null : (
        <>
          <div className="grid content-start gap-2">
            <Label htmlFor="bloqueio-hora-inicial">Horário inicial</Label>
            <Input
              id="bloqueio-hora-inicial"
              type="time"
              step={300}
              aria-invalid={Boolean(err("startTime"))}
              aria-describedby={
                err("startTime") ? "bloqueio-hora-inicial-erro" : undefined
              }
              {...register("startTime")}
            />
            <FieldError
              id="bloqueio-hora-inicial-erro"
              message={err("startTime")}
            />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="bloqueio-hora-final">Horário final</Label>
            <Input
              id="bloqueio-hora-final"
              type="time"
              step={300}
              aria-invalid={Boolean(err("endTime"))}
              aria-describedby={
                err("endTime") ? "bloqueio-hora-final-erro" : undefined
              }
              {...register("endTime")}
            />
            <FieldError
              id="bloqueio-hora-final-erro"
              message={err("endTime")}
            />
          </div>
        </>
      )}
      <div className="grid content-start gap-2 md:col-span-2">
        <Label htmlFor="bloqueio-titulo">Título (opcional)</Label>
        <Input
          id="bloqueio-titulo"
          autoComplete="off"
          maxLength={80}
          aria-invalid={Boolean(err("title"))}
          aria-describedby={
            err("title")
              ? "bloqueio-titulo-dica bloqueio-titulo-erro"
              : "bloqueio-titulo-dica"
          }
          {...register("title")}
        />
        <p id="bloqueio-titulo-dica" className="text-sm text-muted-foreground">
          Não registre dados de pacientes aqui
        </p>
        <FieldError id="bloqueio-titulo-erro" message={err("title")} />
      </div>
      <div className="grid gap-3 md:col-span-2">
        <FormError message={formError} />
        <div role="status" className="grid gap-2 text-sm">
          {conflicts ? (
            <>
              <p className="font-medium text-primary">Bloqueio criado.</p>
              {conflicts.length > 0 ? (
                <div className="grid gap-1 rounded-lg bg-highlight p-3 text-highlight-foreground">
                  <p>{CONFLICT_WARNING}</p>
                  <ul className="list-disc pl-5">
                    {conflicts.map((time, index) => (
                      <li key={`${time}-${index}`}>{time}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
        <Button type="submit" disabled={isSubmitting} className="w-fit">
          {isSubmitting ? "Salvando..." : "Criar bloqueio"}
        </Button>
      </div>
    </form>
  );
}
