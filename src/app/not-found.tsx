import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">
        Página não encontrada
      </h1>
      <p className="text-muted-foreground">
        O endereço pode estar incorreto ou a página pode ter sido removida.
      </p>
      <Link href="/" className="text-sm font-medium underline">
        Voltar ao início
      </Link>
    </main>
  );
}
