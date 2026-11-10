"use client";

import { useState } from "react";

import { FormError } from "@/components/form-message";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatCents } from "@/modules/services/fields";

import { createChargeAction } from "../../actions";

export type ChargeLinkInfo = {
  checkoutUrl: string;
  amountCents: number;
  expiresAt: string;
};

// "Cobrar pelo Mercado Pago": makes (or reuses) a payment link for what is
// left of the installment, then offers to copy it or send it by WhatsApp.
export function ChargeLink({
  installmentId,
  installmentNumber,
  clinicName,
  phone,
  existing,
}: {
  installmentId: string;
  installmentNumber: number;
  clinicName: string;
  // Digits only, with the country code, or null when the patient has none.
  phone: string | null;
  existing: ChargeLinkInfo | null;
}) {
  const [link, setLink] = useState<ChargeLinkInfo | null>(existing);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!link) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            setError(null);
            const result = await createChargeAction(installmentId).catch(
              () => ({
                ok: false,
                formError: "Não foi possível criar o link. Tente novamente.",
                link: undefined,
              }),
            );
            setSaving(false);
            if (result.ok && result.link) setLink(result.link);
            else setError(result.formError ?? "Não foi possível criar o link.");
          }}
        >
          {saving ? "Criando link..." : "Cobrar pelo Mercado Pago"}
        </Button>
        <FormError message={error} />
      </span>
    );
  }

  const message = [
    `Olá! Segue o link para pagar a parcela ${installmentNumber} (${formatCents(link.amountCents)}) da ${clinicName}:`,
    link.checkoutUrl,
    "Dá para pagar por Pix ou cartão.",
  ].join("\n");
  const whatsapp = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    : null;
  const until = new Date(link.expiresAt).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">
        Link do Mercado Pago válido até {until}
      </span>
      {whatsapp ? (
        <a
          href={whatsapp}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ size: "sm" })}
        >
          Enviar pelo WhatsApp
        </a>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link.checkoutUrl);
            setCopied(true);
          } catch {
            window.prompt("Copie o link:", link.checkoutUrl);
          }
        }}
      >
        {copied ? "Link copiado" : "Copiar link"}
      </Button>
    </span>
  );
}
