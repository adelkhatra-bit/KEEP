import React, { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';

const PLAN_OPTIONS = ['ALL', 'FREE', 'PREMIUM', 'CREATOR_PRO', 'VENUE_PRO'] as const;
type PlanFilter = typeof PLAN_OPTIONS[number];
type PaidPlan = 'PREMIUM' | 'CREATOR_PRO' | 'VENUE_PRO';
type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT' | 'MODERATOR';

type DirectoryUser = {
  id: string;
  email: string | null;
  email_confirmed_at: string | null;
  username: string;
  display_name: string | null;
  country_code: string | null;
  kind: string | null;
  created_at: string;
  plan_code: string;
  keeps_this_month: number;
  avatar_url: string | null;
  free_keeps_used: number;
  social_keeps: number;
  credit_consumed: number;
  credit_limit: number | null;
  credit_remaining: number | null;
  playlist_tracks: number;
  recognized_count: number;
  account_verified: boolean;
  certification_tier: string;
};

type UserSnapshot = {
  profile: {
    id: string; username: string; display_name: string | null; bio: string | null; avatar_url: string | null;
    city: string | null; country_code: string | null; kind: string | null; website: string | null; is_public: boolean;
    discovery_hidden: boolean;
    follower_count_override: number | null;
  };
  privateInfo: { birth_date?: string | null; gender?: string | null } | null;
  socialLinks: Array<{ platform: string; url: string; visibility: string }>;
  requirements: string[];
  auth: { email: string | null; emailVerified: boolean; emailConfirmedAt: string | null; isAnonymous: boolean; bannedUntil: string | null };
  usage: {
    kept: number; ownKeeps: number; socialKeeps: number; passed: number; publicKeeps: number; playlists: number;
    downloadsConsumed: number; recognizedCount: number; lastRecognizedAt: string | null;
  };
};

type LegacyRecovery = { username: string; temporaryPassword: string; message?: string };

const REQUIREMENTS = [
  ['BIRTH_DATE', 'Date de naissance'], ['GENDER', 'Genre'],
  ['AVATAR', 'Photo'], ['CITY', 'Ville'], ['COUNTRY', 'Pays'], ['BIO', 'Bio'],
  ['SOCIAL_LINK', 'Au moins un réseau'], ['WEBSITE', 'Site web'],
] as const;

async function invokeAdmin(body: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase Super Admin non configuré.');
  const { data, error } = await supabase.functions.invoke('keep-admin-control', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.message || data.error);
  return data;
}

async function invokeUserControl(body: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase Super Admin non configuré.');
  const { data, error } = await supabase.functions.invoke('keep-admin-user-control', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.message || data.error);
  return data;
}

function visibleEmail(email: string | null) {
  if (!email || email.endsWith('@keep.local')) return 'Sans e-mail';
  return email;
}
function memberNumber(id: string) { return `KEEP-${id.replace(/-/g, '').slice(0, 12).toUpperCase()}`; }
function durationLabel(months: number) { return months === 0 ? 'Illimité' : months === 12 ? '1 an' : months === 24 ? '2 ans' : `${months} mois`; }
function isBanned(until: string | null | undefined) { return Boolean(until && new Date(until).getTime() > Date.now()); }
function planColor(plan: string) {
  if (plan === 'VENUE_PRO') return '#d6aa36';
  if (plan === 'CREATOR_PRO') return '#b788ff';
  if (plan === 'PREMIUM') return '#6f8cff';
  return '#31c981';
}
function certificationLabel(user: DirectoryUser) {
  if (!user.account_verified) return 'ESSAI';
  return user.certification_tier || user.plan_code || 'FREE';
}

export default function Users() {
  const [query, setQuery] = useState('');
  const [planFilter, setPlanFilter] = useState<PlanFilter>('ALL');
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);

  const [selected, setSelected] = useState<DirectoryUser | null>(null);
  const [snapshot, setSnapshot] = useState<UserSnapshot | null>(null);
  const [requirements, setRequirements] = useState<string[]>([]);
  const [plan, setPlan] = useState<PaidPlan>('PREMIUM');
  const [months, setMonths] = useState(12);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditReason, setCreditReason] = useState('');
  // Adel (04/09/2026) : "je veux pouvoir le débloquer à un utilisateur ...
  // pareil pour soirée limitée pour la formule Pro ... mettre un minimum
  // d'abonnés comme ça je pourrais faire des tests" -- keep_event_creation_
  // status ET keep_growth_reward_status lisent tous les deux le nombre RÉEL
  // d'abonnés (follows) ; ce champ force une valeur de test pour CE compte
  // uniquement, sans toucher aux vrais abonnés ni aux réglages globaux.
  const [followerOverride, setFollowerOverride] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailSavedAt, setEmailSavedAt] = useState<string | null>(null);

  const [legacyUsername, setLegacyUsername] = useState('');
  const [legacyRecovery, setLegacyRecovery] = useState<LegacyRecovery | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      if (!supabase) throw new Error('Supabase Super Admin non configuré.');
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error('Session Super Admin expirée. Reconnecte-toi.');
      let result = await supabase.rpc('admin_user_directory');
      if (result.error && /jwt|token|session|auth/i.test(String(result.error.message || ''))) {
        await supabase.auth.refreshSession();
        result = await supabase.rpc('admin_user_directory');
      }
      if (result.error) throw result.error;
      const rows = Array.isArray(result.data) ? result.data : [];
      setUsers(rows as DirectoryUser[]);
      if (!rows.length) setError('Annuaire chargé mais aucun profil n’est remonté. Actualise la session Super Admin.');
    } catch (e: any) { setUsers([]); setError(e?.message ?? 'Impossible de charger les utilisateurs.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!supabase) return;
    void supabase.rpc('get_my_admin_role').then(
      ({ data }) => {
        const role = String(data || '') as AdminRole;
        setAdminRole(['SUPER_ADMIN','ADMIN','SUPPORT','MODERATOR'].includes(role) ? role : null);
      },
      () => setAdminRole(null),
    );
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter((u) => {
      if (planFilter !== 'ALL' && u.plan_code !== planFilter) return false;
      if (!needle) return true;
      return [u.username, u.display_name ?? '', visibleEmail(u.email), u.country_code ?? '', u.kind ?? '', u.plan_code, memberNumber(u.id)]
        .some((value) => value.toLowerCase().includes(needle));
    });
  }, [users, query, planFilter]);

  const openUser = async (u: DirectoryUser) => {
    setSelected(u); setSnapshot(null); setRequirements([]); setTemporaryPassword(null); setEmailInput(''); setEditingEmail(false); setEmailSavedAt(null); setMessage(null); setError(null); setBusy('load'); setFollowerOverride('');
    try {
      const result = await invokeUserControl({ action: 'get', profileId: u.id });
      setSnapshot(result.data as UserSnapshot);
      setRequirements(Array.isArray(result.data?.requirements) ? result.data.requirements : []);
      const override = (result.data as UserSnapshot)?.profile?.follower_count_override;
      setFollowerOverride(override == null ? '' : String(override));
    } catch (e: any) { setError(e?.message ?? 'Impossible de charger ce profil.'); }
    finally { setBusy(null); }
  };

  const refreshSelected = async () => {
    if (!selected) return;
    const result = await invokeUserControl({ action: 'get', profileId: selected.id });
    setSnapshot(result.data as UserSnapshot);
    setRequirements(Array.isArray(result.data?.requirements) ? result.data.requirements : []);
  };

  const saveRequirements = async () => {
    if (!selected) return;
    setBusy('requirements'); setError(null);
    try {
      const result = await invokeUserControl({ action: 'set_requirements', profileId: selected.id, requirements });
      setSnapshot(result.data as UserSnapshot);
      setMessage('Obligations enregistrées pour cet utilisateur.');
    } catch (e: any) { setError(e?.message ?? 'Enregistrement impossible.'); }
    finally { setBusy(null); }
  };

  const grant = async () => {
    if (!selected) return;
    setBusy('grant'); setError(null);
    try {
      const result = await invokeAdmin({ action: 'users.grant', identity: selected.username, planCode: plan, months, reason: 'Offert depuis le Super Admin Loki' });
      const endsAt = result?.data?.endsAt ? new Date(result.data.endsAt).toLocaleDateString('fr-FR') : null;
      setMessage(`${plan} offert à @${selected.username} — ${durationLabel(months)}${endsAt ? `, jusqu’au ${endsAt}` : ''}.`);
      await load(); await refreshSelected();
    } catch (e: any) { setError(e?.message ?? 'Attribution impossible.'); }
    finally { setBusy(null); }
  };

  const revoke = async () => {
    if (!selected) return;
    setBusy('revoke'); setError(null);
    try {
      await invokeAdmin({ action: 'users.revoke_grant', identity: selected.username });
      setMessage(`Avantage offert retiré pour @${selected.username}. Le compte et les données restent intacts.`);
      await load(); await refreshSelected();
    } catch (e: any) { setError(e?.message ?? 'Révocation impossible.'); }
    finally { setBusy(null); }
  };

  const grantCredits = async (amountValue: number) => {
    if (!selected) return;
    if (!Number.isFinite(amountValue) || amountValue === 0) return setError('Indique un nombre de Free différent de 0.');
    // Adel (04/09/2026) : "je veux pouvoir valider, je veux pas que quand
    // j'appuie sur un bouton ça part direct ... j'ai même pas pu mettre la
    // raison" -- une vraie confirmation avant l'envoi réel (même geste que
    // la réinitialisation de mot de passe plus bas), qui rappelle le montant
    // ET la raison telle qu'elle sera vue par l'utilisateur.
    const reasonPreview = creditReason.trim() || '(aucune raison précisée)';
    if (typeof window !== 'undefined' && !window.confirm(`Confirmer ${amountValue > 0 ? '+' : ''}${amountValue} Free pour @${selected.username} ?\n\nRaison affichée à l'utilisateur : ${reasonPreview}\n\nUne notification part immédiatement après validation.`)) return;
    setBusy('credits'); setError(null);
    try {
      const result = await invokeUserControl({ action: 'grant_credits', profileId: selected.id, amount: amountValue, reason: creditReason.trim() });
      setSelected((prev) => prev ? { ...prev, credit_remaining: Number(result.creditRemaining ?? prev.credit_remaining) } : prev);
      setSnapshot(result.data as UserSnapshot);
      setMessage(`${amountValue > 0 ? '+' : ''}${amountValue} Free pour @${selected.username} -- notification envoyée. Nouveau solde : ${result.creditRemaining}.`);
      setCreditAmount(''); setCreditReason('');
      await load();
    } catch (e: any) { setError(e?.message ?? 'Impossible de créditer ce compte.'); }
    finally { setBusy(null); }
  };

  const saveFollowerOverride = async (value: number | null) => {
    if (!selected || !supabase) return;
    setBusy('followerOverride'); setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('admin_set_follower_count_override', { p_profile_id: selected.id, p_override: value });
      if (rpcError) throw rpcError;
      setFollowerOverride(value == null ? '' : String(value));
      setSnapshot((prev) => prev ? { ...prev, profile: { ...prev.profile, follower_count_override: value } } : prev);
      setMessage(value == null ? `Nombre d'abonnés réel restauré pour @${selected.username}.` : `Nombre d'abonnés forcé à ${value} pour @${selected.username} (test uniquement, n'affecte pas les vrais abonnés).`);
    } catch (e: any) { setError(e?.message ?? 'Impossible de modifier ce réglage de test.'); }
    finally { setBusy(null); }
  };

  const resetPassword = async () => {
    if (!selected) return;
    if (typeof window !== 'undefined' && !window.confirm(`Générer un nouveau mot de passe temporaire pour @${selected.username} ? L’ancien ne fonctionnera plus.`)) return;
    setBusy('password'); setError(null); setTemporaryPassword(null);
    try {
      const result = await invokeUserControl({ action: 'reset_password', profileId: selected.id });
      setTemporaryPassword(String(result.temporaryPassword || ''));
      setMessage(`Mot de passe temporaire généré pour @${selected.username}. Aucun e-mail n’a été envoyé.`);
      if (result.data) setSnapshot(result.data as UserSnapshot);
    } catch (e: any) { setError(e?.message ?? 'Réinitialisation impossible.'); }
    finally { setBusy(null); }
  };

  const setUserEmail = async () => {
    if (!selected || !emailInput.trim()) return;
    setBusy('email'); setError(null);
    try {
      const result = await invokeUserControl({ action: 'set_email', profileId: selected.id, email: emailInput.trim() });
      if (result.data) setSnapshot(result.data as UserSnapshot);
      setMessage(`Adresse e-mail enregistrée pour @${selected.username}.`);
      setEmailInput('');
      setEditingEmail(false);
      setEmailSavedAt(new Date().toLocaleTimeString('fr-FR'));
      await load();
    } catch (e: any) {
      const code = String(e?.message || '');
      setError(code === 'invalid_email' ? 'Adresse e-mail invalide.' : code === 'email_taken' ? 'Cette adresse est déjà utilisée par un autre compte Loki.' : e?.message ?? 'Enregistrement impossible.');
    } finally { setBusy(null); }
  };

  const copyTemporaryPassword = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { setError('Copie impossible -- sélectionne le mot de passe manuellement.'); }
  };

  const toggleBlocked = async () => {
    if (!selected || !snapshot) return;
    const blocked = !isBanned(snapshot.auth.bannedUntil);
    setBusy('block'); setError(null);
    try {
      const result = await invokeUserControl({ action: 'set_blocked', profileId: selected.id, blocked });
      setSnapshot(result.data as UserSnapshot);
      setMessage(blocked ? `@${selected.username} est bloqué.` : `@${selected.username} peut de nouveau se connecter.`);
    } catch (e: any) { setError(e?.message ?? 'Action impossible.'); }
    finally { setBusy(null); }
  };

  const toggleDiscoveryHidden = async () => {
    if (!selected || !snapshot) return;
    const hidden = !snapshot.profile.discovery_hidden;
    setBusy('discovery'); setError(null);
    try {
      const result = await invokeUserControl({ action: 'set_discovery_hidden', profileId: selected.id, hidden });
      setSnapshot(result.data as UserSnapshot);
      setMessage(hidden ? `@${selected.username} est masqué de Découvertes.` : `@${selected.username} est de nouveau visible dans Découvertes.`);
    } catch (e: any) { setError(e?.message ?? 'Modification de visibilité impossible.'); }
    finally { setBusy(null); }
  };

  const deleteUser = async () => {
    if (!selected) return;
    if (typeof window !== 'undefined' && !window.confirm(`Supprimer définitivement @${selected.username} ? Profil, musiques, playlists et accès seront supprimés.`)) return;
    setBusy('delete'); setError(null);
    try {
      await invokeUserControl({ action: 'delete', profileId: selected.id });
      setMessage(`@${selected.username} a été supprimé.`);
      setSelected(null); setSnapshot(null); setTemporaryPassword(null); await load();
    } catch (e: any) { setError(e?.message ?? 'Suppression impossible.'); }
    finally { setBusy(null); }
  };

  const recoverLegacy = async () => {
    const username = legacyUsername.trim().replace(/^@+/, '');
    if (!username) return;
    setBusy('recover'); setError(null); setLegacyRecovery(null);
    try {
      const result = await invokeAdmin({ action: 'users.recover_legacy', username });
      setLegacyRecovery({ username: String(result?.username || username), temporaryPassword: String(result?.temporaryPassword || ''), message: result?.message });
      await load();
    } catch (e: any) { setError(e?.message ?? 'Récupération impossible.'); }
    finally { setBusy(null); }
  };

  const toggleRequirement = (key: string) => setRequirements((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  const canRequirements = adminRole === 'SUPER_ADMIN' || adminRole === 'ADMIN' || adminRole === 'SUPPORT';
  const canGrant = adminRole === 'SUPER_ADMIN' || adminRole === 'ADMIN';
  const canModerateDiscovery = adminRole === 'SUPER_ADMIN' || adminRole === 'ADMIN' || adminRole === 'MODERATOR';
  const canBlock = adminRole === 'SUPER_ADMIN' || adminRole === 'ADMIN';
  const canDestruct = adminRole === 'SUPER_ADMIN';

  return <AdminLayout>
    <div className="page-title">Utilisateurs</div>
    <div className="page-subtitle">{users.length} compte(s) réels · écoute, FREE, profil, certification, abonnement et récupération au même endroit</div>
    {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
    {message && <div className="demo-banner" style={{ borderColor: '#2e7d32' }}>{message}</div>}

    <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
      <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Rechercher pseudo, e-mail, n° KEEP…" style={{ flex:'1 1 320px', minWidth:220, background:'var(--bg-card)', border:'1px solid var(--border)', color:'var(--text)', borderRadius:10, padding:'11px 14px' }}/>
      <select value={planFilter} onChange={(e)=>setPlanFilter(e.target.value as PlanFilter)} style={{ background:'var(--bg-card)', border:'1px solid var(--border)', color:'var(--text)', borderRadius:10, padding:'11px 14px' }}>
        {PLAN_OPTIONS.map((p)=><option key={p} value={p}>{p==='ALL'?'Tous les plans':p}</option>)}
      </select>
      <button onClick={()=>void load()} disabled={loading}>Actualiser</button>
    </div>

    <div className="card" style={{ padding:0, overflowX:'auto', overflowY:'hidden', width:'100%', WebkitOverflowScrolling:'touch' }}>
      <table style={{ margin:0, width:'100%', minWidth:860, tableLayout:'fixed' }}>
        <thead><tr><th style={{width:'28%'}}>Utilisateur</th><th style={{width:'12%'}}>Certification</th><th>Reconnu</th><th>Morceaux débités</th><th>Depuis utilisateurs</th><th>FREE restant</th><th>Bibliothèque</th><th style={{width:72}}></th></tr></thead>
        <tbody>
          {loading && <tr><td colSpan={8} style={{textAlign:'center',padding:24}}>Chargement…</td></tr>}
          {!loading && filtered.length===0 && <tr><td colSpan={8} style={{textAlign:'center',padding:24,color:'var(--text-muted)'}}>Aucun utilisateur.</td></tr>}
          {filtered.map((u)=><tr key={u.id} onClick={()=>void openUser(u)} style={{ cursor:'pointer' }}>
            <td><div style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>{u.avatar_url?<img src={u.avatar_url} alt="" style={{width:32,height:32,borderRadius:'50%',objectFit:'cover',flexShrink:0}}/>:<div style={{width:32,height:32,borderRadius:'50%',background:'#251d32',flexShrink:0}}/>}<div style={{minWidth:0}}><strong style={{display:'block',overflow:'hidden',textOverflow:'ellipsis'}}>@{u.username}</strong><div style={{fontSize:10,color:'var(--text-muted)',overflow:'hidden',textOverflow:'ellipsis'}}>{visibleEmail(u.email)}</div></div></div></td>
            <td><span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'4px 6px',borderRadius:999,border:`1px solid ${u.account_verified ? planColor(u.certification_tier || u.plan_code) : '#6f6678'}`,color:u.account_verified ? planColor(u.certification_tier || u.plan_code) : '#9d94a8',fontWeight:800,fontSize:10}}>{u.account_verified?'●':'○'} {certificationLabel(u)}</span></td>
            <td>{u.recognized_count ?? 0}</td><td>{u.free_keeps_used ?? 0}</td><td>{u.social_keeps ?? 0}</td><td>{u.credit_remaining == null ? '∞' : u.credit_remaining}</td><td>{u.playlist_tracks ?? 0}</td>
            <td><button onClick={(e)=>{e.stopPropagation();void openUser(u)}} style={{padding:'7px 9px'}}>Gérer</button></td>
          </tr>)}
        </tbody>
      </table>
    </div>

    <details style={{marginTop:18,display:canRequirements?'block':'none'}}><summary style={{cursor:'pointer',color:'var(--text-muted)'}}>Récupérer un ancien profil de test</summary>
      <div className="card" style={{marginTop:10}}><div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
        <input value={legacyUsername} onChange={(e)=>setLegacyUsername(e.target.value)} placeholder="Pseudo Loki" style={{flex:'1 1 260px',background:'var(--bg-card)',border:'1px solid var(--border)',color:'var(--text)',borderRadius:8,padding:'10px 14px'}}/>
        <button onClick={()=>void recoverLegacy()} disabled={!legacyUsername.trim()||busy!==null}>Récupérer</button>
      </div>
      {legacyRecovery && <div style={{marginTop:10,fontFamily:'monospace'}}>@{legacyRecovery.username} · mot de passe temporaire : {legacyRecovery.temporaryPassword}</div>}
      </div>
    </details>

    {selected && <div onClick={()=>setSelected(null)} style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(0,0,0,.72)',display:'flex',alignItems:'center',justifyContent:'center',padding:18}}>
      <div onClick={(e)=>e.stopPropagation()} style={{width:'min(800px,96vw)',maxHeight:'90vh',overflowY:'auto',overflowX:'hidden',background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:18,padding:20,boxShadow:'0 20px 80px rgba(0,0,0,.5)'}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start'}}>
          <div style={{display:'flex',gap:12,alignItems:'center',minWidth:0}}>{snapshot?.profile.avatar_url?<img src={snapshot.profile.avatar_url} alt="" style={{width:56,height:56,borderRadius:'50%',objectFit:'cover',flexShrink:0}}/>:<div style={{width:56,height:56,borderRadius:'50%',background:'#251d32',flexShrink:0}}/>}<div style={{minWidth:0}}><div style={{fontSize:22,fontWeight:900,overflowWrap:'anywhere'}}>@{selected.username}</div><div style={{color:'var(--text-muted)',fontSize:12,overflowWrap:'anywhere'}}>{visibleEmail(selected.email)} · {memberNumber(selected.id)}</div><div style={{marginTop:5,color:selected.account_verified?planColor(selected.certification_tier || selected.plan_code):'#9d94a8',fontSize:11,fontWeight:900}}>● Certification Loki : {certificationLabel(selected)}</div></div></div>
          <button onClick={()=>setSelected(null)}>Fermer</button>
        </div>

        {busy==='load' || !snapshot ? <div style={{padding:30,textAlign:'center'}}>Chargement du profil réel…</div> : <>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(135px,1fr))',gap:8,marginTop:16}}>
            {[
              ['Certification', selected.account_verified ? certificationLabel(selected) : 'Compte non validé'],
              ['FREE restant', selected.credit_remaining == null ? '∞ (illimité)' : String(selected.credit_remaining)],
              ['E-mail', snapshot.auth.email ? (snapshot.auth.emailVerified?'Vérifié':'Présent') : 'Non ajouté'],
              ['Reconnaissances', String(snapshot.usage.recognizedCount)],
              ['Morceaux débités', String(snapshot.usage.ownKeeps)],
              ['Reprises par d’autres (impact)', String(snapshot.usage.socialKeeps)],
              ['Morceaux total', String(snapshot.usage.kept)],
              ['Publics', String(snapshot.usage.publicKeeps)],
              ['Playlists', String(snapshot.usage.playlists)],
              ['Réseaux', String(snapshot.socialLinks.length)],
              ['Naissance', snapshot.privateInfo?.birth_date || 'Manquante'],
              ['Ville / pays', [snapshot.profile.city,snapshot.profile.country_code].filter(Boolean).join(' · ') || 'Manquant'],
              ['Découvertes', snapshot.profile.discovery_hidden ? 'Masqué' : 'Visible'],
            ].map(([label,value])=><div key={label} style={{border:'1px solid var(--border)',borderRadius:10,padding:10,minWidth:0}}><div style={{fontSize:10,color:'var(--text-muted)'}}>{label}</div><strong style={{overflowWrap:'anywhere'}}>{value}</strong></div>)}
          </div>

          {/* Adel (04/09/2026) : "je puisse cliquer dessus et rajouter du
              Free pour recréditer ... ça enverra une notification à
              l'utilisateur, par exemple offrir un bonus pour le dérangement."
              Ledger audité (admin_credit_grants) + notification automatique,
              jamais un UPDATE muet d'un compteur. */}
          <div style={{marginTop:18,borderTop:'1px solid var(--border)',paddingTop:16,display:canBlock?'block':'none'}}>
            <h3 style={{margin:'0 0 6px'}}>Créditer / débiter des Free</h3>
            <div style={{color:'var(--text-muted)',fontSize:12}}>Un nombre positif ajoute des Free (ex : bonus surprise, geste commercial suite à un bug). Un nombre négatif corrige le solde à la baisse. Rien ne part avant que tu valides sur la fenêtre de confirmation.</div>
            <div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}>
              <input type="number" value={creditAmount} onChange={(e)=>setCreditAmount(e.target.value)} placeholder="Ex : 10 ou -5" style={{width:140,background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text)',borderRadius:8,padding:'9px 10px'}}/>
              <input value={creditReason} onChange={(e)=>setCreditReason(e.target.value)} placeholder="Raison affichée à l’utilisateur (facultatif)" style={{flex:'1 1 260px',background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text)',borderRadius:8,padding:'9px 10px'}}/>
              <button onClick={()=>void grantCredits(Math.trunc(Number(creditAmount)))} disabled={busy!==null || !creditAmount.trim()} style={{background:'var(--primary)',color:'#fff',border:'none',borderRadius:8,padding:'9px 16px',fontWeight:800,cursor:busy!==null?'wait':'pointer',opacity:busy!==null||!creditAmount.trim()?0.6:1}}>{busy==='credits'?'Envoi…':'Valider'}</button>
            </div>
            {/* Adel (04/09/2026) : "je mets 5 Free et ça part automatiquement
                ... j'ai même pas pu mettre la raison, c'est pas logique" --
                un raccourci ne doit plus jamais envoyer directement : il se
                contente maintenant de remplir le montant, pour laisser le
                temps d'écrire la raison puis de valider via le seul bouton
                qui envoie réellement (avec confirmation en plus). */}
            <div style={{color:'var(--text-muted)',fontSize:11,marginTop:10}}>Raccourcis (remplissent juste le montant, n’envoient rien) :</div>
            <div style={{display:'flex',gap:8,marginTop:6,flexWrap:'wrap'}}>
              {[5,10,20,50].map((preset)=><button key={preset} onClick={()=>setCreditAmount(String(preset))} disabled={busy!==null} style={{background:'var(--primary)',color:'#fff',border:'none',borderRadius:8,padding:'9px 14px',fontWeight:800,cursor:busy!==null?'wait':'pointer',opacity:busy!==null?0.6:1}}>+{preset} Free</button>)}
            </div>
          </div>

          {/* Adel (04/09/2026) : "je veux pouvoir le débloquer à un
              utilisateur ... pareil pour soirée limitée pour la formule Pro
              ... mettre un minimum d'abonnés comme ça je pourrais faire des
              tests" -- Soirées (VENUE_PRO comme les autres) et les paliers de
              croissance sont bloqués tant que le compte n'a pas 500 abonnés
              RÉELS. Ce champ force un nombre d'abonnés de test pour CE
              compte uniquement (n'écrit jamais dans `follows`, ne touche à
              aucun autre utilisateur) ; vide = comportement réel normal. */}
          <div style={{marginTop:18,borderTop:'1px solid var(--border)',paddingTop:16,display:canBlock?'block':'none'}}>
            <h3 style={{margin:'0 0 6px'}}>Test : forcer le nombre d’abonnés</h3>
            <div style={{color:'var(--text-muted)',fontSize:12}}>Débloque « Créer un événement » et les paliers de croissance (Découvertes, Essais Vibes, Audience Pro) sans attendre de vrais abonnés. N’affecte que ce compte, jamais ses vrais abonnés ni les autres utilisateurs. Laisse vide pour revenir au nombre réel.</div>
            <div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap',alignItems:'center'}}>
              <input type="number" min="0" value={followerOverride} onChange={(e)=>setFollowerOverride(e.target.value)} placeholder="Ex : 500" style={{width:140,background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text)',borderRadius:8,padding:'9px 10px'}}/>
              <button onClick={()=>void saveFollowerOverride(followerOverride.trim()==='' ? null : Math.max(0,Math.trunc(Number(followerOverride))))} disabled={busy!==null} style={{background:'var(--primary)',color:'#fff',border:'none',borderRadius:8,padding:'9px 16px',fontWeight:800,cursor:busy!==null?'wait':'pointer',opacity:busy!==null?0.6:1}}>{busy==='followerOverride'?'Enregistrement…':'Appliquer'}</button>
              {snapshot.profile.follower_count_override != null && <button onClick={()=>void saveFollowerOverride(null)} disabled={busy!==null} style={{background:'transparent',border:'1px solid var(--border)',color:'var(--text)',borderRadius:8,padding:'9px 16px',fontWeight:700,cursor:busy!==null?'wait':'pointer',opacity:busy!==null?0.6:1}}>Revenir au réel</button>}
            </div>
            {snapshot.profile.follower_count_override != null && <div style={{color:'#ffb454',fontSize:11,marginTop:8,fontWeight:700}}>⚠ Actif : ce compte est actuellement vu avec {snapshot.profile.follower_count_override} abonnés (valeur de test).</div>}
          </div>

          <div style={{marginTop:18,borderTop:'1px solid var(--border)',paddingTop:16,display:canDestruct?'block':'none'}}>
            <h3 style={{margin:'0 0 6px'}}>Accès au compte</h3>
            <div style={{color:'var(--text-muted)',fontSize:12}}>Pas besoin d’attendre un e-mail : le Super Admin peut générer un mot de passe temporaire.</div>
            <button style={{marginTop:10,background:'var(--primary)',color:'#fff',border:'none',borderRadius:8,padding:'9px 16px',fontWeight:800,cursor:busy!==null?'wait':'pointer',opacity:busy!==null?0.6:1}} onClick={()=>void resetPassword()} disabled={busy!==null}>{busy==='password'?'Réinitialisation…':'Générer un mot de passe temporaire'}</button>
            {temporaryPassword && <div style={{marginTop:10,padding:12,border:'1px solid #6f8cff',borderRadius:10,background:'#121728'}}>
              <div style={{fontSize:11,color:'var(--text-muted)'}}>À copier maintenant — il ne sera pas renvoyé par e-mail</div>
              <div style={{display:'flex',alignItems:'center',gap:8,marginTop:4}}>
                <div style={{fontFamily:'monospace',fontSize:18,fontWeight:900,wordBreak:'break-all',flex:1}}>{temporaryPassword}</div>
                <button onClick={()=>void copyTemporaryPassword(temporaryPassword)} style={{flexShrink:0,background:copied?'#2e7d32':'#3a3450'}}>{copied?'Copié ✓':'Copier'}</button>
              </div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginTop:5}}>Connexion possible avec le pseudo Loki ou l’e-mail réel + ce mot de passe.</div>
            </div>}

            <div style={{marginTop:16,paddingTop:14,borderTop:'1px solid var(--border)'}}>
              <div style={{fontWeight:700,marginBottom:4}}>Attribuer une adresse e-mail</div>
              <div style={{color:'var(--text-muted)',fontSize:12,marginBottom:8}}>Pour un compte créé avant le 01/09/2026 (proche, ami...) sans e-mail -- utile aussi pour que « mot de passe oublié » fonctionne pour lui.</div>
              {snapshot.auth.email && !editingEmail ? (
                <div style={{padding:12,border:'1px solid #2e7d32',borderRadius:10,background:'#0f1f14',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:11,color:'#7fd99a',fontWeight:900}}>✓ E-mail enregistré{emailSavedAt ? ` à ${emailSavedAt}` : ''}</div>
                    <div style={{fontWeight:700,marginTop:2,overflowWrap:'anywhere'}}>{snapshot.auth.email}</div>
                  </div>
                  <button onClick={()=>{setEditingEmail(true); setEmailInput(snapshot.auth.email || '');}} style={{flexShrink:0}}>Modifier</button>
                </div>
              ) : (
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e)=>setEmailInput(e.target.value)}
                    placeholder="nom@exemple.com"
                    style={{flex:'1 1 220px',background:'var(--bg-card)',border:'1px solid var(--border)',color:'var(--text)',borderRadius:8,padding:'10px 14px'}}
                  />
                  <button onClick={()=>void setUserEmail()} disabled={busy!==null || !emailInput.trim()}>{busy==='email'?'Enregistrement…':'Enregistrer l’e-mail'}</button>
                  {snapshot.auth.email && <button onClick={()=>{setEditingEmail(false); setEmailInput('');}} disabled={busy!==null}>Annuler</button>}
                </div>
              )}
            </div>
          </div>

          <div style={{marginTop:18,borderTop:'1px solid var(--border)',paddingTop:16,display:canRequirements?'block':'none'}}>
            <h3 style={{margin:'0 0 4px'}}>À imposer à cet utilisateur</h3>
            <div style={{color:'var(--text-muted)',fontSize:12,marginBottom:10}}>Coche uniquement ce que Loki devra lui demander de compléter.</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:7}}>
              {REQUIREMENTS.map(([key,label])=><label key={key} style={{display:'flex',gap:8,alignItems:'center',border:'1px solid var(--border)',borderRadius:9,padding:'9px 10px',cursor:'pointer'}}><input type="checkbox" checked={requirements.includes(key)} onChange={()=>toggleRequirement(key)}/><span>{label}</span></label>)}
            </div>
            <button style={{marginTop:10}} onClick={()=>void saveRequirements()} disabled={busy!==null}>{busy==='requirements'?'Enregistrement…':'Enregistrer les obligations'}</button>
          </div>

          <div style={{marginTop:18,borderTop:'1px solid var(--border)',paddingTop:16,display:canGrant?'block':'none'}}>
            <h3 style={{margin:'0 0 10px'}}>Abonnement offert</h3>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:8}}>
              <select value={plan} onChange={(e)=>setPlan(e.target.value as PaidPlan)} style={{background:'var(--bg-card)',border:'1px solid var(--border)',color:'var(--text)',borderRadius:8,padding:'10px 12px'}}><option value="PREMIUM">Premium · 2,99 €</option><option value="CREATOR_PRO">Creator Pro · 9,99 €</option><option value="VENUE_PRO">Venue Pro · 29,99 €</option></select>
              <select value={months} onChange={(e)=>setMonths(Number(e.target.value))} style={{background:'var(--bg-card)',border:'1px solid var(--border)',color:'var(--text)',borderRadius:8,padding:'10px 12px'}}><option value={1}>1 mois</option><option value={3}>3 mois</option><option value={6}>6 mois</option><option value={12}>1 an</option><option value={24}>2 ans</option><option value={0}>Illimité</option></select>
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}><button onClick={()=>void grant()} disabled={busy!==null}>Offrir {plan}</button><button onClick={()=>void revoke()} disabled={busy!==null} style={{opacity:.8}}>Arrêter l’offre</button></div>
          </div>

          <div style={{marginTop:18,borderTop:'1px solid var(--border)',paddingTop:16,display:canModerateDiscovery?'block':'none'}}>
            <h3 style={{margin:'0 0 5px'}}>Visibilité Découvertes</h3>
            <div style={{color:'var(--text-muted)',fontSize:12,marginBottom:10}}>Masquer retire uniquement ce profil de l’onglet Découvertes. Son compte, ses données et son lien de profil restent intacts.</div>
            <button onClick={()=>void toggleDiscoveryHidden()} disabled={busy!==null} style={{background:snapshot.profile.discovery_hidden?'#2e7d32':'#5b3f7f'}}>{busy==='discovery'?'Enregistrement…':snapshot.profile.discovery_hidden?'Rendre visible dans Découvertes':'Masquer de Découvertes'}</button>
          </div>

          <div style={{marginTop:18,borderTop:'1px solid var(--border)',paddingTop:16,display:(canBlock||canDestruct)?'flex':'none',gap:8,flexWrap:'wrap'}}>
            <button onClick={()=>void toggleBlocked()} disabled={busy!==null} style={{display:canBlock?'inline-block':'none'}}>{isBanned(snapshot.auth.bannedUntil)?'Débloquer le compte':'Bloquer le compte'}</button>
            <button onClick={()=>void deleteUser()} disabled={busy!==null} style={{background:'#7a1f2a',display:canDestruct?'inline-block':'none'}}>Supprimer définitivement</button>
          </div>
        </>}
      </div>
    </div>}
  </AdminLayout>;
}