// "45 min", "1h", "2h30": how the clinics write durations.
export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, "0")}`;
}

// Groups the page's services under their categories, keeping the order they
// arrive in (categories first, then services). Headings only help when there
// is more than one category, so the caller shows them just then.
export function groupByCategory<
  T extends { category: { id: string; name: string } },
>(services: T[]): { id: string; name: string; services: T[] }[] {
  const groups: { id: string; name: string; services: T[] }[] = [];
  for (const service of services) {
    const last = groups.at(-1);
    if (last?.id === service.category.id) {
      last.services.push(service);
    } else {
      groups.push({ ...service.category, services: [service] });
    }
  }
  return groups;
}
