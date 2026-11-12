"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { FieldError, FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  entrySchema,
  type EntryInput,
  type EntryValues,
} from "@/modules/stock/fields";

import { recordEntryAction, reverseMovementAction } from "../actions";

const SAVE_ERROR = "Não foi possível salvar. Tente novamente.";

export function EntryForm({ productId }: { productId: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    getValues,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EntryInput, unknown, EntryValues>({
    resolver: zodResolver(entrySchema),
    defaultValues: { quantity: "", note: "" },
  });

  async function onSubmit() {
    setFormError(null);
    let result;
    try {
      // Raw text goes to the server, which parses it again with the schema.
      result = await recordEntryAction(productId, getValues());
    } catch {
      setFormError(SAVE_ERROR);
      return;
    }
    if (result.ok) {
      reset();
      router.refresh();
      return;
    }
    const entries = Object.entries(result.fieldErrors);
    entries.forEach(([name, message], index) => {
      setError(
        name as keyof EntryInput,
        { message },
        { shouldFocus: index === 0 },
      );
    });
    setFormError(
      result.formError ?? (entries.length === 0 ? SAVE_ERROR : null),
    );
  }

  const quantityError = errors.quantity?.message;
  const noteError = errors.note?.message;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-[10rem_1fr]">
        <div className="grid content-start gap-2">
          <Label htmlFor="entry-quantity">Quantidade</Label>
          <Input
            id="entry-quantity"
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={Boolean(quantityError)}
            aria-describedby={
              quantityError ? "entry-quantity-error" : undefined
            }
            {...register("quantity")}
          />
          <FieldError id="entry-quantity-error" message={quantityError} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="entry-note">Observação</Label>
          <Input
            id="entry-note"
            autoComplete="off"
            aria-invalid={Boolean(noteError)}
            aria-describedby={noteError ? "entry-note-error" : undefined}
            {...register("note")}
          />
          <FieldError id="entry-note-error" message={noteError} />
        </div>
      </div>
      <FormError message={formError} />
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Salvando..." : "Lançar entrada"}
        </Button>
      </div>
    </form>
  );
}

export function UndoButton({ movementId }: { movementId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setPending(true);
    setError(null);
    try {
      const result = await reverseMovementAction(movementId);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.formError ?? SAVE_ERROR);
      }
    } catch {
      setError(SAVE_ERROR);
    }
    setPending(false);
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={onClick}
      >
        Desfazer
      </Button>
      <FormError message={error} />
    </span>
  );
}
