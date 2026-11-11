import type { Metadata, Route } from "next";
import Link from "next/link";

import { requireAdmin } from "@/modules/auth/session";
import { PAYMENT_PLAN_LABELS } from "@/modules/finance/fields";
import { listSales } from "@/modules/finance/sales";
import { formatLocal } from "@/modules/schedule/time";

import { FinanceTabs, money, PageTitle } from "../ui";

export const metadata: Metadata = { title: "Vendas" };

export default async function SalesPage() {
  const { clinicId } = await requireAdmin();
  const sales = await listSales(clinicId);

  return (
    <div className="grid gap-6">
      <PageTitle title="Vendas" />
      <FinanceTabs current="/admin/financeiro/vendas" />
      <p className="text-muted-foreground">
        Cada venda nasce de um orçamento aprovado.
      </p>
      {sales.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma venda ainda.</p>
      ) : (
        <ul className="grid gap-2">
          {sales.map((sale) => (
            <li key={sale.id}>
              <Link
                href={`/admin/financeiro/vendas/${sale.id}` as Route}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-card px-4 py-3 hover:bg-muted/50"
              >
                <span className="min-w-0 break-words">
                  <span className="font-medium">{sale.patientName}</span>{" "}
                  <span className="text-muted-foreground">
                    · orçamento {sale.quoteNumber} ·{" "}
                    {PAYMENT_PLAN_LABELS[sale.paymentPlan]} ·{" "}
                    {formatLocal(sale.createdAt, "dd/MM/yyyy")}
                    {sale.cancelled ? " · cancelada" : ""}
                  </span>
                </span>
                <span className="text-right tabular-nums">
                  <span className="font-semibold">
                    {money(sale.totalCents)}
                  </span>
                  {!sale.cancelled && sale.outstandingCents > 0 ? (
                    <span className="block text-sm text-muted-foreground">
                      falta {money(sale.outstandingCents)}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
