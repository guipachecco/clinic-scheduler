import type { ClinicPage } from "@/modules/clinic-page/public";

import { Icon } from "../icons";
import { clinicName } from "../ui";

import { openStatus } from "./open-status";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

// The image at the top of the page: the cover the owner published, else the
// first photo of the gallery (also what a shared link shows).
export function coverImage(
  page: ClinicPage,
): { src: string; width: number; height: number } | null {
  if (page.cover) {
    const version = page.coverVersion ? `?v=${page.coverVersion}` : "";
    return { src: `/${page.slug}/capa${version}`, ...page.cover };
  }
  const photo = page.photos[0];
  return photo
    ? {
        src: `/${page.slug}/fotos/${photo.id}`,
        width: photo.width,
        height: photo.height,
      }
    : null;
}

const score = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

// Top of the clinic page, kept calm on purpose: the cover photo edge to edge,
// the owner's photo on its lower edge, the name large, one tilted Zemana
// sticker with the area, and a single line with the open/closed status and
// the review score.
export function Hero({ page, now }: { page: ClinicPage; now: Date }) {
  const name = clinicName(page);
  const status = openStatus(page.hours, page.timezone, now);
  const cover = coverImage(page);
  const { average, total } = page.reviewSummary;

  return (
    <header className="grid">
      {/* -mx-4 -mt-6 undo the page padding (layout.tsx) so the photo runs
          edge to edge in the column. */}
      <div className="-mx-4 -mt-6">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- served by the /capa and /fotos route handlers
          <img
            src={cover.src}
            alt={`Espaço de ${name}`}
            width={cover.width}
            height={cover.height}
            fetchPriority="high"
            className="h-56 w-full bg-muted object-cover"
          />
        ) : (
          <div
            className="flex h-40 flex-col items-center justify-center gap-1 bg-muted text-muted-foreground"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, transparent 0 10px, color-mix(in srgb, currentColor 6%, transparent) 10px 20px)",
            }}
          >
            <Icon name="image" className="size-6 shrink-0" />
            <span className="text-sm">Fotos em breve</span>
          </div>
        )}
      </div>

      {page.hasOwnerPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- served by the /foto route handler
        <img
          src={`/${page.slug}/foto`}
          alt=""
          className="relative -mt-10 size-20 rounded-full border-4 border-background bg-card object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="relative -mt-10 flex size-20 items-center justify-center rounded-full border-4 border-background bg-primary font-heading text-2xl font-semibold text-primary-foreground"
        >
          {initials(name)}
        </div>
      )}

      <h1 className="mt-3 font-heading text-[2rem] leading-none font-extrabold tracking-tight">
        {name}
      </h1>

      {page.areaLabel ? (
        <p className="mt-3">
          {/* The one Zemana touch: brand colours in both themes. */}
          <span className="inline-block -rotate-3 rounded-full border-2 border-[#2a0081] bg-[#ffd3f0] px-3 py-0.5 font-heading text-xs font-extrabold tracking-wide text-[#2a0081] uppercase">
            {page.areaLabel}
          </span>
        </p>
      ) : null}

      <p className="mt-3 text-sm text-muted-foreground">
        <span className={status.open ? "font-semibold text-primary-text" : ""}>
          {status.label}
        </span>
        {average !== null ? (
          <>
            {" · "}
            <span className="inline-flex items-center gap-1 align-[-2px]">
              <Icon name="starFilled" className="size-3.5 text-highlight" />
              <b className="text-foreground">{score.format(average)}</b>
              <span>({total})</span>
              <span className="sr-only">
                {total === 1 ? " avaliação" : " avaliações"}
              </span>
            </span>
          </>
        ) : null}
      </p>
    </header>
  );
}
