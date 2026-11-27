import { DateTime } from "luxon";
import type { Metadata, Route } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { requireRoot } from "@/modules/auth/session";
import { listClinics } from "@/modules/clinics/clinics";
import { listMessages, messageTotals } from "@/modules/platform/message-log";

import { PrintButton } from "../print-button";

export const metadata: Metadata = { title: "Mensagens" };

const ZONE = "America/Sao_Paulo";
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const LIMIT = 1000;

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const n = (value: number) => value.toLocaleString("pt-BR");
const br = (day: string) => day.split("-").reverse().join("/");

const KIND_LABEL: Record<string, string> = {
  reminder: "Lembrete",
  opt_in: "Ativação",
  reply: "Resposta",
};

// Root only: every WhatsApp message Zemana's number sent, per clinic, with
// the exact text. Filter one clinic and a period and print it to hand over.
export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ clinica?: string; de?: string; ate?: string }>;
}) {
  await requireRoot();
  const params = await searchParams;
  const today = DateTime.now().setZone(ZONE);
  const de =
    params.de && DAY.test(params.de)
      ? params.de
      : today.minus({ days: 29 }).toISODate()!;
  const ate =
    params.ate && DAY.test(params.ate) ? params.ate : today.toISODate()!;
  const from = DateTime.fromISO(de, { zone: ZONE }).startOf("day").toJSDate();
  const to = DateTime.fromISO(ate, { zone: ZONE })
    .plus({ days: 1 })
    .startOf("day")
    .toJSDate();

  const clinics = await listClinics();
  const clinic = clinics.find((c) => c.id === params.clinica);
  const [messages, totals] = await Promise.all([
    listMessages({ clinicId: clinic?.id, from, to, limit: LIMIT }),
    messageTotals({ from, to }),
  ]);
  const nameOf = new Map(clinics.map((c) => [c.id, c.name]));
  const shown = clinic
    ? totals.filter((t) => t.clinicId === clinic.id)
    : totals;
  const sent = shown.reduce((sum, t) => sum + t.sent, 0);
  const failed = shown.reduce((sum, t) => sum + t.failed, 0);
  const reminders = shown.reduce((sum, t) => sum + t.reminders, 0);
  const linkFor = (clinicId?: string) =>
    `/admin/mensagens?${new URLSearchParams({
      ...(clinicId ? { clinica: clinicId } : {}),
      de,
      ate,
    })}` as Route;

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        title={clinic ? `Mensagens · ${clinic.name}` : "Mensagens enviadas"}
        eyebrow={`De ${br(de)} a ${br(ate)} · horário de Brasília`}
      >
        <PrintButton />
      </PageHeader>

      <form
        method="get"
        className="grid grid-cols-1 items-end gap-3 rounded-2xl border bg-card p-4 shadow-xs sm:grid-cols-[2fr_1fr_1fr_auto] print:hidden"
      >
        <div className="grid gap-1">
          <Label htmlFor="msg-clinica">Clínica</Label>
          <NativeSelect
            id="msg-clinica"
            name="clinica"
            defaultValue={clinic?.id ?? ""}
          >
            <option value="">Todas as clínicas</option>
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="msg-de">De</Label>
          <Input id="msg-de" name="de" type="date" defaultValue={de} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="msg-ate">Até</Label>
          <Input id="msg-ate" name="ate" type="date" defaultValue={ate} />
        </div>
        <Button type="submit">Filtrar</Button>
      </form>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Enviadas" value={n(sent)} />
        <Stat label="Lembretes" value={n(reminders)} />
        <Stat label="Falharam" value={n(failed)} bad={failed > 0} />
        <Stat
          label={clinic ? "Clínica" : "Clínicas atendidas"}
          value={clinic ? clinic.name : n(shown.filter((t) => t.sent).length)}
        />
      </div>

      {!clinic && totals.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-xs print:hidden">
          <table className="w-full min-w-[32rem] text-sm">
            <caption className="sr-only">Mensagens por clínica</caption>
            <thead className="bg-brand text-brand-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-semibold">
                  Clínica
                </th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">
                  Enviadas
                </th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">
                  Lembretes
                </th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">
                  Falhas
                </th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Relatório</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {[...totals]
                .sort((a, b) => b.sent - a.sent)
                .map((t) => (
                  <tr key={t.clinicId} className="border-t">
                    <th
                      scope="row"
                      className="px-4 py-2.5 text-left font-semibold"
                    >
                      {nameOf.get(t.clinicId) ?? "Clínica removida"}
                    </th>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {n(t.sent)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {n(t.reminders)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right tabular-nums",
                        t.failed > 0 && "font-semibold text-destructive",
                      )}
                    >
                      {n(t.failed)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        href={linkFor(t.clinicId)}
                        className="text-sm font-semibold text-primary-text underline-offset-4 hover:underline"
                      >
                        Ver relatório
                      </Link>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <section aria-labelledby="lista" className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="lista" className="font-heading text-lg font-bold">
            Uma a uma
          </h2>
          {clinic ? (
            <Link
              href={linkFor()}
              className="text-sm text-primary-text underline-offset-4 hover:underline print:hidden"
            >
              Ver todas as clínicas
            </Link>
          ) : null}
        </div>
        {messages.length === 0 ? (
          <p className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
            Nenhuma mensagem nesse período. O registro uma a uma começou em
            27/11/2026; antes disso só havia a contagem por dia.
          </p>
        ) : (
          <ol className="grid gap-2">
            {messages.map((m) => (
              <li
                key={m.id}
                className={cn(
                  "grid break-inside-avoid gap-2 rounded-2xl border bg-card p-4 shadow-xs",
                  !m.ok && "border-destructive/50",
                )}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold tabular-nums">
                    {dateTime.format(m.createdAt)}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">
                    {KIND_LABEL[m.kind] ?? m.kind}
                  </span>
                  {!clinic ? (
                    <span className="font-semibold text-primary-text">
                      {nameOf.get(m.clinicId) ?? "Clínica removida"}
                    </span>
                  ) : null}
                  <span className="text-muted-foreground tabular-nums">
                    para final {m.phoneLast4}
                  </span>
                  <span
                    className={cn(
                      "ml-auto rounded-full px-2 py-0.5 font-semibold",
                      m.ok
                        ? "bg-status-confirmed text-status-confirmed-foreground"
                        : "bg-destructive text-destructive-foreground",
                    )}
                  >
                    {m.ok ? "Enviada" : "Falhou"}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-line">{m.body}</p>
                {m.error ? (
                  <p className="text-xs text-destructive">{m.error}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
        {messages.length === LIMIT ? (
          <p className="text-xs text-muted-foreground">
            Mostrando as {n(LIMIT)} mais recentes; diminua o período para ver o
            resto.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  bad,
}: {
  label: string;
  value: string;
  bad?: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-1 rounded-2xl border bg-card px-4 py-3 shadow-xs">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-heading text-2xl font-extrabold break-words",
          bad && "text-destructive",
        )}
      >
        {value}
      </span>
    </div>
  );
}
