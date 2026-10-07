import React, { useEffect, useRef, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import Hint, { Sheet } from '../components/Hint';
import { supabase } from '../lib/supabaseClient';
import { invokeAdminFunction } from '../lib/invokeFunction';
import PresetPicker, { PRESETS, formatDays, formatEur, formatFree } from '../components/PresetPicker';

interface ApiPrice { id: string; currency_code: string; period: 'MONTHLY' | 'YEARLY'; amount: number | string; is_active: boolean; free_bonus_per_month?: number | string; stripe_price_id?: string | null; }
interface ApiPlan { id: string; code: string; name: string; trial_days: number; plan_prices?: ApiPrice[]; }
interface PlanRow { id: string; code: string; monthly: number; yearly: number; trialDays: number; monthlyPriceId?: string; yearlyPriceId?: string; monthlyFreeBonus: number; yearlyFreeBonus: number; monthlyStripePriceId?: string; yearlyStripePriceId?: string; }

type LimitKey =
  | 'keeps_per_month'
  | 'follows_max'
  | 'compares_per_month'
  | 'providers_max'
  | 'events_max'
  | 'discovery_profiles_lifetime'
  | 'smart_sort_trials_lifetime'
  | 'events_per_month'
  | 'downloads_per_day'
  | 'listens_per_day'
  | 'battle_matches_per_month';

type LimitsByPlan = Record<string, Partial<Record<LimitKey, number | null>>>;
type QuotaResponse = { guestLimit?: number; signupBonus?: number; usageLimits?: Array<{ planCode: string; limitKey: LimitKey; limitValue: number | null }>; };

// Adel (04/09/2026) : "je pense que Découvertes c'est le jour où l'utilisateur
// a son Premium, il a 50 Free directement ... j'ai pas compris" -- confirmé :
// Découvertes est un total À VIE (discovery_profiles_lifetime), pas un
// crédit qui revient chaque mois, contrairement à Soirées ou Comparaisons.
// La périodicité était seulement dans l'infobulle (survol), facile à
// manquer -- désormais écrite en toutes lettres dans l'intitulé de colonne.
const LIMIT_COLUMNS: Array<{ key: LimitKey; label: string; help: string }> = [
  { key: 'discovery_profiles_lifetime', label: 'Découvertes', help: 'À vie, une seule fois. Profils uniques accessibles au total, jamais renouvelé. ∞ = illimité.' },
  { key: 'smart_sort_trials_lifetime', label: 'Vibes', help: 'À vie, une seule fois. Essais de rangement automatique au total, jamais renouvelé. ∞ = illimité.' },
  { key: 'listens_per_day', label: 'Écoutes', help: 'Écoutes reconnues (chaque jour) : reconnaissances réussies incluses ; au-delà, une reconnaissance réussie coûte 1 FREE. Une reconnaissance ratée ne coûte rien.' },
  { key: 'downloads_per_day', label: 'Téléch.', help: 'Chaque jour. Téléchargements autorisés, remis à zéro chaque jour. ∞ = illimité.' },
  { key: 'events_per_month', label: 'Soirées', help: 'Chaque mois. Créations de soirées autorisées, remis à zéro chaque mois. ∞ = illimité.' },
  { key: 'battle_matches_per_month', label: 'Battle', help: 'Chaque mois. Battle EN LIGNE (contre un autre joueur) par utilisateur. Le Battle solo reste gratuit et illimité.' },
  { key: 'providers_max', label: 'Services', help: 'Maximum en même temps. Services musicaux connectés simultanément.' },
  { key: 'follows_max', label: 'Suivis', help: 'Maximum en même temps. Profils suivis simultanément.' },
  { key: 'compares_per_month', label: 'Comparer', help: 'Chaque mois. Comparaisons de goûts, remis à zéro chaque mois.' },
  // Anciennes limites (keeps_per_month, events_max) retirées de l’écran le 07/10/2026 : elles ne servent plus dans l’app et restent intactes en base.
];

function mapPlan(plan: ApiPlan): PlanRow {
  const eur = plan.plan_prices ?? [];
  const monthly = eur.find((p) => p.currency_code === 'EUR' && p.period === 'MONTHLY');
  const yearly = eur.find((p) => p.currency_code === 'EUR' && p.period === 'YEARLY');
  return {
    id: plan.id, code: plan.code, monthly: Number(monthly?.amount ?? 0), yearly: Number(yearly?.amount ?? 0), trialDays: Number(plan.trial_days ?? 0),
    monthlyPriceId: monthly?.id, yearlyPriceId: yearly?.id,
    monthlyFreeBonus: Number(monthly?.free_bonus_per_month ?? 0), yearlyFreeBonus: Number(yearly?.free_bonus_per_month ?? 0),
    monthlyStripePriceId: (monthly as any)?.stripe_price_id ?? '',
    yearlyStripePriceId: (yearly as any)?.stripe_price_id ?? '',
  };
}

const PLAN_ICON: Record<string, string> = { PREMIUM: '⭐', CREATOR_PRO: '🎤', VENUE_PRO: '🏛️' };
// Mêmes noms que l’écran Offres de l’app (OffersScreen.planLabel) : l’admin lit exactement ce que voit l’utilisateur.
const planName = (code: string) => (code === 'CREATOR_PRO' ? 'Creator Pro' : code === 'VENUE_PRO' ? 'Venue Pro' : code === 'PREMIUM' ? 'Premium' : code === 'FREE' ? 'Free' : code.replace(/_/g, ' '));

const invokeAdmin = (body: Record<string, unknown>) => invokeAdminFunction('keep-admin-control', body);

export default function Plans() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [guestLimit, setGuestLimit] = useState(3);
  const [signupBonus, setSignupBonus] = useState(5);
  const [limits, setLimits] = useState<LimitsByPlan>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Adel (04/09/2026) : "mets-moi des ? je clique dessus, je sais à quoi ça
  // sert ... faut que je sache exactement si je veux paramétrer" -- le
  // `title` (infobulle au survol) était invisible/peu fiable sur tactile.
  // Un vrai bouton "?" cliquable affiche l'explication en clair.
  // 07/10/2026 : le « ? » de chaque colonne ouvre la fenêtre partagée (Hint) ; avant d'enregistrer, une fenêtre liste chaque changement.
  const [snapshot, setSnapshot] = useState<string>('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const cardsRef = useRef<HTMLDivElement>(null);
  const slide = (dir: 1 | -1) => cardsRef.current?.scrollBy({ left: dir * 260, behavior: 'smooth' });


  const load = async () => {
    setLoading(true); setError(null);
    try {
      if (!supabase) throw new Error('Supabase Super Admin non configuré.');
      const [response, quotaResult] = await Promise.all([invokeAdmin({ action: 'plans.list' }), supabase.rpc('admin_get_quota_settings')]);
      if (quotaResult.error) throw quotaResult.error;
      setPlans(((response?.data ?? []) as ApiPlan[]).map(mapPlan));
      const quota = (quotaResult.data ?? {}) as QuotaResponse;
      setGuestLimit(Number(quota.guestLimit ?? 3)); setSignupBonus(Number(quota.signupBonus ?? 5));
      const nextLimits: LimitsByPlan = {};
      for (const item of quota.usageLimits ?? []) {
        if (!item?.planCode || !item?.limitKey) continue;
        nextLimits[item.planCode] = { ...(nextLimits[item.planCode] ?? {}), [item.limitKey]: item.limitValue };
      }
      setLimits(nextLimits);
      setSnapshot(JSON.stringify({ plans: ((response?.data ?? []) as ApiPlan[]).map(mapPlan), guestLimit: Number(quota.guestLimit ?? 3), signupBonus: Number(quota.signupBonus ?? 5), limits: nextLimits }));
    } catch (e: any) { setError(e?.message ?? 'Impossible de charger les réglages réels.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);
  const updatePlan = (code: string, field: 'monthly' | 'yearly' | 'trialDays' | 'monthlyFreeBonus' | 'yearlyFreeBonus' | 'monthlyStripePriceId' | 'yearlyStripePriceId', value: number | string) => { setPlans((prev) => prev.map((p) => p.code === code ? { ...p, [field]: value } : p)); setSavedAt(null); };
  const updateLimit = (planCode: string, key: LimitKey, value: number | null) => { setLimits((prev) => ({ ...prev, [planCode]: { ...(prev[planCode] ?? {}), [key]: value } })); setSavedAt(null); };

  const handleSave = async () => {
    if (!supabase) return;
    setSaving(true); setError(null);
    try {
      for (const plan of plans) {
        await invokeAdmin({ action: 'plans.update', planId: plan.id, trialDays: plan.trialDays, prices: [
          ...(plan.monthlyPriceId ? [{ id: plan.monthlyPriceId, amount: plan.monthly, freeBonusPerMonth: plan.monthlyFreeBonus, stripePriceId: plan.monthlyStripePriceId ?? '' }] : []),
          ...(plan.yearlyPriceId ? [{ id: plan.yearlyPriceId, amount: plan.yearly, freeBonusPerMonth: plan.yearlyFreeBonus, stripePriceId: plan.yearlyStripePriceId ?? '' }] : []),
        ] });
      }
      // Une seule source : les FREE mensuels réglés ici sont recopiés dans free_monthly_bonus_* (lus par l’écran Offres
      // et la notification d’abonnement offert), pour que l’app affiche exactement le chiffre réellement crédité.
      for (const plan of plans) {
        if (!plan.monthlyPriceId) continue;
        const sync = await supabase.rpc('admin_remote_config_set', { p_key: `free_monthly_bonus_${plan.code.toLowerCase()}`, p_value: Math.max(0, Math.round(plan.monthlyFreeBonus)), p_description: `FREE offerts / mois · ${planName(plan.code)} (recopié depuis Formules)` });
        if (sync.error) throw sync.error;
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

  const freePlan = plans.find((p) => p.code === 'FREE');
  // Ordre du moins cher au plus cher, comme dans l’écran Offres.
  const PLAN_ORDER = ['PREMIUM', 'CREATOR_PRO', 'VENUE_PRO'];
  const paidPlans = plans.filter((p) => p.code !== 'FREE').sort((a, b) => (PLAN_ORDER.indexOf(a.code) + 1 || 99) - (PLAN_ORDER.indexOf(b.code) + 1 || 99));
  const renderLimits = (plan: PlanRow) => {
    const cols = LIMIT_COLUMNS.filter((c) => c.key in (limits[plan.code] ?? {}));
    if (!cols.length) return null;
    return <>
      <div className="plan-group">Limites<Hint title="Limites" text="∞ = illimité. Les cadenas de l’app suivent exactement ces chiffres."/></div>
      {cols.map((c) => { const value = limits[plan.code]?.[c.key]; return <div key={c.key} className="plan-row"><span>{c.label}<Hint title={c.label} text={c.help}/></span>
        <PresetPicker label={`${planName(plan.code)} · ${c.label}`} value={value == null ? null : Number(value)} presets={PRESETS.limit} allowUnlimited onChange={(v) => updateLimit(plan.code, c.key, v == null ? null : Math.round(v))} width={120} impact={(v) => `Chaque utilisateur ${planName(plan.code)} aura droit à ${v == null ? 'un nombre illimité' : v} — ${c.label}. ${c.help}`}/></div>; })}
    </>;
  };
  const fmtLimit = (v: number | null | undefined) => (v == null ? '∞' : String(v));
  const changes: string[] = (() => {
    if (!snapshot) return [];
    const before = JSON.parse(snapshot) as { plans: PlanRow[]; guestLimit: number; signupBonus: number; limits: LimitsByPlan };
    const out: string[] = [];
    if (before.guestLimit !== guestLimit) out.push(`Invité : ${before.guestLimit} → ${guestLimit} écoutes avant compte`);
    if (before.signupBonus !== signupBonus) out.push(`Bonus inscription : ${before.signupBonus} → ${signupBonus} FREE pour chaque nouveau compte`);
    for (const p of plans) {
      const b = before.plans.find((x) => x.code === p.code); if (!b) continue;
      if (b.monthly !== p.monthly) out.push(`${planName(p.code)} · prix mois : ${formatEur(b.monthly)} → ${formatEur(p.monthly)}`);
      if (b.yearly !== p.yearly) out.push(`${planName(p.code)} · prix an : ${formatEur(b.yearly)} → ${formatEur(p.yearly)}`);
      if (b.monthlyFreeBonus !== p.monthlyFreeBonus) out.push(`${planName(p.code)} · FREE/mois (mensuel) : ${b.monthlyFreeBonus} → ${p.monthlyFreeBonus}`);
      if (b.yearlyFreeBonus !== p.yearlyFreeBonus) out.push(`${planName(p.code)} · FREE/mois (annuel) : ${b.yearlyFreeBonus} → ${p.yearlyFreeBonus}`);
      if (b.trialDays !== p.trialDays) out.push(`${planName(p.code)} · essai : ${b.trialDays} → ${p.trialDays} j pour les nouveaux abonnés`);
      if ((b.monthlyStripePriceId ?? '') !== (p.monthlyStripePriceId ?? '') || (b.yearlyStripePriceId ?? '') !== (p.yearlyStripePriceId ?? '')) out.push(`${planName(p.code)} · identifiant Stripe modifié`);
      for (const c of LIMIT_COLUMNS) {
        const was = before.limits[p.code]?.[c.key]; const now = limits[p.code]?.[c.key];
        if (c.key in (limits[p.code] ?? {}) && was !== now) out.push(`${planName(p.code)} · ${c.label} : ${fmtLimit(was)} → ${fmtLimit(now)}`);
      }
    }
    return out;
  })();

  return <AdminLayout>
    <div className="page-title">Formules <Hint title="Formules" text={<>Prix, essais et limites réellement appliqués par Loki Music.</>}/></div>
    {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
    {!error && !loading && <div className="demo-banner"><span className="real-pill">● Réel <Hint title="Mode réel" text="Chaque modification est enregistrée dans Supabase et auditée."/></span></div>}

    {/* 07/10/2026 (Adel) : un BLOC complet par type d’utilisateur, côte à côte (dans la longueur), jamais mélangés.
        Invité (sans compte) · Free (compte gratuit) · chaque formule payante. Chaque bloc ne montre que ce qui le concerne.
        Chaque réglage n’existe qu’ici (aucun doublon avec Réglages). */}
    <div className="plan-cards-nav"><button type="button" className="btn" onClick={()=>slide(-1)} aria-label="Bloc précédent">‹</button><button type="button" className="btn" onClick={()=>slide(1)} aria-label="Bloc suivant">›</button></div>
    {loading ? <div className="card" style={{marginTop:18}}>Chargement…</div> : <div className="plan-cards" ref={cardsRef}>
      <section className="plan-card">
        <header className="plan-card-head">👤 Invité<Hint title="Invité" text="Personne qui utilise l’app SANS compte. Elle peut seulement reconnaître quelques morceaux avant de devoir créer un compte."/></header>
        <div className="plan-card-sub">Sans compte</div>
        <div className="plan-group">FREE</div>
        <div className="plan-row"><span>Écoutes<Hint title="Écoutes avant compte" text="Nombre total de morceaux qu’un invité peut reconnaître avant de devoir créer un compte."/></span>
          <PresetPicker label="Invité · écoutes" value={guestLimit} presets={PRESETS.guestListens} format={(v)=>`${v} écoutes`} onChange={(v)=>setGuestLimit(v??0)} width={120} impact={(v)=>`Une personne sans compte pourra reconnaître ${v ?? 0} morceau(x) au total, puis l’app lui demandera de créer un compte.`}/></div>
      </section>
      {freePlan && <section className="plan-card">
        <header className="plan-card-head">🆓 Free<Hint title="Free" text="Compte gratuit, sans abonnement. Il reçoit le bonus d’inscription, puis utilise ses FREE et les limites de ce bloc."/></header>
        <div className="plan-card-sub">Gratuit</div>
        <div className="plan-group">FREE</div>
        <div className="plan-row"><span>Bonus<Hint title="Bonus d’inscription" text="FREE offerts une seule fois à la création du compte. Les comptes déjà créés ne changent pas."/></span>
          <PresetPicker label="Free · bonus inscription" value={signupBonus} presets={PRESETS.signupBonus} format={formatFree} onChange={(v)=>setSignupBonus(v??0)} width={120} impact={(v)=>`Chaque NOUVEAU compte recevra ${v ?? 0} FREE à l’inscription. Les comptes existants ne changent pas.`}/></div>
        {freePlan.monthlyPriceId && <div className="plan-row"><span>Mois<Hint title="FREE par mois" text="FREE ajoutés chaque mois à un compte Free."/></span>
          <PresetPicker label="Free · FREE par mois" value={freePlan.monthlyFreeBonus} presets={PRESETS.freeBonus} format={formatFree} onChange={(v)=>updatePlan('FREE','monthlyFreeBonus',Math.round(v??0))} width={120} impact={(v)=>`Chaque compte Free recevra ${v ?? 0} FREE par mois.`}/></div>}
        {renderLimits(freePlan)}
      </section>}
      {paidPlans.map((p)=><section key={p.code} className="plan-card plan-card-paid">
        <header className="plan-card-head">{PLAN_ICON[p.code] ?? '⭐'} {planName(p.code)}<Hint title={planName(p.code)} text={`Abonné ${planName(p.code)} : le prix qu’il paie, les FREE qu’il reçoit chaque mois, son essai gratuit et ses limites. Tout s’affiche tel quel dans l’écran Offres de l’app.`}/></header>
        <div className="plan-card-sub">Abonnement</div>
        <div className="plan-group">Prix<Hint title="Prix" text="Prix affiché dans l’écran Offres. Sur iPhone, c’est le prix Apple (App Store Connect) qui s’affiche : garde les deux identiques."/></div>
        <div className="plan-row"><span>Mois</span><PresetPicker label={`${planName(p.code)} · prix mois`} value={p.monthly} presets={PRESETS.priceEur} format={formatEur} onChange={(v)=>updatePlan(p.code,'monthly',v??0)} width={120} impact={(v)=>`Les nouveaux abonnés ${planName(p.code)} au mois verront ${formatEur(v ?? 0)} dans l’écran Offres.`}/></div>
        <div className="plan-row"><span>An</span><PresetPicker label={`${planName(p.code)} · prix an`} value={p.yearly} presets={PRESETS.priceEur} format={formatEur} onChange={(v)=>updatePlan(p.code,'yearly',v??0)} width={120} impact={(v)=>`Les nouveaux abonnés ${planName(p.code)} à l’année verront ${formatEur(v ?? 0)} dans l’écran Offres.`}/></div>
        <div className="plan-row"><span>Essai<Hint title="Essai" text="Jours gratuits avant le premier paiement, pour les nouveaux abonnés."/></span><PresetPicker label={`${planName(p.code)} · essai`} value={p.trialDays} presets={PRESETS.trialDays} format={formatDays} onChange={(v)=>updatePlan(p.code,'trialDays',Math.round(v??0))} width={120} impact={(v)=>(v ? `Les nouveaux abonnés ${planName(p.code)} auront ${v} jours gratuits avant de payer.` : `Plus d’essai : les nouveaux abonnés ${planName(p.code)} paient dès le premier jour.`)}/></div>
        <div className="plan-group">FREE<Hint title="FREE par mois" text="FREE ajoutés à l’abonné chaque mois d’abonnement : « Mois » pour l’abonnement au mois, « An » pour l’abonnement à l’année."/></div>
        <div className="plan-row"><span>Mois</span><PresetPicker label={`${planName(p.code)} · FREE (au mois)`} value={p.monthlyFreeBonus} presets={PRESETS.freeBonus} format={formatFree} onChange={(v)=>updatePlan(p.code,'monthlyFreeBonus',Math.round(v??0))} width={120} impact={(v)=>`Chaque abonné ${planName(p.code)} au mois recevra ${v ?? 0} FREE par mois.`}/></div>
        <div className="plan-row"><span>An</span><PresetPicker label={`${planName(p.code)} · FREE (à l’an)`} value={p.yearlyFreeBonus} presets={PRESETS.freeBonus} format={formatFree} onChange={(v)=>updatePlan(p.code,'yearlyFreeBonus',Math.round(v??0))} width={120} impact={(v)=>`Chaque abonné ${planName(p.code)} à l’année recevra ${v ?? 0} FREE par mois.`}/></div>
        {renderLimits(p)}
      </section>)}
    </div>}
    <div style={{display:'flex',gap:16,flexWrap:'wrap',alignItems:'center',marginTop:12}}>
      <a href="/remote-config" style={{color:'#c4b5fd',fontWeight:800}}>Paliers ›</a>
    </div>

    <details style={{marginTop:14}}><summary style={{cursor:'pointer',color:'#f0b429',fontWeight:800}}>💳 Stripe</summary>
    <div className="demo-banner" style={{ marginTop: 8, borderColor: '#f0b429', color: '#f0b429' }}>
      ⚠️ Les Stripe Price ID (price_...) doivent être copiés depuis le{' '}
      <a href="https://dashboard.stripe.com/products" target="_blank" rel="noreferrer" style={{ color: '#f0b429', textDecoration: 'underline' }}>
        Stripe Dashboard → Produits
      </a>
      {' '}pour chaque plan × période. Sans eux, aucun checkout Stripe ne peut aboutir.
    </div>
    <table><thead><tr><th>Plan</th><th>Mensuel</th><th>Annuel</th></tr></thead><tbody>
      {plans.map((p)=><tr key={`stripe-${p.id}`}>
        <td>{p.code}</td>
        <td><input type="text" placeholder="price_..." value={p.monthlyStripePriceId ?? ''} onChange={(e)=>updatePlan(p.code,'monthlyStripePriceId',e.target.value)} style={{width:160,fontFamily:'monospace',fontSize:11}}/></td>
        <td><input type="text" placeholder="price_..." value={p.yearlyStripePriceId ?? ''} onChange={(e)=>updatePlan(p.code,'yearlyStripePriceId',e.target.value)} style={{width:160,fontFamily:'monospace',fontSize:11}}/></td>
      </tr>)}
    </tbody></table></details>


    <button onClick={()=>setReviewOpen(true)} disabled={loading||saving||plans.length===0||changes.length===0} style={{marginTop:20,background:'var(--primary)',color:'#fff',border:'none',borderRadius:8,padding:'10px 20px',fontWeight:700,cursor:saving?'wait':'pointer',opacity:saving?0.65:1}}>{saving?'Enregistrement…':changes.length?`Enregistrer (${changes.length})`:'Enregistrer'}</button>
    {reviewOpen && <Sheet title={`Confirmer ${changes.length} changement${changes.length>1?'s':''}`} onClose={()=>setReviewOpen(false)}
      actions={<><button type="button" className="btn" onClick={()=>setReviewOpen(false)}>Annuler</button><button type="button" className="btn btn-primary" onClick={()=>{setReviewOpen(false);void handleSave();}}>Valider</button></>}>
      <ul className="change-list">{changes.map((c)=><li key={c}>{c}</li>)}</ul>
      <p className="muted-note">S’applique tout de suite dans l’application, pour les utilisateurs concernés.</p>
    </Sheet>}
    {savedAt&&<p className="save-hint">✓ Enregistré à {savedAt}</p>}
  </AdminLayout>;
}
