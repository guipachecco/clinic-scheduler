"use client";

import "@/app/page-fonts";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import {
  mergeDraft,
  type PageDraft,
  type PublishedPage,
  STEP_IDS,
  type StepId,
} from "@/modules/page-builder/draft";

import { saveStepAction } from "./actions";
import { PagePreview } from "./page-preview";
import { BotoesStep } from "./steps/botoes";
import { CorStep } from "./steps/cor";
import { FonteStep } from "./steps/fonte";
import { GaleriaStep } from "./steps/galeria";
import { ImageStep } from "./steps/image-step";
import { PublicarStep } from "./steps/publicar";
import type { StepProps } from "./steps/shared";
import { TextoStep } from "./steps/texto";
import { TipoStep } from "./steps/tipo";
import { changedLabels, STEP_INFO, stepHref } from "./wizard";

const SAVE_ERROR = "Não foi possível salvar. Tente novamente.";
// Errors the steps print next to their own field (cor, texto).
const FIELDS_WITH_MESSAGE = new Set([
  "theme.primaryColor",
  "headline",
  "about",
]);

function renderStep(step: StepId, props: StepProps) {
  switch (step) {
    case "tipo":
      return <TipoStep {...props} />;
    case "logo":
      return <ImageStep {...props} slot="logo" />;
    case "perfil":
      return <ImageStep {...props} slot="ownerPhoto" />;
    case "capa":
      return <ImageStep {...props} slot="cover" />;
    case "cor":
      return <CorStep {...props} />;
    case "botoes":
      return <BotoesStep {...props} />;
    case "fonte":
      return <FonteStep {...props} />;
    case "texto":
      return <TextoStep {...props} />;
    case "galeria":
      return <GaleriaStep {...props} />;
    case "publicar":
      return null;
  }
}

// One step of "Monte a cara da sua página" (modelo A): progress, a live
// preview, the question, the control and Voltar / Próximo. The page renders
// it with key={step}, so the unsaved changes of a step start empty.
export function BuilderWizard({
  step,
  slug,
  name,
  published,
  draft,
  hasDraft,
}: {
  step: StepId;
  slug: string;
  name: string;
  published: PublishedPage;
  draft: PageDraft;
  hasDraft: boolean;
}) {
  const router = useRouter();
  const [patch, setPatch] = useState<PageDraft>({});
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const index = STEP_IDS.indexOf(step);
  const info = STEP_INFO[step];
  const saved = mergeDraft(published, draft);
  const preview = mergeDraft(saved, patch);
  const previous = STEP_IDS[index - 1];
  const next = STEP_IDS[index + 1];
  const locked = busy || pending;

  const dirty = Object.keys(patch).length > 0;

  // Leaving the tab or the site with changes not saved yet asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Saves this step (when it changed something) and opens `href`. An error
  // keeps the owner on the step.
  async function saveAndOpen(href: string) {
    if (locked) return;
    setFormError(null);
    setFieldErrors({});
    if (dirty) {
      setPending(true);
      try {
        const result = await saveStepAction(patch);
        if (!result.ok) {
          setFieldErrors(result.fieldErrors);
          const keys = Object.keys(result.fieldErrors);
          const shownByField =
            keys.length > 0 &&
            keys.every((key) => FIELDS_WITH_MESSAGE.has(key));
          setFormError(shownByField ? null : (result.formError ?? SAVE_ERROR));
          setPending(false);
          return;
        }
      } catch {
        setFormError(SAVE_ERROR);
        setPending(false);
        return;
      }
    }
    // Stays pending until the next page replaces this one.
    setPending(true);
    router.push(href as Route);
  }

  const go = (target: StepId) => saveAndOpen(stepHref(target));

  const back = previous ? (
    <Button
      type="button"
      variant="outline"
      className="min-h-11"
      disabled={locked}
      onClick={() => go(previous)}
    >
      Voltar
    </Button>
  ) : null;

  return (
    <div className="mx-auto grid w-full max-w-xl gap-5">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={"/admin/pagina" as Route}
          onClick={(event) => {
            event.preventDefault();
            void saveAndOpen("/admin/pagina");
          }}
          className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
        >
          Sair do passo a passo
        </Link>
        {hasDraft ? (
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Rascunho, ainda não publicado
          </span>
        ) : null}
      </div>

      <div className="grid gap-2">
        <p className="text-sm font-semibold" id="progresso">
          Passo {index + 1} de {STEP_IDS.length} · {info.name}
        </p>
        <div
          aria-hidden="true"
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${((index + 1) / STEP_IDS.length) * 100}%` }}
          />
        </div>
        <details className="group text-sm">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-primary-text underline-offset-4 hover:underline">
            Ver todos os passos
          </summary>
          <ol className="mt-1 grid gap-1">
            {STEP_IDS.map((id, i) => (
              <li key={id}>
                <Link
                  href={stepHref(id) as Route}
                  aria-current={id === step ? "step" : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    if (id !== step) void go(id);
                  }}
                  className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-accent aria-[current=step]:bg-accent aria-[current=step]:font-semibold"
                >
                  <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs">
                    {i + 1}
                  </span>
                  {STEP_INFO[id].name}
                </Link>
              </li>
            ))}
          </ol>
        </details>
      </div>

      <PagePreview page={preview} name={name} large={step === "publicar"} />

      <h1 className="font-heading text-2xl font-bold tracking-tight">
        {info.question}
      </h1>

      {step === "publicar" ? (
        <PublicarStep
          slug={slug}
          hasDraft={hasDraft}
          changes={changedLabels(published, saved)}
          back={back}
        />
      ) : (
        <form
          noValidate
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (next) void go(next);
          }}
        >
          {renderStep(step, {
            published,
            draft,
            saved,
            patch,
            setPatch: (value) => setPatch(value),
            setBusy,
            fieldErrors,
          })}
          <FormError message={formError} />
          <div className="flex items-center gap-2 border-t pt-4">
            {back}
            <Button
              type="submit"
              className="ml-auto min-h-11 min-w-32"
              disabled={locked}
            >
              {pending ? "Salvando..." : "Próximo"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
