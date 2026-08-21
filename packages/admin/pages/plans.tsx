import React, { useState } from 'react';
import AdminLayout from '../components/AdminLayout';

interface PlanRow {
  code: string;
  monthly: number;
  yearly: number;
  trialDays: number;
}

const INITIAL_PLANS: PlanRow[] = [
  { code: 'FREE', monthly: 0, yearly: 0, trialDays: 0 },
  { code: 'PREMIUM', monthly: 4.99, yearly: 39.99, trialDays: 7 },
  { code: 'CREATOR_PRO', monthly: 9.99, yearly: 79, trialDays: 14 },
  { code: 'VENUE_PRO', monthly: 29, yearly: 279, trialDays: 14 },
];

/**
 * Édition des plans/prix — cf. règle "aucun prix codé en dur dans l'app".
 * En Mode Démo, l'édition modifie un state local uniquement (aucune
 * écriture réelle). En Mode Réel, ce formulaire écrira dans
 * `plans`/`plan_prices` (supabase/migrations/0003_commerce.sql) via le
 * backend, avec audit_log de chaque changement (§48-49).
 */
export default function Plans() {
  const [plans, setPlans] = useState(INITIAL_PLANS);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const updatePlan = (code: string, field: keyof PlanRow, value: number) => {
    setPlans((prev) => prev.map((p) => (p.code === code ? { ...p, [field]: value } : p)));
    setSavedAt(null);
  };

  const handleSave = () => {
    // MODE DÉMO : pas d'écriture réelle. En Mode Réel, appel au backend
    // (PATCH /admin/plans) qui écrit dans plan_prices + audit_logs.
    setSavedAt(new Date().toLocaleTimeString('fr-FR'));
  };

  return (
    <AdminLayout>
      <div className="page-title">Abonnements & Prix</div>
      <div className="page-subtitle">FREE / PREMIUM / CREATOR PRO / VENUE PRO — France (EUR)</div>

      <div className="demo-banner">
        🎭 MODE DÉMO — modification en mémoire uniquement (perdue au
        rafraîchissement). Voir docs/PRICING_STRATEGY.md pour la
        méthodologie de ces valeurs de départ.
      </div>

      <table>
        <thead>
          <tr><th>Plan</th><th>Prix mensuel</th><th>Prix annuel</th><th>Essai (jours)</th></tr>
        </thead>
        <tbody>
          {plans.map((p) => (
            <tr key={p.code}>
              <td>{p.code}</td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  value={p.monthly}
                  onChange={(e) => updatePlan(p.code, 'monthly', parseFloat(e.target.value) || 0)}
                /> €
              </td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  value={p.yearly}
                  onChange={(e) => updatePlan(p.code, 'yearly', parseFloat(e.target.value) || 0)}
                /> €
              </td>
              <td>
                <input
                  type="number"
                  value={p.trialDays}
                  onChange={(e) => updatePlan(p.code, 'trialDays', parseInt(e.target.value, 10) || 0)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button
        onClick={handleSave}
        style={{
          marginTop: 20,
          background: 'var(--primary)',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '10px 20px',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Enregistrer
      </button>
      {savedAt && <p className="save-hint">Enregistré (Mode Démo) à {savedAt} — non persisté, aucun backend connecté.</p>}
    </AdminLayout>
  );
}
