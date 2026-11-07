import { requireAdmin } from "@/modules/auth/session";
import { getPatientLoyalty } from "@/modules/clinic-page/panel";

import { RedeemButton } from "./redeem-button";

// The patient's loyalty card progress; nothing when the card is off.
export async function PatientLoyalty({ patientId }: { patientId: string }) {
  const { clinicId } = await requireAdmin();
  const loyalty = await getPatientLoyalty(clinicId, patientId);
  if (!loyalty.enabled) return null;

  return (
    <section aria-labelledby="fidelidade" className="grid gap-3">
      <h2 id="fidelidade" className="font-heading text-lg font-semibold">
        Cartão fidelidade
      </h2>
      <p>
        <span className="font-semibold tabular-nums">
          {loyalty.stamps} de {loyalty.visits}
        </span>{" "}
        visitas
      </p>
      {loyalty.prize ? (
        <div className="grid justify-items-start gap-2 rounded-2xl border bg-card p-4">
          <p className="font-semibold">Prêmio disponível</p>
          {loyalty.reward ? <p className="text-sm">{loyalty.reward}</p> : null}
          <RedeemButton patientId={patientId} />
        </div>
      ) : null}
    </section>
  );
}
