import { getOwnerPhoto } from "@/modules/clinic-page/public";
import { RESERVED_SLUGS, SLUG_PATTERN } from "@/modules/clinics/fields";

// The owner's photo on the clinic page. Only an active clinic's photo is
// served (getOwnerPhoto reads it through a definer function).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!SLUG_PATTERN.test(slug) || RESERVED_SLUGS.has(slug)) {
    return new Response("Not found", { status: 404 });
  }
  const photo = await getOwnerPhoto(slug);
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.mimeType,
      "Cache-Control": "public, max-age=300",
    },
  });
}
