"use client";

import { Button } from "@/components/ui/button";

// Opens the browser's print dialog: print or "Salvar como PDF" to hand over.
export function PrintButton({ label = "Imprimir / PDF" }: { label?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="rounded-none print:hidden"
      onClick={() => window.print()}
    >
      {label}
    </Button>
  );
}
