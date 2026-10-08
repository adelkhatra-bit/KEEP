import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { APP_NAME } from '../lib/brand';
import AdminRobot from './AdminRobot';
import Hint from './Hint';
import { AdminRole, ALL_ROLES, NAV, NAV_GROUPS, currentTab, tabHref } from '../lib/adminNavigation';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [role, setRole] = useState<AdminRole | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pendingSupport, setPendingSupport] = useState(0);
  const [integrationIssues, setIntegrationIssues] = useState(0);
  const [pendingModeration, setPendingModeration] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.innerWidth < 1180) setSidebarOpen(false);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const update = () => setIsMobile(window.innerWidth < 900);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    let active = true;
    if (!supabase) return () => { active = false; };
    void Promise.resolve(supabase.rpc('get_my_admin_role'))
      .then(({ data }) => {
        if (!active) return;
        const value = String(data || '') as AdminRole;
        setRole(ALL_ROLES.includes(value) ? value : null);
      })
      .catch(() => { if (active) setRole(null); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) return undefined;
    let active = true;
    const refresh = async () => {
      const [{ data: pending }, { data: runtime }, { data: moderation }] = await Promise.all([
        client.rpc('admin_pending_support_count'),
        client.rpc('admin_integration_runtime_status'),
        client.rpc('admin_event_pending_count'),
      ]);
      if (!active) return;
      setPendingSupport(Number(pending || 0));
      const issues = Array.isArray(runtime) ? runtime.filter((row: any) => row.status === 'ERROR' || row.status === 'EXHAUSTED').length : 0;
      setIntegrationIssues(issues);
      setPendingModeration(Number(moderation || 0));
    };
    void refresh();
    const channel = client
      .channel('admin-bell')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => void refresh())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_ticket_messages' }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'integration_runtime_status' }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => void refresh())
      .subscribe();
    const interval = setInterval(() => void refresh(), 60000);
    return () => { active = false; clearInterval(interval); void client.removeChannel(channel); };
  }, []);

  const totalAlerts = pendingSupport + integrationIssues + pendingModeration;

  const visibleGroups = useMemo(
    () => NAV_GROUPS
      .map((group) => ({ ...group, items: group.items.filter((item) => !item.roles || (role ? item.roles.includes(role) : false)) }))
      .filter((group) => group.items.length > 0),
    [role],
  );
  const currentItem = currentTab(router.pathname, router.query.section, router.query.tab);
  const currentGroup = visibleGroups.find((group) => group.items.some((item) => item.href === currentItem?.href));
  const routeAllowed = Boolean(currentItem && role && currentItem.roles.includes(role));

  useEffect(() => {
    if (!router.isReady || router.pathname !== '/[section]' || router.query.tab !== undefined || !role) return;
    const group = visibleGroups.find((entry) => entry.slug === router.query.section);
    if (!group) return;
    const { section: _section, ...query } = router.query;
    const hash = router.asPath.includes('#') ? router.asPath.slice(router.asPath.indexOf('#')) : '';
    const item = group.items[0];
    void router.replace({ pathname: `/${group.slug}`, query: { ...query, tab: item.href === '/' ? 'index' : item.href.slice(1) }, hash });
  }, [router.isReady, router.pathname, router.query.tab, router.query.section, role, visibleGroups]);

  useEffect(() => {
    if (!router.isReady || router.pathname === '/[section]') return;
    const item = NAV.find((entry) => entry.href === router.pathname);
    const group = NAV_GROUPS.find((entry) => entry.items.includes(item!));
    if (!item || !group) return;
    const { tab: _tab, section: _section, ...query } = router.query;
    const hash = router.asPath.includes('#') ? router.asPath.slice(router.asPath.indexOf('#')) : '';
    void router.replace({ pathname: `/${group.slug}`, query: { ...query, tab: item.href === '/' ? 'index' : item.href.slice(1) }, hash });
  }, [router.isReady, router.pathname]);

  return (
    <div className="layout">
      {sidebarOpen && isMobile && (
        <div
          className="sidebar-backdrop active"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
        <div className="logo">{APP_NAME}</div>
        <div className="subtitle">Super Admin{role ? ` · ${role}` : ''}</div>
        <nav aria-label="Rubriques">
          {visibleGroups.map((group) => (
            <div key={group.title} className="nav-group">
              <Link href={tabHref(group, group.items[0])}
                onClick={() => { if (isMobile) setSidebarOpen(false); }}
                className={currentGroup?.slug === group.slug ? 'active' : ''}
                aria-current={currentGroup?.slug === group.slug ? 'page' : undefined}>
                {group.title}
              </Link>
            </div>
          ))}
        </nav>
        <div
          style={{
            marginTop: 24,
            padding: '10px 12px',
            borderRadius: 8,
            background: 'rgba(167,139,250,0.08)',
            border: '1px solid #5b4a78',
            color: '#b9a7d6',
            fontSize: 11,
            lineHeight: 1.4,
          }}
        >
          🔒 Tracé
        </div>
      </aside>
      <main className="main">
        <div className="admin-toolbar">
          <button
            className="admin-menu-toggle"
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label={sidebarOpen ? 'Masquer le menu Super Admin' : 'Afficher le menu Super Admin'}
            aria-expanded={sidebarOpen}
          >
            ☰
          </button>
          <span className="admin-toolbar-label">Menu</span>
          {/* Une seule entrée mot de passe : Utilisateurs › Équipe. */}
          <div style={{ marginLeft: 'auto', position: 'relative' }}>
            <button
              type="button"
              onClick={() => setBellOpen((v) => !v)}
              aria-label={totalAlerts > 0 ? `${totalAlerts} alerte(s) Super Admin` : 'Aucune alerte'}
              style={{ position: 'relative', background: 'transparent', border: '1px solid var(--border)', borderRadius: 10, width: 38, height: 38, padding: 0, fontSize: 18, cursor: 'pointer', color: 'var(--text)' }}
            >
              🔔
              {totalAlerts > 0 && (
                <span style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9, background: '#e05252', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                  {totalAlerts > 99 ? '99+' : totalAlerts}
                </span>
              )}
            </button>
            {bellOpen && (
              <div style={{ position: 'absolute', right: 0, top: 44, width: 300, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
                {totalAlerts === 0 ? (
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>Rien à signaler.</p>
                ) : <>
                  {pendingSupport > 0 && (
                    <Link href="/support-center" onClick={() => setBellOpen(false)} style={{ display: 'block', padding: '8px 0', color: 'var(--text)', textDecoration: 'none' }}>
                      💬 {pendingSupport} message{pendingSupport > 1 ? 's' : ''} utilisateur en attente de réponse
                    </Link>
                  )}
                  {integrationIssues > 0 && (
                    <Link href="/integrations" onClick={() => setBellOpen(false)} style={{ display: 'block', padding: '8px 0', color: 'var(--text)', textDecoration: 'none' }}>
                      ⚠️ {integrationIssues} intégration{integrationIssues > 1 ? 's' : ''} en erreur ou quota épuisé
                    </Link>
                  )}
                  {pendingModeration > 0 && (
                    <Link href="/moderation" onClick={() => setBellOpen(false)} style={{ display: 'block', padding: '8px 0', color: 'var(--text)', textDecoration: 'none' }}>
                      🛡️ {pendingModeration} événement{pendingModeration > 1 ? 's' : ''} en attente de validation
                    </Link>
                  )}
                </>}
              </div>
            )}
          </div>
        </div>
        {currentGroup && <div className="admin-section">
          <h1>{currentGroup.title}<Hint title={currentGroup.title} text={currentGroup.items.map((item) => item.label).join(' · ')} /></h1>
          <nav className="admin-tabs" aria-label={`Onglets ${currentGroup.title}`}>
            {currentGroup.items.map((item) => <Link key={item.href} href={tabHref(currentGroup, item)}
              aria-current={item.href === currentItem?.href ? 'page' : undefined}
              className={item.href === currentItem?.href ? 'active' : ''}>{item.label}</Link>)}
          </nav>
        </div>}
        {routeAllowed ? children : (
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Accès limité</h2>
            <p style={{ color: 'var(--text-muted)' }}>Ton rôle {role || 'inconnu'} n’autorise pas cette section.</p>
          </div>
        )}
        {/* Robot d'aide (07/10/2026) : son catalogue = ce menu, filtré par rôle (aucun lien vers une page interdite ou absente). */}
        <AdminRobot currentPath={currentItem?.href || router.pathname} pages={visibleGroups.flatMap((g) => g.items.map((i) => ({ href: i.href, label: i.label, group: g.title })))} />
      </main>
    </div>
  );
}
