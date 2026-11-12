"use client";

import { useId, useState } from "react";

import { Icon } from "@/app/[slug]/icons";
import { Input } from "@/components/ui/input";
import { matchesClinicSearch } from "@/modules/clients/my-clinics-list";

// The list of "Suas clínicas", already ordered and rendered on the server.
// With many clinics, a search field filters it as she types; without
// JavaScript the whole list shows.
export function ClinicList({
  entries,
  searchable,
}: {
  entries: { slug: string; searchText: string; card: React.ReactNode }[];
  searchable: boolean;
}) {
  const [query, setQuery] = useState("");
  const inputId = useId();
  const visible = searchable
    ? entries.filter((entry) => matchesClinicSearch(entry.searchText, query))
    : entries;

  return (
    <>
      {searchable ? (
        <div className="relative">
          <label htmlFor={inputId} className="sr-only">
            Buscar clínica
          </label>
          <Icon
            name="search"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={inputId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome, área ou endereço"
            autoComplete="off"
            className="pl-9"
          />
        </div>
      ) : null}
      {visible.length === 0 ? (
        <p
          role="status"
          className="rounded-2xl border bg-card p-5 text-muted-foreground"
        >
          Nenhuma clínica encontrada para “{query.trim()}”.
        </p>
      ) : (
        <ul className="grid gap-4">
          {visible.map((entry) => (
            <li key={entry.slug} className="grid">
              {entry.card}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
