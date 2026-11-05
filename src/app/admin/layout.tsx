import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Painel",
    template: "%s | Painel",
  },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return children;
}
