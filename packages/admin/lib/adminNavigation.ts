import navigation from './adminNavigation.json';

export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT' | 'FINANCE' | 'MARKETING' | 'MODERATOR' | 'TECH';
export type NavItem = { href: string; label: string; roles: AdminRole[] };
export type NavGroup = { slug: string; title: string; items: NavItem[] };
export const NAV_GROUPS = navigation as NavGroup[];
export const ALL_ROLES: AdminRole[] = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE', 'MARKETING', 'MODERATOR', 'TECH'];
export const NAV = NAV_GROUPS.flatMap((group) => group.items);

export function tabId(item: NavItem) {
  return item.href === '/' ? 'index' : item.href.slice(1);
}

export function tabHref(group: NavGroup, item: NavItem) {
  return `/${group.slug}?tab=${tabId(item)}`;
}

export function currentTab(pathname: string, section: unknown, tab: unknown) {
  if (pathname !== '/[section]') return NAV.find((item) => item.href === pathname);
  const group = NAV_GROUPS.find((entry) => entry.slug === section);
  return tab === undefined ? group?.items[0]
    : typeof tab === 'string' ? group?.items.find((item) => tabId(item) === tab)
    : undefined;
}
