"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

import { Icon } from "../icons";

import { type DepositPayload, pollDeposit } from "./actions";
import { formatCents } from "./confirm-sheet";

const POLL_MS = 4_000;

function remaining(expiresAt: string, now: number) {
  return Math.max(0, Date.parse(expiresAt) - now);
}

function clock(ms: number) {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// The Pix of the deposit: QR Code, "copia e cola" and the time left. Asks the
// server every few seconds whether it was paid; paid, onPaid shows the
// confirmed booking. Time out, the slot is let go.
export function PixStep({
  slug,
  deposit,
  onPaid,
  onRestart,
}: {
  slug: string;
  deposit: DepositPayload;
  onPaid: () => void;
  onRestart: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [status, setStatus] = useState(deposit.status);
  const left = remaining(deposit.expiresAt, now);
  const open = status === "pending" && left > 0;

  useEffect(() => {
    if (!open) return;
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(tick);
  }, [open]);

  useEffect(() => {
    if (status !== "pending") return;
    let stopped = false;
    const poll = setInterval(async () => {
      try {
        const fresh = await pollDeposit(slug, deposit.appointmentId);
        if (!stopped && fresh) setStatus(fresh.status);
      } catch {
        // Try again on the next tick.
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(poll);
    };
  }, [slug, deposit.appointmentId, status]);

  useEffect(() => {
    if (status === "paid") onPaid();
  }, [status, onPaid]);

  if (!open && status !== "paid") {
    return (
      <section
        aria-labelledby="pix-expirado"
        className="grid gap-4 rounded-2xl border bg-card p-4 lg:mx-auto lg:w-full lg:max-w-xl lg:rounded-3xl lg:p-8"
      >
        <h2 id="pix-expirado" className="font-heading text-xl font-semibold">
          O tempo para pagar acabou
        </h2>
        <p className="text-muted-foreground">
          O horário foi liberado. Se ainda quiser, escolha o horário de novo.
        </p>
        <Button type="button" size="lg" onClick={onRestart}>
          Escolher horário
        </Button>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="pix-sinal"
      className="grid gap-4 rounded-2xl border bg-card p-4 lg:mx-auto lg:w-full lg:max-w-xl lg:rounded-3xl lg:p-8"
    >
      <h2 id="pix-sinal" className="font-heading text-xl font-semibold">
        Pague o sinal para garantir o horário
      </h2>
      <p>
        Sinal de{" "}
        <span className="font-semibold">
          {formatCents(deposit.amountCents)}
        </span>{" "}
        por Pix. O horário fica guardado por{" "}
        <span className="font-semibold tabular-nums" aria-live="off">
          {clock(left)}
        </span>
        .
      </p>
      {deposit.pixPayload ? (
        <PixCode
          payload={deposit.pixPayload}
          qrImageBase64={deposit.qrImageBase64}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          O código do Pix aparece em Meus horários. Se não aparecer, fale com a
          clínica.
        </p>
      )}
      <p role="status" className="text-sm text-muted-foreground">
        Aguardando o pagamento. Esta tela atualiza sozinha.
      </p>
      <p className="text-sm text-muted-foreground">
        Devolvido se você desmarcar com mais de 24h de antecedência.
      </p>
    </section>
  );
}

// The QR Code and the "copia e cola" of a Pix, with its copy button. Also
// used by Meus horários while a deposit waits.
export function PixCode({
  payload,
  qrImageBase64,
}: {
  payload: string;
  qrImageBase64: string | null;
}) {
  const [copied, setCopied] = useState(false);

  const [copyFailed, setCopyFailed] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  }

  return (
    <div className="grid gap-3">
      {qrImageBase64 ? (
        // A data URL from Asaas: next/image adds nothing here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`data:image/png;base64,${qrImageBase64}`}
          alt="QR Code do Pix"
          width={220}
          height={220}
          className="mx-auto rounded-xl bg-white p-2"
        />
      ) : null}
      <p className="text-sm text-muted-foreground">
        Ou copie o código e cole no app do seu banco:
      </p>
      {/* One tap selects the whole code, for when the copy button can't
          reach the clipboard. */}
      <p className="rounded-xl bg-muted p-3 font-mono text-xs break-all select-all">
        {payload}
      </p>
      <Button type="button" size="lg" variant="outline" onClick={copy}>
        <Icon name="copy" />
        {copied ? "Código copiado" : "Copiar código Pix"}
      </Button>
      {copyFailed ? (
        <p role="alert" className="text-sm text-muted-foreground">
          Não deu para copiar sozinho. Toque no código acima para selecionar e
          copie.
        </p>
      ) : null}
    </div>
  );
}
