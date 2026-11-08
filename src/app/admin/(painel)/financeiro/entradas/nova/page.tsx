import type { Metadata } from "next";

import { requireAdmin } from "@/modules/auth/session";
import { listPaymentMethods } from "@/modules/finance/sales";
import { todayLocal } from "@/modules/schedule/time";

import { ReceiptForm } from "../../receipt-forms";
import { PageTitle } from "../../ui";

export const metadata: Metadata = { title: "Nova entrada" };

// Money received outside an appointment or a sale (a product, a walk-in).
// Once saved, the cash book shows it.
export default async function NewReceiptPage() {
  const { clinicId } = await requireAdmin();
  const methods = await listPaymentMethods(clinicId);

  return (
    <div className="grid max-w-2xl gap-6">
      <PageTitle title="Nova entrada" />
      <p className="text-muted-foreground">
        Para um atendimento da agenda, use o botão Receber na página dele: o
        serviço e a cliente já vêm preenchidos.
      </p>
      <ReceiptForm
        methods={methods}
        today={todayLocal()}
        startOpen
        afterSaveHref="/admin/financeiro/caixa"
      />
    </div>
  );
}
