import Image from "next/image";

export default function AccessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-primary px-4 py-10">
      <div className="flex w-full max-w-md flex-col items-center gap-2">
        <Image
          src="/marca/logo-marinho.png"
          alt="Grais Saúde Integrativa"
          width={300}
          height={300}
          preload
          className="-my-10 size-[300px]"
        />
        <div className="w-full">{children}</div>
      </div>
    </main>
  );
}
