import type { Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { AMENITY_LABELS } from "@/modules/clinic-page/fields";
import type { ClinicPage } from "@/modules/clinic-page/public";

import { AMENITY_ICONS, Icon, type IconName } from "../icons";
import { instagramUrl, mapsLink, priceLabel, whatsappUrl } from "../ui";

import { CopyPhone } from "./copy-phone";
import { WEEKDAY_NAMES } from "./open-status";

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="inline-flex text-highlight" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon
          key={n}
          name={n <= full ? "starFilled" : "star"}
          className="size-4 shrink-0"
        />
      ))}
    </span>
  );
}

export function Amenities({
  amenities,
}: {
  amenities: ClinicPage["amenities"];
}) {
  if (amenities.length === 0) return null;
  return (
    <Section title="Comodidades">
      <ul className="flex flex-wrap gap-2">
        {amenities.map((key) => (
          <li
            key={key}
            className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm"
          >
            <Icon name={AMENITY_ICONS[key]} className="size-4 shrink-0" />
            {AMENITY_LABELS[key]}
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function Reviews({
  page,
  canReview,
}: {
  page: ClinicPage;
  canReview: boolean;
}) {
  const { reviews, reviewSummary } = page;
  if (reviews.length === 0 && !canReview) return null;
  const date = new Intl.DateTimeFormat("pt-BR", {
    timeZone: page.timezone,
    dateStyle: "short",
  });
  return (
    <Section
      title="Avaliações"
      action={
        canReview ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/${page.slug}/avaliar` as Route}>Avaliar</Link>
          </Button>
        ) : undefined
      }
    >
      {reviewSummary.average !== null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Stars value={reviewSummary.average} />
          <span>
            <b className="text-foreground">
              {reviewSummary.average.toLocaleString("pt-BR", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}
            </b>{" "}
            · {reviewSummary.total}{" "}
            {reviewSummary.total === 1 ? "avaliação" : "avaliações"}
          </span>
        </p>
      ) : null}
      {reviews.length > 0 ? (
        <ul className="grid gap-2">
          {reviews.slice(0, 10).map((review) => (
            <li key={review.id} className="rounded-xl border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <b className="text-sm">{review.author}</b>
                <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <Stars value={review.rating} />
                  <span className="sr-only">{`Nota ${review.rating} de 5`}</span>
                  {date.format(review.createdAt)}
                </span>
              </div>
              {review.comment ? (
                <p className="mt-1 text-sm">{review.comment}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

export function Location({ page }: { page: ClinicPage }) {
  const href = mapsLink(page);
  if (!page.address && !href) return null;
  return (
    <Section title="Localização">
      <div className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3">
        <p className="min-w-0 text-sm">{page.address ?? "Ver no mapa"}</p>
        {href ? (
          <Button asChild size="sm" variant="outline">
            <a href={href} target="_blank" rel="noopener noreferrer">
              <Icon name="map" />
              Mapa
            </a>
          </Button>
        ) : null}
      </div>
    </Section>
  );
}

// Week from Monday; weekday 0 is Sunday.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function Hours({ page, today }: { page: ClinicPage; today: number }) {
  if (page.hours.every((day) => day.intervals.length === 0)) return null;
  return (
    <Section title="Horário de atendimento">
      <ul className="grid">
        {WEEK_ORDER.map((weekday) => {
          const day = page.hours.find((d) => d.weekday === weekday);
          const intervals = day?.intervals ?? [];
          const name = WEEKDAY_NAMES[weekday]!;
          return (
            <li
              key={weekday}
              className="flex items-center justify-between gap-3 border-b py-2 text-sm"
            >
              <span className="flex items-center gap-2">
                <span className={weekday === today ? "font-semibold" : ""}>
                  {name.charAt(0).toUpperCase() + name.slice(1)}
                </span>
                {weekday === today ? (
                  <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                    Hoje
                  </span>
                ) : null}
              </span>
              <span className="text-muted-foreground">
                {intervals.length === 0
                  ? "Fechado"
                  : intervals.map((i) => `${i.start} – ${i.end}`).join(" · ")}
              </span>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function PaymentMethods({ methods }: { methods: string[] }) {
  if (methods.length === 0) return null;
  return (
    <Section title="Formas de pagamento">
      <ul className="flex flex-wrap gap-2">
        {methods.map((name) => (
          <li
            key={name}
            className="rounded-full border bg-card px-3 py-1.5 text-sm"
          >
            {name}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function RoundLink({
  href,
  icon,
  label,
  external,
}: {
  href: string;
  icon: IconName;
  label: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      aria-label={label}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="inline-flex size-11 items-center justify-center rounded-full bg-secondary text-primary hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <Icon name={icon} />
    </a>
  );
}

// "+5511987650001" -> "+55 11 98765-0001" (falls back to the stored value).
export function formatPhone(e164: string) {
  const match = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(e164);
  return match ? `+55 ${match[1]} ${match[2]}-${match[3]}` : e164;
}

export function Contacts({ page }: { page: ClinicPage }) {
  if (!page.whatsappPhone && !page.instagramHandle && !page.contactEmail) {
    return null;
  }
  return (
    <Section title="Redes e contato">
      <div className="flex gap-3">
        {page.whatsappPhone ? (
          <RoundLink
            href={whatsappUrl(page.whatsappPhone)}
            icon="whatsapp"
            label="WhatsApp"
            external
          />
        ) : null}
        {page.instagramHandle ? (
          <RoundLink
            href={instagramUrl(page.instagramHandle)}
            icon="instagram"
            label="Instagram"
            external
          />
        ) : null}
        {page.contactEmail ? (
          <RoundLink
            href={`mailto:${page.contactEmail}`}
            icon="mail"
            label="E-mail"
          />
        ) : null}
      </div>
      {page.whatsappPhone ? (
        <CopyPhone
          phone={page.whatsappPhone}
          label={formatPhone(page.whatsappPhone)}
        />
      ) : null}
    </Section>
  );
}

// ---- Tab contents ----

export function ServicesTab({ page }: { page: ClinicPage }) {
  if (page.services.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum serviço disponível no momento.
      </p>
    );
  }
  return (
    <div className="grid gap-3">
      {!page.onlineBookingEnabled ? (
        <p className="text-sm text-muted-foreground">
          Para marcar um horário, fale com a clínica pelos contatos abaixo.
        </p>
      ) : null}
      <ul className="grid gap-2">
        {page.services.map((service) => {
          const price = priceLabel(service.priceDisplay, service.priceCents);
          return (
            <li
              key={service.id}
              className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3"
            >
              <div className="min-w-0">
                <b className="block">{service.name}</b>
                <span className="text-sm text-muted-foreground">
                  {price ? (
                    <span className="font-semibold text-status-confirmed-foreground">
                      {price}
                    </span>
                  ) : null}
                  {price ? " · " : ""}
                  {service.durationMinutes} min
                </span>
              </div>
              {page.onlineBookingEnabled ? (
                <Button asChild size="sm">
                  <Link
                    href={`/${page.slug}/marcar?servico=${service.id}` as Route}
                  >
                    Agendar
                  </Link>
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PhotosTab() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border bg-card p-6 text-center text-muted-foreground">
      <Icon name="image" className="size-6 shrink-0" />
      <p>Fotos em breve</p>
    </div>
  );
}

export function LoyaltyTab({
  loyalty,
}: {
  loyalty: NonNullable<ClinicPage["loyalty"]>;
}) {
  return (
    <div className="grid gap-1 rounded-2xl bg-primary p-4 text-primary-foreground">
      <b className="flex items-center gap-2">
        <Icon name="gift" />
        Cartão fidelidade
      </b>
      <p className="text-sm">
        A cada {loyalty.visits} atendimentos concluídos, você ganha:{" "}
        <span className="font-semibold">{loyalty.reward}</span>
      </p>
    </div>
  );
}

export function ProductsTab({
  products,
}: {
  products: ClinicPage["products"];
}) {
  const money = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  return (
    <ul className="grid gap-2">
      {products.map((product) => (
        <li
          key={product.id}
          className="flex items-center gap-3 rounded-xl border bg-card p-3"
        >
          <div
            aria-hidden="true"
            className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
          >
            <Icon name="bag" />
          </div>
          <div className="min-w-0">
            <b className="block">{product.name}</b>
            {product.priceCents !== null ? (
              <span className="text-sm font-semibold text-status-confirmed-foreground">
                {money.format(product.priceCents / 100)}
              </span>
            ) : null}
            {product.description ? (
              <p className="text-sm text-muted-foreground">
                {product.description}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AboutTab({ page }: { page: ClinicPage }) {
  const hasProfessional =
    page.professionalName || page.professionalRegistration;
  if (!page.headline && !page.about && !hasProfessional) {
    return (
      <p className="text-sm text-muted-foreground">
        A clínica ainda não preencheu esta seção.
      </p>
    );
  }
  return (
    <div className="grid gap-3">
      {page.headline ? (
        <p className="font-heading text-lg font-semibold">{page.headline}</p>
      ) : null}
      {page.about ? (
        <p className="text-sm whitespace-pre-line">{page.about}</p>
      ) : null}
      {hasProfessional ? (
        <p className="text-sm text-muted-foreground">
          {page.professionalName}
          {page.professionalName && page.professionalRegistration ? " · " : ""}
          {page.professionalRegistration}
        </p>
      ) : null}
    </div>
  );
}
