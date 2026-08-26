import React, { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';

const PLAN_OPTIONS = ['ALL', 'FREE', 'PREMIUM', 'CREATOR_PRO', 'VENUE_PRO'] as const;
type PlanFilter = typeof PLAN_OPTIONS[number];

type DirectoryUser = {
  id: string;
  email: string | null;
  username: string;
  display_name: string | null;
  country_code: string | null;
  kind: string | null;
  created_at: string;
  plan_code: string;
  keeps_this_month: number;
};

export default function Users() {
  const [query, setQuery] = useState('');
  const [planFilter, setPlanFilter] = useState<PlanFilter>('ALL');
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!supabase) throw new Error('Supabase Super Admin non configuré.');
      const { data, error: rpcError } = await supabase.rpc('admin_user_directory');
      if (rpcError) throw rpcError;
      setUsers((data ?? []) as DirectoryUser[]);
    } catch (e: any) {
      setError(e?.message ?? 'Impossible de charger l’annuaire réel.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter((u) => {
      if (planFilter !== 'ALL' && u.plan_code !== planFilter) return false;
      if (!needle) return true;
      return [u.username, u.display_name ?? '', u.email ?? '', u.country_code ?? '', u.kind ?? '', u.plan_code]
        .some((value) => value.toLowerCase().includes(needle));
    });
  }, [users, query, planFilter]);

  return (
    <AdminLayout>
      <div className="page-title">Utilisateurs</div>
      <div className="page-subtitle">{filtered.length} affiché(s) / {users.length} compte(s) réellement lus dans Supabase</div>

      {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
      {!error && !loading && <div className="demo-banner">● MODE RÉEL — profils + e-mails Supabase Auth + plan actif + KEEP du mois. Accès réservé aux `admin_users` actifs.</div>}

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <input
          type="text"
          placeholder="Rechercher (pseudo, e-mail, pays, type, plan)…"
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
          <tr><th>Utilisateur</th><th>E-mail</th><th>Pays</th><th>Type</th><th>Plan réel</th><th>KEEP ce mois</th><th>Inscrit le</th></tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>Chargement de Supabase…</td></tr>}
          {!loading && filtered.length === 0 && <tr><td colSpan={7} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>Aucun utilisateur ne correspond à ces critères.</td></tr>}
          {filtered.map((u) => (
            <tr key={u.id}>
              <td><strong>{u.username}</strong>{u.display_name ? <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{u.display_name}</div> : null}</td>
              <td>{u.email ?? '—'}</td>
              <td>{u.country_code ?? '—'}</td>
              <td>{u.kind ?? 'USER'}</td>
              <td>{u.plan_code ?? 'FREE'}</td>
              <td>{u.keeps_this_month ?? 0}</td>
              <td>{new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminLayout>
  );
}
