"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";

import { FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ageOn, todayInClinic } from "@/modules/patients/fields";
import type {
  PatientCursor,
  PatientListItem,
} from "@/modules/patients/patients";

import { searchPatientsAction } from "./actions";
import { formatDate, formatPhone } from "./format";

type Props = { initialItems: PatientListItem[]; initialNext?: PatientCursor };

const ROW_COLUMNS = "md:grid-cols-[2fr_1.2fr_1fr_0.6fr]";

// The term travels in a Server Action POST body, never in the URL.
export function PatientSearch({ initialItems, initialNext }: Props) {
  const [term, setTerm] = useState("");
  const [searchedTerm, setSearchedTerm] = useState("");
  const [items, setItems] = useState(initialItems);
  const [next, setNext] = useState(initialNext);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(input: { term: string; after?: PatientCursor }) {
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
    const result = await run({ term: trimmed });
    if (!result) return;
    setSearchedTerm(trimmed);
    setItems(result.items);
    setNext(result.next);
  }

  async function onLoadMore() {
    if (!next) return;
    const result = await run({ term: searchedTerm, after: next });
    if (!result) return;
    setItems((current) => [...current, ...result.items]);
    setNext(result.next);
  }

  const today = todayInClinic();

  return (
    <div className="grid gap-6">
      <form
        onSubmit={onSearch}
        className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
      >
        <div className="grid gap-2">
          <Label htmlFor="patient-search">Buscar paciente</Label>
          <Input
            id="patient-search"
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            maxLength={100}
            autoComplete="off"
            placeholder="Nome, apelido, telefone ou CPF"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Buscando..." : "Buscar"}
        </Button>
      </form>

      <FormError message={error} />

      {items.length === 0 ? (
        <p role="status" className="text-muted-foreground">
          {searchedTerm === ""
            ? "Nenhum paciente cadastrado ainda"
            : "Nenhum paciente encontrado"}
        </p>
      ) : (
        <ul className="grid gap-3 md:gap-0 md:overflow-hidden md:rounded-2xl md:border md:bg-card">
          <li
            aria-hidden="true"
            className={`hidden gap-4 border-b bg-muted px-4 py-3 text-sm font-medium text-muted-foreground md:grid ${ROW_COLUMNS}`}
          >
            <span>Nome</span>
            <span>WhatsApp</span>
            <span>Nascimento</span>
            <span>Idade</span>
          </li>
          {items.map((patient) => (
            <li key={patient.id} className="md:border-b md:last:border-b-0">
              <Link
                href={`/admin/pacientes/${patient.id}` as Route}
                className={`grid gap-1 rounded-2xl border bg-card p-4 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 md:items-center md:gap-4 md:rounded-none md:border-0 ${ROW_COLUMNS}`}
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
                <span className="text-sm md:text-base">
                  {formatPhone(patient.phone)}
                </span>
                <span className="text-sm text-muted-foreground md:text-base md:text-foreground">
                  {formatDate(patient.birthDate)}
                </span>
                <span className="text-sm text-muted-foreground md:text-base md:text-foreground">
                  {patient.birthDate
                    ? `${ageOn(patient.birthDate, today)} anos`
                    : ""}
                </span>
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
