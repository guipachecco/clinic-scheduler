import { redirect } from "next/navigation";

// The products screen moved to its own area of the panel.
export default function LegacyProductsPage() {
  redirect("/admin/produtos");
}
