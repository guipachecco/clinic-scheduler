import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  asaasEnabled,
  getAccountView,
  refreshAccount,
} from "@/modules/asaas/accounts";
import { DEPOSIT_PERCENT } from "@/modules/asaas/rules";
import { requireModule } from "@/modules/auth/session";

import { FinanceTabs, PageTitle } from "../ui";

import { ActivationForm } from "./activation-form";
import { DepositToggle } from "./deposit-toggle";

export const metadata: Metadata = { title: "Sinal por Pix" };

const BOX = "grid gap-3 rounded-2xl border bg-card p-4";

export default async function SinalPixPage() {
  const { clinicId } = await requireModule("finance");
  if (!asaasEnabled()) notFound();

  // Opening the screen reads the status at Asaas until the account is
  // approved and its Pix key is ready.
  let view = await getAccountView(clinicId);
  if (view && !(view.status === "approved" && view.pixKeyReady)) {
    view = (await refreshAccount(clinicId)) ?? view;
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <PageTitle title="Sinal por Pix" />
      <FinanceTabs current="/admin/financeiro/sinal-pix" />

      {!view ? (
        <section className={BOX}>
          <p>
            Ative os recebimentos para pedir um sinal de {DEPOSIT_PERCENT}% por
            Pix a quem marca horário online. O dinheiro cai direto na sua conta
            do Asaas, sem taxa da Zemana. Preencha seus dados uma vez: a Zemana
            cria a conta para você.
          </p>
          <ActivationForm />
        </section>
      ) : view.status === "pending" ? (
        <section className={BOX}>
          <p className="font-medium">Sua conta está em análise.</p>
          <p>
            Confira o e-mail do Asaas para enviar seus documentos. Quando a
            conta for aprovada, o sinal liga sozinho: abra esta tela de novo
            para ver como está.
          </p>
        </section>
      ) : view.status === "rejected" ? (
        <section className={BOX}>
          <p className="font-medium text-destructive">
            O Asaas não aprovou a conta.
          </p>
          <p>
            Veja o e-mail que o Asaas enviou, com o motivo e o que fazer. Se
            precisar de ajuda, fale com o suporte.
          </p>
        </section>
      ) : (
        <section className={BOX}>
          {view.pixKeyReady && view.depositEnabled ? (
            <p className="font-medium">
              Sinal de {DEPOSIT_PERCENT}% ativo nos agendamentos online.
            </p>
          ) : view.pixKeyReady ? (
            <p className="font-medium">
              O sinal está desligado. Os agendamentos online seguem sem sinal.
            </p>
          ) : (
            <p className="font-medium">
              Conta aprovada. Falta criar a chave Pix: abra esta tela de novo em
              instantes.
            </p>
          )}
          {view.pixKeyReady ? (
            <div>
              <DepositToggle enabled={view.depositEnabled} />
            </div>
          ) : null}
        </section>
      )}

      {view?.lastError ? (
        <p
          role="status"
          className="rounded-xl border border-destructive/40 bg-card p-3 text-sm text-destructive"
        >
          O Asaas não respondeu como esperado ({view.lastError}). Tente de novo
          em instantes.
        </p>
      ) : null}
    </div>
  );
}
