import React, { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { adminApi, isBackendConfigured } from '../lib/apiClient';

const PLAN_OPTIONS = ['ALL', 'FREE', 'PREMIUM', 'CREATOR_PRO', 'VENUE_PRO'] as const;
type PlanFilter = typeof PLAN_OPTIONS[number];

type Subscription = {
  status?: string;
  plans?: { code?: string } | null;
};

type ApiUser = {
  id: string;
  username: string;
  display_name?: string | null;
  country_code?: string | null;
  kind?: string | null;
  created_at: string;
  subscriptions?: Subscription[];
};

function activePlan(user: ApiUser): string {
  const active = (user.subscriptions ?? []).find((s) => s.status === 'ACTIVE');
  return active?.plans?.code ?? 'FREE';
}

export default function Users() {
  const [query, setQuery] = useState('');
  const [planFilter, setPlanFilter] = useState<PlanFilter>('ALL');
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!isBackendConfigured) throw new Error('Backend Super Admin non configuré.');
      const response = await adminApi.get<{ data: ApiUser[]; count: number }>('/users?limit=200');
      setUsers(response.data ?? []);
      setTotal(response.count ?? response.data?.length ?? 0);
    } catch (e: any) {
      setError(e?.message ?? 'Impossible de charger les utilisateurs réels.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter((u) => {
      const plan = activePlan(u);
      if (planFilter !== 'ALL' && plan !== planFilter) return false;
      if (!needle) return true;
      return [u.username, u.display_name ?? '', u.country_code ?? '', u.kind ?? '', plan]
        .some((value) => value.toLowerCase().includes(needle));
    });
  }, [users, query, planFilter]);

  return (
    <AdminLayout>
      <div className="page-title">Utilisateurs</div>
      <div className="page-subtitle">{filtered.length} affiché(s) / {total} profil(s) réellement présents dans Supabase</div>

      {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
      {!error && !loading && <div className="demo-banner">● MODE RÉEL — `profiles` + `subscriptions` via le backend Super Admin sécurisé.</div>}

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <input
          type="text"
          placeholder="Rechercher (pseudo, pays, type, plan)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}
        />
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value as PlanFilter)}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}
        >
          {PLAN_OPTIONS.map((p) => <option key={p} value={p}>{p === 'ALL' ? 'Tous les plans' : p}</option>)}
        </select>
        <button onClick={() => void load()} disabled={loading}>Actualiser</button>
      </div>

      <table>
        <thead>
          <tr><th>Utilisateur</th><th>Pays</th><th>Type</th><th>Plan réel</th><th>Inscrit le</th></tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>Chargement de Supabase…</td></tr>}
          {!loading && filtered.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>Aucun utilisateur ne correspond à ces critères.</td></tr>}
          {filtered.map((u) => (
            <tr key={u.id}>
              <td><strong>{u.username}</strong>{u.display_name ? <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{u.display_name}</div> : null}</td>
              <td>{u.country_code ?? '—'}</td>
              <td>{u.kind ?? 'USER'}</td>
              <td>{activePlan(u)}</td>
              <td>{new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminLayout>
  );
}
