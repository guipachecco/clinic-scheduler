import { headers } from "next/headers";

// Structured data (schema.org) for search engines. It carries the request's
// CSP nonce like every other script, and "<" is escaped so that no text from
// the database can close the tag.
export async function JsonLd({ data }: { data: object }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
