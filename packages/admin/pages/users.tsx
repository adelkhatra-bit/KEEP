import React, { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';

const PLAN_OPTIONS = ['ALL', 'FREE', 'PREMIUM', 'CREATOR_PRO', 'VENUE_PRO'] as const;
type PlanFilter = typeof PLAN_OPTIONS[number];
type PaidPlan = 'PREMIUM' | 'CREATOR_PRO' | 'VENUE_PRO';

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
};

type UserSnapshot = {
  profile: {
    id: string; username: string; display_name: string | null; bio: string | null; avatar_url: string | null;
    city: string | null; country_code: string | null; kind: string | null; website: string | null; is_public: boolean;
  };
  privateInfo: { birth_date?: string | null; gender?: string | null } | null;
  socialLinks: Array<{ platform: string; url: string; visibility: string }>;
  requirements: string[];
  auth: { email: string | null; emailVerified: boolean; emailConfirmedAt: string | null; isAnonymous: boolean; bannedUntil: string | null };
  usage: { kept: number; passed: number; publicKeeps: number; playlists: number; downloadsConsumed: number };
};

type LegacyRecovery = { username: string; temporaryPassword: string; message?: string };

const REQUIREMENTS = [
  ['EMAIL_VERIFIED', 'E-mail vérifié'], ['BIRTH_DATE', 'Date de naissance'], ['GENDER', 'Genre'],
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

export default function Users() {
  const [query, setQuery] = useState('');
  const [planFilter, setPlanFilter] = useState<PlanFilter>('ALL');
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [selected, setSelected] = useState<DirectoryUser | null>(null);
  const [snapshot, setSnapshot] = useState<UserSnapshot | null>(null);
  const [requirements, setRequirements] = useState<string[]>([]);
  const [plan, setPlan] = useState<PaidPlan>('PREMIUM');
  const [months, setMonths] = useState(12);
  const [busy, setBusy] = useState<string | null>(null);

  const [legacyUsername, setLegacyUsername] = useState('');
  const [legacyRecovery, setLegacyRecovery] = useState<LegacyRecovery | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      if (!supabase) throw new Error('Supabase Super Admin non configuré.');
      const { data, error: rpcError } = await supabase.rpc('admin_user_directory');
      if (rpcError) throw rpcError;
      setUsers((data ?? []) as DirectoryUser[]);
    } catch (e: any) { setError(e?.message ?? 'Impossible de charger les utilisateurs.'); }
    finally { setLoading(false); }
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

  const openUser = async (u: DirectoryUser) => {
    setSelected(u); setSnapshot(null); setRequirements([]); setMessage(null); setError(null); setBusy('load');
    try {
      const result = await invokeUserControl({ action: 'get', profileId: u.id });
      setSnapshot(result.data as UserSnapshot);
      setRequirements(Array.isArray(result.data?.requirements) ? result.data.requirements : []);
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
      const result = await invokeAdmin({ action: 'users.grant', identity: selected.username, planCode: plan, months, reason: 'Offert depuis le Super Admin KEEP' });
      const endsAt = result?.data?.endsAt ? new Date(result.data.endsAt).toLocaleDateString('fr-FR') : null;
      setMessage(`${plan} offert à @${selected.username} — ${durationLabel(months)}${endsAt ? `, jusqu’au ${endsAt}` : ''}. Une notification KEEP est créée automatiquement.`);
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

  const deleteUser = async () => {
    if (!selected) return;
    if (typeof window !== 'undefined' && !window.confirm(`Supprimer définitivement @${selected.username} ? Le compte pourra ensuite être recréé.`)) return;
    setBusy('delete'); setError(null);
    try {
      await invokeUserControl({ action: 'delete', profileId: selected.id });
      setMessage(`@${selected.username} a été supprimé.`);
      setSelected(null); setSnapshot(null); await load();
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

  return <AdminLayout>
    <div className="page-title">Utilisateurs</div>
    <div className="page-subtitle">{users.length} compte(s) réels dans KEEP · clique sur un utilisateur pour tout gérer</div>
    {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
    {message && <div className="demo-banner" style={{ borderColor: '#2e7d32' }}>{message}</div>}

    <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
      <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Rechercher pseudo, e-mail, n° KEEP…" style={{ flex:'1 1 320px', minWidth:220, background:'var(--bg-card)', border:'1px solid var(--border)', color:'var(--text)', borderRadius:10, padding:'11px 14px' }}/>
      <select value={planFilter} onChange={(e)=>setPlanFilter(e.target.value as PlanFilter)} style={{ background:'var(--bg-card)', border:'1px solid var(--border)', color:'var(--text)', borderRadius:10, padding:'11px 14px' }}>
        {PLAN_OPTIONS.map((p)=><option key={p} value={p}>{p==='ALL'?'Tous les plans':p}</option>)}
      </select>
      <button onClick={()=>void load()} disabled={loading}>Actualiser</button>
    </div>

    <div className="card" style={{ padding:0, overflow:'hidden' }}>
      <table style={{ margin:0 }}>
        <thead><tr><th>Utilisateur</th><th>E-mail</th><th>Plan</th><th>KEEP</th><th>Pays</th><th></th></tr></thead>
        <tbody>
          {loading && <tr><td colSpan={6} style={{textAlign:'center',padding:24}}>Chargement…</td></tr>}
          {!loading && filtered.length===0 && <tr><td colSpan={6} style={{textAlign:'center',padding:24,color:'var(--text-muted)'}}>Aucun utilisateur.</td></tr>}
          {filtered.map((u)=><tr key={u.id} onClick={()=>void openUser(u)} style={{ cursor:'pointer' }}>
            <td><strong>@{u.username}</strong><div style={{fontSize:11,color:'var(--text-muted)'}}>{memberNumber(u.id)}</div></td>
            <td><button onClick={(e)=>{e.stopPropagation();void openUser(u)}} style={{background:'transparent',border:0,padding:0,color:'inherit',textDecoration:'underline',cursor:'pointer'}}>{visibleEmail(u.email)}</button></td>
            <td>{u.plan_code || 'FREE'}</td><td>{u.keeps_this_month ?? 0}</td><td>{u.country_code || '—'}</td>
            <td><button onClick={(e)=>{e.stopPropagation();void openUser(u)}}>Gérer</button></td>
          </tr>)}
        </tbody>
      </table>
    </div>

    <details style={{marginTop:18}}><summary style={{cursor:'pointer',color:'var(--text-muted)'}}>Récupérer un ancien profil de test</summary>
      <div className="card" style={{marginTop:10}}><div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
        <input value={legacyUsername} onChange={(e)=>setLegacyUsername(e.target.value)} placeholder="Pseudo KEEP" style={{flex:'1 1 260px',background:'var(--bg-card)',border:'1px solid var(--border)',color:'var(--text)',borderRadius:8,padding:'10px 14px'}}/>
        <button onClick={()=>void recoverLegacy()} disabled={!legacyUsername.trim()||busy!==null}>Récupérer</button>
      </div>
      {legacyRecovery && <div style={{marginTop:10,fontFamily:'monospace'}}>@{legacyRecovery.username} · mot de passe temporaire : {legacyRecovery.temporaryPassword}</div>}
      </div>
    </details>

    {selected && <div onClick={()=>setSelected(null)} style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(0,0,0,.72)',display:'flex',alignItems:'center',justifyContent:'center',padding:18}}>
      <div onClick={(e)=>e.stopPropagation()} style={{width:'min(760px,96vw)',maxHeight:'90vh',overflowY:'auto',background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:18,padding:20,boxShadow:'0 20px 80px rgba(0,0,0,.5)'}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start'}}>
          <div><div style={{fontSize:22,fontWeight:900}}>@{selected.username}</div><div style={{color:'var(--text-muted)',fontSize:12}}>{visibleEmail(selected.email)} · {memberNumber(selected.id)}</div></div>
          <button onClick={()=>setSelected(null)}>Fermer</button>
        </div>

        {busy==='load' || !snapshot ? <div style={{padding:30,textAlign:'center'}}>Chargement du profil réel…</div> : <>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',gap:8,marginTop:16}}>
            {[
              ['E-mail', snapshot.auth.email ? (snapshot.auth.emailVerified?'Vérifié':'À vérifier') : 'Non ajouté'],
              ['Naissance', snapshot.privateInfo?.birth_date || 'Manquante'], ['Genre', snapshot.privateInfo?.gender || 'Manquant'],
              ['Ville / pays', [snapshot.profile.city,snapshot.profile.country_code].filter(Boolean).join(' · ') || 'Manquant'],
              ['KEEP', String(snapshot.usage.kept)], ['Publics', String(snapshot.usage.publicKeeps)], ['Playlists', String(snapshot.usage.playlists)],
              ['Réseaux', String(snapshot.socialLinks.length)],
            ].map(([label,value])=><div key={label} style={{border:'1px solid var(--border)',borderRadius:10,padding:10}}><div style={{fontSize:10,color:'var(--text-muted)'}}>{label}</div><strong>{value}</strong></div>)}
          </div>

          <div style={{marginTop:18,borderTop:'1px solid var(--border)',paddingTop:16}}>
            <h3 style={{margin:'0 0 4px'}}>À imposer à cet utilisateur</h3>
            <div style={{color:'var(--text-muted)',fontSize:12,marginBottom:10}}>Coche uniquement ce que KEEP devra lui demander de compléter.</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:7}}>
              {REQUIREMENTS.map(([key,label])=><label key={key} style={{display:'flex',gap:8,alignItems:'center',border:'1px solid var(--border)',borderRadius:9,padding:'9px 10px',cursor:'pointer'}}><input type="checkbox" checked={requirements.includes(key)} onChange={()=>toggleRequirement(key)}/><span>{label}</span></label>)}
            </div>
            <button style={{marginTop:10}} onClick={()=>void saveRequirements()} disabled={busy!==null}>{busy==='requirements'?'Enregistrement…':'Enregistrer les obligations'}</button>
          </div>

          <div style={{marginTop:18,borderTop:'1px solid var(--border)',paddingTop:16}}>
            <h3 style={{margin:'0 0 10px'}}>Abonnement offert</h3>
            <div style={{display:'grid',gridTemplateColumns:'minmax(160px,1fr) minmax(130px,.7fr)',gap:8}}>
              <select value={plan} onChange={(e)=>setPlan(e.target.value as PaidPlan)} style={{background:'var(--bg-card)',border:'1px solid var(--border)',color:'var(--text)',borderRadius:8,padding:'10px 12px'}}><option value="PREMIUM">Premium · 2,99 €</option><option value="CREATOR_PRO">Creator Pro · 9,99 €</option><option value="VENUE_PRO">Venue Pro · 29,99 €</option></select>
              <select value={months} onChange={(e)=>setMonths(Number(e.target.value))} style={{background:'var(--bg-card)',border:'1px solid var(--border)',color:'var(--text)',borderRadius:8,padding:'10px 12px'}}><option value={1}>1 mois</option><option value={3}>3 mois</option><option value={6}>6 mois</option><option value={12}>1 an</option><option value={24}>2 ans</option><option value={0}>Illimité</option></select>
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}><button onClick={()=>void grant()} disabled={busy!==null}>Offrir {plan}</button><button onClick={()=>void revoke()} disabled={busy!==null} style={{opacity:.8}}>Arrêter l’offre</button></div>
          </div>

          <div style={{marginTop:18,borderTop:'1px solid var(--border)',paddingTop:16,display:'flex',gap:8,flexWrap:'wrap'}}>
            <button onClick={()=>void toggleBlocked()} disabled={busy!==null}>{isBanned(snapshot.auth.bannedUntil)?'Débloquer le compte':'Bloquer le compte'}</button>
            <button onClick={()=>void deleteUser()} disabled={busy!==null} style={{background:'#7a1f2a'}}>Supprimer définitivement</button>
          </div>
        </>}
      </div>
    </div>}
  </AdminLayout>;
}
