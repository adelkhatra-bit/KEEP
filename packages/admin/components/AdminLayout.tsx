import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT' | 'FINANCE' | 'MARKETING' | 'MODERATOR' | 'TECH';

type NavItem = { href: string; label: string; roles?: AdminRole[] };

const ALL_ROLES: AdminRole[] = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE', 'MARKETING', 'MODERATOR', 'TECH'];
const NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', roles: ALL_ROLES },
  { href: '/users', label: 'Utilisateurs', roles: ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'MODERATOR'] },
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

  const visibleNav = useMemo(
    () => NAV.filter((item) => !item.roles || (role ? item.roles.includes(role) : false)),
    [role],
  );
  const currentItem = NAV.find((item) => item.href === router.pathname);
  const routeAllowed = !currentItem || !currentItem.roles || (role ? currentItem.roles.includes(role) : false);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">KEEP</div>
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
          Accès par rôle. Les actions sensibles restent liées à la session KEEP, au rôle Admin actif et au journal d’audit.
        </div>
      </aside>
      <main className="main">
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
