import type { MetadataRoute } from "next";

import { SITE_URL } from "./site-url";

// Search engines read the public pages (the Zemana page, the legal pages and
// each clinic's page) and skip the panel, the API and the client's own area.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", "/minhas-clinicas", "/nova-senha"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
