"use client";

import {
  CLINIC_MODULES,
  CLINIC_MODULE_LABELS,
  type ClinicModule,
} from "@/modules/clinics/modules";

// Which optional modules a clinic has. Shared by creating and editing.
export function ModulesFieldset({
  value,
  onChange,
}: {
  value: ClinicModule[];
  onChange: (next: ClinicModule[]) => void;
}) {
  return (
    <fieldset className="grid gap-1">
      <legend className="mb-1 text-sm font-medium">Módulos</legend>
      {CLINIC_MODULES.map((key) => (
        <label
          key={key}
          htmlFor={`modulo-${key}`}
          className="flex h-11 items-center gap-3 text-sm font-medium"
        >
          <input
            id={`modulo-${key}`}
            type="checkbox"
            className="size-5 accent-primary"
            checked={value.includes(key)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...value, key]
                  : value.filter((item) => item !== key),
              )
            }
          />
          {CLINIC_MODULE_LABELS[key]}
          {key === "anamnesis" && (
            <span className="text-xs font-normal text-muted-foreground">
              Só aparece quando a clínica tem um modelo de anamnese.
            </span>
          )}
        </label>
      ))}
    </fieldset>
  );
}
