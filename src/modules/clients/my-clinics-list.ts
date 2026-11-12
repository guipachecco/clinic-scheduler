import { normalizeName } from "@/modules/patients/fields";

// Order and search of "Suas clínicas". Pure: the page orders on the server and
// the search filters in the browser.

// From this many clinics on, the page shows the search field.
export const SEARCH_MIN_CLINICS = 4;

type Orderable = {
  slug: string;
  name: string;
  nextAppointment: { startsAt: Date } | null;
  lastVisitAt: Date | null;
};

// The clinics with an appointment come first, the soonest on top; then the
// others by the last completed visit, the latest on top; then by name (and
// slug, for equal names).
export function orderMyClinics<T extends Orderable>(clinics: T[]): T[] {
  const byName = (a: T, b: T) =>
    a.name.localeCompare(b.name, "pt-BR") || a.slug.localeCompare(b.slug);
  return [...clinics].sort((a, b) => {
    const nextA = a.nextAppointment?.startsAt.getTime();
    const nextB = b.nextAppointment?.startsAt.getTime();
    if (nextA !== undefined || nextB !== undefined) {
      if (nextA === undefined) return 1;
      if (nextB === undefined) return -1;
      return nextA - nextB || byName(a, b);
    }
    const lastA = a.lastVisitAt?.getTime();
    const lastB = b.lastVisitAt?.getTime();
    if (lastA !== undefined || lastB !== undefined) {
      if (lastA === undefined) return 1;
      if (lastB === undefined) return -1;
      return lastB - lastA || byName(a, b);
    }
    return byName(a, b);
  });
}

// What the search looks in: name, area, address and slug, normalized like
// the query.
export function clinicSearchText(clinic: {
  slug: string;
  name: string;
  areaLabel: string | null;
  address: string | null;
}): string {
  return normalizeName(
    [clinic.name, clinic.areaLabel, clinic.address, clinic.slug]
      .filter(Boolean)
      .join(" "),
  );
}

// Every word of the query must appear, in any order, ignoring accents and
// case. An empty query matches everything.
export function matchesClinicSearch(searchText: string, query: string) {
  const words = normalizeName(query).split(" ").filter(Boolean);
  return words.every((word) => searchText.includes(word));
}
