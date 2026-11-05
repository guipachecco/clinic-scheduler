import type { PublicClinic } from "@/modules/clients/context";

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

export function ClinicContacts({ clinic }: { clinic: PublicClinic }) {
  if (!clinic.whatsappPhone && !clinic.contactEmail) return null;
  return (
    <ul className="grid gap-2">
      {clinic.whatsappPhone ? (
        <li>
          <a
            href={whatsappUrl(clinic.whatsappPhone)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary underline underline-offset-4"
          >
            Falar no WhatsApp
          </a>
        </li>
      ) : null}
      {clinic.contactEmail ? (
        <li>
          <a
            href={`mailto:${clinic.contactEmail}`}
            className="font-semibold break-all text-primary underline underline-offset-4"
          >
            {clinic.contactEmail}
          </a>
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
