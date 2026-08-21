import React, { useMemo, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { DEMO_USERS, PlanCode } from '../lib/demoData';
import { filterUsers } from '../lib/aggregate';

const PLAN_OPTIONS: (PlanCode | 'ALL')[] = ['ALL', 'FREE', 'PREMIUM', 'CREATOR_PRO', 'VENUE_PRO'];

/**
 * Écran Utilisateurs — cf. RESTE_A_FAIRE.md Priorité 4. En Mode Démo,
 * lit DEMO_USERS ; en Mode Réel, lira `profiles` + `subscriptions` via le
 * backend (service role, jamais la clé anon côté admin -- RLS bloque de
 * toute façon un accès direct multi-utilisateurs avec la clé anon).
 */
export default function Users() {
  const [query, setQuery] = useState('');
  const [planFilter, setPlanFilter] = useState<PlanCode | 'ALL'>('ALL');

  const filtered = useMemo(() => filterUsers(DEMO_USERS, query, planFilter), [query, planFilter]);

  return (
    <AdminLayout>
      <div className="page-title">Utilisateurs</div>
      <div className="page-subtitle">{filtered.length} / {DEMO_USERS.length} utilisateur(s) — France (EUR)</div>

      <div className="demo-banner">
        🎭 MODE DÉMO — {DEMO_USERS.length} utilisateurs d'exemple, aucun projet
        Supabase connecté. En Mode Réel, cet écran lira `profiles` +
        `subscriptions` via le backend (service role).
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <input
          type="text"
          placeholder="Rechercher (pseudo, pays)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: 1,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 13,
          }}
        />
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value as PlanCode | 'ALL')}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 13,
          }}
        >
          {PLAN_OPTIONS.map((p) => (
            <option key={p} value={p}>{p === 'ALL' ? 'Tous les plans' : p}</option>
          ))}
        </select>
      </div>

      <table>
        <thead>
          <tr><th>Utilisateur</th><th>Pays</th><th>Plan</th><th>GARDER ce mois</th><th>Inscrit le</th></tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr><td colSpan={5} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>Aucun utilisateur ne correspond à ces critères.</td></tr>
          )}
          {filtered.map((u) => (
            <tr key={u.id}>
              <td>{u.username}</td>
              <td>{u.country}</td>
              <td>{u.plan}</td>
              <td>{u.keepsThisMonth}</td>
              <td>{u.joinedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminLayout>
  );
}
