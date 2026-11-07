"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState, useTransition } from "react";

import { FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";

import { Icon } from "../icons";

import { submitReview } from "./actions";

const MAX_COMMENT = 500;

export function ReviewForm({ slug }: { slug: string }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (rating === 0) {
      setError("Escolha de 1 a 5 estrelas.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitReview(slug, { rating, comment });
      if (result.ok) setSent(true);
      else setError(result.message);
    });
  }

  if (sent) {
    return (
      <div role="status" className="grid gap-3 rounded-2xl border bg-card p-4">
        <p className="flex items-center gap-2 font-semibold">
          <Icon name="check" className="size-5 shrink-0 text-primary" />
          Obrigada pela avaliação!
        </p>
        <Button asChild size="lg">
          <Link href={`/${slug}` as Route}>Voltar para a página</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <div role="group" aria-label="Nota" className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={n === rating}
            aria-label={n === 1 ? "1 estrela" : `${n} estrelas`}
            onClick={() => setRating(n)}
            className="inline-flex size-11 items-center justify-center rounded-full text-highlight outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Icon
              name={n <= rating ? "starFilled" : "star"}
              className="size-8 shrink-0"
            />
          </button>
        ))}
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="comment" className="text-sm font-semibold">
          Comentário (opcional)
        </label>
        <textarea
          id="comment"
          name="comment"
          rows={4}
          maxLength={MAX_COMMENT}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          className="min-h-24 w-full rounded-xl border bg-card px-3 py-2 text-base outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <span className="text-xs text-muted-foreground">
          {comment.length}/{MAX_COMMENT}
        </span>
      </div>
      <FormError message={error} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Enviando..." : "Enviar"}
      </Button>
    </form>
  );
}
