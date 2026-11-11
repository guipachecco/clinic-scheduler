"use client";

import { bookingButtonClass } from "@/app/[slug]/home/booking-button";
import { pageThemeCss } from "@/app/[slug]/page-theme";
import { cn } from "@/lib/utils";
import type { PublishedPage } from "@/modules/page-builder/draft";
import { pageStyleVars } from "@/modules/page-style/fonts";

// A small copy of the top of the public page, fed by what the owner is
// choosing right now (published page + draft + the current step). Images come
// from the panel's own media route, so draft images show before publishing.

// Same rule as the public Hero (first letters of the first two words); not
// imported from it so that the panel bundle stays free of its date code.
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export function mediaSrc(id: string) {
  return `/admin/foto/${id}`;
}

export function PagePreview({
  page,
  name,
  large = false,
}: {
  page: PublishedPage;
  name: string;
  large?: boolean;
}) {
  const coverId = page.coverMediaId ?? page.gallery[0] ?? null;
  const vars = pageStyleVars(page.theme);
  // Same fallbacks as globals.css after the chosen family.
  vars["--font-heading"] = `${vars["--font-heading"]}, system-ui, sans-serif`;

  return (
    <section
      aria-label="Prévia da sua página"
      className="page-preview overflow-hidden rounded-2xl border bg-background text-foreground shadow-sm"
      style={vars as React.CSSProperties}
    >
      {/* Only a validated #rrggbb reaches the CSS (pageThemeCss). */}
      <style
        dangerouslySetInnerHTML={{
          __html: pageThemeCss(page.theme, ".page-preview"),
        }}
      />
      <div className="flex items-center gap-2 border-b bg-card px-3 py-2">
        {page.logoMediaId ? (
          // eslint-disable-next-line @next/next/no-img-element -- served by the panel media route
          <img
            src={mediaSrc(page.logoMediaId)}
            alt="Logo"
            className="h-6 w-auto max-w-24 shrink-0 object-contain"
          />
        ) : null}
        <span className="truncate font-heading text-sm font-semibold">
          {name}
        </span>
      </div>
      {coverId ? (
        // eslint-disable-next-line @next/next/no-img-element -- served by the panel media route
        <img
          src={mediaSrc(coverId)}
          alt="Foto de capa"
          className={cn(
            "w-full bg-muted object-cover",
            large ? "h-44" : "h-20",
          )}
        />
      ) : (
        <div
          className={cn(
            "flex items-center justify-center bg-muted text-xs text-muted-foreground",
            large ? "h-32" : "h-16",
          )}
        >
          Sem foto de capa
        </div>
      )}
      <div className={cn("grid px-3 pb-3", large ? "gap-3" : "gap-2")}>
        <div className="flex items-end gap-3">
          {page.ownerPhotoMediaId ? (
            // eslint-disable-next-line @next/next/no-img-element -- served by the panel media route
            <img
              src={mediaSrc(page.ownerPhotoMediaId)}
              alt="Foto de perfil"
              className={cn(
                "relative shrink-0 rounded-full border-4 border-background bg-card object-cover",
                large ? "-mt-10 size-20" : "-mt-7 size-14",
              )}
            />
          ) : (
            <span
              aria-hidden="true"
              className={cn(
                "relative flex shrink-0 items-center justify-center rounded-full border-4 border-background bg-primary font-heading font-semibold text-primary-foreground",
                large ? "-mt-10 size-20 text-2xl" : "-mt-7 size-14 text-lg",
              )}
            >
              {initials(name)}
            </span>
          )}
          <p
            className={cn(
              "min-w-0 font-heading leading-tight font-extrabold tracking-tight break-words",
              large ? "text-2xl" : "text-lg",
            )}
          >
            {name}
          </p>
        </div>
        {page.headline ? (
          <p className="font-heading text-sm font-semibold">{page.headline}</p>
        ) : null}
        {large && page.about ? (
          <p className="text-sm whitespace-pre-line text-muted-foreground">
            {page.about}
          </p>
        ) : null}
        {large && page.gallery.length > 0 ? (
          <ul className="grid grid-cols-3 gap-1.5" aria-label="Galeria">
            {page.gallery.map((id) => (
              <li key={id}>
                {/* eslint-disable-next-line @next/next/no-img-element -- served by the panel media route */}
                <img
                  src={mediaSrc(id)}
                  alt=""
                  className="aspect-square w-full rounded-lg bg-muted object-cover"
                />
              </li>
            ))}
          </ul>
        ) : null}
        <span
          data-testid="preview-booking-button"
          className={cn(
            bookingButtonClass(page.theme),
            !large && "min-h-11 text-sm",
          )}
        >
          Agendar horário
        </span>
      </div>
    </section>
  );
}
