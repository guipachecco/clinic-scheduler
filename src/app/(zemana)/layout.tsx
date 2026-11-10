import type { Metadata } from "next";

import { CookieNotice } from "../landing/cookie-notice/cookie-notice";

// Titles of the Zemana pages read "<page> | Zemana", not the clinic suffix
// set by the root layout.
export const metadata: Metadata = {
  title: { template: "%s | Zemana", default: "Zemana" },
};

export default function ZemanaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <CookieNotice />
    </>
  );
}
