import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/plans', label: 'Abonnements & Prix' },
  { href: '/costs', label: 'Coûts & Rentabilité' },
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
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
