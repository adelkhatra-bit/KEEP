import React, { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import DataModeBanner from '../components/DataModeBanner';
import { useLiveOrDemo } from '../lib/useLiveOrDemo';
import { adminApi, AdminApiError } from '../lib/apiClient';

interface RemotePlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  trial_days: number;
  is_active: boolean;
  plan_prices: { id: string; period: string; amount: number; is_active: boolean; currency_code: string }[];
}

interface PlanRow {
  id: string;
  code: string;
  name: string;
  monthlyPriceId: string | null;
  monthly: number;
  trialDays: number;
  isActive: boolean;
}

// Repli Mode Démo honnête uniquement -- jamais la source de vérité (voir
// docs/KEEP_DECISIONS.md : "aucune information marquée dans le dur, surtout
// la tarification"). Utilisé UNIQUEMENT si le backend réel est injoignable.
const DEMO_PLANS: PlanRow[] = [
  { id: 'demo-free', code: 'FREE', name: 'Free', monthlyPriceId: null, monthly: 0, trialDays: 0, isActive: true },
  { id: 'demo-premium', code: 'PREMIUM', name: 'Premium', monthlyPriceId: null, monthly: 2.99, trialDays: 0, isActive: true },
  { id: 'demo-creator', code: 'CREATOR_PRO', name: 'Creator Pro', monthlyPriceId: null, monthly: 9.99, trialDays: 0, isActive: true },
  { id: 'demo-venue', code: 'VENUE_PRO', name: 'Venue Pro', monthlyPriceId: null, monthly: 29.99, trialDays: 0, isActive: true },
];

function mapPlans(raw: RemotePlan[]): PlanRow[] {
  return raw.map((p) => {
    const monthlyPrice = p.plan_prices.find((price) => price.period === 'MONTHLY' && price.is_active);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      monthlyPriceId: monthlyPrice?.id ?? null,
      monthly: monthlyPrice?.amount ?? 0,
      trialDays: p.trial_days,
      isActive: p.is_active,
    };
  });
}

/**
 * Édition des plans/prix — RÉELLE (cf. demande explicite du 24/08/2026 --
 * "je veux aucune information marquée dans le dur, surtout la
 * tarification... test complet, audit complet"). AUDIT FAIT AVANT DE
 * RÉÉCRIRE : `packages/backend/src/routes/admin.ts` avait déjà tout le CRUD
 * nécessaire (GET/PATCH /plans, PATCH /plan-prices/:id) mais 100% gated par
 * `service_role` (placeholder cassé, même cause déjà trouvée pour
 * Utilisateurs) -- réparé en RLS+is_admin() (migration 0019), pas une
 * deuxième version. Repli Mode Démo honnête (DataModeBanner) tant qu'aucun
 * `admin_users` réel n'existe -- jamais un faux "connecté".
 */
export default function Plans() {
  const plansResult = useLiveOrDemo<RemotePlan[], PlanRow[]>('/plans', mapPlans, DEMO_PLANS);
  const [rows, setRows] = useState<PlanRow[]>(DEMO_PLANS);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setRows(plansResult.data), [plansResult.data]);

  const updateRow = (id: string, field: 'monthly' | 'trialDays', value: number) => {
    setRows((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
    setDirty((d) => ({ ...d, [id]: true }));
  };

  const handleSave = async (row: PlanRow) => {
    if (plansResult.mode !== 'live') return; // Mode Démo : rien à écrire, pas de faux succès.
    setSavingId(row.id);
    setError(null);
    try {
      if (row.monthlyPriceId) {
        await adminApi.patch(`/plan-prices/${row.monthlyPriceId}`, { amount: row.monthly });
      }
      await adminApi.patch(`/plans/${row.id}`, { trial_days: row.trialDays });
      setDirty((d) => ({ ...d, [row.id]: false }));
      setSavedAt((s) => ({ ...s, [row.id]: new Date().toLocaleTimeString('fr-FR') }));
    } catch (e) {
      setError(e instanceof AdminApiError ? `${e.message} (HTTP ${e.status})` : 'Échec de sauvegarde.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <AdminLayout>
      <div className="page-title">Abonnements & Prix</div>
      <div className="page-subtitle">FREE / PREMIUM / CREATOR PRO / VENUE PRO — France (EUR)</div>

      <DataModeBanner
        mode={plansResult.mode}
        loading={plansResult.loading}
        reason={plansResult.reason}
        demoNote="4 plans d'exemple, valeurs de démarrage (voir docs/PRICING_STRATEGY.md)."
      />
      {error && <p style={{ color: 'var(--danger, #ff5c5c)', marginTop: 8 }}>{error}</p>}

      <table>
        <thead>
          <tr><th>Plan</th><th>Prix mensuel</th><th>Essai (jours)</th><th /></tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.name} <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({p.code})</span></td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  value={p.monthly}
                  disabled={p.code === 'FREE' || plansResult.mode !== 'live'}
                  onChange={(e) => updateRow(p.id, 'monthly', parseFloat(e.target.value) || 0)}
                /> €
              </td>
              <td>
                <input
                  type="number"
                  value={p.trialDays}
                  disabled={plansResult.mode !== 'live'}
                  onChange={(e) => updateRow(p.id, 'trialDays', parseInt(e.target.value, 10) || 0)}
                />
              </td>
              <td>
                {plansResult.mode === 'live' && (
                  <button
                    onClick={() => handleSave(p)}
                    disabled={!dirty[p.id] || savingId === p.id}
                    style={{
                      background: dirty[p.id] ? 'var(--primary)' : 'var(--bg-card)',
                      color: dirty[p.id] ? '#fff' : 'var(--text-muted)',
                      border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px',
                      fontWeight: 700, cursor: dirty[p.id] ? 'pointer' : 'default', fontSize: 12,
                    }}
                  >
                    {savingId === p.id ? '…' : 'Enregistrer'}
                  </button>
                )}
                {savedAt[p.id] && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Enregistré à {savedAt[p.id]}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminLayout>
  );
}
