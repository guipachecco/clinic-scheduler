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

// Top of the clinic page: the space's photos area (empty for now), the
// owner's photo or initials, the name, the area and the open/closed line.
export function Hero({ page, now }: { page: ClinicPage; now: Date }) {
  const name = clinicName(page);
  const status = openStatus(page.hours, page.timezone, now);

  return (
    <header className="grid gap-0">
      <div
        className="flex h-36 flex-col items-center justify-center gap-1 rounded-2xl border bg-muted text-muted-foreground"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, transparent 0 10px, color-mix(in srgb, currentColor 6%, transparent) 10px 20px)",
        }}
      >
        <Icon name="image" className="size-6 shrink-0" />
        <span className="text-sm">Fotos em breve</span>
      </div>
      <div className="relative -mt-8 flex items-end gap-3 px-3">
        {page.hasOwnerPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- served by the /foto route handler
          <img
            src={`/${page.slug}/foto`}
            alt=""
            className="size-16 shrink-0 rounded-full border-[3px] border-background bg-card object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex size-16 shrink-0 items-center justify-center rounded-full border-[3px] border-background bg-primary font-heading text-xl font-semibold text-primary-foreground"
          >
            {initials(name)}
          </div>
        )}
        <div className="min-w-0 pb-1">
          <h1 className="truncate font-heading text-xl font-semibold">
            {name}
          </h1>
        </div>
      </div>
      <div className="grid gap-0.5 px-3 pt-1 text-sm text-muted-foreground">
        {page.areaLabel ? <p>{page.areaLabel}</p> : null}
        <p
          className={
            status.open ? "font-semibold text-status-confirmed-foreground" : ""
          }
        >
          {status.label}
        </p>
      </div>
    </header>
  );
}
