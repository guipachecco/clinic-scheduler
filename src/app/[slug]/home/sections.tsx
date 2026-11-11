import type { Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AMENITY_LABELS } from "@/modules/clinic-page/fields";
import type { ClinicPage } from "@/modules/clinic-page/public";

import { AMENITY_ICONS, Icon, type IconName } from "../icons";
import { customColor } from "../page-theme";
import {
  clinicName,
  instagramUrl,
  mapsLink,
  priceLabel,
  whatsappUrl,
} from "../ui";

import { CopyPhone } from "./copy-phone";
import { WEEKDAY_NAMES } from "./open-status";
import { PhotoGallery } from "./photo-gallery";

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
    <section className="grid gap-3 pt-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-xl font-extrabold tracking-tight">
          {title}
        </h2>
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
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {amenities.map((key) => (
          <li key={key} className="inline-flex items-center gap-2 text-sm">
            <Icon
              name={AMENITY_ICONS[key]}
              className="size-5 shrink-0 text-primary-text"
            />
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
            <Link href={`/${page.slug}/avaliar`}>Avaliar</Link>
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
        <ul className="divide-y border-y">
          {reviews.slice(0, 10).map((review) => (
            <li key={review.id} className="py-3">
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
      <div className="flex items-center justify-between gap-3">
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
      <ul className="flex flex-wrap gap-x-1.5 gap-y-1 text-sm">
        {methods.map((name, index) => (
          <li key={name}>
            {name}
            {index < methods.length - 1 ? (
              <span aria-hidden="true" className="text-muted-foreground">
                {" "}
                ·
              </span>
            ) : null}
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
      className="inline-flex size-11 items-center justify-center rounded-full bg-secondary text-primary-text hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
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

// Shown only when the clinic has services (the home page drops the tab). A
// plain list, one line per service: name and duration on the left, the price
// on the right. With online booking on, the whole line opens the booking with
// that service chosen.
export function ServicesTab({ page }: { page: ClinicPage }) {
  return (
    <div className="grid gap-3">
      {!page.onlineBookingEnabled ? (
        <p className="text-sm text-muted-foreground">
          {page.whatsappPhone
            ? "Para marcar um horário, chame a clínica no WhatsApp."
            : "Para marcar um horário, fale com a clínica pelos contatos abaixo."}
        </p>
      ) : null}
      <ul className="divide-y border-b">
        {page.services.map((service) => {
          const price = priceLabel(service.priceDisplay, service.priceCents);
          const body = (
            <>
              <span className="min-w-0 flex-1">
                <span className="block font-heading text-base leading-snug font-bold">
                  {service.name}
                </span>
                <span className="text-sm text-muted-foreground">
                  {service.durationMinutes} min
                </span>
              </span>
              {price ? (
                <span className="shrink-0 text-right font-heading text-base font-extrabold">
                  {price}
                </span>
              ) : null}
            </>
          );
          return (
            <li key={service.id}>
              {page.onlineBookingEnabled ? (
                <Link
                  href={`/${page.slug}/marcar?servico=${service.id}` as Route}
                  aria-label={`Agendar ${service.name}${price ? `, ${price}` : ""}`}
                  className="flex min-h-16 items-center gap-3 py-3 outline-none hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {body}
                  <Icon
                    name="chevronRight"
                    className="size-5 shrink-0 text-primary-text"
                  />
                </Link>
              ) : (
                <div className="flex min-h-16 items-center gap-3 py-3">
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// The one strong action of the page, fixed above the bottom navigation:
// "Marcar horário", or the clinic's WhatsApp when online booking is off.
export function BookingBar({ page }: { page: ClinicPage }) {
  const className = cn(
    // The shape the owner chose (--radius-button, page-theme.tsx).
    "flex min-h-13 w-full items-center justify-center gap-2 rounded-[var(--radius-button)] font-heading text-base font-extrabold shadow-[0_0_0_4px_var(--background)] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
    page.theme.buttonFill === "outline"
      ? // The page background behind the outline keeps the label readable
        // over the content that scrolls under the fixed bar.
        "border-2 border-primary-text bg-background text-primary-text hover:bg-muted"
      : customColor(page.theme)
        ? // The owner's color, in both themes.
          "bg-primary text-primary-foreground hover:bg-primary-pressed"
        : // Purple in the light theme, the Zemana yellow in the dark one.
          "bg-primary text-primary-foreground hover:bg-primary-pressed dark:bg-highlight dark:text-highlight-foreground dark:hover:bg-highlight/90",
  );
  let action: React.ReactNode = null;
  if (page.onlineBookingEnabled) {
    action = (
      <Link href={`/${page.slug}/marcar` as Route} className={className}>
        Marcar horário
      </Link>
    );
  } else if (page.whatsappPhone) {
    action = (
      <a
        href={whatsappUrl(page.whatsappPhone)}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        <Icon name="whatsapp" />
        Chamar no WhatsApp
      </a>
    );
  }
  if (!action) return null;
  return (
    <>
      {/* Keeps the last section clear of the fixed bar. */}
      <div aria-hidden="true" className="h-16" />
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10">
        <div className="mx-auto w-full max-w-md px-4 pb-3">{action}</div>
      </div>
    </>
  );
}

export function PhotosTab({ page }: { page: ClinicPage }) {
  if (page.photos.length > 0) {
    return (
      <PhotoGallery
        slug={page.slug}
        clinicName={clinicName(page)}
        photos={page.photos}
      />
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border bg-card p-6 text-center text-muted-foreground">
      <Icon name="image" className="size-6 shrink-0" />
      <p>Fotos em breve</p>
    </div>
  );
}

// The rule always; with a signed-in client, her stamp card or her prize.
// Signed out, a link to sign in and see the card.
export function LoyaltyTab({
  slug,
  loyalty,
  progress,
  needsRecord,
}: {
  slug: string;
  loyalty: NonNullable<ClinicPage["loyalty"]>;
  progress: { stamps: number; prize: boolean } | null;
  // Signed in, but without a record in this clinic yet.
  needsRecord: boolean;
}) {
  const back = encodeURIComponent(`/${slug}`);
  return (
    <div className="grid gap-3 rounded-2xl bg-primary p-4 text-primary-foreground">
      <b className="flex items-center gap-2">
        <Icon name="gift" />
        Cartão fidelidade
      </b>
      <p className="text-sm">
        A cada {loyalty.visits} atendimentos concluídos, você ganha:{" "}
        <span className="font-semibold">{loyalty.reward}</span>
      </p>
      {progress ? (
        progress.prize ? (
          <p className="rounded-xl bg-primary-foreground/15 p-3 text-sm font-semibold">
            Você ganhou: {loyalty.reward}. Avise na próxima visita.
          </p>
        ) : (
          <div className="grid gap-2">
            <ul aria-hidden="true" className="flex flex-wrap gap-1.5">
              {Array.from({ length: loyalty.visits }, (_, index) => (
                <li
                  key={index}
                  className={
                    index < progress.stamps
                      ? "flex size-7 items-center justify-center rounded-full bg-primary-foreground text-primary"
                      : "size-7 rounded-full border border-primary-foreground/50"
                  }
                >
                  {index < progress.stamps ? (
                    <Icon name="check" className="size-4" />
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="text-sm font-semibold">
              {progress.stamps} de {loyalty.visits}
            </p>
          </div>
        )
      ) : needsRecord ? (
        <Link
          href={`/${slug}/cadastro?completar=1&next=${back}` as Route}
          className="text-sm font-semibold underline underline-offset-4"
        >
          Complete seu cadastro para ver o seu cartão
        </Link>
      ) : (
        <Link
          href={`/${slug}/entrar?next=${back}` as Route}
          className="text-sm font-semibold underline underline-offset-4"
        >
          Entrar para ver o seu cartão
        </Link>
      )}
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
    <ul className="divide-y border-b">
      {products.map((product) => (
        <li key={product.id} className="flex min-h-16 items-center gap-3 py-3">
          <div className="min-w-0 flex-1">
            <b className="block font-heading text-base leading-snug">
              {product.name}
            </b>
            {product.description ? (
              <p className="text-sm text-muted-foreground">
                {product.description}
              </p>
            ) : null}
          </div>
          {product.priceCents !== null ? (
            <span className="shrink-0 font-heading text-base font-extrabold">
              {money.format(product.priceCents / 100)}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

// Whether the Sobre tab has anything to show (otherwise the page drops it).
export function hasAbout(page: ClinicPage): boolean {
  return Boolean(
    page.headline ||
    page.about ||
    page.professionalName ||
    page.professionalRegistration,
  );
}

export function AboutTab({ page }: { page: ClinicPage }) {
  const hasProfessional =
    page.professionalName || page.professionalRegistration;
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
