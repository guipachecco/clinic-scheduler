import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { requireModule } from "@/modules/auth/session";
import {
  getConnection,
  mercadoPagoConfig,
} from "@/modules/mercado-pago/accounts";
import { formatLocal } from "@/modules/schedule/time";

import { FinanceTabs, PageTitle } from "../ui";

import { DisconnectButton } from "./disconnect-button";

export const metadata: Metadata = { title: "Mercado Pago" };

const RESULTS: Record<string, { tone: "ok" | "error"; text: string }> = {
  ok: { tone: "ok", text: "Mercado Pago conectado." },
  recusada: {
    tone: "error",
    text: "A autorização foi cancelada no Mercado Pago. Nada mudou.",
  },
  invalida: {
    tone: "error",
    text: "O pedido de conexão expirou ou não é desta clínica. Tente de novo.",
  },
  erro: {
    tone: "error",
    text: "O Mercado Pago não confirmou a conexão. Tente de novo em instantes.",
  },
};

// A full page load (not a client navigation): the route answers with a
// redirect to Mercado Pago.
function ConnectForm({
  label,
  variant,
}: {
  label: string;
  variant?: "outline";
}) {
  return (
    <form action="/api/mercado-pago/conectar" method="get">
      <Button type="submit" variant={variant}>
        {label}
      </Button>
    </form>
  );
}

export default async function MercadoPagoPage({
  searchParams,
}: {
  searchParams: Promise<{ conexao?: string }>;
}) {
  const { clinicId, isRoot } = await requireModule("finance");
  const { conexao } = await searchParams;
  const config = mercadoPagoConfig();
  const connection = config ? await getConnection(clinicId) : null;
  const result = conexao ? RESULTS[conexao] : undefined;

  return (
    <div className="grid max-w-3xl gap-6">
      <PageTitle title="Mercado Pago" />
      <FinanceTabs current="/admin/financeiro/mercado-pago" />

      {result ? (
        <p
          role="status"
          className={
            result.tone === "ok"
              ? "rounded-2xl border bg-card px-4 py-3 font-medium"
              : "rounded-xl border border-destructive/40 bg-card p-3 font-medium text-destructive"
          }
        >
          {result.text}
        </p>
      ) : null}

      <section className="grid gap-3 rounded-2xl border bg-card p-4">
        <p>
          Conecte a conta Mercado Pago da clínica para mandar links de pagamento
          às pacientes, por Pix ou cartão. O dinheiro cai direto na conta da
          clínica, e a parcela é marcada como paga sozinha quando o pagamento é
          aprovado.
        </p>

        {!config ? (
          <p className="text-muted-foreground">
            O pagamento pelo Mercado Pago ainda não está disponível.
          </p>
        ) : connection ? (
          <div className="grid gap-3">
            <p className="font-medium">
              Conectado desde{" "}
              {formatLocal(connection.connectedAt, "dd/MM/yyyy")}
              {connection.liveMode ? "" : " (conta de teste)"}.
            </p>
            <div className="flex flex-wrap gap-2">
              <ConnectForm label="Conectar outra conta" variant="outline" />
              <DisconnectButton />
            </div>
          </div>
        ) : (
          <ConnectForm label="Conectar Mercado Pago" />
        )}
      </section>

      {config && isRoot ? (
        <section className="grid gap-2 rounded-2xl border bg-card p-4 text-sm">
          <h2 className="font-heading text-base font-semibold">
            Configuração da aplicação (só root vê)
          </h2>
          <p>
            URL de redirecionamento: <code>{config.redirectUri}</code>
          </p>
          <p>
            Webhook (tópico Order):{" "}
            <code>
              {new URL("/api/webhooks/mercado-pago", config.redirectUri).href}
            </code>
          </p>
        </section>
      ) : null}
    </div>
  );
}
