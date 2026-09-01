import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { APP_NAME } from '../lib/brand';

type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT' | 'FINANCE' | 'MARKETING' | 'MODERATOR' | 'TECH';

type NavItem = { href: string; label: string; roles?: AdminRole[] };

const ALL_ROLES: AdminRole[] = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE', 'MARKETING', 'MODERATOR', 'TECH'];
const NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', roles: ALL_ROLES },
  { href: '/users', label: 'Utilisateurs', roles: ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'MODERATOR'] },
  { href: '/support-center', label: 'Support utilisateurs', roles: ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'MODERATOR'] },
  { href: '/music-brain', label: `${APP_NAME} Music Brain`, roles: ['SUPER_ADMIN', 'ADMIN', 'TECH'] },
  { href: '/plans', label: 'Abonnements & Prix', roles: ['SUPER_ADMIN', 'ADMIN', 'FINANCE'] },
  { href: '/operations', label: 'API payantes & Support', roles: ['SUPER_ADMIN', 'ADMIN', 'TECH'] },
  { href: '/costs', label: 'Comptabilité & Rentabilité', roles: ['SUPER_ADMIN', 'ADMIN', 'FINANCE'] },
  { href: '/feature-flags', label: 'Feature Flags', roles: ['SUPER_ADMIN', 'ADMIN', 'TECH'] },
  { href: '/remote-config', label: 'Textes & Quotas app', roles: ['SUPER_ADMIN', 'ADMIN', 'TECH', 'MARKETING'] },
  { href: '/integrations', label: 'Clés & intégrations', roles: ['SUPER_ADMIN', 'ADMIN', 'TECH'] },
  { href: '/team', label: 'Équipe Super Admin', roles: ['SUPER_ADMIN'] },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [role, setRole] = useState<AdminRole | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pendingSupport, setPendingSupport] = useState(0);
  const [integrationIssues, setIntegrationIssues] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.innerWidth < 1180) setSidebarOpen(false);
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
      const [{ data: pending }, { data: runtime }] = await Promise.all([
        client.rpc('admin_pending_support_count'),
        client.rpc('admin_integration_runtime_status'),
      ]);
      if (!active) return;
      setPendingSupport(Number(pending || 0));
      const issues = Array.isArray(runtime) ? runtime.filter((row: any) => row.status === 'ERROR' || row.status === 'EXHAUSTED').length : 0;
      setIntegrationIssues(issues);
    };
    void refresh();
    const channel = client
      .channel('admin-bell')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => void refresh())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_ticket_messages' }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'integration_runtime_status' }, () => void refresh())
      .subscribe();
    const interval = setInterval(() => void refresh(), 60000);
    return () => { active = false; clearInterval(interval); void client.removeChannel(channel); };
  }, []);

  const totalAlerts = pendingSupport + integrationIssues;

  const visibleNav = useMemo(
    () => NAV.filter((item) => !item.roles || (role ? item.roles.includes(role) : false)),
    [role],
  );
  const currentItem = NAV.find((item) => item.href === router.pathname);
  const routeAllowed = !currentItem || !currentItem.roles || (role ? currentItem.roles.includes(role) : false);

  return (
    <div className="layout">
      <aside className={`sidebar ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
        <div className="logo">{APP_NAME}</div>
        <div className="subtitle">Super Admin{role ? ` · ${role}` : ''}</div>
        <nav>
          {visibleNav.map((item) => (
            <Link key={item.href} href={item.href} className={router.pathname === item.href ? 'active' : ''}>
              {item.label}
            </Link>
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
          Accès par rôle. Les actions sensibles restent liées à la session {APP_NAME}, au rôle Admin actif et au journal d’audit.
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
          <span className="admin-toolbar-label">{sidebarOpen ? 'Masquer le menu' : 'Menu Super Admin'}</span>
          <div style={{ marginLeft: 'auto', position: 'relative' }}>
            <button
              type="button"
              onClick={() => setBellOpen((v) => !v)}
              aria-label={totalAlerts > 0 ? `${totalAlerts} alerte(s) Super Admin` : 'Aucune alerte'}
              style={{ position: 'relative', background: 'transparent', border: '1px solid var(--border)', borderRadius: 10, width: 38, height: 38, fontSize: 18, cursor: 'pointer', color: 'var(--text)' }}
            >
              🔔
              {totalAlerts > 0 && (
                <span style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9, background: '#e05252', color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
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
                </>}
              </div>
            )}
          </div>
        </div>
        {routeAllowed ? children : (
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Accès limité</h2>
            <p style={{ color: 'var(--text-muted)' }}>Ton rôle {role || 'inconnu'} n’autorise pas cette section.</p>
          </div>
        )}
      </main>
    </div>
  );
}
