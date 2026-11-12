"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch, type FieldErrors } from "react-hook-form";

import { FieldError, FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { AppointmentResult } from "@/modules/appointments/appointments";
import {
  appointmentFormSchema,
  LABEL_MAX_LENGTH,
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  type AppointmentFormInput,
  type AppointmentFormValues,
} from "@/modules/appointments/fields";
import type { Warning } from "@/modules/appointments/rules";
import { formatStoredPhone } from "@/modules/patients/fields";
import type { PatientListItem } from "@/modules/patients/patients";

import { searchPatientsAction } from "../pacientes/actions";

import { createAppointmentAction, updateAppointmentAction } from "./actions";

const SAVE_ERROR = "Não foi possível salvar o agendamento. Tente novamente.";
const SEARCH_ERROR = "Não foi possível buscar. Tente novamente.";
const INICIO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export type ServiceOption = {
  id: string;
  name: string;
  categoryName: string;
  durationMinutes: number;
  isFlexible: boolean;
};

export type ProfessionalChoice = { id: string; name: string };

// `professionals` are the choices of the selector, the default one first. The
// selector shows only with more than one; otherwise the server picks (a new
// appointment goes to the default professional, an edit keeps hers).
type Props = {
  services: ServiceOption[];
  professionals: ProfessionalChoice[];
} & (
  | {
      mode: "create";
      date: string;
      startTime: string;
      initialPatient: { id: string; name: string } | null;
    }
  | {
      mode: "edit";
      id: string;
      patientName: string;
      defaults: AppointmentFormInput;
    }
);

type Field = keyof AppointmentFormInput;

// Fields with a message slot. An error on any other (the idempotency key)
// is shown as the form error.
const SHOWN_FIELDS: readonly string[] = [
  "patientId",
  "serviceId",
  "professionalId",
  "customLabel",
  "date",
  "startTime",
  "durationMinutes",
];

// Groups the options by category, keeping the server's order.
function byCategory(services: ServiceOption[]) {
  const groups = new Map<string, ServiceOption[]>();
  for (const service of services) {
    const group = groups.get(service.categoryName) ?? [];
    group.push(service);
    groups.set(service.categoryName, group);
  }
  return [...groups];
}

function resultCount(count: number): string {
  if (count === 0) return "Nenhum paciente encontrado.";
  if (count === 1) return "1 paciente encontrado.";
  return `${count} pacientes encontrados.`;
}

// The search term travels in a Server Action POST body, never in the URL.
function PatientPicker({
  selected,
  onSelect,
  error,
  registerHref,
}: {
  selected: { id: string; name: string } | null;
  onSelect: (patient: { id: string; name: string } | null) => void;
  error?: string;
  registerHref: string;
}) {
  const [term, setTerm] = useState("");
  const [items, setItems] = useState<PatientListItem[] | null>(null);
  const [pending, setPending] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // Set by a pick or by Trocar, so focus follows the control that replaced
  // the one just used (never on the first render).
  const focusNext = useRef<"change" | "search" | null>(null);

  useEffect(() => {
    if (focusNext.current === "change") changeRef.current?.focus();
    if (focusNext.current === "search") searchRef.current?.focus();
    focusNext.current = null;
  }, [selected]);

  function pick(patient: { id: string; name: string } | null) {
    focusNext.current = patient ? "change" : "search";
    onSelect(patient);
  }

  async function search() {
    setPending(true);
    setSearchError(null);
    let result;
    try {
      result = await searchPatientsAction({ term: term.trim() });
    } catch {
      setSearchError(SEARCH_ERROR);
      return;
    } finally {
      setPending(false);
    }
    if (result.error) {
      setSearchError(result.error);
      return;
    }
    setItems(result.items);
  }

  if (selected) {
    return (
      <div className="grid gap-2">
        <span className="text-sm font-medium">Paciente</span>
        <div className="flex flex-wrap items-center gap-3">
          <p>Paciente: {selected.name}</p>
          <Button
            type="button"
            variant="outline"
            ref={changeRef}
            onClick={() => pick(null)}
          >
            Trocar
          </Button>
        </div>
      </div>
    );
  }

  const errorId = "patientId-error";
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="grid gap-2">
          <Label htmlFor="patient-search">Buscar paciente</Label>
          <Input
            ref={searchRef}
            id="patient-search"
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={(event) => {
              // Enter searches instead of submitting the appointment form.
              if (event.key === "Enter") {
                event.preventDefault();
                void search();
              }
            }}
            maxLength={100}
            autoComplete="off"
            placeholder="Nome, apelido, telefone ou CPF"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
          />
        </div>
        <Button type="button" disabled={pending} onClick={() => void search()}>
          {pending ? "Buscando..." : "Buscar"}
        </Button>
      </div>
      <FieldError id={errorId} message={error} />
      <FormError message={searchError} />
      <p role="status" className="text-sm text-muted-foreground">
        {items ? resultCount(items.length) : ""}
      </p>
      {items && items.length > 0 ? (
        <ul aria-label="Pacientes encontrados" className="grid gap-2">
          {items.map((patient) => (
            <li key={patient.id}>
              <button
                type="button"
                onClick={() => pick({ id: patient.id, name: patient.name })}
                className="grid w-full gap-1 rounded-lg border bg-card px-4 py-3 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <span className="font-medium">
                  {patient.name}
                  {patient.nickname ? (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      ({patient.nickname})
                    </span>
                  ) : null}
                </span>
                <span className="text-sm text-muted-foreground">
                  {formatStoredPhone(patient.phone)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-sm">
        Não encontrou?{" "}
        <Link
          href={registerHref as Route}
          className="font-semibold text-primary underline underline-offset-4"
        >
          Cadastrar paciente
        </Link>
      </p>
    </div>
  );
}

export function AppointmentForm(props: Props) {
  const router = useRouter();
  // One key per mounted form, made in the browser: a key from the server
  // render would come back with the cached page on Back/Forward. Resubmits
  // after warnings keep it, so a double submit still creates one appointment.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const initialPatient = props.mode === "create" ? props.initialPatient : null;
  const defaults: AppointmentFormInput =
    props.mode === "edit"
      ? props.defaults
      : {
          patientId: initialPatient?.id ?? "",
          serviceId: "",
          professionalId:
            props.professionals.length > 1 ? props.professionals[0]!.id : "",
          customLabel: "",
          date: props.date,
          startTime: props.startTime,
          durationMinutes: "",
          idempotencyKey,
          acknowledgeWarnings: false,
        };
  const [patient, setPatient] = useState(initialPatient);
  const [warnings, setWarnings] = useState<Warning[] | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const {
    register,
    control,
    handleSubmit,
    getValues,
    setValue,
    setError,
    clearErrors,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<AppointmentFormInput, unknown, AppointmentFormValues>({
    resolver: zodResolver(appointmentFormSchema),
    defaultValues: defaults,
  });

  const serviceId = useWatch({ control, name: "serviceId" });
  const service = props.services.find((item) => item.id === serviceId);

  // The registration page sends the user back here with the same slot. Only
  // the time travels in the URL, and only when the fields are valid.
  const watchedDate = useWatch({ control, name: "date" });
  const watchedTime = useWatch({ control, name: "startTime" });
  const inicio = `${watchedDate}T${watchedTime}`;
  const registerHref = INICIO_PATTERN.test(inicio)
    ? `/admin/pacientes/novo?voltar=agenda&inicio=${inicio}`
    : "/admin/pacientes/novo?voltar=agenda";

  // Warnings are announced by the alert; focus goes to the way to proceed.
  useEffect(() => {
    if (warnings) document.getElementById("acknowledgeWarnings")?.focus();
  }, [warnings]);

  // A changed time or duration needs a fresh look at the warnings.
  function dropWarnings() {
    if (!warnings) return;
    setWarnings(null);
    setValue("acknowledgeWarnings", false);
  }

  function selectPatient(selected: { id: string; name: string } | null) {
    setPatient(selected);
    setValue("patientId", selected?.id ?? "");
    if (selected) clearErrors("patientId");
  }

  // The patient field is hidden, so its error moves focus to the search.
  function focusField(name: Field) {
    if (name === "patientId") {
      document.getElementById("patient-search")?.focus();
      return;
    }
    setFocus(name);
  }

  function onInvalid(fieldErrors: FieldErrors<AppointmentFormInput>) {
    const first = (Object.keys(fieldErrors) as Field[])[0];
    if (first === "patientId") focusField(first);
  }

  function applyFailure(result: Extract<AppointmentResult, { ok: false }>) {
    if (result.warnings && result.warnings.length > 0) {
      setWarnings(result.warnings);
      setValue("acknowledgeWarnings", false);
      setFormError(null);
      return;
    }
    const all = Object.entries(result.fieldErrors ?? {});
    const entries = all.filter(([name]) => SHOWN_FIELDS.includes(name));
    entries.forEach(([name, text], index) => {
      setError(name as Field, { message: text });
      if (index === 0) focusField(name as Field);
    });
    const hidden = all.find(([name]) => !SHOWN_FIELDS.includes(name));
    setFormError(
      result.formError ??
        hidden?.[1] ??
        (entries.length === 0 ? SAVE_ERROR : null),
    );
  }

  async function onSubmit() {
    setFormError(null);
    setMessage("");
    // Raw text goes to the server, which parses it again with the same schema.
    const input = getValues();
    let result: AppointmentResult;
    try {
      result =
        props.mode === "edit"
          ? await updateAppointmentAction(props.id, input)
          : await createAppointmentAction(input);
    } catch {
      setFormError(SAVE_ERROR);
      return;
    }
    if (!result.ok) {
      applyFailure(result);
      return;
    }
    // Actions return success instead of redirecting, so navigation is ours.
    if (props.mode === "create") {
      router.push(`/admin/agenda/${result.id}` as Route);
      return;
    }
    setWarnings(null);
    setValue("acknowledgeWarnings", false);
    setMessage("Agendamento salvo.");
    router.refresh();
  }

  const fieldProps = (name: Field) => {
    const error = errors[name]?.message;
    return {
      id: name,
      "aria-invalid": Boolean(error),
      "aria-describedby": error ? `${name}-error` : undefined,
    };
  };

  const idle = props.mode === "edit" ? "Salvar alterações" : "Agendar";

  return (
    <form
      onSubmit={handleSubmit(onSubmit, onInvalid)}
      noValidate
      className="grid gap-6"
    >
      <input type="hidden" {...register("patientId")} />
      {props.mode === "edit" ? (
        <p>Paciente: {props.patientName}</p>
      ) : (
        <PatientPicker
          selected={patient}
          onSelect={selectPatient}
          error={errors.patientId?.message}
          registerHref={registerHref}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor="serviceId">Serviço</Label>
          <NativeSelect
            {...fieldProps("serviceId")}
            {...register("serviceId", {
              onChange: (event: React.ChangeEvent<HTMLSelectElement>) => {
                const chosen = props.services.find(
                  (item) => item.id === event.target.value,
                );
                if (!chosen) return;
                setValue("durationMinutes", String(chosen.durationMinutes));
                if (!chosen.isFlexible) setValue("customLabel", "");
                dropWarnings();
              },
            })}
          >
            <option value="">Escolha o serviço</option>
            {byCategory(props.services).map(([category, options]) => (
              <optgroup key={category} label={category}>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </NativeSelect>
          <FieldError
            id="serviceId-error"
            message={errors.serviceId?.message}
          />
        </div>

        {props.professionals.length > 1 ? (
          <div className="grid content-start gap-2">
            <Label htmlFor="professionalId">Profissional</Label>
            <NativeSelect
              {...fieldProps("professionalId")}
              {...register("professionalId")}
            >
              {props.professionals.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </NativeSelect>
            <FieldError
              id="professionalId-error"
              message={errors.professionalId?.message}
            />
          </div>
        ) : null}

        {service?.isFlexible ? (
          <div className="grid content-start gap-2">
            <Label htmlFor="customLabel">Rótulo</Label>
            <Input
              {...fieldProps("customLabel")}
              autoComplete="off"
              maxLength={LABEL_MAX_LENGTH}
              {...register("customLabel")}
            />
            <p className="text-sm text-muted-foreground">
              Não registre informações de saúde aqui
            </p>
            <FieldError
              id="customLabel-error"
              message={errors.customLabel?.message}
            />
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="grid content-start gap-2">
          <Label htmlFor="date">Data</Label>
          <Input
            {...fieldProps("date")}
            type="date"
            {...register("date", { onChange: dropWarnings })}
          />
          <FieldError id="date-error" message={errors.date?.message} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="startTime">Horário</Label>
          <Input
            {...fieldProps("startTime")}
            type="time"
            step={300}
            {...register("startTime", { onChange: dropWarnings })}
          />
          <FieldError
            id="startTime-error"
            message={errors.startTime?.message}
          />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="durationMinutes">Duração (min)</Label>
          <Input
            {...fieldProps("durationMinutes")}
            type="number"
            inputMode="numeric"
            min={MIN_DURATION_MINUTES}
            max={MAX_DURATION_MINUTES}
            {...register("durationMinutes", { onChange: dropWarnings })}
          />
          <FieldError
            id="durationMinutes-error"
            message={errors.durationMinutes?.message}
          />
        </div>
      </div>

      {warnings ? (
        <div
          role="alert"
          className="grid gap-3 rounded-lg bg-highlight p-4 text-highlight-foreground"
        >
          <p className="font-semibold">Este horário tem avisos:</p>
          <ul className="list-disc pl-5 text-sm">
            {warnings.map((warning) => (
              <li key={warning.code}>{warning.message}</li>
            ))}
          </ul>
          <label
            htmlFor="acknowledgeWarnings"
            className="flex h-11 items-center gap-3 text-sm font-semibold"
          >
            <input
              id="acknowledgeWarnings"
              type="checkbox"
              className="size-5 accent-primary"
              {...register("acknowledgeWarnings")}
            />
            Agendar mesmo assim
          </label>
        </div>
      ) : null}

      <FormError message={formError} />
      <p role="status" className="min-h-5 text-sm">
        {message}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Salvando..." : idle}
        </Button>
        <Button asChild variant="outline">
          <Link href={"/admin/agenda" as Route}>Voltar à agenda</Link>
        </Button>
      </div>
    </form>
  );
}
