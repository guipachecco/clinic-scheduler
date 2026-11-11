import type { Metadata, Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/modules/auth/session";
import { getClinicTimezone, listReviews } from "@/modules/clinic-page/panel";

import { ReviewVisibilityButton } from "./review-actions";

export const metadata: Metadata = { title: "Avaliações" };

export default async function ReviewsPage() {
  const { clinicId } = await requireAdmin();
  const [reviews, timeZone] = await Promise.all([
    listReviews(clinicId),
    getClinicTimezone(clinicId),
  ]);
  // Dates on the clinic's own calendar.
  const dateFormat = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <div className="grid max-w-3xl gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">
          Avaliações
        </h1>
        <Button asChild variant="outline">
          <Link href={"/admin/pagina" as Route}>Voltar à página</Link>
        </Button>
      </header>
      <p className="text-sm text-muted-foreground">
        Avaliações escondidas não aparecem na página e não entram na média.
      </p>

      {reviews.length === 0 ? (
        <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
          Nenhuma avaliação recebida ainda.
        </p>
      ) : (
        <ul className="grid gap-2">
          {reviews.map((review) => (
            <li
              key={review.id}
              className="grid gap-2 rounded-2xl border bg-card p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/admin/pacientes/${review.patientId}` as Route}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {review.patientName}
                </Link>
                <span className="text-sm text-muted-foreground">
                  {dateFormat.format(review.createdAt)}
                </span>
              </div>
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{review.rating} de 5</span>
                {review.isHidden ? (
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    Escondida
                  </span>
                ) : null}
              </p>
              {review.comment ? (
                <p className="text-sm break-words">{review.comment}</p>
              ) : null}
              <ReviewVisibilityButton id={review.id} hidden={review.isHidden} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
