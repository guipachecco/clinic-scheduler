import type { IconName } from "./icons";

// The client area's navigation: the same four items on the phone (the bottom
// bar, bottom-nav.tsx) and on wide screens (links in the header, top-nav.tsx).

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  // Only the exact path marks it (the clinic's home is the prefix of all).
  exact?: boolean;
};

export function clientNavItems(slug: string, signedIn: boolean): NavItem[] {
  const base = `/${slug}`;
  return [
    { href: base, label: "Início", icon: "home", exact: true },
    { href: `${base}/marcar`, label: "Agendar", icon: "calendar" },
    { href: `${base}/meus-horarios`, label: "Meus horários", icon: "clock" },
    {
      href: signedIn ? `${base}/perfil` : `${base}/entrar`,
      label: "Perfil",
      icon: "person",
    },
  ];
}

export function isActiveNavItem(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
