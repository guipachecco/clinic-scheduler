"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

import { addNationalHolidaysAction } from "../actions";

const ADD_ERROR = "Não foi possível adicionar. Tente novamente.";

export function HolidaysButton({ years }: { years: number[] }) {
  const router = useRouter();
  const [year, setYear] = useState(String(years[0]));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const result = await addNationalHolidaysAction(Number(year));
      if (result.ok) {
        setMessage(
          result.created === 0
            ? "Nenhum feriado novo."
            : result.created === 1
              ? "1 feriado adicionado."
              : `${result.created} feriados adicionados.`,
        );
        router.refresh();
      } else {
        setError(result.formError ?? ADD_ERROR);
      }
    } catch {
      setError(ADD_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-2">
          <Label htmlFor="feriados-ano">Ano</Label>
          <NativeSelect
            id="feriados-ano"
            className="w-32"
            value={year}
            onChange={(event) => setYear(event.target.value)}
          >
            {years.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="button" disabled={busy} onClick={add}>
          {busy ? "Adicionando..." : "Adicionar feriados nacionais"}
        </Button>
      </div>
      <FormError message={error} />
      <p role="status" className="text-sm font-medium text-primary">
        {message ?? ""}
      </p>
    </div>
  );
}
