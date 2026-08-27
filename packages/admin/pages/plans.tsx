import React, { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { supabase } from '../lib/supabaseClient';

interface ApiPrice {
  id: string;
  currency_code: string;
  period: 'MONTHLY' | 'YEARLY';
  amount: number | string;
  is_active: boolean;
}

interface ApiPlan {
  id: string;
  code: string;
  name: string;
  trial_days: number;
  plan_prices?: ApiPrice[];
}

interface PlanRow {
  id: string;
  code: string;
  monthly: number;
  yearly: number;
  trialDays: number;
  monthlyPriceId?: string;
  yearlyPriceId?: string;
}

type LimitKey = 'keeps_per_month' | 'follows_max' | 'compares_per_month' | 'providers_max' | 'events_max';
type LimitsByPlan = Record<string, Partial<Record<LimitKey, number | null>>>;

type QuotaResponse = {
  guestLimit?: number;
  signupBonus?: number;
  freeTotal?: number;
  usageLimits?: Array<{ planCode: string; limitKey: LimitKey; limitValue: number | null }>;
};

const LIMIT_COLUMNS: Array<{ key: LimitKey; label: string; help: string }> = [
  { key: 'keeps_per_month', label: 'KEEP / mois', help: 'Nombre maximum de KEEP mensuels.' },
  { key: 'follows_max', label: 'Suivis max', help: 'Nombre maximum de profils suivis.' },
  { key: 'compares_per_month', label: 'Comparaisons / mois', help: 'Nombre maximum de comparaisons mensuelles.' },
  { key: 'providers_max', label: 'Services musicaux', help: 'Nombre maximum de services musicaux connectés.' },
  { key: 'events_max', label: 'Événements', help: 'Nombre maximum d’événements. Vide = illimité si la formule autorise la fonction.' },
];

function mapPlan(plan: ApiPlan): PlanRow {
  const eur = plan.plan_prices ?? [];
  const monthly = eur.find((p) => p.currency_code === 'EUR' && p.period === 'MONTHLY');
  const yearly = eur.find((p) => p.currency_code === 'EUR' && p.period === 'YEARLY');
  return {
    id: plan.id,
    code: plan.code,
    monthly: Number(monthly?.amount ?? 0),
    yearly: Number(yearly?.amount ?? 0),
    trialDays: Number(plan.trial_days ?? 0),
    monthlyPriceId: monthly?.id,
    yearlyPriceId: yearly?.id,
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

  const freeTotal = useMemo(() => Math.max(0, guestLimit) + Math.max(0, signupBonus), [guestLimit, signupBonus]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!supabase) throw new Error('Supabase Super Admin non configuré.');
      const [response, quotaResult] = await Promise.all([
        invokeAdmin({ action: 'plans.list' }),
        supabase.rpc('admin_get_quota_settings'),
      ]);
      if (quotaResult.error) throw quotaResult.error;

      setPlans(((response?.data ?? []) as ApiPlan[]).map(mapPlan));
      const quota = (quotaResult.data ?? {}) as QuotaResponse;
      setGuestLimit(Number(quota.guestLimit ?? 3));
      setSignupBonus(Number(quota.signupBonus ?? 20));

      const nextLimits: LimitsByPlan = {};
      for (const item of quota.usageLimits ?? []) {
        if (!item?.planCode || !item?.limitKey) continue;
        nextLimits[item.planCode] = { ...(nextLimits[item.planCode] ?? {}), [item.limitKey]: item.limitValue };
      }
      setLimits(nextLimits);
    } catch (e: any) {
      setError(e?.message ?? 'Impossible de charger les réglages réels.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const updatePlan = (code: string, field: 'monthly' | 'yearly' | 'trialDays', value: number) => {
    setPlans((prev) => prev.map((p) => (p.code === code ? { ...p, [field]: value } : p)));
    setSavedAt(null);
  };

  const updateLimit = (planCode: string, key: LimitKey, value: number | null) => {
    setLimits((prev) => ({
      ...prev,
      [planCode]: { ...(prev[planCode] ?? {}), [key]: value },
    }));
    setSavedAt(null);
  };

  const handleSave = async () => {
    if (!supabase) return;
    setSaving(true);
    setError(null);
    try {
      for (const plan of plans) {
        await invokeAdmin({
          action: 'plans.update',
          planId: plan.id,
          trialDays: plan.trialDays,
          prices: [
            ...(plan.monthlyPriceId ? [{ id: plan.monthlyPriceId, amount: plan.monthly }] : []),
            ...(plan.yearlyPriceId ? [{ id: plan.yearlyPriceId, amount: plan.yearly }] : []),
          ],
        });
      }

      const freeSave = await supabase.rpc('admin_set_free_credit_rules', {
        p_guest_limit: Math.max(0, Math.floor(guestLimit)),
        p_signup_bonus: Math.max(0, Math.floor(signupBonus)),
      });
      if (freeSave.error) throw freeSave.error;

      for (const plan of plans) {
        const planLimits = limits[plan.code] ?? {};
        for (const column of LIMIT_COLUMNS) {
          if (!(column.key in planLimits)) continue;
          const result = await supabase.rpc('admin_set_usage_limit', {
            p_plan_code: plan.code,
            p_limit_key: column.key,
            p_limit_value: planLimits[column.key] ?? null,
          });
          if (result.error) throw result.error;
        }
      }

      setSavedAt(new Date().toLocaleTimeString('fr-FR'));
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="page-title">Abonnements, Prix & Quotas</div>
      <div className="page-subtitle">Tous les réglages commerciaux réellement stockés dans Supabase — modifiables sans changer l’application.</div>

      {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
      {!error && !loading && <div className="demo-banner">● MODE RÉEL — chaque modification est enregistrée dans Supabase et auditée.</div>}

      <section style={{ marginTop: 22, padding: 18, border: '1px solid #302742', borderRadius: 14, background: '#110d19' }}>
        <h2 style={{ margin: '0 0 6px' }}>Crédits musicaux FREE</h2>
        <p style={{ margin: '0 0 16px', color: '#9f96ad' }}>
          Le compteur ne retient que les morceaux réellement gardés dans une playlist KEEP. Une écoute, une tentative ou un PASS ne consomme rien.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14 }}>
          <label>
            <strong>Avant inscription</strong>
            <input type="number" min="0" value={guestLimit} onChange={(e) => setGuestLimit(Math.max(0, parseInt(e.target.value, 10) || 0))} style={{ width: '100%', marginTop: 8 }} />
            <small style={{ display: 'block', marginTop: 6, color: '#82798e' }}>Ex. 3 aujourd’hui. Tu peux mettre 50 si tu le souhaites.</small>
          </label>
          <label>
            <strong>Bonus après création du compte</strong>
            <input type="number" min="0" value={signupBonus} onChange={(e) => setSignupBonus(Math.max(0, parseInt(e.target.value, 10) || 0))} style={{ width: '100%', marginTop: 8 }} />
            <small style={{ display: 'block', marginTop: 6, color: '#82798e' }}>Ajouté au quota déjà offert avant inscription.</small>
          </label>
          <div style={{ padding: 14, borderRadius: 12, background: '#191225', border: '1px solid #3c2d55' }}>
            <div style={{ color: '#a78bfa', fontWeight: 800 }}>TOTAL FREE</div>
            <div style={{ fontSize: 30, fontWeight: 900, marginTop: 6 }}>{freeTotal} morceaux</div>
            <small style={{ color: '#82798e' }}>Calcul automatique : avant inscription + bonus compte.</small>
          </div>
        </div>
      </section>

      <h2 style={{ marginTop: 28 }}>Prix & périodes d’essai</h2>
      <table>
        <thead>
          <tr><th>Plan</th><th>Prix mensuel</th><th>Prix annuel</th><th>Essai (jours)</th></tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24 }}>Chargement des plans réels…</td></tr>}
          {!loading && plans.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24 }}>Aucun plan trouvé.</td></tr>}
          {plans.map((p) => (
            <tr key={p.id}>
              <td>{p.code}</td>
              <td><input type="number" step="0.01" value={p.monthly} onChange={(e) => updatePlan(p.code, 'monthly', Number(e.target.value) || 0)} /> €</td>
              <td><input type="number" step="0.01" value={p.yearly} onChange={(e) => updatePlan(p.code, 'yearly', Number(e.target.value) || 0)} /> €</td>
              <td><input type="number" min="0" value={p.trialDays} onChange={(e) => updatePlan(p.code, 'trialDays', parseInt(e.target.value, 10) || 0)} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ marginTop: 28 }}>Limites d’usage par formule</h2>
      <p style={{ color: '#9f96ad' }}>Valeur vide = illimité lorsque la fonction est incluse dans la formule. Les fonctions non incluses restent verrouillées par les droits de la formule.</p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Plan</th>
              {LIMIT_COLUMNS.map((column) => <th key={column.key} title={column.help}>{column.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr key={`limits-${plan.code}`}>
                <td>{plan.code}</td>
                {LIMIT_COLUMNS.map((column) => {
                  const hasValue = column.key in (limits[plan.code] ?? {});
                  const value = limits[plan.code]?.[column.key];
                  return (
                    <td key={`${plan.code}-${column.key}`}>
                      {hasValue ? (
                        <input
                          type="number"
                          min="0"
                          placeholder="∞"
                          value={value == null ? '' : value}
                          onChange={(e) => updateLimit(plan.code, column.key, parseNullableNumber(e.target.value))}
                          title={column.help}
                          style={{ width: 86 }}
                        />
                      ) : <span style={{ color: '#665f70' }}>—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={() => void handleSave()}
        disabled={loading || saving || plans.length === 0}
        style={{
          marginTop: 20,
          background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8,
          padding: '10px 20px', fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.65 : 1,
        }}
      >
        {saving ? 'Enregistrement…' : 'Enregistrer tous les réglages dans Supabase'}
      </button>
      {savedAt && <p className="save-hint">Enregistré réellement à {savedAt}. Les valeurs ont été relues depuis Supabase.</p>}
    </AdminLayout>
  );
}
