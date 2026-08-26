import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/users', label: 'Utilisateurs' },
  { href: '/plans', label: 'Abonnements & Prix' },
  { href: '/operations', label: 'API payantes & Support' },
  { href: '/costs', label: 'Coûts & Rentabilité' },
  { href: '/feature-flags', label: 'Feature Flags' },
  { href: '/remote-config', label: 'Textes & Quotas app' },
  { href: '/integrations', label: 'Clés & intégrations' },
  { href: '/email-test', label: 'Tester les e-mails' },
];

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
            background: 'rgba(167,139,250,0.08)',
            border: '1px solid #5b4a78',
            color: '#b9a7d6',
            fontSize: 11,
            lineHeight: 1.4,
          }}
        >
          Mode preview : accès démo isolé. En production, les mutations sensibles passent par la session KEEP + rôle Super Admin et sont journalisées.
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
