import Image from "next/image";

import { cn } from "@/lib/utils";

const SOURCES = {
  logo: { light: "/marca/logo-marinho.png", dark: "/marca/logo-preto.png" },
  symbol: {
    light: "/marca/simbolo-marinho.png",
    dark: "/marca/simbolo-preto.png",
  },
};

// Brand artwork with a solid background: navy in the light theme, black and
// cyan in the dark one. Both are rendered and CSS shows the one that matches.
export function BrandImage({
  kind,
  alt,
  size,
  className,
}: {
  kind: keyof typeof SOURCES;
  alt: string;
  size: number;
  className?: string;
}) {
  return (
    <>
      <Image
        src={SOURCES[kind].light}
        alt={alt}
        width={size}
        height={size}
        preload
        className={cn("dark:hidden", className)}
      />
      <Image
        src={SOURCES[kind].dark}
        alt={alt}
        width={size}
        height={size}
        className={cn("hidden dark:block", className)}
      />
    </>
  );
}
