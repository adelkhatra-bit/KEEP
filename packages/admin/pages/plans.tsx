import React, { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';

interface ApiPrice { id: string; currency_code: string; period: 'MONTHLY' | 'YEARLY'; amount: number | string; is_active: boolean; free_bonus_per_month?: number | string; }
interface ApiPlan { id: string; code: string; name: string; trial_days: number; plan_prices?: ApiPrice[]; }
interface PlanRow { id: string; code: string; monthly: number; yearly: number; trialDays: number; monthlyPriceId?: string; yearlyPriceId?: string; monthlyFreeBonus: number; yearlyFreeBonus: number; }

type LimitKey =
  | 'keeps_per_month'
  | 'follows_max'
  | 'compares_per_month'
  | 'providers_max'
  | 'events_max'
  | 'discovery_profiles_lifetime'
  | 'smart_sort_trials_lifetime'
  | 'events_per_month'
  | 'downloads_per_day';

type LimitsByPlan = Record<string, Partial<Record<LimitKey, number | null>>>;
type QuotaResponse = { guestLimit?: number; signupBonus?: number; freeTotal?: number; usageLimits?: Array<{ planCode: string; limitKey: LimitKey; limitValue: number | null }>; };

// Adel (04/09/2026) : "je pense que Découvertes c'est le jour où l'utilisateur
// a son Premium, il a 50 Free directement ... j'ai pas compris" -- confirmé :
// Découvertes est un total À VIE (discovery_profiles_lifetime), pas un
// crédit qui revient chaque mois, contrairement à Soirées ou Comparaisons.
// La périodicité était seulement dans l'infobulle (survol), facile à
// manquer -- désormais écrite en toutes lettres dans l'intitulé de colonne.
const LIMIT_COLUMNS: Array<{ key: LimitKey; label: string; help: string }> = [
  { key: 'discovery_profiles_lifetime', label: 'Découvertes (à vie, une fois)', help: 'Profils uniques accessibles au total, jamais renouvelé. Vide = illimité.' },
  { key: 'smart_sort_trials_lifetime', label: 'Essais Vibes (à vie, une fois)', help: 'Essais de rangement automatique au total, jamais renouvelé. Vide = illimité.' },
  { key: 'downloads_per_day', label: 'Téléch. (chaque jour)', help: 'Téléchargements autorisés par jour, remis à zéro chaque jour. Vide = illimité.' },
  { key: 'events_per_month', label: 'Soirées (chaque mois)', help: 'Créations de soirées autorisées par mois, remis à zéro chaque mois. Vide = illimité.' },
  { key: 'providers_max', label: 'Services (maximum simultané)', help: 'Nombre de services musicaux connectés en même temps.' },
  { key: 'follows_max', label: 'Suivis (maximum simultané)', help: 'Nombre maximum de profils suivis en même temps.' },
  { key: 'compares_per_month', label: 'Comparaisons (chaque mois)', help: 'Nombre maximum de comparaisons par mois, remis à zéro chaque mois.' },
  { key: 'keeps_per_month', label: 'Morceaux legacy (chaque mois)', help: 'Ancien quota mensuel, conservé pour compatibilité.' },
  { key: 'events_max', label: 'Événements legacy (à vie)', help: 'Ancienne limite événement à vie, conservée pour compatibilité.' },
];

function mapPlan(plan: ApiPlan): PlanRow {
  const eur = plan.plan_prices ?? [];
  const monthly = eur.find((p) => p.currency_code === 'EUR' && p.period === 'MONTHLY');
  const yearly = eur.find((p) => p.currency_code === 'EUR' && p.period === 'YEARLY');
  return {
    id: plan.id, code: plan.code, monthly: Number(monthly?.amount ?? 0), yearly: Number(yearly?.amount ?? 0), trialDays: Number(plan.trial_days ?? 0),
    monthlyPriceId: monthly?.id, yearlyPriceId: yearly?.id,
    monthlyFreeBonus: Number(monthly?.free_bonus_per_month ?? 0), yearlyFreeBonus: Number(yearly?.free_bonus_per_month ?? 0),
  };
}

async function invokeAdmin(body: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase Super Admin non configuré.');
  const { data, error } = await supabase.functions.invoke('keep-admin-control', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.message || data.error);
  return data;
}

function parseNullableNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

export default function Plans() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [guestLimit, setGuestLimit] = useState(3);
  const [signupBonus, setSignupBonus] = useState(20);
  const [limits, setLimits] = useState<LimitsByPlan>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Adel (04/09/2026) : "mets-moi des ? je clique dessus, je sais à quoi ça
  // sert ... faut que je sache exactement si je veux paramétrer" -- le
  // `title` (infobulle au survol) était invisible/peu fiable sur tactile.
  // Un vrai bouton "?" cliquable affiche l'explication en clair.
  const [openHelpKey, setOpenHelpKey] = useState<LimitKey | null>(null);

  const freeTotal = useMemo(() => Math.max(0, guestLimit) + Math.max(0, signupBonus), [guestLimit, signupBonus]);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      if (!supabase) throw new Error('Supabase Super Admin non configuré.');
      const [response, quotaResult] = await Promise.all([invokeAdmin({ action: 'plans.list' }), supabase.rpc('admin_get_quota_settings')]);
      if (quotaResult.error) throw quotaResult.error;
      setPlans(((response?.data ?? []) as ApiPlan[]).map(mapPlan));
      const quota = (quotaResult.data ?? {}) as QuotaResponse;
      setGuestLimit(Number(quota.guestLimit ?? 3)); setSignupBonus(Number(quota.signupBonus ?? 20));
      const nextLimits: LimitsByPlan = {};
      for (const item of quota.usageLimits ?? []) {
        if (!item?.planCode || !item?.limitKey) continue;
        nextLimits[item.planCode] = { ...(nextLimits[item.planCode] ?? {}), [item.limitKey]: item.limitValue };
      }
      setLimits(nextLimits);
    } catch (e: any) { setError(e?.message ?? 'Impossible de charger les réglages réels.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);
  const updatePlan = (code: string, field: 'monthly' | 'yearly' | 'trialDays' | 'monthlyFreeBonus' | 'yearlyFreeBonus', value: number) => { setPlans((prev) => prev.map((p) => p.code === code ? { ...p, [field]: value } : p)); setSavedAt(null); };
  const updateLimit = (planCode: string, key: LimitKey, value: number | null) => { setLimits((prev) => ({ ...prev, [planCode]: { ...(prev[planCode] ?? {}), [key]: value } })); setSavedAt(null); };

  const handleSave = async () => {
    if (!supabase) return;
    setSaving(true); setError(null);
    try {
      for (const plan of plans) {
        await invokeAdmin({ action: 'plans.update', planId: plan.id, trialDays: plan.trialDays, prices: [
          ...(plan.monthlyPriceId ? [{ id: plan.monthlyPriceId, amount: plan.monthly, freeBonusPerMonth: plan.monthlyFreeBonus }] : []),
          ...(plan.yearlyPriceId ? [{ id: plan.yearlyPriceId, amount: plan.yearly, freeBonusPerMonth: plan.yearlyFreeBonus }] : []),
        ] });
      }
      const freeSave = await supabase.rpc('admin_set_free_credit_rules', { p_guest_limit: Math.max(0, Math.floor(guestLimit)), p_signup_bonus: Math.max(0, Math.floor(signupBonus)) });
      if (freeSave.error) throw freeSave.error;
      for (const plan of plans) {
        const planLimits = limits[plan.code] ?? {};
        for (const column of LIMIT_COLUMNS) {
          if (!(column.key in planLimits)) continue;
          const result = await supabase.rpc('admin_set_usage_limit', { p_plan_code: plan.code, p_limit_key: column.key, p_limit_value: planLimits[column.key] ?? null });
          if (result.error) throw result.error;
        }
      }
      setSavedAt(new Date().toLocaleTimeString('fr-FR')); await load();
    } catch (e: any) { setError(e?.message ?? 'Enregistrement impossible.'); }
    finally { setSaving(false); }
  };

  return <AdminLayout>
    <div className="page-title">Abonnements, Prix & Quotas</div>
    <div className="page-subtitle">Prix, essais et limites réellement appliqués par Loki.</div>
    {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
    {!error && !loading && <div className="demo-banner">● MODE RÉEL — chaque modification est enregistrée dans Supabase et auditée.</div>}

    <section style={{ marginTop: 22, padding: 18, border: '1px solid #302742', borderRadius: 14, background: '#110d19' }}>
      <h2 style={{ margin: '0 0 6px' }}>Free : crédits & croissance</h2>
      <p style={{ margin: '0 0 16px', color: '#9f96ad' }}>L’écoute reste gratuite. Les crédits sont consommés seulement lorsqu’un morceau est réellement gardé/téléchargé. Les paliers de partage et d’abonnés se règlent dans Textes & Quotas app.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14 }}>
        <label><strong>Avant inscription</strong><input type="number" min="0" value={guestLimit} onChange={(e)=>setGuestLimit(Math.max(0,parseInt(e.target.value,10)||0))} style={{width:'100%',marginTop:8}}/></label>
        <label><strong>Bonus après compte</strong><input type="number" min="0" value={signupBonus} onChange={(e)=>setSignupBonus(Math.max(0,parseInt(e.target.value,10)||0))} style={{width:'100%',marginTop:8}}/></label>
        <div style={{padding:14,borderRadius:12,background:'#191225',border:'1px solid #3c2d55'}}><div style={{color:'#a78bfa',fontWeight:800}}>BASE FREE</div><div style={{fontSize:30,fontWeight:900,marginTop:6}}>{freeTotal}</div><small style={{color:'#82798e'}}>Les bonus communautaires s’ajoutent ensuite.</small></div>
      </div>
      <a href="/remote-config" style={{display:'inline-block',marginTop:14,color:'#b79cff',fontWeight:800}}>Régler les paliers partages / abonnés / Audience Pro →</a>
    </section>

    <h2 style={{marginTop:28}}>Prix & périodes d’essai</h2>
    {/* Adel (04/09/2026) : "regarde bien où y a prix mensuel et prix annuel,
        le nombre de Free que je vais donner avec, ça ira modifier
        automatiquement dans les offres" -- une colonne Free/mois juste à
        côté de chaque prix, au même endroit et dans le même geste. */}
    <p style={{color:'#9f96ad',marginTop:-8}}>Free/mois : combien de Free ce prix accorde par mois écoulé depuis l’inscription (cumulatif, jamais remis à zéro). Peut différer entre mensuel et annuel pour la même formule.</p>
    <table><thead><tr><th>Plan</th><th>Prix mensuel</th><th>Free/mois (mensuel)</th><th>Prix annuel</th><th>Free/mois (annuel)</th><th>Essai</th></tr></thead><tbody>
      {loading&&<tr><td colSpan={6} style={{textAlign:'center',padding:24}}>Chargement…</td></tr>}
      {plans.map((p)=><tr key={p.id}>
        <td>{p.code}</td>
        <td><input type="number" step="0.01" value={p.monthly} onChange={(e)=>updatePlan(p.code,'monthly',Number(e.target.value)||0)}/> €</td>
        <td><input type="number" min="0" value={p.monthlyFreeBonus} onChange={(e)=>updatePlan(p.code,'monthlyFreeBonus',Math.max(0,parseInt(e.target.value,10)||0))} style={{width:70}}/></td>
        <td><input type="number" step="0.01" value={p.yearly} onChange={(e)=>updatePlan(p.code,'yearly',Number(e.target.value)||0)}/> €</td>
        <td><input type="number" min="0" value={p.yearlyFreeBonus} onChange={(e)=>updatePlan(p.code,'yearlyFreeBonus',Math.max(0,parseInt(e.target.value,10)||0))} style={{width:70}}/></td>
        <td><input type="number" min="0" value={p.trialDays} onChange={(e)=>updatePlan(p.code,'trialDays',parseInt(e.target.value,10)||0)}/></td>
      </tr>)}
    </tbody></table>

    <h2 style={{marginTop:28}}>Limites par formule</h2>
    <p style={{color:'#9f96ad'}}>Vide = illimité quand la fonction est incluse. Les cadenas de l’application utilisent ces mêmes règles serveur. Cliquez sur un « ? » pour savoir exactement à quoi sert une colonne avant de la paramétrer.</p>
    {openHelpKey && <div style={{background:'#1B1422',border:'1px solid #493369',borderRadius:10,padding:'10px 14px',marginBottom:10,display:'flex',alignItems:'flex-start',gap:10}}>
      <div style={{flex:1}}><strong>{LIMIT_COLUMNS.find((c)=>c.key===openHelpKey)?.label}</strong><div style={{color:'#b79cff',fontSize:12,marginTop:3,lineHeight:1.4}}>{LIMIT_COLUMNS.find((c)=>c.key===openHelpKey)?.help}</div></div>
      <button type="button" onClick={()=>setOpenHelpKey(null)} style={{background:'transparent',border:'none',color:'#9f96ad',cursor:'pointer',fontSize:16,lineHeight:1}}>×</button>
    </div>}
    <div style={{overflowX:'auto'}}><table><thead><tr><th>Plan</th>{LIMIT_COLUMNS.map((c)=><th key={c.key}>{c.label} <button type="button" onClick={()=>setOpenHelpKey(openHelpKey===c.key?null:c.key)} title={c.help} style={{width:18,height:18,borderRadius:9,border:'1px solid var(--primary)',background:openHelpKey===c.key?'var(--primary)':'transparent',color:openHelpKey===c.key?'#fff':'var(--primary)',fontSize:11,fontWeight:900,cursor:'pointer',lineHeight:1,padding:0}}>?</button></th>)}</tr></thead><tbody>
      {plans.map((plan)=><tr key={`limits-${plan.code}`}><td>{plan.code}</td>{LIMIT_COLUMNS.map((column)=>{const hasValue=column.key in (limits[plan.code]??{});const value=limits[plan.code]?.[column.key];return <td key={`${plan.code}-${column.key}`}>{hasValue?<input type="number" min="0" placeholder="∞" value={value==null?'':value} onChange={(e)=>updateLimit(plan.code,column.key,parseNullableNumber(e.target.value))} title={column.help} style={{width:86}}/>:<span style={{color:'#665f70'}}>—</span>}</td>;})}</tr>)}
    </tbody></table></div>

    <button onClick={()=>void handleSave()} disabled={loading||saving||plans.length===0} style={{marginTop:20,background:'var(--primary)',color:'#fff',border:'none',borderRadius:8,padding:'10px 20px',fontWeight:700,cursor:saving?'wait':'pointer',opacity:saving?0.65:1}}>{saving?'Enregistrement…':'Enregistrer tous les réglages dans Supabase'}</button>
    {savedAt&&<p className="save-hint">Enregistré réellement à {savedAt}. Les valeurs ont été relues depuis Supabase.</p>}
  </AdminLayout>;
}
