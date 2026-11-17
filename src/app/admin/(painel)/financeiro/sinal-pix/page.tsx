import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  getAccountView,
  pixDepositOn,
  refreshAccount,
  REFUND_PENDING_APPROVAL,
} from "@/modules/asaas/accounts";
import { DEPOSIT_PERCENT } from "@/modules/asaas/rules";
import { requireModule } from "@/modules/auth/session";

import { FinanceTabs, PageTitle } from "../ui";

import { ConnectForm } from "./connect-form";
import { DepositToggle } from "./deposit-toggle";
import { ReplaceKey } from "./replace-key";

export const metadata: Metadata = { title: "Sinal por Pix" };

const BOX = "grid gap-3 rounded-2xl border bg-card p-4";

export default async function SinalPixPage() {
  const { clinicId, clinic } = await requireModule("finance");
  if (!pixDepositOn(clinic)) notFound();

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
            Receba um sinal de {DEPOSIT_PERCENT}% por Pix de quem marca horário
            online. O dinheiro cai direto na sua conta do Asaas, sem taxa da
            Zemana.
          </p>
          <ol className="grid list-decimal gap-1 pl-5 text-sm">
            <li>
              Crie sua conta no{" "}
              <a
                href="https://www.asaas.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary underline underline-offset-4"
              >
                Asaas
              </a>
              .
            </li>
            <li>Envie seus documentos e espere a aprovação.</li>
            <li>
              No Asaas, abra Integrações, depois Chaves de API, e crie uma
              chave.
            </li>
            <li>Cole a chave aqui embaixo.</li>
          </ol>
          <ConnectForm />
        </section>
      ) : view.status === "disconnected" ? (
        <section className={BOX}>
          <p role="alert" className="font-medium text-destructive">
            Sua conta do Asaas desconectou. O sinal foi desligado e as marcações
            seguem sem sinal. Gere uma chave nova no Asaas e cole aqui.
          </p>
          <ConnectForm />
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
          {view.status === "approved" && view.pixKeyReady ? (
            <>
              {view.depositEnabled ? (
                <p className="font-medium">
                  Sinal de {DEPOSIT_PERCENT}% ativo nos agendamentos online.
                </p>
              ) : (
                <p className="font-medium">
                  O sinal está desligado. Os agendamentos online seguem sem
                  sinal.
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Conta Asaas: {view.accountName}
              </p>
              <div>
                <DepositToggle enabled={view.depositEnabled} />
              </div>
            </>
          ) : (
            <>
              <p className="font-medium">Conta conectada: {view.accountName}</p>
              <p>
                {view.status === "pending"
                  ? "Sua conta está em análise no Asaas. Confira o e-mail do Asaas para enviar seus documentos."
                  : "Falta a chave Pix ficar ativa no Asaas. Abra esta tela de novo em instantes."}
              </p>
            </>
          )}
          <ReplaceKey />
        </section>
      )}

      {view && view.status !== "disconnected" && view.lastError ? (
        <p
          role="status"
          className="rounded-xl border border-destructive/40 bg-card p-3 text-sm text-destructive"
        >
          {view.lastError === REFUND_PENDING_APPROVAL
            ? "Um reembolso automático de sinal está aguardando sua aprovação no app do Asaas."
            : `O Asaas não respondeu como esperado (${view.lastError}). Tente de novo em instantes.`}
        </p>
      ) : null}
    </div>
  );
}
