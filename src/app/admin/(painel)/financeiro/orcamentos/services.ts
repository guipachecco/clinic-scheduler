import "server-only";

import { listActiveProducts } from "@/modules/products/products";
import { listCatalog } from "@/modules/services/services";

import type { QuoteProductOption, QuoteServiceOption } from "./quote-form";

// Services a quote can offer: active, in active categories, and not the
// flexible "Avaliação / encaixe" (it has no fixed description to sell).
export async function quoteServiceOptions(
  clinicId: string,
): Promise<QuoteServiceOption[]> {
  const catalog = await listCatalog(clinicId);
  return catalog
    .filter((category) => category.isActive)
    .flatMap((category) =>
      category.services
        .filter((service) => service.isActive && !service.isFlexible)
        .map((service) => ({
          id: service.id,
          name: service.name,
          categoryName: category.name,
          priceCents: service.priceCents,
        })),
    );
}

// Products a quote can offer: the active ones, and only while the clinic has
// the products module on (the server refuses a product item otherwise).
export async function quoteProductOptions(
  clinicId: string,
  productsOn: boolean,
): Promise<QuoteProductOption[]> {
  return productsOn ? listActiveProducts(clinicId) : [];
}
