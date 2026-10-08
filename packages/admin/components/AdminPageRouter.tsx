import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { NAV, NAV_GROUPS, tabId } from '../lib/adminNavigation';

export default function AdminPageRouter({ Component, pageProps }: Pick<AppProps, 'Component' | 'pageProps'>) {
  const router = useRouter();
  const item = NAV.find((entry) => entry.href === router.pathname);
  const group = item && NAV_GROUPS.find((entry) => entry.items.includes(item));

  useEffect(() => {
    if (!router.isReady || !item || !group) return;
    const { tab: _tab, section: _section, ...query } = router.query;
    const hash = router.asPath.includes('#') ? router.asPath.slice(router.asPath.indexOf('#')) : '';
    void router.replace({ pathname: `/${group.slug}`, query: { ...query, tab: tabId(item) }, hash });
  }, [router.isReady, router.pathname, item, group]);

  // Ne pas monter la page historique : ses requêtes seraient doublées
  // à la redirection vers l'onglet.
  return item ? <main className="main"><div className="card" role="status">…</div></main>
    : <Component {...pageProps} />;
}
