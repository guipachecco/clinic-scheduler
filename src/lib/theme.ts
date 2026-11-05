// The theme lives in a cookie so the server renders the right class on <html>:
// no flash on load and no inline script (the CSP only allows nonce scripts).
export const THEME_COOKIE = "theme";

export type Theme = "light" | "dark";

export function parseTheme(value: string | undefined): Theme {
  return value === "dark" ? "dark" : "light";
}
