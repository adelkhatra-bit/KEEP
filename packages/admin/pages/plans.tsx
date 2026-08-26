import React, { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { adminApi, isBackendConfigured } from '../lib/apiClient';

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

export default function Plans() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!isBackendConfigured) throw new Error('Backend Super Admin non configuré.');
      const response = await adminApi.get<{ data: ApiPlan[] }>('/plans');
      setPlans((response.data ?? []).map(mapPlan));
    } catch (e: any) {
      setError(e?.message ?? 'Impossible de charger les plans réels.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const updatePlan = (code: string, field: 'monthly' | 'yearly' | 'trialDays', value: number) => {
    setPlans((prev) => prev.map((p) => (p.code === code ? { ...p, [field]: value } : p)));
    setSavedAt(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      for (const plan of plans) {
        await adminApi.patch(`/plans/${plan.id}`, { trial_days: plan.trialDays });
        if (plan.monthlyPriceId) await adminApi.patch(`/plan-prices/${plan.monthlyPriceId}`, { amount: plan.monthly });
        if (plan.yearlyPriceId) await adminApi.patch(`/plan-prices/${plan.yearlyPriceId}`, { amount: plan.yearly });
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
      <div className="page-title">Abonnements & Prix</div>
      <div className="page-subtitle">Plans et prix réellement stockés dans Supabase — France (EUR)</div>

      {error && <div className="demo-banner" style={{ borderColor: '#b42318' }}>Erreur : {error}</div>}
      {!error && !loading && <div className="demo-banner">● MODE RÉEL — lecture et écriture via le backend Super Admin sécurisé + audit logs.</div>}

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
              <td>
                <input type="number" step="0.01" value={p.monthly} onChange={(e) => updatePlan(p.code, 'monthly', Number(e.target.value) || 0)} /> €
              </td>
              <td>
                <input type="number" step="0.01" value={p.yearly} onChange={(e) => updatePlan(p.code, 'yearly', Number(e.target.value) || 0)} /> €
              </td>
              <td>
                <input type="number" min="0" value={p.trialDays} onChange={(e) => updatePlan(p.code, 'trialDays', parseInt(e.target.value, 10) || 0)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button
        onClick={() => void handleSave()}
        disabled={loading || saving || plans.length === 0}
        style={{
          marginTop: 20,
          background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8,
          padding: '10px 20px', fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.65 : 1,
        }}
      >
        {saving ? 'Enregistrement…' : 'Enregistrer dans Supabase'}
      </button>
      {savedAt && <p className="save-hint">Enregistré réellement à {savedAt}. Les modifications ont été relues depuis Supabase.</p>}
    </AdminLayout>
  );
}
