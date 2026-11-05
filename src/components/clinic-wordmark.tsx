import { initialsFor } from "@/modules/branding/palettes";

// Name of a clinic without brand artwork: monogram, name and area.
export function ClinicWordmark({
  displayName,
  areaLabel,
}: {
  displayName: string;
  areaLabel: string | null;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-accent font-wordmark text-lg font-semibold text-brand-accent-foreground"
      >
        {initialsFor(displayName)}
      </span>
      <div className="min-w-0 leading-tight">
        <p className="font-wordmark text-xl font-semibold break-words">
          {displayName}
        </p>
        {areaLabel ? (
          <p className="text-[0.65rem] font-medium tracking-[0.2em] uppercase opacity-80">
            {areaLabel}
          </p>
        ) : null}
      </div>
    </div>
  );
}
