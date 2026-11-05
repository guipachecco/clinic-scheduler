import { BrandImage } from "@/components/brand-image";
import { ThemeToggle } from "@/components/theme-toggle";
import { getTheme } from "@/lib/theme-server";

// Sign-in is shown before any clinic is known, so it shows the Zemana brand.
export default async function AccessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = await getTheme();

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center bg-brand px-4 py-10">
      <ThemeToggle initialTheme={theme} className="absolute top-4 right-4" />
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <BrandImage kind="vertical" size={160} onBrand />
        <div className="w-full">{children}</div>
      </div>
    </main>
  );
}
