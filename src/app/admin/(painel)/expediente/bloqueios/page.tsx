import type { Metadata, Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/modules/auth/session";
import { TIME_BLOCK_TYPES } from "@/modules/schedule/fields";
import { listUpcomingBlocks } from "@/modules/schedule/schedule";
import { formatLocal, todayLocal } from "@/modules/schedule/time";

import { BlockList, type BlockRow } from "./block-list";
import { HolidaysButton } from "./holidays-button";
import { TimeBlockForm } from "./time-block-form";

export const metadata: Metadata = { title: "Bloqueios e feriados" };

function dateLabel(startsAt: Date, endsAt: Date, allDay: boolean) {
  if (allDay) {
    // An all-day block ends at the next local midnight; show the last day.
    const lastDay = new Date(endsAt.getTime() - 1);
    const first = formatLocal(startsAt, "dd/MM/yyyy");
    const last = formatLocal(lastDay, "dd/MM/yyyy");
    return `${first === last ? first : `${first} a ${last}`} - Dia inteiro`;
  }
  const from = `${formatLocal(startsAt, "dd/MM/yyyy")} ${formatLocal(startsAt, "HH:mm")}`;
  const to = `${formatLocal(endsAt, "dd/MM/yyyy")} ${formatLocal(endsAt, "HH:mm")}`;
  return `${from} a ${to}`;
}

export default async function BlocksPage() {
  await requireAdmin();
  const today = todayLocal();
  const year = Number(today.slice(0, 4));
  const blocks = await listUpcomingBlocks();

  const rows: BlockRow[] = blocks.map((block) => ({
    id: block.id,
    typeLabel:
      TIME_BLOCK_TYPES.find((type) => type.value === block.type)?.label ??
      block.type,
    title: block.title,
    when: dateLabel(block.startsAt, block.endsAt, block.allDay),
    deletable: block.deletable,
  }));

  return (
    <div className="grid max-w-3xl gap-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Bloqueios e feriados
        </h1>
        <Button asChild variant="outline">
          <Link href={"/admin/expediente" as Route}>Voltar ao expediente</Link>
        </Button>
      </header>

      <section aria-labelledby="novo-bloqueio" className="grid gap-4">
        <h2 id="novo-bloqueio" className="font-heading text-lg font-semibold">
          Novo bloqueio
        </h2>
        <TimeBlockForm today={today} />
      </section>

      <section aria-labelledby="proximos" className="grid gap-3">
        <h2 id="proximos" className="font-heading text-lg font-semibold">
          Próximos bloqueios
        </h2>
        <BlockList blocks={rows} />
      </section>

      <section aria-labelledby="feriados" className="grid gap-3">
        <h2 id="feriados" className="font-heading text-lg font-semibold">
          Feriados nacionais
        </h2>
        <HolidaysButton years={[year, year + 1]} />
      </section>
    </div>
  );
}
