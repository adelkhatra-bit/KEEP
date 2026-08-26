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

async function invokeAdmin(body: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase Super Admin non configuré.');
  const { data, error } = await supabase.functions.invoke('keep-admin-control', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.message || data.error);
  return data;
}

export default function Users() {
  const [query, setQuery] = useState('');
  const [planFilter, setPlanFilter] = useState<PlanFilter>('ALL');
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [manageEmail, setManageEmail] = useState('');
  const [managePlan, setManagePlan] = useState<'PREMIUM' | 'CREATOR_PRO' | 'VENUE_PRO'>('PREMIUM');
  const [months, setMonths] = useState(12);
  const [reason, setReason] = useState('Offert depuis le Super Admin KEEP');
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

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

  const invite = async () => {
    const email = manageEmail.trim();
    if (!email) return;
    setActionBusy('invite'); setError(null); setActionMessage(null);
    try {
      await invokeAdmin({ action: 'users.invite', email });
      setActionMessage(`Invitation KEEP envoyée à ${email}.`);
    } catch (e: any) {
      setError(e?.message ?? 'Invitation impossible.');
    } finally {
      setActionBusy(null);
    }
  };

  const grant = async () => {
    const email = manageEmail.trim();
    if (!email) return;
    setActionBusy('grant'); setError(null); setActionMessage(null);
    try {
      const result = await invokeAdmin({
        action: 'users.grant',
        email,
        planCode: managePlan,
        months,
        reason,
      });
      const endsAt = result?.data?.endsAt ? new Date(result.data.endsAt).toLocaleDateString('fr-FR') : null;
      setActionMessage(`${managePlan} offert à ${email} pour ${months} mois${endsAt ? ` — jusqu’au ${endsAt}` : ''}.`);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Attribution impossible.');
    } finally {
      setActionBusy(null);
    }
  };

  const revoke = async () => {
    const email = manageEmail.trim();
    if (!email) return;
    setActionBusy('revoke'); setError(null); setActionMessage(null);
    try {
      const result = await invokeAdmin({ action: 'users.revoke_grant', email });
      setActionMessage(`Abonnement offert révoqué pour ${email} (${result?.revoked ?? 0} attribution active).`);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Révocation impossible.');
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <AdminLayout>
      <div className="page-title">Utilisateurs</div>
      <div className="page-subtitle">{filtered.length} affiché(s) / {users.length} compte(s) réellement lus dans Supabase</div>

      {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
      {actionMessage && <div className="demo-banner" style={{ borderColor: '#2e7d32' }}>{actionMessage}</div>}
      {!error && !loading && <div className="demo-banner">● MODE RÉEL — profils + e-mails Supabase Auth + plan actif + KEEP du mois. Accès réservé aux `admin_users` actifs.</div>}

      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ marginTop: 0 }}>Ajouter / offrir un abonnement</h3>
        <p style={{ color: 'var(--text-muted)', marginTop: 0, lineHeight: 1.5 }}>
          Invite une nouvelle adresse ou attribue manuellement une formule à un compte KEEP existant. Les cadeaux sont enregistrés dans Supabase avec leur durée et l’administrateur qui les a accordés.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 2fr) minmax(150px, 1fr) 110px', gap: 10, marginBottom: 10 }}>
          <input
            type="email"
            placeholder="utilisateur@email.fr"
            value={manageEmail}
            onChange={(e) => setManageEmail(e.target.value)}
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 14px' }}
          />
          <select
            value={managePlan}
            onChange={(e) => setManagePlan(e.target.value as typeof managePlan)}
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 14px' }}
          >
            <option value="PREMIUM">Premium</option>
            <option value="CREATOR_PRO">Creator Pro</option>
            <option value="VENUE_PRO">Venue Pro</option>
          </select>
          <input
            type="number"
            min={1}
            max={60}
            value={months}
            onChange={(e) => setMonths(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
            title="Durée en mois"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 14px' }}
          />
        </div>
        <input
          type="text"
          placeholder="Motif interne (optionnel)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}
        />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => void invite()} disabled={!manageEmail.trim() || actionBusy !== null}>
            {actionBusy === 'invite' ? 'Invitation…' : 'Inviter l’utilisateur'}
          </button>
          <button onClick={() => void grant()} disabled={!manageEmail.trim() || actionBusy !== null}>
            {actionBusy === 'grant' ? 'Attribution…' : `Offrir ${managePlan} — ${months} mois`}
          </button>
          <button onClick={() => void revoke()} disabled={!manageEmail.trim() || actionBusy !== null} style={{ opacity: 0.8 }}>
            {actionBusy === 'revoke' ? 'Révocation…' : 'Révoquer le cadeau actif'}
          </button>
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 10 }}>
          Pour un nouveau compte : invite d’abord l’adresse. L’utilisateur doit ouvrir KEEP une première fois avant qu’une formule puisse être attribuée à son profil.
        </div>
      </div>

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
          <tr><th>Utilisateur</th><th>E-mail</th><th>Pays</th><th>Type</th><th>Plan réel</th><th>KEEP ce mois</th><th>Inscrit le</th><th>Action</th></tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24 }}>Chargement de Supabase…</td></tr>}
          {!loading && filtered.length === 0 && <tr><td colSpan={8} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>Aucun utilisateur ne correspond à ces critères.</td></tr>}
          {filtered.map((u) => (
            <tr key={u.id}>
              <td><strong>{u.username}</strong>{u.display_name ? <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{u.display_name}</div> : null}</td>
              <td>{u.email ?? '—'}</td>
              <td>{u.country_code ?? '—'}</td>
              <td>{u.kind ?? 'USER'}</td>
              <td>{u.plan_code ?? 'FREE'}</td>
              <td>{u.keeps_this_month ?? 0}</td>
              <td>{new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
              <td><button disabled={!u.email} onClick={() => u.email && setManageEmail(u.email)}>Gérer</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminLayout>
  );
}
