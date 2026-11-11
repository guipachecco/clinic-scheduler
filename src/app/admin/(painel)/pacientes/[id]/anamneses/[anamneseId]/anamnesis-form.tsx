"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import { FieldError, FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  answersSchema,
  LONG_MAX,
  TEXT_MAX,
  type Answers,
} from "@/modules/anamnesis/fields";
import type { AnamnesisTemplate, Question } from "@/modules/anamnesis/template";

import {
  deleteAnamnesisAction,
  saveAnamnesisAction,
  setStatusAction,
  type SaveResult,
} from "../actions";

// The anamnesis form. Drafts live only on the server: nothing is written to
// localStorage, sessionStorage or IndexedDB (the phone may be shared). Every
// save carries the version the screen holds (expectedUpdatedAt), and saves run
// one at a time, each with the version the previous one returned.

type Status = "in_progress" | "completed";

const AUTOSAVE_MS = 3_000;

const MESSAGES = {
  session:
    "Sua sessão expirou. Entre de novo em outra aba e depois clique em Salvar.",
  conflict:
    "Esta anamnese foi alterada em outro aparelho. Copie o que digitou e recarregue a página.",
  error: "Não foi possível salvar. Tente novamente.",
} as const;

const STATUS_LABELS: Record<Status, string> = {
  in_progress: "Em andamento",
  completed: "Concluída",
};

const timeFormat = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

type Props = {
  patientId: string;
  id: string;
  template: AnamnesisTemplate;
  initialAnswers: Answers;
  initialTakenOn: string;
  initialStatus: Status;
  initialUpdatedAt: string;
  today: string;
};

