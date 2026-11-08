import type { MetadataRoute } from "next";

import { listActiveClinicSlugs } from "@/modules/clinics/clinics";

import { SITE_URL } from "./site-url";

// Read on each request (never at build time), so a new clinic reaches the list
// without a deploy and the build does not need the database.
export const dynamic = "force-dynamic";

// The Zemana page, the legal pages and the page of every active clinic.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs = await listActiveClinicSlugs();
  return [
    { url: `${SITE_URL}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/clinicas`, changeFrequency: "weekly", priority: 0.6 },
    ...slugs.map((slug) => ({
      url: `${SITE_URL}/${slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    {
      url: `${SITE_URL}/privacidade`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    { url: `${SITE_URL}/termos`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
