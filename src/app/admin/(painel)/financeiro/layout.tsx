import { requireModule } from "@/modules/auth/session";

// The financial module turned off answers 404 for every /admin/financeiro
// page. Each page also calls requireModule (a layout does not re-run on
// client navigation nor stop its pages from rendering), and every action
// checks the module itself.
export default async function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireModule("finance");
  return children;
}
