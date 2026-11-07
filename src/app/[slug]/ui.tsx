import type { PublicClinic } from "@/modules/clients/context";

import { Icon, type IconName } from "./icons";

// Small pieces shared by the clinic link's pages.

export function clinicName(clinic: Pick<PublicClinic, "name" | "displayName">) {
  return clinic.displayName ?? clinic.name;
}

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

// The price as the clinic chose to show it; null when hidden.
export function priceLabel(
  display: "fixed" | "starting_at" | "on_request" | "hidden",
  cents: number | null,
): string | null {
  if (display === "on_request") return "Sob consulta";
  if (display === "hidden" || cents === null) return null;
  const value = money.format(cents / 100);
  return display === "starting_at" ? `A partir de ${value}` : value;
}

// https://wa.me/<digits> for a stored E.164 number.
export function whatsappUrl(e164: string) {
  return `https://wa.me/${e164.replace(/\D/g, "")}`;
}

// https://www.instagram.com/<handle>/ for a stored handle.
export function instagramUrl(handle: string) {
  return `https://www.instagram.com/${handle}/`;
}

// The clinic's own map link, else a Google Maps search of its address; null
// when it has neither.
export function mapsLink(
  clinic: Pick<PublicClinic, "mapsUrl" | "address">,
): string | null {
  if (clinic.mapsUrl) return clinic.mapsUrl;
  if (clinic.address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clinic.address)}`;
  }
  return null;
}

function ContactLink({
  href,
  icon,
  external = false,
  className = "",
  children,
}: {
  href: string;
  icon: IconName;
  external?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={`inline-flex items-center gap-2 font-semibold text-primary underline underline-offset-4 ${className}`}
    >
      <Icon name={icon} />
      {children}
    </a>
  );
}

export function ClinicContacts({ clinic }: { clinic: PublicClinic }) {
  if (!clinic.whatsappPhone && !clinic.contactEmail) return null;
  return (
    <ul className="grid gap-2">
      {clinic.whatsappPhone ? (
        <li>
          <ContactLink
            href={whatsappUrl(clinic.whatsappPhone)}
            icon="whatsapp"
            external
          >
            Falar no WhatsApp
          </ContactLink>
        </li>
      ) : null}
      {clinic.contactEmail ? (
        <li>
          <ContactLink
            href={`mailto:${clinic.contactEmail}`}
            icon="mail"
            className="break-all"
          >
            {clinic.contactEmail}
          </ContactLink>
        </li>
      ) : null}
    </ul>
  );
}

export function Unavailable({ clinic }: { clinic: PublicClinic }) {
  return (
    <section className="grid gap-3 rounded-2xl border bg-card p-5">
      <h1 className="font-heading text-xl font-semibold">
        Agendamento online indisponível
      </h1>
      <p className="text-muted-foreground">
        Para marcar um horário, fale com {clinicName(clinic)}.
      </p>
      <ClinicContacts clinic={clinic} />
    </section>
  );
}

export function PageTitle({
  children,
  description,
}: {
  children: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        {children}
      </h1>
      {description ? (
        <p className="text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
