import { getClinicLogo } from "@/modules/clinic-page/public";

import { imageResponse } from "../image-response";

// The published logo in the clinic page header. Only an active clinic's image is served.
export function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return imageResponse(params, getClinicLogo);
}
