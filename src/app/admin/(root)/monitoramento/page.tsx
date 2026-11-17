import type { Metadata, Route } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { requireRoot } from "@/modules/auth/session";
import { loadMonitoring } from "@/modules/platform/load";
import {
  formatBytes,
  formatMs,
  latencyLevel,
  percentile,
  type LatencyLevel,
} from "@/modules/platform/stats";

import { BarChart } from "./bar-chart";

export const metadata: Metadata = { title: "Monitoramento" };

const ZONE = "America/Sao_Paulo";

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: ZONE,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const timeOnly = new Intl.DateTimeFormat("pt-BR", {
  timeZone: ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

// "2026-11-17" -> "17/11"
const shortDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const n = (value: number) => value.toLocaleString("pt-BR");

function since(date: Date | null, now: Date): string {
  if (!date) return "nunca";
  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `há ${hours} h`;
  return `há ${Math.round(hours / 24)} dias`;
}

const LEVEL_LABEL: Record<LatencyLevel, string> = {
  good: "Rápido",
  warn: "Lento",
  bad: "Muito lento",
};

const LEVEL_STYLE: Record<LatencyLevel, string> = {
  good: "bg-status-confirmed text-status-confirmed-foreground",
  warn: "bg-status-requested text-status-requested-foreground",
  bad: "bg-destructive text-destructive-foreground",
};

function Tile({
  label,
  value,
  detail,
  badge,
}: {
  label: string;
  value: string;
  detail?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="grid min-w-0 content-start gap-1 rounded-2xl border bg-card px-4 py-3 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        {badge}
      </div>
      <span className="font-heading text-2xl font-extrabold break-words">
        {value}
      </span>
      {detail ? (
        <span className="text-xs text-muted-foreground">{detail}</span>
      ) : null}
    </div>
  );
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="grid grid-cols-1 gap-3">
      <div className="grid gap-0.5">
        <h2 id={id} className="font-heading text-lg font-bold">
          {title}
        </h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 content-start gap-3 rounded-2xl border bg-card p-4 shadow-xs",
        className,
      )}
    >
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

const ROUTE_TYPE_LABEL: Record<string, string> = {
  render: "Página",
  route: "API",
  action: "Ação",
  proxy: "Proxy",
  log: "Registro",
};

// Root only: health of the system. Database latency and size, server errors
// (recorded by src/instrumentation.ts), what is being created and how each
// clinic uses the system. Counts only, never personal data.
export default async function MonitoringPage() {
  await requireRoot();
  const now = new Date();

  const {
    latency,
    queriesMs,
    db,
    errors,
    history,
    daily,
    accounts,
    clinics,
    usage,
  } = await loadMonitoring(now);

  const level = latencyLevel(latency.median);
  const historyValues = history.map((point) => point.dbMs);
  const p95 = percentile(historyValues, 95);
  const p50 = percentile(historyValues, 50);
  const connections = db.connections.reduce((sum, c) => sum + c.count, 0);
  const activeClinics = clinics.filter((clinic) => clinic.isActive).length;
  const totals = [...usage.values()].reduce(
    (sum, row) => ({
      patients: sum.patients + row.patients,
      patients30d: sum.patients30d + row.patients30d,
      appointments: sum.appointments + row.appointments,
      appointments30d: sum.appointments30d + row.appointments30d,
      online30d: sum.online30d + row.online30d,
      upcoming: sum.upcoming + row.upcoming,
      sales30d: sum.sales30d + row.sales30d,
    }),
    {
      patients: 0,
      patients30d: 0,
      appointments: 0,
      appointments30d: 0,
      online30d: 0,
      upcoming: 0,
      sales30d: 0,
    },
  );
  const clinicRows = clinics
    .map((clinic) => ({ clinic, use: usage.get(clinic.id) }))
    .sort(
      (a, b) =>
        (b.use?.appointments30d ?? 0) - (a.use?.appointments30d ?? 0) ||
        a.clinic.name.localeCompare(b.clinic.name, "pt-BR"),
    );

  return (
    <div className="grid grid-cols-1 gap-8">
      <PageHeader
        title="Monitoramento"
        eyebrow={`Atualizado às ${timeOnly.format(now)}`}
      >
        <Link
          href={"/admin/monitoramento" as Route}
          prefetch={false}
          className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary-pressed focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Atualizar
        </Link>
      </PageHeader>

      {/* The headline: is everything fine right now? */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Tile
          label="Banco agora"
          value={formatMs(latency.median)}
          badge={
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                LEVEL_STYLE[level],
              )}
            >
              {LEVEL_LABEL[level]}
            </span>
          }
          detail={`${formatMs(latency.min)} a ${formatMs(latency.max)} em ${latency.samples} idas`}
        />
        <Tile
          label="Erros 24 h"
          value={n(errors.last24h)}
          badge={
            errors.last24h > 0 ? (
              <span className="rounded-full bg-destructive px-2 py-0.5 text-[11px] font-semibold text-destructive-foreground">
                Ver abaixo
              </span>
            ) : (
              <span className="rounded-full bg-status-confirmed px-2 py-0.5 text-[11px] font-semibold text-status-confirmed-foreground">
                Tudo certo
              </span>
            )
          }
          detail={`${n(errors.last7d)} nos últimos 7 dias`}
        />
        <Tile
          label="Latência (72 h)"
          value={historyValues.length ? formatMs(p95) : "—"}
          detail={
            historyValues.length
              ? `p95 · mediana ${formatMs(p50)} · ${historyValues.length} amostras`
              : "sem amostras ainda"
          }
        />
        <Tile
          label="Tamanho do banco"
          value={formatBytes(db.sizeBytes)}
          detail={`PostgreSQL ${db.version}`}
        />
        <Tile
          label="Conexões"
          value={`${n(connections)}`}
          detail={`de ${n(db.maxConnections)} possíveis`}
        />
        <Tile
          label="Cache do banco"
          value={
            db.cacheHitRatio === null
              ? "—"
              : `${(db.cacheHitRatio * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
          }
          detail="leituras servidas da memória"
        />
      </div>

      <Section
        id="latencia"
        title="Latência"
        description={
          <>
            Tempo de ida e volta ao banco. Uma amostra cada vez que esta tela
            abre e, se um monitor de disponibilidade chamar{" "}
            <code className="rounded bg-muted px-1">/api/saude</code>, uma a
            cada 4 minutos. As consultas desta página levaram{" "}
            {formatMs(queriesMs)}.
          </>
        }
      >
        <Panel title="Banco, últimas 72 horas">
          {history.length > 0 ? (
            <BarChart
              caption="Latência do banco nas últimas 72 horas"
              unit=" ms"
              bars={history.map((point) => ({
                label: timeOnly.format(point.at),
                value: point.dbMs,
                title: `${dateTime.format(point.at)}: ${formatMs(point.dbMs)} (${point.source === "saude" ? "monitor" : "painel"})`,
                tone:
                  latencyLevel(point.dbMs) === "good"
                    ? undefined
                    : latencyLevel(point.dbMs) === "warn"
                      ? "warn"
                      : "bad",
              }))}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Sem amostras ainda.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Até 100 ms é rápido; acima de 400 ms as clientes sentem. A primeira
            ida depois de um tempo parado costuma ser mais lenta (o banco
            acorda).
          </p>
        </Panel>
      </Section>

      <Section
        id="erros"
        title="Erros"
        description="Falhas do servidor (páginas, ações e APIs) e erros registrados pelo próprio app, como um pagamento recusado pelo provedor. Ficam guardados por 30 dias, sem dados pessoais."
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_2fr]">
          <Panel title="Erros por dia (14 dias)">
            <BarChart
              caption="Erros por dia nos últimos 14 dias"
              bars={errors.perDay.map((row) => ({
                label: shortDay(row.day),
                value: row.total,
                title: `${shortDay(row.day)}: ${n(row.total)} ${row.total === 1 ? "erro" : "erros"}`,
                tone: row.total > 0 ? "bad" : undefined,
              }))}
            />
          </Panel>
          <Panel title="Mais frequentes (7 dias)">
            {errors.groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum erro nos últimos 7 dias.
              </p>
            ) : (
              <ul className="grid divide-y">
                {errors.groups.map((group, index) => (
                  <li key={index} className="grid gap-0.5 py-2 first:pt-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-destructive px-2 py-0.5 text-[11px] font-bold text-destructive-foreground">
                        {n(group.total)}×
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">
                        {ROUTE_TYPE_LABEL[group.routeType] ?? group.routeType}
                      </span>
                      <code className="text-xs break-all">{group.path}</code>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {since(group.lastAt, now)}
                      </span>
                    </div>
                    <p className="text-sm break-words">
                      <span className="font-semibold">{group.errorName}:</span>{" "}
                      {group.message}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        {errors.recent.length > 0 ? (
          <details className="rounded-2xl border bg-card p-4 shadow-xs">
            <summary className="cursor-pointer text-sm font-semibold">
              Últimos {errors.recent.length} erros, um a um
            </summary>
            <ul className="mt-3 grid divide-y text-sm">
              {errors.recent.map((row) => (
                <li key={row.id} className="grid gap-0.5 py-2">
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{dateTime.format(row.at)}</span>
                    <span>{row.method}</span>
                    <code className="break-all">{row.path}</code>
                    {row.digest ? <span>código {row.digest}</span> : null}
                  </div>
                  <p className="break-words">
                    <span className="font-semibold">{row.errorName}:</span>{" "}
                    {row.message}
                  </p>
                  {row.routePath ? (
                    <code className="text-xs break-all text-muted-foreground">
                      {row.routePath}
                    </code>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Section>

      <Section
        id="criados"
        title="O que está sendo criado"
        description="Todas as clínicas juntas. Os gráficos mostram os últimos 30 dias, no horário de Brasília."
      >
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <Tile
            label="Clínicas ativas"
            value={n(activeClinics)}
            detail={`${n(clinics.length)} no total`}
          />
          <Tile
            label="Agendamentos"
            value={n(totals.appointments)}
            detail={`${n(totals.appointments30d)} em 30 dias · ${n(totals.online30d)} pelo site`}
          />
          <Tile
            label="Próximos"
            value={n(totals.upcoming)}
            detail="marcados daqui pra frente"
          />
          <Tile
            label="Clientes cadastradas"
            value={n(totals.patients)}
            detail={`${n(totals.patients30d)} em 30 dias`}
          />
          <Tile
            label="Contas de clientes"
            value={n(accounts.client)}
            detail={`${n(accounts.client30d)} em 30 dias`}
          />
          <Tile
            label="Contas de donas"
            value={n(accounts.admin)}
            detail={`${n(totals.sales30d)} vendas em 30 dias`}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Panel title="Agendamentos criados por dia">
            <BarChart
              caption="Agendamentos criados por dia nos últimos 30 dias"
              bars={daily.map((row) => ({
                label: shortDay(row.day),
                value: row.appointments,
                title: `${shortDay(row.day)}: ${n(row.appointments)} agendamentos (${n(row.online)} pelo site)`,
              }))}
            />
          </Panel>
          <Panel title="Clientes cadastradas por dia">
            <BarChart
              caption="Clientes cadastradas por dia nos últimos 30 dias"
              bars={daily.map((row) => ({
                label: shortDay(row.day),
                value: row.patients,
                title: `${shortDay(row.day)}: ${n(row.patients)} clientes`,
              }))}
            />
          </Panel>
          <Panel title="Contas de clientes por dia">
            <BarChart
              caption="Contas de clientes criadas por dia nos últimos 30 dias"
              bars={daily.map((row) => ({
                label: shortDay(row.day),
                value: row.clientAccounts,
                title: `${shortDay(row.day)}: ${n(row.clientAccounts)} contas`,
              }))}
            />
          </Panel>
        </div>
      </Section>

      <Section
        id="por-clinica"
        title="Uso por clínica"
        description="Ordenado por agendamentos nos últimos 30 dias. Última atividade é a última alteração registrada no painel da clínica."
      >
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-xs">
          <table className="w-full min-w-[44rem] text-sm">
            <caption className="sr-only">Uso de cada clínica</caption>
            <thead className="bg-brand text-brand-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-semibold">
                  Clínica
                </th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">
                  Agend. 30d
                </th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">
                  Pelo site
                </th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">
                  Próximos
                </th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">
                  Clientes
                </th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">
                  Serviços
                </th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">
                  Equipe
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold">
                  Última atividade
                </th>
              </tr>
            </thead>
            <tbody>
              {clinicRows.map(({ clinic, use }) => (
                <tr key={clinic.id} className="border-t">
                  <th scope="row" className="px-4 py-2.5 text-left font-normal">
                    <span className="font-semibold break-words">
                      {clinic.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      /{clinic.slug}
                      {clinic.isActive ? "" : " · desativada"}
                    </span>
                  </th>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {n(use?.appointments30d ?? 0)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {n(use?.online30d ?? 0)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {n(use?.upcoming ?? 0)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {n(use?.patients ?? 0)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {n(use?.services ?? 0)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {n(use?.professionals ?? 0)}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {since(use?.lastActivityAt ?? null, now)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        id="banco"
        title="Banco de dados"
        description={
          db.startedAt
            ? `No ar desde ${dateTime.format(db.startedAt)} (${since(db.startedAt, now)}). No Neon, o banco dorme quando fica parado e acorda na próxima visita.`
            : undefined
        }
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_2fr]">
          <Panel title="Atividade">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Transações</dt>
              <dd className="text-right tabular-nums">{n(db.commits)}</dd>
              <dt className="text-muted-foreground">Desfeitas</dt>
              <dd className="text-right tabular-nums">{n(db.rollbacks)}</dd>
              <dt className="text-muted-foreground">Deadlocks</dt>
              <dd className="text-right tabular-nums">{n(db.deadlocks)}</dd>
              {db.connections.map((c) => (
                <div key={c.state} className="contents">
                  <dt className="text-muted-foreground">
                    Conexões{" "}
                    {c.state === "active"
                      ? "ativas"
                      : c.state === "idle"
                        ? "paradas"
                        : c.state}
                  </dt>
                  <dd className="text-right tabular-nums">{n(c.count)}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          <Panel title="Maiores tabelas">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-1 text-left font-medium">
                      Tabela
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      Linhas
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      Tamanho
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      Leituras por índice
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {db.tables.map((table) => {
                    const scans = table.seqScans + table.indexScans;
                    return (
                      <tr key={table.name} className="border-t">
                        <td className="py-1.5">
                          <code className="text-xs">{table.name}</code>
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {n(table.rows)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {formatBytes(table.sizeBytes)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {scans === 0
                            ? "—"
                            : `${Math.round((table.indexScans / scans) * 100)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </Section>
    </div>
  );
}
