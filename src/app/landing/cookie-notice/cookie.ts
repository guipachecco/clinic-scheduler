// Remembers that the visitor dismissed the cookie notice ("Entendi"). Set in
// the browser by CookieNoticeBar and read on the server by CookieNotice, so a
// visitor who already accepted never gets the notice in the HTML.
export const COOKIE_NOTICE_COOKIE = "aviso_cookies";
export const COOKIE_NOTICE_ACCEPTED = "ok";
export const COOKIE_NOTICE_MAX_AGE = 60 * 60 * 24 * 365;
