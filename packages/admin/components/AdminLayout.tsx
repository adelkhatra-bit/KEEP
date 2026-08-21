import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/users', label: 'Utilisateurs' },
  { href: '/plans', label: 'Abonnements & Prix' },
  { href: '/costs', label: 'Coûts & Rentabilité' },
  { href: '/feature-flags', label: 'Feature Flags' },
];

/**
 * Coquille du Super Admin. Auth/RBAC réel PLANNED (voir docs/PROJECT_STATUS.md)
 * — cette version démontre la structure et le pilotage des données, pas
 * encore protégée par une authentification admin réelle.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">KEEP</div>
        <div className="subtitle">Super Admin</div>
        <nav>
          {NAV.map((item) => (
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
            background: 'rgba(255,92,114,0.1)',
            border: '1px solid var(--pass)',
            color: 'var(--pass)',
            fontSize: 11,
            lineHeight: 1.4,
          }}
        >
          🔓 Authentification Super Admin non branchée (voir
          docs/RESTE_A_FAIRE.md Priorité 4). Ne jamais déployer cette
          interface sur une URL publique avant ça.
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
