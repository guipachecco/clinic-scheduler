import { cache } from "react";

import { getClinicPage } from "@/modules/clinic-page/public";

// The layout (look and logo), the metadata and the home page read the same
// clinic page once per request.
export const loadClinicPage = cache(getClinicPage);
