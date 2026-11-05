import { z } from "zod";

import { getClinicMedia } from "@/modules/branding/photo";
import { requireAdmin } from "@/modules/auth/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { clinicId } = await requireAdmin();
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) return new Response("Not found", { status: 404 });
  const id = parsed.data;
  const file = await getClinicMedia(clinicId, id);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
