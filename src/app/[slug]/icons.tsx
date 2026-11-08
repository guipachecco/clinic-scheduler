import type { Amenity } from "@/modules/clinic-page/fields";

export type IconName =
  | "home"
  | "calendar"
  | "clock"
  | "person"
  | "wifi"
  | "parking"
  | "accessibility"
  | "snowflake"
  | "coffee"
  | "restroom"
  | "kids"
  | "paw"
  | "star"
  | "starFilled"
  | "map"
  | "whatsapp"
  | "instagram"
  | "mail"
  | "phone"
  | "copy"
  | "chevronLeft"
  | "chevronRight"
  | "image"
  | "gift"
  | "bag"
  | "check"
  | "close"
  | "plus";

// Stroke icons in the style of the panel's (src/app/admin/(painel)/panel-nav.tsx).
const PATHS: Record<IconName, React.ReactNode> = {
  home: <path d="M4 11.5 12 5l8 6.5V20H4z" />,
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1-4 4-6 7-6s6 2 7 6" />
    </>
  ),
  wifi: (
    <>
      <path d="M3 9.5a13 13 0 0 1 18 0M6 13a8.5 8.5 0 0 1 12 0M9 16.5a4 4 0 0 1 6 0" />
      <circle cx="12" cy="19.5" r="0.6" />
    </>
  ),
  parking: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M9.5 16.5V7.5h3a2.75 2.75 0 0 1 0 5.5h-3" />
    </>
  ),
  accessibility: (
    <>
      <circle cx="12" cy="5" r="1.6" />
      <path d="M6 9h12M12 9v5l-3 6M12 14l3 6" />
    </>
  ),
  snowflake: (
    <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5" />
  ),
  coffee: (
    <>
      <path d="M5 9h11v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" />
      <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2M12 3.5v2" />
    </>
  ),
  restroom: (
    <>
      <circle cx="8" cy="5" r="1.5" />
      <circle cx="16" cy="5" r="1.5" />
      <path d="M8 8.5v6M5.5 20v-5.5h5V20M16 8.5l-3 6h6zM16 14.5V20" />
    </>
  ),
  kids: (
    <>
      <circle cx="12" cy="7" r="3" />
      <path d="M6 20v-3a6 6 0 0 1 12 0v3M10.5 7h.01M13.5 7h.01" />
    </>
  ),
  paw: (
    <>
      <circle cx="6.5" cy="11" r="1.7" />
      <circle cx="10" cy="6.5" r="1.7" />
      <circle cx="14" cy="6.5" r="1.7" />
      <circle cx="17.5" cy="11" r="1.7" />
      <path d="M12 12c-3 0-5 3-5 5 0 1.7 1.5 2.5 3 2.2 1-.2 1.4-.5 2-.5s1 .3 2 .5c1.5.3 3-.5 3-2.2 0-2-2-5-5-5z" />
    </>
  ),
  star: (
    <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" />
  ),
  starFilled: (
    <path
      fill="currentColor"
      d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"
    />
  ),
  map: (
    <>
      <path d="M12 21s6.5-5.7 6.5-11A6.5 6.5 0 0 0 5.5 10c0 5.3 6.5 11 6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M4 20l1.2-4.1A8 8 0 1 1 8.2 19z" />
      <path d="M9 9c0 3 3 6 6 6l1.2-1.5-2-1-1 .7c-.8-.4-1.7-1.3-2.1-2.1l.7-1-1-2z" />
    </>
  ),
  instagram: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4.5" />
      <circle cx="12" cy="12" r="3.6" />
      <circle cx="16.8" cy="7.2" r="0.6" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  phone: (
    <path d="M6.5 4h3l1.5 4-2 1.5a10 10 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15 15 0 0 1 4.5 6a2 2 0 0 1 2-2z" />
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" />
    </>
  ),
  chevronLeft: <path d="m14.5 6-6 6 6 6" />,
  chevronRight: <path d="m9.5 6 6 6-6 6" />,
  image: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m4.5 17 4.5-4.5 3.5 3.5 3-3 4 4" />
    </>
  ),
  gift: (
    <>
      <rect x="4" y="9" width="16" height="4" rx="1" />
      <path d="M5.5 13v7h13v-7M12 9v11M12 9c-2.5 0-4.5-.5-4.5-2.2C7.5 5.3 9 4.7 10.2 5.5 11.3 6.2 12 9 12 9zM12 9c2.5 0 4.5-.5 4.5-2.2 0-1.5-1.5-2.1-2.7-1.3C12.7 6.2 12 9 12 9z" />
    </>
  ),
  bag: (
    <>
      <path d="M5.5 8h13l1 12h-15z" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
};

export function Icon({
  name,
  className,
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? "size-5 shrink-0"}
    >
      {PATHS[name]}
    </svg>
  );
}

export const AMENITY_ICONS: Record<Amenity, IconName> = {
  wifi: "wifi",
  estacionamento: "parking",
  acessibilidade: "accessibility",
  ar_condicionado: "snowflake",
  cafe_agua: "coffee",
  banheiro: "restroom",
  espaco_kids: "kids",
  aceita_pets: "paw",
};
