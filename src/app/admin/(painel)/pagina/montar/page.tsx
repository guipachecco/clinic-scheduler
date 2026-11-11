import type { Metadata } from "next";

import { requireAdmin } from "@/modules/auth/session";
import { getBuilderState } from "@/modules/page-builder/builder";

import { BuilderWizard } from "./builder-wizard";
import { stepFromParam } from "./wizard";

export const metadata: Metadata = { title: "Monte a cara da sua página" };

// The step-by-step builder of the public page. `?passo=` picks the step;
// anything unknown opens the first one.
export default async function BuildPage({
  searchParams,
}: {
  searchParams: Promise<{ passo?: string | string[] }>;
}) {
  const { clinicId } = await requireAdmin();
  const step = stepFromParam((await searchParams).passo);
  const state = await getBuilderState(clinicId);

  return (
    <BuilderWizard
      key={step}
      step={step}
      slug={state.slug}
      name={state.pageName}
      published={state.published}
      draft={state.draft}
      hasDraft={state.hasDraft}
    />
  );
}
