import { getClinicCover } from "@/modules/clinic-page/public";

import { imageResponse } from "../image-response";

// The published cover at the top of the clinic page. Only an active clinic's image is served.
export function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return imageResponse(params, getClinicCover);
}
