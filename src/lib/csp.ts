// Content Security Policy sent with every page. Scripts only run with the
// per-request nonce (generated in src/proxy.ts), which blocks injected scripts.
export function buildContentSecurityPolicy({
  nonce,
  isDevelopment,
  upgradeInsecureRequests,
}: {
  nonce: string;
  isDevelopment: boolean;
  upgradeInsecureRequests: boolean;
}): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // React uses eval only in development, to rebuild server error stacks.
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
    ],
    // Inline styles are allowed for component libraries; scripts are not.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "blob:", "data:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  if (upgradeInsecureRequests) directives["upgrade-insecure-requests"] = [];

  return Object.entries(directives)
    .map(([name, values]) => [name, ...values].join(" "))
    .join("; ");
}
