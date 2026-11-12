import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireModule } from "@/modules/auth/session";
import { getProduct, listProductCatalog } from "@/modules/products/products";
import { formatCents } from "@/modules/services/fields";

import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "Produto" };

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { clinicId } = await requireModule("products");
  const { id } = await params;
  const product = await getProduct(clinicId, id);
  if (!product) notFound();

  const catalog = await listProductCatalog(clinicId);
  const inUse = catalog
    .flatMap((category) => category.products)
    .some((item) => item.id === product.id && item.inUse);
  // Active categories, plus the product's own even when it is inactive.
  const categories = catalog
    .filter(
      (category) => category.isActive || category.id === product.categoryId,
    )
    .map(({ id, name, isActive }) => ({ id, name, isActive }));

  return (
    <div className="grid max-w-3xl gap-6">
      <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">
        {product.name}
      </h1>
      <ProductForm
        mode="edit"
        id={product.id}
        inUse={inUse}
        categories={categories}
        defaults={{
          categoryId: product.categoryId,
          name: product.name,
          description: product.description ?? "",
          price:
            product.priceCents === null
              ? ""
              : formatCents(product.priceCents).replace("R$ ", ""),
          showOnPage: product.showOnPage,
          isActive: product.isActive,
        }}
      />
    </div>
  );
}
