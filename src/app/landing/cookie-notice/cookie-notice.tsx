import { cookies } from "next/headers";

import { COOKIE_NOTICE_ACCEPTED, COOKIE_NOTICE_COOKIE } from "./cookie";
import { CookieNoticeBar } from "./cookie-notice-bar";

// The cookie notice of the Zemana pages, until the visitor clicks "Entendi".
export async function CookieNotice() {
  const accepted =
    (await cookies()).get(COOKIE_NOTICE_COOKIE)?.value ===
    COOKIE_NOTICE_ACCEPTED;
  return accepted ? null : <CookieNoticeBar />;
}
