import Image from "next/image";

import { cn } from "@/lib/utils";

type Variant = { src: string; width: number; height: number };

// Zemana logo files cropped from the brand manual. "light" is for light
// backgrounds (purple symbol); "onDark" is for purple or dark backgrounds
// (yellow symbol, white name). Never redraw or recolor them.
const SOURCES: Record<
  "vertical" | "horizontal" | "symbol",
  { light: Variant; onDark: Variant }
> = {
  vertical: {
    light: {
      src: "/marca/zemana-vertical.png",
      width: 1574,
      height: 1352,
    },
    onDark: {
      src: "/marca/zemana-vertical-fundo-escuro.png",
      width: 1502,
      height: 1298,
    },
  },
  horizontal: {
    light: {
      src: "/marca/zemana-horizontal.png",
      width: 2156,
      height: 578,
    },
    onDark: {
      src: "/marca/zemana-horizontal-fundo-escuro.png",
      width: 2156,
      height: 578,
    },
  },
  symbol: {
    light: { src: "/marca/zemana-simbolo.png", width: 884, height: 883 },
    onDark: {
      src: "/marca/zemana-simbolo-fundo-escuro.png",
      width: 868,
      height: 867,
    },
  },
};

// The Zemana logo. `size` is the rendered width in px (logos stay at 120 px or
// more, the symbol at 16 px or more). On a surface that is always purple pass
// `onBrand`; elsewhere both files render and CSS picks one by theme.
export function BrandImage({
  kind,
  size,
  onBrand = false,
  className,
}: {
  kind: keyof typeof SOURCES;
  size: number;
  onBrand?: boolean;
  className?: string;
}) {
  const { light, onDark } = SOURCES[kind];
  const imageClass = cn("h-auto max-w-full", className);
  const style = { width: size };

  if (onBrand) {
    return (
      <Image
        src={onDark.src}
        alt="Zemana"
        width={onDark.width}
        height={onDark.height}
        style={style}
        preload
        className={imageClass}
      />
    );
  }

  return (
    <>
      <Image
        src={light.src}
        alt="Zemana"
        width={light.width}
        height={light.height}
        style={style}
        preload
        className={cn("dark:hidden", imageClass)}
      />
      <Image
        src={onDark.src}
        alt="Zemana"
        width={onDark.width}
        height={onDark.height}
        style={style}
        className={cn("hidden dark:block", imageClass)}
      />
    </>
  );
}
