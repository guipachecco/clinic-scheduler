import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { requireAdmin } from "@/modules/auth/session";
import { ageText } from "@/modules/patients/birthdays";
import { formatStoredPhone } from "@/modules/patients/fields";
import { listBirthdays } from "@/modules/patients/patients";

export const metadata: Metadata = { title: "Aniversariantes" };

const actionClass =
  "inline-flex min-h-11 items-center rounded-full bg-muted px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export default async function BirthdaysPage() {
  const { clinicId } = await requireAdmin();
  const { date, items } = await listBirthdays(clinicId);

  // `date` is already the clinic-local day, so format it as a plain calendar
  // date (noon UTC never crosses a day boundary).
  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  })
    .format(new Date(`${date}T12:00:00Z`))
    .replace(/^./, (c) => c.toUpperCase());

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader title="Aniversariantes de hoje" eyebrow={dateLabel} />

      {items.length > 0 ? (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {items.map((item) => {
            const digits = item.phone?.replace(/\D/g, "") ?? "";
            return (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
              >
                <div className="grid min-w-0 gap-0.5">
                  <Link
                    href={`/admin/pacientes/${item.id}`}
                    className="font-semibold break-words underline-offset-4 hover:underline"
                  >
                    {item.name}
                    {item.nickname ? ` (${item.nickname})` : ""}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {ageText(item.age)}
                    {item.phone ? ` · ${formatStoredPhone(item.phone)}` : ""}
                  </span>
                </div>
                {digits ? (
                  <a
                    href={`https://wa.me/${digits}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`WhatsApp de ${item.name}`}
                    className={actionClass}
                  >
                    WhatsApp
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhuma aniversariante hoje.
        </p>
      )}

      <Link
        href="/admin/pacientes"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-brand underline-offset-4 hover:underline dark:text-foreground"
      >
        Voltar aos clientes
      </Link>
    </div>
  );
}
