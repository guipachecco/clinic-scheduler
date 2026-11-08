import { initialsFor } from "@/modules/branding/palettes";
import type { PublicClinicCard } from "@/modules/clients/my-clinics";

import { Icon } from "../[slug]/icons";

// The top of a clinic's card on the Zemana pages (the clinic list and "Suas
// clínicas"): the cover photo (or a neutral area), the owner's photo or
// initials over it, the name and the area.
export function ClinicCardHeader({
  clinic,
  badge,
  headingLevel = 2,
}: {
  clinic: PublicClinicCard;
  // Shown on the cover's corner (the review score).
  badge?: React.ReactNode;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="grid">
      <div className="relative">
        {clinic.coverPhotoId ? (
          // eslint-disable-next-line @next/next/no-img-element -- served by the /fotos route handler
          <img
            src={`/${clinic.slug}/fotos/${clinic.coverPhotoId}`}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-28 w-full rounded-xl bg-muted object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-28 items-center justify-center rounded-xl bg-muted text-muted-foreground"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, transparent 0 10px, color-mix(in srgb, currentColor 6%, transparent) 10px 20px)",
            }}
          >
            <Icon name="image" className="size-6" />
          </div>
        )}
        {badge ? (
          <div className="absolute top-2 right-2 rounded-full bg-background/90 px-2 py-0.5 text-xs font-semibold text-foreground">
            {badge}
          </div>
        ) : null}
      </div>
      <div className="relative -mt-7 flex items-end gap-3 px-2">
        {clinic.hasPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- served by the /foto route handler
          <img
            src={`/${clinic.slug}/foto`}
            alt=""
            className="size-14 shrink-0 rounded-full border-[3px] border-card bg-card object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex size-14 shrink-0 items-center justify-center rounded-full border-[3px] border-card bg-primary font-heading text-lg font-semibold text-primary-foreground"
          >
            {initialsFor(clinic.name)}
          </div>
        )}
        <div className="min-w-0 pb-0.5">
          <Heading className="truncate font-heading text-lg font-semibold">
            {clinic.name}
          </Heading>
          {clinic.areaLabel ? (
            <p className="truncate text-sm text-muted-foreground">
              {clinic.areaLabel}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
