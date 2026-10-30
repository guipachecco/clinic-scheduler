import { BrandImage } from "@/components/brand-image";
import { ThemeToggle } from "@/components/theme-toggle";
import { getTheme } from "@/lib/theme-server";

export default async function AccessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = await getTheme();

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center bg-brand px-4 py-10">
      <ThemeToggle initialTheme={theme} className="absolute top-4 right-4" />
      <div className="flex w-full max-w-md flex-col items-center gap-2">
        <BrandImage
          kind="logo"
          alt="Grais Saúde Integrativa"
          size={300}
          className="-my-10 size-[300px]"
        />
        <div className="w-full">{children}</div>
      </div>
    </main>
  );
}
