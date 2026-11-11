import { getClinicLogo } from "@/modules/clinic-page/public";
import { RESERVED_SLUGS, SLUG_PATTERN } from "@/modules/clinics/fields";

// The published logo in the clinic page header. Only an active
// clinic's image is served (getClinicLogo reads it through a definer
// function).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!SLUG_PATTERN.test(slug) || RESERVED_SLUGS.has(slug)) {
    return new Response("Not found", { status: 404 });
  }
  const image = await getClinicLogo(slug);
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
