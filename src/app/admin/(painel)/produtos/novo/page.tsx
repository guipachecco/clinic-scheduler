import type { Metadata } from "next";

import { requireModule } from "@/modules/auth/session";
import { listProductCatalog } from "@/modules/products/products";

import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "Novo produto" };

export default async function NewProductPage() {
  const { clinicId } = await requireModule("products");
  const catalog = await listProductCatalog(clinicId);
  const categories = catalog
    .filter((category) => category.isActive)
    .map(({ id, name, isActive }) => ({ id, name, isActive }));

  return (
    <div className="grid max-w-3xl gap-6">
      <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">
        Novo produto
      </h1>
      <ProductForm mode="create" categories={categories} />
    </div>
  );
}
