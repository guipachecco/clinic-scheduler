"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  useFieldArray,
  useForm,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from "react-hook-form";

import { FieldError, FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  businessHoursSchema,
  WEEKDAYS,
  type BusinessHoursInput,
  type BusinessHoursValues,
} from "@/modules/schedule/fields";

import { saveBusinessHoursAction } from "./actions";

const SAVE_ERROR = "Não foi possível salvar. Tente novamente.";
const MAX_INTERVALS = 6;
// The clinic reads its week from Monday; weekday values keep 0 = Domingo.
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

type Props = { initialDays: BusinessHoursInput["days"] };

function DayRow({
  weekday,
  control,
  register,
  errors,
}: {
  weekday: number;
  control: Control<BusinessHoursInput, unknown, BusinessHoursValues>;
  register: UseFormRegister<BusinessHoursInput>;
  errors: FieldErrors<BusinessHoursInput>;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `days.${weekday}.intervals`,
  });
  const name = WEEKDAYS[weekday];
  const dayErrors = errors.days?.[weekday]?.intervals;
  const listError = dayErrors?.message ?? dayErrors?.root?.message;

  return (
    <li className="grid gap-3 rounded-2xl border bg-card p-4 md:grid-cols-[9rem_minmax(0,1fr)] md:items-start">
      <h2 className="flex h-11 items-center font-medium">{name}</h2>
      <div className="grid gap-3">
        {fields.length === 0 ? (
          <p className="flex h-11 items-center text-sm text-muted-foreground">
            Fechado
          </p>
        ) : null}
        {fields.map((field, index) => {
          const intervalError = dayErrors?.[index];
          const message =
            intervalError?.start?.message ?? intervalError?.end?.message;
          const errorId = `dia-${weekday}-${index}-erro`;
          return (
            <div key={field.id} className="grid gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="time"
                  step={300}
                  className="w-32"
                  aria-label={`${name}, intervalo ${index + 1}, início`}
                  aria-invalid={Boolean(message)}
                  aria-describedby={message ? errorId : undefined}
                  {...register(`days.${weekday}.intervals.${index}.start`)}
                />
                <span aria-hidden="true">até</span>
                <Input
                  type="time"
                  step={300}
                  className="w-32"
                  aria-label={`${name}, intervalo ${index + 1}, fim`}
                  aria-invalid={Boolean(message)}
                  aria-describedby={message ? errorId : undefined}
                  {...register(`days.${weekday}.intervals.${index}.end`)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Remover intervalo ${index + 1}: ${name}`}
                  onClick={() => remove(index)}
                >
                  Remover
                </Button>
              </div>
              <FieldError id={errorId} message={message} />
            </div>
          );
        })}
        <FieldError id={`dia-${weekday}-erro`} message={listError} />
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          disabled={fields.length >= MAX_INTERVALS}
          aria-label={`Adicionar intervalo: ${name}`}
          onClick={() => append({ start: "", end: "" })}
        >
          Adicionar intervalo
        </Button>
      </div>
    </li>
  );
}

export function BusinessHoursForm({ initialDays }: Props) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const form = useForm<BusinessHoursInput, unknown, BusinessHoursValues>({
    resolver: zodResolver(businessHoursSchema),
    defaultValues: { days: initialDays },
  });
  const {
    control,
    register,
    handleSubmit,
    getValues,
    setError,
    setFocus,
    trigger,
    formState: { errors, isSubmitting, isSubmitted },
  } = form;

  async function onSubmit() {
    setFormError(null);
    setSaved(false);
    let result;
    try {
      result = await saveBusinessHoursAction(getValues());
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
    entries.forEach(([path, message], index) => {
      const field = path as `days.${number}.intervals.${number}.start`;
      setError(field, { message });
      if (index === 0 && /^days\.\d+\.intervals\.\d+\.start$/.test(path)) {
        setFocus(field);
      }
    });
    setFormError(
      result.formError ?? (entries.length === 0 ? SAVE_ERROR : null),
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      onChange={() => {
        setSaved(false);
        // An interval's errors depend on its other end and on the day's other
        // intervals (order, overlap). Revalidating only the changed input
        // would leave a fixed row still marked, so after the first submit
        // every change checks the whole week again.
        if (isSubmitted) void trigger();
      }}
      noValidate
      className="grid gap-4"
    >
      <ul className="grid gap-3">
        {DISPLAY_ORDER.map((weekday) => (
          <DayRow
            key={weekday}
            weekday={weekday}
            control={control}
            register={register}
            errors={errors}
          />
        ))}
      </ul>
      <FormError message={formError} />
      <p role="status" className="text-sm font-medium text-primary">
        {saved ? "Expediente salvo." : ""}
      </p>
      <Button type="submit" disabled={isSubmitting} className="w-fit">
        {isSubmitting ? "Salvando..." : "Salvar expediente"}
      </Button>
    </form>
  );
}
