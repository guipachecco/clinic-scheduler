import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { requireClient } from "@/modules/clients/session";
import { canReview } from "@/modules/clinic-page/public";
import { hasModule } from "@/modules/clinics/modules";

import { clinicName, PageTitle } from "../ui";

import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Avaliar" };

// She reviews only after a completed appointment; the form is hidden
// otherwise (the database policy refuses the insert anyway).
export default async function ReviewPage({
  params,
}: PageProps<"/[slug]/avaliar">) {
  const { slug } = await params;
  const { ctx, clinic } = await requireClient(slug, `/${slug}/avaliar`);
  if (!hasModule(clinic, "reviews")) notFound();
  const allowed = await canReview(ctx);

  return (
    <>
      <PageTitle
        description={`Conte como foi o seu atendimento com ${clinicName(clinic)}.`}
      >
        Avaliar
      </PageTitle>
      {allowed ? (
        <ReviewForm slug={slug} />
      ) : (
        <div className="grid gap-3 rounded-2xl border bg-card p-4">
          <p>Você poderá avaliar depois do seu primeiro atendimento.</p>
          <Button asChild variant="outline" size="lg">
            <Link href={`/${slug}` as Route}>Voltar para a página</Link>
          </Button>
        </div>
      )}
    </>
  );
}
