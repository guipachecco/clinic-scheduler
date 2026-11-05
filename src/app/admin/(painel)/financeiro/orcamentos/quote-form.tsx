"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FieldError, FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { QuoteFormInput } from "@/modules/finance/fields";
import { quoteTotals } from "@/modules/finance/money";
import type { PatientListItem } from "@/modules/patients/patients";
import { formatCents, parsePriceToCents } from "@/modules/services/fields";

import { searchPatientsAction } from "../../pacientes/actions";
import { saveQuoteAction } from "../actions";

export type QuoteServiceOption = {
  id: string;
  name: string;
  categoryName: string;
  priceCents: number | null;
};

type Item = QuoteFormInput["items"][number] & { key: number };

const centsToText = (cents: number | null) =>
  cents === null ? "" : formatCents(cents).replace("R$ ", "");

const SAVE_ERROR = "Não foi possível salvar. Tente novamente.";

let nextKey = 1;

export function QuoteForm({
  services,
  quoteId,
  initialPatient,
  defaults,
}: {
  services: QuoteServiceOption[];
  quoteId: string | null;
  initialPatient: { id: string; name: string } | null;
  defaults: Omit<QuoteFormInput, "patientId">;
}) {
  const router = useRouter();
  const [patient, setPatient] = useState(initialPatient);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<PatientListItem[] | null>(null);
  const [items, setItems] = useState<Item[]>(
    defaults.items.map((item) => ({ ...item, key: nextKey++ })),
  );
  const [discount, setDiscount] = useState(defaults.discount);
  const [validUntil, setValidUntil] = useState(defaults.validUntil);
  const [notes, setNotes] = useState(defaults.notes);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const servicePrice = (id: string) =>
    services.find((service) => service.id === id)?.priceCents ?? null;

  function updateItem(key: number, change: Partial<Item>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...change } : item)),
    );
  }

  async function search() {
    const result = await searchPatientsAction({ term });
    setResults(result.items);
  }

  // Live totals; invalid values count as zero until fixed.
  const priced = items.map((item) => ({
    sessions: Math.max(0, Math.trunc(Number(item.sessions)) || 0),
    unitPriceCents: parsePriceToCents(item.unitPrice) ?? 0,
    discountCents: parsePriceToCents(item.discount) ?? 0,
  }));
  let totals: ReturnType<typeof quoteTotals> | null = null;
  try {
    totals = quoteTotals(
      priced.map((p) => ({
        ...p,
        discountCents: Math.min(p.discountCents, p.sessions * p.unitPriceCents),
      })),
      parsePriceToCents(discount) ?? 0,
    );
  } catch {
    totals = null;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setErrors({});
    if (!patient) {
      setErrors({ patientId: "Escolha o paciente." });
      return;
    }
    setSaving(true);
    let result;
    try {
      result = await saveQuoteAction(quoteId, {
        patientId: patient.id,
        validUntil,
        discount,
        notes,
        items: items.map(({ serviceId, sessions, unitPrice, discount }) => ({
          serviceId,
          sessions,
          unitPrice,
          discount,
        })),
      });
    } catch {
      setSaving(false);
      setFormError(SAVE_ERROR);
      return;
    }
    setSaving(false);
    if (result.ok && result.id) {
      router.push(`/admin/financeiro/orcamentos/${result.id}` as Route);
      router.refresh();
      return;
    }
    setErrors(result.fieldErrors ?? {});
    setFormError(
      result.formError ??
        (Object.keys(result.fieldErrors ?? {}).length > 0
          ? "Confira os campos destacados."
          : SAVE_ERROR),
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6">
      <fieldset className="grid gap-3">
        <legend className="mb-2 font-heading text-lg font-semibold">
          Paciente
        </legend>
        {patient ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-medium break-words">{patient.name}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPatient(null);
                setResults(null);
              }}
            >
              Trocar
            </Button>
          </div>
        ) : (
          <div className="grid gap-2">
            <Label htmlFor="orcamento-busca">Buscar paciente</Label>
            <div className="flex gap-2">
              <Input
                id="orcamento-busca"
                value={term}
                autoComplete="off"
                onChange={(event) => setTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void search();
                  }
                }}
                aria-describedby={
                  errors.patientId ? "orcamento-paciente-erro" : undefined
                }
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void search()}
              >
                Buscar
              </Button>
            </div>
            <FieldError
              id="orcamento-paciente-erro"
              message={errors.patientId}
            />
            {results !== null ? (
              results.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum paciente encontrado.
                </p>
              ) : (
                <ul className="grid gap-1">
                  {results.slice(0, 10).map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="w-full rounded-lg border bg-card px-3 py-2 text-left hover:bg-muted/50"
                        onClick={() =>
                          setPatient({ id: item.id, name: item.name })
                        }
                      >
                        {item.name}
                        {item.nickname ? ` (${item.nickname})` : ""}
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </div>
        )}
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-2 font-heading text-lg font-semibold">
          Serviços
        </legend>
        {items.map((item, index) => {
          const prefix = `item-${item.key}`;
          const err = (field: string) => errors[`items.${index}.${field}`];
          const line = totals?.items[index];
          return (
            <div
              key={item.key}
              className="grid gap-3 rounded-2xl border bg-card p-4 md:grid-cols-12"
            >
              <div className="grid gap-2 md:col-span-5">
                <Label htmlFor={`${prefix}-servico`}>Serviço</Label>
                <NativeSelect
                  id={`${prefix}-servico`}
                  value={item.serviceId}
                  aria-invalid={Boolean(err("serviceId"))}
                  onChange={(event) => {
                    const price = servicePrice(event.target.value);
                    updateItem(item.key, {
                      serviceId: event.target.value,
                      ...(price !== null
                        ? { unitPrice: centsToText(price) }
                        : {}),
                    });
                  }}
                >
                  <option value="">Escolha…</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.categoryName} · {service.name}
                    </option>
                  ))}
                </NativeSelect>
                <FieldError
                  id={`${prefix}-servico-erro`}
                  message={err("serviceId")}
                />
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor={`${prefix}-sessoes`}>Sessões</Label>
                <Input
                  id={`${prefix}-sessoes`}
                  inputMode="numeric"
                  value={item.sessions}
                  aria-invalid={Boolean(err("sessions"))}
                  onChange={(event) =>
                    updateItem(item.key, { sessions: event.target.value })
                  }
                />
                <FieldError
                  id={`${prefix}-sessoes-erro`}
                  message={err("sessions")}
                />
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor={`${prefix}-preco`}>Preço por sessão</Label>
                <Input
                  id={`${prefix}-preco`}
                  inputMode="decimal"
                  value={item.unitPrice}
                  aria-invalid={Boolean(err("unitPrice"))}
                  onChange={(event) =>
                    updateItem(item.key, { unitPrice: event.target.value })
                  }
                />
                <FieldError
                  id={`${prefix}-preco-erro`}
                  message={err("unitPrice")}
                />
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor={`${prefix}-desconto`}>Desconto</Label>
                <Input
                  id={`${prefix}-desconto`}
                  inputMode="decimal"
                  value={item.discount}
                  placeholder="0,00"
                  aria-invalid={Boolean(err("discount"))}
                  onChange={(event) =>
                    updateItem(item.key, { discount: event.target.value })
                  }
                />
                <FieldError
                  id={`${prefix}-desconto-erro`}
                  message={err("discount")}
                />
              </div>
              <div className="flex items-end md:col-span-1">
                <Button
                  type="button"
                  variant="outline"
                  disabled={items.length === 1}
                  onClick={() =>
                    setItems((current) =>
                      current.filter((i) => i.key !== item.key),
                    )
                  }
                  aria-label={`Remover o serviço ${index + 1}`}
                >
                  Remover
                </Button>
              </div>
              {line ? (
                <p className="text-sm text-muted-foreground md:col-span-12">
                  Subtotal: {formatCents(line.grossCents)}
                </p>
              ) : null}
            </div>
          );
        })}
        <FieldError id="orcamento-itens-erro" message={errors.items} />
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          onClick={() =>
            setItems((current) => [
              ...current,
              {
                key: nextKey++,
                serviceId: "",
                sessions: "1",
                unitPrice: "",
                discount: "",
              },
            ])
          }
        >
          Adicionar serviço
        </Button>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor="orcamento-desconto">Desconto no total</Label>
          <Input
            id="orcamento-desconto"
            inputMode="decimal"
            value={discount}
            placeholder="0,00"
            aria-invalid={Boolean(errors.discount)}
            onChange={(event) => setDiscount(event.target.value)}
          />
          <FieldError id="orcamento-desconto-erro" message={errors.discount} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="orcamento-validade">Válido até</Label>
          <Input
            id="orcamento-validade"
            type="date"
            value={validUntil}
            aria-invalid={Boolean(errors.validUntil)}
            onChange={(event) => setValidUntil(event.target.value)}
          />
          <FieldError
            id="orcamento-validade-erro"
            message={errors.validUntil}
          />
        </div>
        <div className="grid gap-2 md:col-span-2">
          <Label htmlFor="orcamento-obs">Observação para o paciente</Label>
          <Textarea
            id="orcamento-obs"
            value={notes}
            maxLength={500}
            onChange={(event) => setNotes(event.target.value)}
            aria-describedby="orcamento-obs-dica"
          />
          <p id="orcamento-obs-dica" className="text-sm text-muted-foreground">
            Aparece na mensagem do orçamento. Não escreva informações de saúde.
          </p>
          <FieldError id="orcamento-obs-erro" message={errors.notes} />
        </div>
      </div>

      <div
        className="grid gap-1 rounded-2xl border bg-muted/40 p-4"
        aria-live="polite"
      >
        <p>Subtotal: {totals ? formatCents(totals.subtotalCents) : "—"}</p>
        <p>Desconto: {totals ? formatCents(totals.discountCents) : "—"}</p>
        <p className="font-heading text-xl font-semibold">
          Total:{" "}
          {totals ? formatCents(totals.totalCents) : "confira os valores"}
        </p>
      </div>

      <div className="grid gap-3">
        <FormError message={formError} />
        <Button type="submit" disabled={saving} className="w-fit">
          {saving
            ? "Salvando..."
            : quoteId
              ? "Salvar orçamento"
              : "Criar orçamento"}
        </Button>
      </div>
    </form>
  );
}
