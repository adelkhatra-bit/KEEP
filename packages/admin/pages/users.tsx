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

type LegacyRecovery = { username: string; temporaryPassword: string; message?: string };

async function invokeAdmin(body: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase Super Admin non configuré.');
  const { data, error } = await supabase.functions.invoke('keep-admin-control', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.message || data.error);
  return data;
}

function visibleEmail(email: string | null) {
  if (!email || email.endsWith('@keep.local')) return 'Sans e-mail';
  return email;
}

function memberNumber(id: string) {
  return `KEEP-${id.replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}

function durationLabel(months: number) {
  if (months === 0) return 'Illimité';
  if (months === 12) return '1 an';
  if (months === 24) return '2 ans';
  return `${months} mois`;
}

export default function Users() {
  const [query, setQuery] = useState('');
  const [planFilter, setPlanFilter] = useState<PlanFilter>('ALL');
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [manageIdentity, setManageIdentity] = useState('');
  const [managePlan, setManagePlan] = useState<'PREMIUM' | 'CREATOR_PRO' | 'VENUE_PRO'>('PREMIUM');
  const [months, setMonths] = useState(12);
  const [reason, setReason] = useState('Offert depuis le Super Admin KEEP');
  const [legacyUsername, setLegacyUsername] = useState('');
  const [legacyRecovery, setLegacyRecovery] = useState<LegacyRecovery | null>(null);
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
      return [u.username, u.display_name ?? '', visibleEmail(u.email), u.country_code ?? '', u.kind ?? '', u.plan_code, memberNumber(u.id)]
        .some((value) => value.toLowerCase().includes(needle));
    });
  }, [users, query, planFilter]);

  const invite = async () => {
    const email = manageIdentity.trim();
    if (!/^\S+@\S+\.\S+$/.test(email) || email.endsWith('@keep.local')) {
      setError('Pour envoyer une invitation, saisis une vraie adresse e-mail.');
      return;
    }
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

  const recoverLegacy = async () => {
    const username = legacyUsername.trim().replace(/^@+/, '');
    if (!username) return;
    setActionBusy('recover'); setError(null); setActionMessage(null); setLegacyRecovery(null);
    try {
      const result = await invokeAdmin({ action: 'users.recover_legacy', username });
      setLegacyRecovery({
        username: String(result?.username || username),
        temporaryPassword: String(result?.temporaryPassword || ''),
        message: result?.message,
      });
      setActionMessage(`Ancien essai @${String(result?.username || username)} converti en vrai compte KEEP sans changer son profil.`);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Récupération impossible.');
    } finally {
      setActionBusy(null);
    }
  };

  const copyRecovery = async () => {
    if (!legacyRecovery) return;
    const text = `Identifiant KEEP : ${legacyRecovery.username}\nMot de passe temporaire : ${legacyRecovery.temporaryPassword}`;
    try {
      await navigator.clipboard.writeText(text);
      setActionMessage('Identifiant et mot de passe temporaire copiés.');
    } catch {
      setActionMessage(text);
    }
  };

  const grant = async () => {
    const identity = manageIdentity.trim().replace(/^@+/, '');
    if (!identity) return;
    setActionBusy('grant'); setError(null); setActionMessage(null);
    try {
      const result = await invokeAdmin({
        action: 'users.grant',
        identity,
        planCode: managePlan,
        months,
        reason,
      });
      const endsAt = result?.data?.endsAt ? new Date(result.data.endsAt).toLocaleDateString('fr-FR') : null;
      const target = `@${result?.username || identity}`;
      setActionMessage(`${managePlan} offert à ${target} — ${durationLabel(months)}${endsAt ? `, jusqu’au ${endsAt}` : months === 0 ? ', sans date de fin' : ''}.`);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Attribution impossible.');
    } finally {
      setActionBusy(null);
    }
  };

  const revoke = async () => {
    const identity = manageIdentity.trim().replace(/^@+/, '');
    if (!identity) return;
    setActionBusy('revoke'); setError(null); setActionMessage(null);
    try {
      const result = await invokeAdmin({ action: 'users.revoke_grant', identity });
      setActionMessage(`Abonnement offert révoqué pour ${identity} (${result?.revoked ?? 0} attribution active). Le compte et ses données restent intacts.`);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Révocation impossible.');
    } finally {
      setActionBusy(null);
    }
  };

  const canInviteByEmail = /^\S+@\S+\.\S+$/.test(manageIdentity.trim()) && !manageIdentity.trim().endsWith('@keep.local');

  return (
    <AdminLayout>
      <div className="page-title">Utilisateurs</div>
      <div className="page-subtitle">{filtered.length} affiché(s) / {users.length} compte(s) réellement lus dans Supabase</div>

      {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
      {actionMessage && <div className="demo-banner" style={{ borderColor: '#2e7d32' }}>{actionMessage}</div>}
      {!error && !loading && <div className="demo-banner">● MODE RÉEL — profils, numéro support KEEP, plan actif et KEEP du mois. Les comptes sans e-mail sont gérés directement par leur pseudo KEEP.</div>}

      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ marginTop: 0 }}>Récupérer un ancien essai KEEP</h3>
        <p style={{ color: 'var(--text-muted)', marginTop: 0, lineHeight: 1.55 }}>
          Pour un profil créé avec l’ancien mode anonyme puis perdu après suppression du cache. Cette action conserve exactement le même identifiant Supabase, la photo, la bio, les réseaux, la ville et les données du profil. Elle transforme seulement l’ancien accès anonyme en identifiant KEEP + mot de passe.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Pseudo KEEP, ex. adel4A"
            value={legacyUsername}
            onChange={(e) => setLegacyUsername(e.target.value)}
            style={{ flex: '1 1 260px', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 14px', fontSize: 16 }}
          />
          <button onClick={() => void recoverLegacy()} disabled={!legacyUsername.trim() || actionBusy !== null}>
            {actionBusy === 'recover' ? 'Récupération…' : 'Récupérer ce profil'}
          </button>
        </div>
        {legacyRecovery && (
          <div style={{ marginTop: 14, border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--bg-card)' }}>
            <div style={{ fontWeight: 800 }}>Identifiant : {legacyRecovery.username}</div>
            <div style={{ fontFamily: 'monospace', fontSize: 16, marginTop: 7, wordBreak: 'break-all' }}>Mot de passe temporaire : {legacyRecovery.temporaryPassword}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>Ce mot de passe n’est affiché qu’après cette récupération. Connecte-toi ensuite dans KEEP avec l’identifiant ci-dessus.</div>
            <button style={{ marginTop: 10 }} onClick={() => void copyRecovery()}>Copier les accès</button>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ marginTop: 0 }}>Ajouter / offrir un abonnement</h3>
        <p style={{ color: 'var(--text-muted)', marginTop: 0, lineHeight: 1.5 }}>
          Saisis un <strong>pseudo KEEP</strong> ou une adresse e-mail existante pour offrir Premium, Creator Pro ou Venue Pro. Choisis une durée fixe ou <strong>Illimité</strong>. À tout moment, « Révoquer » remet les droits payants à l’état normal sans supprimer le compte.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 2fr) minmax(150px, 1fr) minmax(140px, 1fr)', gap: 10, marginBottom: 10 }}>
          <input
            type="text"
            placeholder="pseudo KEEP ou utilisateur@email.fr"
            value={manageIdentity}
            onChange={(e) => setManageIdentity(e.target.value)}
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 14px' }}
          />
          <select
            value={managePlan}
            onChange={(e) => setManagePlan(e.target.value as typeof managePlan)}
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 14px' }}
          >
            <option value="PREMIUM">Premium · 2,99 €</option>
            <option value="CREATOR_PRO">Creator Pro · 9,99 €</option>
            <option value="VENUE_PRO">Venue Pro · 29,99 €</option>
          </select>
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            title="Durée du cadeau"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 14px' }}
          >
            <option value={1}>1 mois</option>
            <option value={3}>3 mois</option>
            <option value={6}>6 mois</option>
            <option value={12}>1 an</option>
            <option value={24}>2 ans</option>
            <option value={36}>3 ans</option>
            <option value={60}>5 ans</option>
            <option value={0}>Illimité</option>
          </select>
        </div>
        <input
          type="text"
          placeholder="Motif interne (optionnel)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}
        />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => void grant()} disabled={!manageIdentity.trim() || actionBusy !== null}>
            {actionBusy === 'grant' ? 'Attribution…' : `Offrir ${managePlan} — ${durationLabel(months)}`}
          </button>
          <button onClick={() => void revoke()} disabled={!manageIdentity.trim() || actionBusy !== null} style={{ opacity: 0.8 }}>
            {actionBusy === 'revoke' ? 'Révocation…' : 'Révoquer le cadeau actif'}
          </button>
          <button onClick={() => void invite()} disabled={!canInviteByEmail || actionBusy !== null} style={{ opacity: canInviteByEmail ? 1 : 0.55 }}>
            {actionBusy === 'invite' ? 'Invitation…' : 'Inviter par e-mail (optionnel)'}
          </button>
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 10 }}>
          Un cadeau ne crée jamais un nouveau compte : le profil doit déjà exister dans KEEP. L’invitation e-mail est seulement une option séparée.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <input
          type="text"
          placeholder="Rechercher (pseudo, n° KEEP, e-mail, pays, type, plan)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 14px', fontSize: 16 }}
        />
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value as PlanFilter)}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 14px', fontSize: 16 }}
        >
          {PLAN_OPTIONS.map((p) => <option key={p} value={p}>{p === 'ALL' ? 'Tous les plans' : p}</option>)}
        </select>
        <button onClick={() => void load()} disabled={loading}>Actualiser</button>
      </div>

      <table>
        <thead>
          <tr><th>Utilisateur</th><th>N° KEEP</th><th>E-mail</th><th>Pays</th><th>Type</th><th>Plan réel</th><th>KEEP ce mois</th><th>Inscrit le</th><th>Action</th></tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24 }}>Chargement de Supabase…</td></tr>}
          {!loading && filtered.length === 0 && <tr><td colSpan={9} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>Aucun utilisateur ne correspond à ces critères.</td></tr>}
          {filtered.map((u) => (
            <tr key={u.id}>
              <td><strong>@{u.username}</strong>{u.display_name ? <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{u.display_name}</div> : null}</td>
              <td><code>{memberNumber(u.id)}</code></td>
              <td>{visibleEmail(u.email)}</td>
              <td>{u.country_code ?? '—'}</td>
              <td>{u.kind ?? 'USER'}</td>
              <td>{u.plan_code ?? 'FREE'}</td>
              <td>{u.keeps_this_month ?? 0}</td>
              <td>{new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
              <td><button onClick={() => setManageIdentity(u.username)}>Gérer</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminLayout>
  );
}