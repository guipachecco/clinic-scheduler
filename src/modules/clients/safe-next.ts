import type { Route } from "next";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A path on this clinic's pages, safe to send her back to after signing in.
// The only query allowed is `?servico=<uuid>` on the booking page, so a
// service chosen while signed out survives the login.
export function safeNext(slug: string, next: unknown): Route | null {
  if (typeof next !== "string") return null;
  const base = `/${slug}`;
  let path = next;
  const query = next.indexOf("?");
  if (query !== -1) {
    path = next.slice(0, query);
    const match = /^\?servico=(.+)$/.exec(next.slice(query));
    if (path !== `${base}/marcar` || !match || !UUID.test(match[1]!)) {
      return null;
    }
  }
  if (path !== base && !path.startsWith(`${base}/`)) return null;
  // Only plain path characters: no "//", backslashes or schemes.
  if (!/^\/[a-z0-9\-/]*$/.test(path) || path.includes("//")) return null;
  return next as Route;
}