export function AnamnesisForm({
  patientId,
  id,
  template,
  initialAnswers,
  initialTakenOn,
  initialStatus,
  initialUpdatedAt,
  today,
}: Props) {
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [takenOn, setTakenOn] = useState(initialTakenOn);
  const [status, setStatus] = useState<Status>(initialStatus);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [takenOnError, setTakenOnError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [deleting, startDelete] = useTransition();
  const router = useRouter();

  // What the next save sends, read outside React renders.
  const latest = useRef({ answers: initialAnswers, takenOn: initialTakenOn });
  // The version of the anamnesis this screen holds.
  const version = useRef(initialUpdatedAt);
  // Each change bumps `revision`; `savedRevision` is the last one stored.
  const revision = useRef(0);
  const savedRevision = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // No more saves from this screen: deleted, or left without saving.
  const closed = useRef(false);
  // The last save tried before leaving through a link failed.
  const leaveFailed = useRef(false);

  const schema = useMemo(() => answersSchema(template), [template]);
  const pdfUrl = `/admin/pacientes/${patientId}/anamneses/${id}/pdf`;

  // Runs `task` after everything queued before it, so only one request is in
  // flight and each uses the version the previous one returned.
  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(task);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  const save = useCallback((): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    return enqueue(async () => {
      if (closed.current) return false;
      const rev = revision.current;
      if (rev === savedRevision.current) return true;
      const input = { ...latest.current, expectedUpdatedAt: version.current };
      if (!schema.safeParse(input.answers).success) {
        setMessage("Há respostas inválidas.");
        return false;
      }
      setSaving(true);
      let result: SaveResult;
      try {
        result = await saveAnamnesisAction(patientId, id, input);
      } catch {
        result = { ok: false, reason: "error" };
      }
      setSaving(false);
      if (result.ok) {
        version.current = result.updatedAt;
        savedRevision.current = rev;
        leaveFailed.current = false;
        setSavedAt(new Date());
        setMessage(null);
        setTakenOnError(undefined);
        setDirty(revision.current !== rev);
        return true;
      }
      if (result.reason === "invalid") {
        setTakenOnError(result.fieldErrors?.takenOn);
        setMessage(
          result.fieldErrors?.answers ??
            (result.fieldErrors?.takenOn ? null : MESSAGES.error),
        );
      } else {
        setMessage(MESSAGES[result.reason]);
      }
      return false;
    });
  }, [enqueue, schema, patientId, id]);

  const markChanged = () => {
    revision.current += 1;
    setDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void save();
    }, AUTOSAVE_MS);
  };

  const setAnswer = (questionId: string, value: string | string[]) => {
    const next = { ...latest.current.answers, [questionId]: value };
    latest.current = { ...latest.current, answers: next };
    setAnswers(next);
    markChanged();
  };

  const changeTakenOn = (value: string) => {
    latest.current = { ...latest.current, takenOn: value };
    setTakenOn(value);
    markChanged();
  };

  useEffect(() => {
    const unsaved = () =>
      !closed.current && revision.current !== savedRevision.current;
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && unsaved()) void save();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!unsaved()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
      // Leaving through a link of the panel: save what is left.
      if (unsaved()) void save();
      else if (timer.current) clearTimeout(timer.current);
    };
  }, [save]);

  // Links of the panel (Voltar à ficha, the menu) navigate without unloading
  // the page, so beforeunload does not cover them: with unsaved changes the
  // click waits for the save and stays on the page when it fails. Clicking
  // again after a failed save asks before leaving.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.target && link.target !== "_self") return;
      if (link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // The section index only jumps within the page.
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search &&
        url.hash
      ) {
        return;
      }
      if (closed.current || revision.current === savedRevision.current) {
        return;
      }
      event.preventDefault();
      if (leaveFailed.current) {
        if (
          window.confirm(
            "Sair sem salvar? O que você digitou depois do último salvamento será perdido.",
          )
        ) {
          closed.current = true;
          router.push((url.pathname + url.search + url.hash) as Route);
        }
        return;
      }
      void save().then((ok) => {
        if (ok) router.push((url.pathname + url.search + url.hash) as Route);
        else leaveFailed.current = true;
      });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router, save]);

  const changeStatus = (next: Status) => {
    setBusy(true);
    void enqueue(async () => {
      let result;
      try {
        result = await setStatusAction(patientId, id, next, version.current);
      } catch {
        result = { ok: false as const, reason: "error" as const };
      }
      if (result.ok) {
        // The status change is a new version too.
        version.current = result.updatedAt;
        setStatus(next);
      } else {
        setMessage(
          result.reason === "session" || result.reason === "conflict"
            ? MESSAGES[result.reason]
            : "Não foi possível mudar a situação. Tente novamente.",
        );
      }
    }).finally(() => setBusy(false));
  };

  const generatePdf = async () => {
    setBusy(true);
    const ok = await save();
    setBusy(false);
    if (!ok) return;
    // The route answers with Content-Disposition: attachment, so the page
    // stays and the file downloads.
    const link = document.createElement("a");
    link.href = pdfUrl;
    link.click();
  };

  const remove = () => {
    if (!window.confirm("Excluir esta anamnese? Não dá para desfazer.")) return;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    startDelete(async () => {
      await enqueue(async () => {
        closed.current = true;
        let result;
        try {
          // Redirects to the patient's record on success.
          result = await deleteAnamnesisAction(patientId, id);
        } catch {
          result = { ok: false as const, reason: "error" as const };
        }
        if (result && !result.ok) {
          closed.current = false;
          setMessage(
            result.reason === "session"
              ? MESSAGES.session
              : "Não foi possível excluir. Tente novamente.",
          );
        }
      });
    });
  };

  const saveState = saving
    ? "Salvando…"
    : dirty
      ? "Alterações não salvas"
      : savedAt
        ? `Salvo às ${timeFormat.format(savedAt)}`
        : "";
  const disabled = busy || deleting;

  return (
    <form
      className="grid min-w-0 gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="grid gap-4 rounded-2xl border p-4 md:p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="grid gap-2">
            <Label htmlFor="takenOn">Data da anamnese</Label>
            <Input
              id="takenOn"
              type="date"
              className="w-auto"
              value={takenOn}
              max={today}
              onChange={(event) => changeTakenOn(event.target.value)}
              aria-invalid={takenOnError ? true : undefined}
              aria-describedby={takenOnError ? "takenOn-error" : undefined}
            />
            <FieldError id="takenOn-error" message={takenOnError} />
          </div>
          <p className="pb-3">
            Situação:{" "}
            <span className="font-semibold">{STATUS_LABELS[status]}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit">Salvar</Button>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() =>
              changeStatus(status === "completed" ? "in_progress" : "completed")
            }
          >
            {status === "completed" ? "Reabrir" : "Marcar como concluída"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => void generatePdf()}
          >
            Gerar PDF
          </Button>
        </div>
        <p role="status" className="min-h-5 text-sm text-muted-foreground">
          {saveState}
        </p>
        <FormError message={message} />
      </div>

      <nav aria-label="Seções da anamnese" className="min-w-0">
        <ol className="grid gap-1 text-sm sm:grid-cols-2">
          {template.sections.map((section, index) => (
            <li key={section.id} className="min-w-0">
              <a
                href={`#secao-${section.id}`}
                className="inline-flex min-h-11 items-center break-words underline-offset-4 hover:underline"
              >
                {index + 1}. {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {template.sections.map((section, index) => (
        <details
          key={section.id}
          id={`secao-${section.id}`}
          open
          className="min-w-0 scroll-mt-4 rounded-2xl border p-4 md:p-6"
        >
          <summary className="flex min-h-11 cursor-pointer items-center rounded-md font-heading text-lg font-semibold break-words outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
            {index + 1}. {section.title}
          </summary>
          <div className="mt-4 grid gap-5">
            {section.help ? (
              <p className="text-sm text-muted-foreground">{section.help}</p>
            ) : null}
            {section.questions.map((question) => (
              <QuestionField
                key={question.id}
                question={question}
                value={answers[question.id]}
                onChange={(value) => setAnswer(question.id, value)}
              />
            ))}
          </div>
        </details>
      ))}

      <div className="grid gap-4 rounded-2xl border p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit">Salvar</Button>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="text-destructive"
            onClick={remove}
          >
            Excluir anamnese
          </Button>
        </div>
      </div>
    </form>
  );
}

function QuestionField({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: string | string[] | undefined;
  onChange: (value: string | string[]) => void;
}) {
  const fieldId = `q-${question.id}`;
  const helpId = question.help ? `${fieldId}-help` : undefined;
  const help = question.help ? (
    <p id={helpId} className="text-sm text-muted-foreground">
      {question.help}
    </p>
  ) : null;

  if (question.type === "multi") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset className="grid min-w-0 gap-2" aria-describedby={helpId}>
        <legend className="mb-2 text-sm leading-snug font-medium break-words">
          {question.label}
        </legend>
        {help}
        {question.options.map((option) => {
          const optionId = `${fieldId}-${option.value}`;
          return (
            <div
              key={option.value}
              className="flex min-h-11 items-center gap-3"
            >
              <input
                id={optionId}
                type="checkbox"
                className="size-5 shrink-0 accent-primary"
                checked={selected.includes(option.value)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, option.value]
                      : selected.filter((v) => v !== option.value),
                  )
                }
              />
              <Label
                htmlFor={optionId}
                className="min-w-0 leading-snug break-words"
              >
                {option.label}
              </Label>
            </div>
          );
        })}
      </fieldset>
    );
  }

  const text = typeof value === "string" ? value : "";
  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={fieldId} className="leading-snug break-words">
        {question.label}
      </Label>
      {help}
      {question.type === "single" ? (
        <NativeSelect
          id={fieldId}
          value={text}
          aria-describedby={helpId}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Não informado</option>
          {question.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      ) : question.type === "long" ? (
        <Textarea
          id={fieldId}
          value={text}
          maxLength={LONG_MAX}
          aria-describedby={helpId}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={fieldId}
          value={text}
          maxLength={TEXT_MAX}
          aria-describedby={helpId}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}
