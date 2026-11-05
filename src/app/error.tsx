"use client";

import { Button } from "@/components/ui/button";
import { BrandImage } from "@/components/brand-image";

export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-6 py-16">
      <BrandImage kind="horizontal" size={140} />
      <h1 className="text-2xl font-semibold tracking-tight">Algo deu errado</h1>
      <p className="text-muted-foreground">
        Não foi possível carregar esta página. Tente novamente em instantes.
      </p>
      <div>
        <Button onClick={() => retry()}>Tentar novamente</Button>
      </div>
    </main>
  );
}
