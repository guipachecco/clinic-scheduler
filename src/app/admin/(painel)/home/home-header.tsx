import type { Route } from "next";
import Link from "next/link";

// Greeting, the date in full, the owner photo (or initials) and the
// "N avisos" pill.
export function HomeHeader({
  greeting,
  firstName,
  dateLabel,
  photoId,
  alerts,
  alertsHref,
}: {
  greeting: string;
  firstName: string;
  dateLabel: string;
  photoId: string | null;
  alerts: number;
  alertsHref: Route;
}) {
  return (
    <div className="flex items-center gap-3">
      {photoId ? (
        // eslint-disable-next-line @next/next/no-img-element -- served by the panel photo route handler
        <img
          src={`/admin/foto/${photoId}`}
          alt=""
          className="size-12 shrink-0 rounded-full bg-card object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-accent font-heading text-lg font-extrabold text-brand-accent-foreground"
        >
          {firstName.charAt(0).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="font-heading text-xl leading-tight font-bold tracking-tight">
          {greeting}, {firstName}
        </h1>
        <p className="text-sm text-muted-foreground">{dateLabel}</p>
      </div>
      {alerts > 0 ? (
        <Link
          href={alertsHref}
          className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-highlight px-3 text-sm font-bold text-highlight-foreground"
        >
          {alerts} {alerts === 1 ? "aviso" : "avisos"}
        </Link>
      ) : null}
    </div>
  );
}
