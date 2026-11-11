import type { StoredImage } from "@/modules/clinic-page/public";
import { RESERVED_SLUGS, SLUG_PATTERN } from "@/modules/clinics/fields";

// Shared by the /foto, /logo and /capa routes: validates the slug, reads the
// image of an active clinic and answers with it. The ?v= of the URLs only
// busts the browser cache; it is ignored here.
export async function imageResponse(
  params: Promise<{ slug: string }>,
  read: (slug: string) => Promise<StoredImage | null>,
): Promise<Response> {
  const { slug } = await params;
  if (!SLUG_PATTERN.test(slug) || RESERVED_SLUGS.has(slug)) {
    return new Response("Not found", { status: 404 });
  }
  const image = await read(slug);
  // Only images are served from here, whatever was stored.
  if (!image || !image.mimeType.startsWith("image/")) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mimeType,
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
