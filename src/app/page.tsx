import Image from "next/image";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-6 py-16">
      <Image
        src="/marca/logo-marinho.png"
        alt="Grais Saúde Integrativa"
        width={160}
        height={160}
        preload
        className="size-40 rounded-2xl"
      />
      <h1 className="text-3xl font-semibold tracking-tight">
        Site em construção
      </h1>
      <p className="text-muted-foreground">
        Em breve, as informações da clínica e o agendamento online estarão
        disponíveis aqui.
      </p>
    </main>
  );
}
