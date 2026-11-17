"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

import { ConnectForm } from "./connect-form";

// "Trocar chave": opens the same connection form in place.
export function ReplaceKey() {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        onClick={() => setOpen(true)}
      >
        Trocar chave
      </Button>
    );
  }
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Gere uma chave nova no Asaas e cole aqui. Use uma chave da mesma conta.
      </p>
      <ConnectForm onConnected={() => setOpen(false)} />
      <Button
        type="button"
        variant="ghost"
        className="w-fit"
        onClick={() => setOpen(false)}
      >
        Cancelar
      </Button>
    </div>
  );
}
