import React, { useMemo, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import DataModeBanner from '../components/DataModeBanner';
import { DEMO_USERS, DemoUser, PlanCode } from '../lib/demoData';
import { filterUsers } from '../lib/aggregate';
import { useLiveOrDemo } from '../lib/useLiveOrDemo';

const PLAN_OPTIONS: (PlanCode | 'ALL')[] = ['ALL', 'FREE', 'PREMIUM', 'CREATOR_PRO', 'VENUE_PRO'];

interface RawProfile {
  id: string;
  username: string;
  country_code: string | null;
  created_at: string;
  subscriptions: { status: string; plans: { code: PlanCode } | null }[] | null;
}

function mapUsers(raw: RawProfile[]): DemoUser[] {
  return raw.map((p) => {
    const activePlan = p.subscriptions?.find((s) => s.status === 'ACTIVE')?.plans?.code;
    return {
      id: p.id,
      username: p.username,
      country: p.country_code ?? '—',
      plan: activePlan ?? 'FREE',
      // Aucune table "sessions"/"keeps" côté backend (voir docs/PROJECT_STATUS.md) --
      // pas de valeur inventée, -1 signale explicitement "non disponible" au rendu.
      keepsThisMonth: -1,
      joinedAt: p.created_at?.slice(0, 10) ?? '—',
    };
  });
}

/**
 * Écran Utilisateurs -- cf. RESTE_A_FAIRE.md Priorité 4. En Mode Réel, lit
 * `profiles` + `subscriptions` via GET /api/admin/users (service role,
 * jamais la clé anon côté admin -- RLS bloque de toute façon un accès direct
 * multi-utilisateurs avec la clé anon). Repli Mode Démo honnête sinon.
 */
export default function Users() {
  const usersResult = useLiveOrDemo('/users', mapUsers, DEMO_USERS);
  const [query, setQuery] = useState('');
  const [planFilter, setPlanFilter] = useState<PlanCode | 'ALL'>('ALL');

  const filtered = useMemo(
    () => filterUsers(usersResult.data, query, planFilter),
    [usersResult.data, query, planFilter]
  );

  return (
    <AdminLayout>
      <div className="page-title">Utilisateurs</div>
      <div className="page-subtitle">{filtered.length} / {usersResult.data.length} utilisateur(s) — France (EUR)</div>

      <DataModeBanner
        mode={usersResult.mode}
        loading={usersResult.loading}
        reason={usersResult.reason}
        demoNote={`${DEMO_USERS.length} utilisateurs d'exemple.`}
      />

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
              <td>{u.keepsThisMonth === -1 ? '— (non suivi côté backend)' : u.keepsThisMonth}</td>
              <td>{u.joinedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminLayout>
  );
}
