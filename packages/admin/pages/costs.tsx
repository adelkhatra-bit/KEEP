import React from 'react';
import AdminLayout from '../components/AdminLayout';
import DataModeBanner from '../components/DataModeBanner';
import { DEMO_COSTS, DEMO_SUBSCRIPTIONS, DemoCost } from '../lib/demoData';
import { computeMRR, computeTotalMonthlyCosts } from '../lib/aggregate';
import { useLiveOrDemo } from '../lib/useLiveOrDemo';

interface RawOperatingCost {
  category: DemoCost['category'];
  label: string;
  amount: number;
  currency_code: string;
  period: 'MONTHLY' | 'YEARLY';
}

interface RawAnalytics {
  mrrByCurrency: Record<string, number>;
}

function mapCosts(raw: RawOperatingCost[]): DemoCost[] {
  // Scope EUR uniquement ici (cf. règle anti-mélange devise) -- même limite
  // que le reste de cet écran, déjà "France (EUR)".
  return raw
    .filter((c) => c.currency_code === 'EUR')
    .map((c) => ({
      category: c.category,
      label: c.label,
      monthlyAmountEur: c.period === 'YEARLY' ? Number(c.amount) / 12 : Number(c.amount),
    }));
}

/**
 * Écran "COÛTS & RENTABILITÉ". En Mode Réel, les coûts viennent de
 * GET /api/admin/operating-costs (table réelle) ; le revenu (MRR) vient de
 * GET /api/admin/analytics, qui l'agrège déjà côté backend -- il n'existe
 * pas de route GET /subscriptions brute côté admin (voir routes/admin.ts),
 * donc pas de recalcul client de computeMRR sur des lignes réelles en Mode
 * Réel. Repli Mode Démo honnête sinon.
 */
export default function Costs() {
  const costsResult = useLiveOrDemo('/operating-costs', mapCosts, DEMO_COSTS);
  const analyticsResult = useLiveOrDemo<RawAnalytics, number>(
    '/analytics',
    (raw) => raw.mrrByCurrency?.EUR ?? 0,
    computeMRR(DEMO_SUBSCRIPTIONS)
  );

  const revenue = analyticsResult.data;
  const totalCosts = computeTotalMonthlyCosts(costsResult.data);
  const margin = revenue - totalCosts;
  const marginPercent = revenue > 0 ? (margin / revenue) * 100 : 0;
  const live = costsResult.mode === 'live' && analyticsResult.mode === 'live';

  return (
    <AdminLayout>
      <div className="page-title">Coûts & Rentabilité</div>
      <div className="page-subtitle">Tableau de gestion — estimation, pas une clôture comptable officielle</div>

      <DataModeBanner
        mode={live ? 'live' : 'demo'}
        loading={costsResult.loading || analyticsResult.loading}
        reason={costsResult.reason ?? analyticsResult.reason}
        demoNote="coûts saisis à titre d'exemple."
      />

      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-value">{revenue.toFixed(2)} €</div><div className="kpi-label">Revenus (MRR)</div></div>
        <div className="kpi-card"><div className="kpi-value">{totalCosts.toFixed(2)} €</div><div className="kpi-label">Coûts opérationnels / mois</div></div>
        <div className="kpi-card"><div className="kpi-value">{margin.toFixed(2)} €</div><div className="kpi-label">Marge estimée / mois</div></div>
        <div className="kpi-card"><div className="kpi-value">{marginPercent.toFixed(0)}%</div><div className="kpi-label">Marge en % du revenu</div></div>
      </div>

      <table>
        <thead>
          <tr><th>Catégorie</th><th>Libellé</th><th>Coût mensuel</th></tr>
        </thead>
        <tbody>
          {costsResult.data.map((c, i) => (
            <tr key={i}>
              <td>{c.category}</td>
              <td>{c.label}</td>
              <td>{c.monthlyAmountEur.toFixed(2)} €</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="save-hint">
        Commissions Apple/Google non incluses ici tant qu'aucune transaction
        réelle n'existe — voir docs/PLATFORM_COMPLIANCE.md pour les taux
        (15% abonnements après réduction, historiquement 30%).
      </p>
    </AdminLayout>
  );
}
