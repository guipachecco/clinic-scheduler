"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";

import { Avatar } from "@/components/avatar";
import { FormError } from "@/components/form-message";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ageOn,
  formatStoredPhone,
  todayInClinic,
} from "@/modules/patients/fields";
import type {
  PatientCursor,
  PatientListItem,
} from "@/modules/patients/patients";

import { searchPatientsAction } from "./actions";
import { formatDate } from "./format";

type Props = { initialItems: PatientListItem[]; initialNext?: PatientCursor };

// The term travels in a Server Action POST body, never in the URL.
export function PatientSearch({ initialItems, initialNext }: Props) {
  const [term, setTerm] = useState("");
  const [searchedTerm, setSearchedTerm] = useState("");
  const [items, setItems] = useState(initialItems);
  const [next, setNext] = useState(initialNext);
  const [includeAnonymized, setIncludeAnonymized] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(input: {
    term: string;
    after?: PatientCursor;
    includeAnonymized: boolean;
  }) {
    setPending(true);
    setError(null);
    let result;
    try {
      result = await searchPatientsAction(input);
    } catch {
      setError("Não foi possível buscar. Tente novamente.");
      return null;
    } finally {
      setPending(false);
    }
    if (result.error) {
      setError(result.error);
      return null;
    }
    return result;
  }

  async function onSearch(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = term.trim();
    const result = await run({ term: trimmed, includeAnonymized });
    if (!result) return;
    setSearchedTerm(trimmed);
    setItems(result.items);
    setNext(result.next);
  }

  async function onLoadMore() {
    if (!next) return;
    const result = await run({
      term: searchedTerm,
      after: next,
      includeAnonymized,
    });
    if (!result) return;
    setItems((current) => [...current, ...result.items]);
    setNext(result.next);
  }

  async function onToggleAnonymized(checked: boolean) {
    setIncludeAnonymized(checked);
    const trimmed = term.trim();
    const result = await run({ term: trimmed, includeAnonymized: checked });
    if (!result) {
      setIncludeAnonymized(!checked);
      return;
    }
    setSearchedTerm(trimmed);
    setItems(result.items);
    setNext(result.next);
  }

  const today = todayInClinic();

  return (
    <div className="grid gap-6">
      <form
        onSubmit={onSearch}
        className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
      >
        <div className="relative">
          <Label htmlFor="patient-search" className="sr-only">
            Buscar paciente
          </Label>
          <Icon
            name="search"
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="patient-search"
            type="search"
            className="pl-11"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            maxLength={100}
            autoComplete="off"
            placeholder="Nome, telefone ou CPF"
          />
        </div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Buscando..." : "Buscar"}
        </Button>
      </form>

      <label
        htmlFor="include-anonymized"
        className="flex h-11 items-center gap-3 text-sm font-medium"
      >
        <input
          id="include-anonymized"
          type="checkbox"
          className="size-5 accent-primary"
          checked={includeAnonymized}
          disabled={pending}
          onChange={(event) => onToggleAnonymized(event.target.checked)}
        />
        Mostrar anonimizados
      </label>

      <FormError message={error} />

      {items.length === 0 ? (
        <p role="status" className="text-muted-foreground">
          {searchedTerm === ""
            ? "Nenhum paciente cadastrado ainda"
            : "Nenhum paciente encontrado"}
        </p>
      ) : (
        <ul className="grid gap-2">
          {items.map((patient) => (
            <li key={patient.id}>
              <Link
                href={`/admin/pacientes/${patient.id}` as Route}
                className="flex min-h-16 items-center gap-3 rounded-2xl border bg-card px-4 py-3 outline-none hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <Avatar
                  name={patient.name}
                  seed={patient.id}
                  muted={Boolean(patient.anonymizedAt)}
                />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="font-heading font-semibold break-words">
                    {patient.name}
                    {patient.nickname ? (
                      <span className="font-sans font-normal text-muted-foreground">
                        {" "}
                        ({patient.nickname})
                      </span>
                    ) : null}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {[
                      formatStoredPhone(patient.phone),
                      patient.birthDate
                        ? `${formatDate(patient.birthDate)} · ${ageOn(patient.birthDate, today)} anos`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {patient.anonymizedAt ? (
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground">
                    Anonimizado
                  </span>
                ) : null}
                <Icon name="chevronRight" className="text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {next ? (
        <Button
          type="button"
          variant="outline"
          onClick={onLoadMore}
          disabled={pending}
          className="sm:w-fit"
        >
          {pending ? "Carregando..." : "Carregar mais"}
        </Button>
      ) : null}
    </div>
  );
}
