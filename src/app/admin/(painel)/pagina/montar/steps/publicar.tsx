"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";

import { discardAction, publishAction } from "../actions";

const PUBLISH_ERROR = "Não foi possível publicar. Tente novamente.";
const DISCARD_ERROR = "Não foi possível descartar. Tente novamente.";

// The last step: what will change, then Publicar (the page goes live) or
// Descartar rascunho (back to the published page). The big preview is drawn
// by the wizard above.
export function PublicarStep({
  slug,
  changes,
  hasDraft,
  back,
}: {
  slug: string;
  changes: string[];
  hasDraft: boolean;
  back: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"publish" | "discard" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<"published" | "discarded" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = useRef<HTMLDivElement>(null);

  // On a phone the message lands below the big preview: bring it into view.
  useEffect(() => {
    if (done) status.current?.scrollIntoView({ block: "center" });
  }, [done]);

  async function run(kind: "publish" | "discard") {
    setPending(kind);
    setError(null);
    try {
      const result = await (kind === "publish"
        ? publishAction()
        : discardAction());
      if (result.ok) {
        setDone(kind === "publish" ? "published" : "discarded");
        setConfirming(false);
        router.refresh();
      } else {
        setError(
          result.formError ??
            (kind === "publish" ? PUBLISH_ERROR : DISCARD_ERROR),
        );
      }
    } catch {
      setError(kind === "publish" ? PUBLISH_ERROR : DISCARD_ERROR);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="grid gap-5">
      {done === "published" ? null : changes.length > 0 ? (
        <div className="grid gap-2">
          <p className="text-sm font-medium">O que muda na sua página:</p>
          <ul className="grid list-disc gap-1 pl-5 text-sm">
            {changes.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nada mudou: a página no ar já está assim.
        </p>
      )}

      <div ref={status} role="status" className="grid gap-2 empty:hidden">
        {done === "published" ? (
          <>
            <p className="font-semibold text-primary-text">Página publicada.</p>
            <Link
              href={`/${slug}` as Route}
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-11 w-fit items-center font-semibold text-primary underline underline-offset-4"
            >
              Ver minha página
            </Link>
          </>
        ) : done === "discarded" ? (
          <p className="font-semibold">Rascunho descartado.</p>
        ) : null}
      </div>

      <FormError message={error} />

      {confirming ? (
        <div className="grid gap-3 rounded-xl border border-destructive/40 p-4">
          <p className="text-sm">
            Apagar tudo o que você mudou e não publicou? A página no ar não
            muda.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              disabled={pending !== null}
              onClick={() => run("discard")}
            >
              {pending === "discard" ? "Descartando..." : "Sim, descartar"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={pending !== null}
              onClick={() => setConfirming(false)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        {back}
        {done === "published" ? null : (
          <Button
            type="button"
            className="min-h-11 flex-1 sm:flex-none"
            disabled={pending !== null || !hasDraft}
            onClick={() => run("publish")}
          >
            {pending === "publish" ? "Publicando..." : "Publicar"}
          </Button>
        )}
        {hasDraft && !confirming ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            disabled={pending !== null}
            onClick={() => setConfirming(true)}
          >
            Descartar rascunho
          </Button>
        ) : null}
      </div>
    </div>
  );
}
