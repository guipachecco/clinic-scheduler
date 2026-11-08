import { getClinicPhoto } from "@/modules/clinic-page/public";
import { RESERVED_SLUGS, SLUG_PATTERN } from "@/modules/clinics/fields";

// One photo of the clinic's page. A photo id never changes its image (a new
// photo gets a new id), so browsers and the CDN may keep it for a day.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  if (!SLUG_PATTERN.test(slug) || RESERVED_SLUGS.has(slug)) {
    return new Response("Not found", { status: 404 });
  }
  const photo = await getClinicPhoto(slug, id);
  if (!photo || !photo.mimeType.startsWith("image/")) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.mimeType,
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
