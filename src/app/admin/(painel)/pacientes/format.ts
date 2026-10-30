// Display helpers for patient data. Pure, safe for server and client.

// 1990-05-10 -> 10/05/1990
export function formatDate(isoDate: string | null): string {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}
