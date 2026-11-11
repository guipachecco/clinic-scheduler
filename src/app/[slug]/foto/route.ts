import { getOwnerPhoto } from "@/modules/clinic-page/public";

import { imageResponse } from "../image-response";

// The owner's photo on the clinic page. Only an active clinic's photo is served.
export function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return imageResponse(params, getOwnerPhoto);
}
